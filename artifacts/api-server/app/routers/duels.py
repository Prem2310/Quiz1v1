"""Matchmaking and real-time 1v1 duel gameplay.

Two WebSocket endpoints:
  - /ws/matchmaking  -- join the queue, get paired with an opponent of similar rating.
  - /ws/duels/{id}   -- the authoritative duel game loop (questions, timing, scoring, Elo).

Plus a small REST endpoint to fetch a duel's final summary (for the result page, which
should work even after the sockets have closed).
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select

from app.core.scoring import bump_daily_streak, elo_deltas, league_for_rating
from app.core.security import decode_access_token
from app.db import SessionLocal
from app.dependencies import CurrentUser, DbSession
from app.models import DuelChallenge, DuelMatch, Question, QuizHistory, QuizQuestion, Subtopic, Topic, UserData, UserQuizHistory
from app.schemas import DuelChallengeCreate, DuelChallengeRead, DuelOpponent, DuelSummary

router = APIRouter(tags=["duels"])

DUEL_TIME_PER_QUESTION = 15
DUEL_NUM_QUESTIONS = 10
BASE_POINTS = 10
SPEED_BONUS_MAX = 10
REVEAL_PAUSE_SECONDS = 1.5
QUEUE_MIN_TOLERANCE = 75
QUEUE_MAX_TOLERANCE = 400
QUEUE_WIDEN_PER_SECOND = 20
CHALLENGE_EXPIRY_SECONDS = 90
XP_PER_CORRECT_DUEL = 4
DUEL_WIN_XP = 20
DUEL_DRAW_XP = 8
DUEL_LOSS_XP = 4


async def _authenticate_ws(websocket: WebSocket) -> int | None:
    token = websocket.cookies.get("access_token") or websocket.query_params.get("token")
    return decode_access_token(token) if token else None


# --------------------------------------------------------------------------
# Matchmaking
# --------------------------------------------------------------------------


@dataclass
class QueueEntry:
    user_id: int
    username: str
    name: str
    rating: float
    topic_id: int | None
    websocket: WebSocket
    queued_at: float = field(default_factory=time.monotonic)
    matched_duel_id: int | None = None
    opponent: DuelOpponent | None = None
    notified: bool = False


_queue: dict[int, QueueEntry] = {}
_queue_lock = asyncio.Lock()


async def _create_duel(
    db,
    player1_id: int,
    player1_rating: float,
    player2_id: int,
    player2_rating: float,
    topic_id: int | None,
    num_questions: int = DUEL_NUM_QUESTIONS,
    time_per_question: int = DUEL_TIME_PER_QUESTION,
) -> DuelMatch:
    quiz = QuizHistory(
        topic_id=topic_id,
        time_per_question=time_per_question,
        num_questions=num_questions,
        quiz_mode="duel",
    )
    db.add(quiz)
    await db.flush()

    query = select(Question.id).join(Question.subtopic).where(Question.is_active.is_(True), Subtopic.is_active.is_(True))
    if topic_id is not None:
        query = query.where(Subtopic.topic_id == topic_id)

    question_ids = list((await db.scalars(query.order_by(func.random()).limit(num_questions))).all())
    if len(question_ids) < num_questions:
        # topic had too few questions; fall back to any active question
        extra = list(
            (
                await db.scalars(
                    select(Question.id)
                    .where(Question.is_active.is_(True), Question.id.not_in(question_ids))
                    .order_by(func.random())
                    .limit(num_questions - len(question_ids))
                )
            ).all()
        )
        question_ids += extra
    quiz.num_questions = len(question_ids)
    db.add_all([QuizQuestion(quiz_history_id=quiz.id, question_id=qid, question_order=i) for i, qid in enumerate(question_ids)])

    match = DuelMatch(
        quiz_history_id=quiz.id,
        topic_id=topic_id,
        player1_id=player1_id,
        player2_id=player2_id,
        status="waiting",
        player1_rating_before=player1_rating,
        player2_rating_before=player2_rating,
    )
    db.add(match)
    await db.commit()
    await db.refresh(match)
    return match


async def _attempt_match(entry: QueueEntry) -> DuelMatch | None:
    if entry.matched_duel_id is not None:
        return None  # caller already knows; nothing new to do
    async with _queue_lock:
        if entry.user_id not in _queue:
            return None
        elapsed = time.monotonic() - entry.queued_at
        tolerance = min(QUEUE_MAX_TOLERANCE, QUEUE_MIN_TOLERANCE + elapsed * QUEUE_WIDEN_PER_SECOND)
        best: QueueEntry | None = None
        best_gap = None
        for candidate in _queue.values():
            if candidate.user_id == entry.user_id:
                continue
            if entry.topic_id is not None and candidate.topic_id is not None and entry.topic_id != candidate.topic_id:
                continue
            gap = abs(candidate.rating - entry.rating)
            if gap > tolerance:
                continue
            if best is None or gap < best_gap:
                best, best_gap = candidate, gap
        if best is None:
            return None
        del _queue[entry.user_id]
        del _queue[best.user_id]

    topic_id = entry.topic_id or best.topic_id
    async with SessionLocal() as db:
        match = await _create_duel(db, entry.user_id, entry.rating, best.user_id, best.rating, topic_id)

    entry.matched_duel_id = match.id
    best.matched_duel_id = match.id
    entry.opponent = DuelOpponent(user_id=best.user_id, username=best.username, name=best.name, rating=best.rating, league=league_for_rating(best.rating))
    best.opponent = DuelOpponent(user_id=entry.user_id, username=entry.username, name=entry.name, rating=entry.rating, league=league_for_rating(entry.rating))

    for who, opp_payload in ((entry, entry.opponent), (best, best.opponent)):
        try:
            await who.websocket.send_json({"type": "match_found", "duel_id": match.id, "opponent": opp_payload.model_dump()})
            who.notified = True
        except Exception:
            pass
    return match


@router.websocket("/ws/matchmaking")
async def matchmaking_socket(websocket: WebSocket, topic_id: int | None = Query(default=None)) -> None:
    user_id = await _authenticate_ws(websocket)
    if user_id is None:
        await websocket.close(code=1008, reason="Authentication required")
        return

    async with SessionLocal() as db:
        user = await db.get(UserData, user_id)
    if user is None:
        await websocket.close(code=1008, reason="Unknown user")
        return

    await websocket.accept()
    entry = QueueEntry(user_id=user.id, username=user.username, name=user.name, rating=user.user_rating, topic_id=topic_id, websocket=websocket)
    async with _queue_lock:
        _queue[user.id] = entry
    await websocket.send_json({"type": "queued"})

    try:
        while entry.matched_duel_id is None:
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=1.0)
                if isinstance(message, dict) and message.get("type") == "cancel":
                    return
            except asyncio.TimeoutError:
                pass
            if entry.matched_duel_id is None:
                await _attempt_match(entry)
            elif not entry.notified:
                # We were matched by the other side; make sure we still tell this socket.
                try:
                    await websocket.send_json({"type": "match_found", "duel_id": entry.matched_duel_id, "opponent": entry.opponent.model_dump() if entry.opponent else None})
                except Exception:
                    pass
                return
            else:
                return
    except WebSocketDisconnect:
        pass
    finally:
        async with _queue_lock:
            _queue.pop(user.id, None)


# --------------------------------------------------------------------------
# Duel gameplay
# --------------------------------------------------------------------------


def _public_question(question: Question) -> dict[str, Any]:
    return {
        "id": question.id,
        "text": question.text,
        "text_html": question.text_html,
        "directions_html": question.directions_html,
        "options": question.options,
        "options_html": question.options_html,
        "difficulty": question.difficulty,
    }


@dataclass
class PlayerConn:
    user_id: int
    websocket: WebSocket
    score: int = 0
    correct: int = 0
    incorrect: int = 0
    answered_index: int | None = None


class DuelSession:
    def __init__(self, duel_id: int, quiz_history_id: int, topic_id: int | None, questions: list[Question], time_per_question: int) -> None:
        self.duel_id = duel_id
        self.quiz_history_id = quiz_history_id
        self.topic_id = topic_id
        self.questions = questions
        self.time_per_question = time_per_question
        self.players: dict[int, PlayerConn] = {}
        self.answer_event = asyncio.Event()
        self.join_event = asyncio.Event()
        self.started = False
        self.finished = False
        self.question_started_at = 0.0
        self._current_index = -1

    def add_player(self, user_id: int, websocket: WebSocket) -> None:
        self.players[user_id] = PlayerConn(user_id=user_id, websocket=websocket)
        if len(self.players) == 2:
            self.join_event.set()

    def opponent_of(self, user_id: int) -> PlayerConn | None:
        for uid, conn in self.players.items():
            if uid != user_id:
                return conn
        return None

    async def abort(self) -> None:
        """A player left mid-game. No Elo changes; just close out the match record."""
        if self.finished:
            return
        self.finished = True
        async with SessionLocal() as db:
            match = await db.get(DuelMatch, self.duel_id)
            if match is not None:
                match.status = "aborted"
                match.completed_at = datetime.now(UTC)
                await db.commit()
        _active_duels.pop(self.duel_id, None)

    async def broadcast(self, message: dict[str, Any]) -> None:
        for conn in list(self.players.values()):
            try:
                await conn.websocket.send_json(message)
            except Exception:
                pass

    def scores_payload(self) -> dict[str, int]:
        return {str(uid): conn.score for uid, conn in self.players.items()}

    async def submit_answer(self, user_id: int, index: int, selected: str | None) -> None:
        conn = self.players.get(user_id)
        if conn is None or index != self._current_index or conn.answered_index == index:
            return
        question = self.questions[index]
        is_correct = selected is not None and selected.strip().lower() in {
            (question.answer or "").strip().lower(),
            (question.answer_letter or "").strip().lower(),
        }
        conn.answered_index = index
        if is_correct:
            elapsed = max(0.0, time.monotonic() - self.question_started_at)
            remaining_fraction = max(0.0, (self.time_per_question - elapsed) / self.time_per_question)
            conn.score += BASE_POINTS + round(SPEED_BONUS_MAX * remaining_fraction)
            conn.correct += 1
        else:
            conn.incorrect += 1
        await self.broadcast({"type": "score_update", "scores": self.scores_payload()})
        self.answer_event.set()

    async def run(self) -> None:
        self.started = True
        async with SessionLocal() as db:
            match = await db.get(DuelMatch, self.duel_id)
            if match is not None:
                match.status = "active"
                match.started_at = datetime.now(UTC)
                await db.commit()

        for index, question in enumerate(self.questions):
            self._current_index = index
            for conn in self.players.values():
                conn.answered_index = None
            self.answer_event.clear()
            self.question_started_at = time.monotonic()
            await self.broadcast(
                {
                    "type": "question",
                    "index": index,
                    "total": len(self.questions),
                    "time_limit": self.time_per_question,
                    "question": _public_question(question),
                }
            )
            deadline = self.question_started_at + self.time_per_question
            while time.monotonic() < deadline and not all(conn.answered_index == index for conn in self.players.values()):
                remaining = deadline - time.monotonic()
                try:
                    await asyncio.wait_for(self.answer_event.wait(), timeout=max(0.05, remaining))
                except asyncio.TimeoutError:
                    break
                self.answer_event.clear()

            await self.broadcast(
                {
                    "type": "reveal",
                    "index": index,
                    "correct_answer": question.answer_letter or question.answer,
                    "explanation": question.explanation,
                    "scores": self.scores_payload(),
                }
            )
            await asyncio.sleep(REVEAL_PAUSE_SECONDS)

        await self._finish()

    async def _finish(self) -> None:
        self.finished = True
        player_ids = list(self.players.keys())
        p1_id, p2_id = player_ids[0], player_ids[1]
        p1, p2 = self.players[p1_id], self.players[p2_id]

        async with SessionLocal() as db:
            match = await db.get(DuelMatch, self.duel_id)
            u1 = await db.get(UserData, p1_id)
            u2 = await db.get(UserData, p2_id)
            if match is None or u1 is None or u2 is None:
                return

            if p1.score == p2.score:
                score_for_p1 = 0.5
                winner_id = None
            elif p1.score > p2.score:
                score_for_p1 = 1.0
                winner_id = p1_id
            else:
                score_for_p1 = 0.0
                winner_id = p2_id

            delta1, delta2 = elo_deltas(u1.user_rating, u2.user_rating, score_for_p1)
            now = datetime.now(UTC)
            xp_gained: dict[int, int] = {}
            for user, conn, delta in ((u1, p1, delta1), (u2, p2, delta2)):
                is_winner = winner_id == user.id
                is_draw = winner_id is None
                xp = conn.correct * XP_PER_CORRECT_DUEL + (DUEL_WIN_XP if is_winner else DUEL_DRAW_XP if is_draw else DUEL_LOSS_XP)
                xp_gained[user.id] = xp
                attempt = UserQuizHistory(
                    user_id=user.id,
                    quiz_history_id=self.quiz_history_id,
                    points_scored=conn.score,
                    correct_count=conn.correct,
                    incorrect_count=conn.incorrect,
                    status="completed",
                    completed_at=now,
                )
                db.add(attempt)
                user.user_rating = round(user.user_rating + delta, 1)
                user.best_rating = max(user.best_rating, user.user_rating)
                user.matches_played += 1
                user.total_points += conn.score
                user.total_correct += conn.correct
                user.total_incorrect += conn.incorrect
                user.total_xp += xp
                bump_daily_streak(user, now)
                await db.flush()
                if user.id == p1_id:
                    match.player1_attempt_id = attempt.id
                else:
                    match.player2_attempt_id = attempt.id

            match.status = "completed"
            match.winner_id = winner_id
            match.player1_rating_after = u1.user_rating
            match.player2_rating_after = u2.user_rating
            match.completed_at = now
            await db.commit()

            await self.broadcast(
                {
                    "type": "duel_end",
                    "scores": self.scores_payload(),
                    "xp_gained": {str(uid): xp for uid, xp in xp_gained.items()},
                    "winner_id": winner_id,
                    "rating_after": {str(p1_id): u1.user_rating, str(p2_id): u2.user_rating},
                    "rating_delta": {str(p1_id): round(delta1, 1), str(p2_id): round(delta2, 1)},
                }
            )

        _active_duels.pop(self.duel_id, None)


_active_duels: dict[int, DuelSession] = {}
_active_duels_lock = asyncio.Lock()


@router.websocket("/ws/duels/{duel_id}")
async def duel_socket(websocket: WebSocket, duel_id: int) -> None:
    user_id = await _authenticate_ws(websocket)
    if user_id is None:
        await websocket.close(code=1008, reason="Authentication required")
        return

    async with SessionLocal() as db:
        match = await db.get(DuelMatch, duel_id)
        if match is None or user_id not in (match.player1_id, match.player2_id):
            await websocket.close(code=1008, reason="Duel not found")
            return
        if match.status == "completed":
            await websocket.close(code=1000, reason="Duel already finished")
            return
        question_ids = list(
            (
                await db.scalars(
                    select(QuizQuestion.question_id)
                    .where(QuizQuestion.quiz_history_id == match.quiz_history_id)
                    .order_by(QuizQuestion.question_order)
                )
            ).all()
        )
        questions_by_id = {q.id: q for q in (await db.scalars(select(Question).where(Question.id.in_(question_ids)))).all()}
        questions = [questions_by_id[qid] for qid in question_ids if qid in questions_by_id]
        quiz = await db.get(QuizHistory, match.quiz_history_id)

    await websocket.accept()

    async with _active_duels_lock:
        session = _active_duels.get(duel_id)
        if session is None:
            session = DuelSession(
                duel_id=duel_id,
                quiz_history_id=match.quiz_history_id,
                topic_id=match.topic_id,
                questions=questions,
                time_per_question=(quiz.time_per_question if quiz else None) or DUEL_TIME_PER_QUESTION,
            )
            _active_duels[duel_id] = session
        session.add_player(user_id, websocket)
        should_start = len(session.players) == 2 and not session.started

    await websocket.send_json({"type": "waiting_for_opponent"} if len(session.players) < 2 else {"type": "opponent_joined"})

    game_task: asyncio.Task | None = None
    if should_start:
        game_task = asyncio.create_task(session.run())

    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                continue
            if message.get("type") == "answer":
                await session.submit_answer(user_id, int(message.get("index", -1)), message.get("answer"))
    except WebSocketDisconnect:
        if not session.finished:
            opponent = session.opponent_of(user_id)
            if opponent is not None:
                try:
                    await opponent.websocket.send_json({"type": "opponent_left"})
                except Exception:
                    pass
            if game_task is not None:
                await session.abort()
    finally:
        if game_task is not None and not game_task.done():
            game_task.cancel()


# --------------------------------------------------------------------------
# REST: duel summary (works after sockets close)
# --------------------------------------------------------------------------


async def _opponent_read(db: DbSession, user_id: int, rating: float) -> DuelOpponent:
    user = await db.get(UserData, user_id)
    return DuelOpponent(
        user_id=user_id,
        username=user.username if user else "?",
        name=user.name if user else "?",
        rating=rating,
        league=league_for_rating(rating),
    )


@router.get("/duels/{duel_id}", response_model=DuelSummary)
async def get_duel(duel_id: int, current_user: CurrentUser, db: DbSession) -> DuelSummary:
    match = await db.get(DuelMatch, duel_id)
    if match is None or current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Duel not found")

    scores = {"p1": 0, "p2": 0}
    if match.player1_attempt_id:
        attempt = await db.get(UserQuizHistory, match.player1_attempt_id)
        scores["p1"] = attempt.points_scored if attempt else 0
    if match.player2_attempt_id:
        attempt = await db.get(UserQuizHistory, match.player2_attempt_id)
        scores["p2"] = attempt.points_scored if attempt else 0

    player1 = await _opponent_read(db, match.player1_id, match.player1_rating_after or match.player1_rating_before)
    player2 = await _opponent_read(db, match.player2_id, match.player2_rating_after or match.player2_rating_before)
    quiz = await db.get(QuizHistory, match.quiz_history_id)

    return DuelSummary(
        id=match.id,
        status=match.status,
        quiz_history_id=match.quiz_history_id,
        room_id=quiz.room_id if quiz else None,
        topic_id=match.topic_id,
        player1=player1,
        player2=player2,
        player1_score=scores["p1"],
        player2_score=scores["p2"],
        winner_id=match.winner_id,
        player1_rating_before=match.player1_rating_before,
        player2_rating_before=match.player2_rating_before,
        player1_rating_after=match.player1_rating_after,
        player2_rating_after=match.player2_rating_after,
        started_at=match.started_at,
        completed_at=match.completed_at,
    )


# --------------------------------------------------------------------------
# Direct challenges: custom duels between two known users, and rematches
# --------------------------------------------------------------------------


async def _challenge_read(db: DbSession, challenge: DuelChallenge) -> DuelChallengeRead:
    challenger = await db.get(UserData, challenge.challenger_id)
    opponent = await db.get(UserData, challenge.opponent_id)
    topic_name = None
    if challenge.topic_id is not None:
        topic = await db.get(Topic, challenge.topic_id)
        topic_name = topic.name if topic else None
    return DuelChallengeRead(
        id=challenge.id,
        status=challenge.status,
        challenger=_opponent_from_user(challenger),
        opponent=_opponent_from_user(opponent),
        topic_id=challenge.topic_id,
        topic_name=topic_name,
        num_questions=challenge.num_questions,
        time_per_question=challenge.time_per_question,
        duel_match_id=challenge.duel_match_id,
        created_at=challenge.created_at,
        expires_at=challenge.expires_at,
    )


def _opponent_from_user(user: UserData | None) -> DuelOpponent:
    if user is None:
        return DuelOpponent(user_id=0, username="?", name="?", rating=1000, league="Novice")
    return DuelOpponent(user_id=user.id, username=user.username, name=user.name, rating=user.user_rating, league=league_for_rating(user.user_rating))


async def _expire_if_stale(db: DbSession, challenge: DuelChallenge) -> DuelChallenge:
    if challenge.status == "pending" and challenge.expires_at < datetime.now(UTC):
        challenge.status = "expired"
        challenge.responded_at = datetime.now(UTC)
        await db.commit()
    return challenge


@router.post("/duels/challenges", response_model=DuelChallengeRead, status_code=status.HTTP_201_CREATED)
async def create_challenge(payload: DuelChallengeCreate, current_user: CurrentUser, db: DbSession) -> DuelChallengeRead:
    if payload.opponent_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't duel yourself")
    opponent = await db.get(UserData, payload.opponent_id)
    if opponent is None or not opponent.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That player doesn't exist")

    existing = await db.scalar(
        select(DuelChallenge).where(
            DuelChallenge.challenger_id == current_user.id,
            DuelChallenge.opponent_id == payload.opponent_id,
            DuelChallenge.status == "pending",
        )
    )
    if existing is not None:
        await _expire_if_stale(db, existing)
        if existing.status == "pending":
            return await _challenge_read(db, existing)

    challenge = DuelChallenge(
        challenger_id=current_user.id,
        opponent_id=payload.opponent_id,
        topic_id=payload.topic_id,
        num_questions=payload.num_questions,
        time_per_question=payload.time_per_question,
        status="pending",
        expires_at=datetime.now(UTC) + timedelta(seconds=CHALLENGE_EXPIRY_SECONDS),
    )
    db.add(challenge)
    await db.commit()
    await db.refresh(challenge)
    return await _challenge_read(db, challenge)


@router.get("/duels/challenges/incoming", response_model=list[DuelChallengeRead])
async def list_incoming_challenges(current_user: CurrentUser, db: DbSession) -> list[DuelChallengeRead]:
    challenges = list(
        (
            await db.scalars(
                select(DuelChallenge).where(DuelChallenge.opponent_id == current_user.id, DuelChallenge.status == "pending").order_by(DuelChallenge.created_at.desc())
            )
        ).all()
    )
    fresh: list[DuelChallengeRead] = []
    for challenge in challenges:
        await _expire_if_stale(db, challenge)
        if challenge.status == "pending":
            fresh.append(await _challenge_read(db, challenge))
    return fresh


@router.get("/duels/challenges/{challenge_id}", response_model=DuelChallengeRead)
async def get_challenge(challenge_id: int, current_user: CurrentUser, db: DbSession) -> DuelChallengeRead:
    challenge = await db.get(DuelChallenge, challenge_id)
    if challenge is None or current_user.id not in (challenge.challenger_id, challenge.opponent_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    await _expire_if_stale(db, challenge)
    return await _challenge_read(db, challenge)


@router.post("/duels/challenges/{challenge_id}/accept", response_model=DuelChallengeRead)
async def accept_challenge(challenge_id: int, current_user: CurrentUser, db: DbSession) -> DuelChallengeRead:
    challenge = await db.get(DuelChallenge, challenge_id)
    if challenge is None or challenge.opponent_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    await _expire_if_stale(db, challenge)
    if challenge.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"This challenge is {challenge.status}")

    challenger = await db.get(UserData, challenge.challenger_id)
    if challenger is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenger no longer exists")

    match = await _create_duel(
        db,
        challenger.id,
        challenger.user_rating,
        current_user.id,
        current_user.user_rating,
        challenge.topic_id,
        num_questions=challenge.num_questions,
        time_per_question=challenge.time_per_question,
    )
    challenge.status = "accepted"
    challenge.duel_match_id = match.id
    challenge.responded_at = datetime.now(UTC)
    await db.commit()
    return await _challenge_read(db, challenge)


@router.post("/duels/challenges/{challenge_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_challenge(challenge_id: int, current_user: CurrentUser, db: DbSession) -> None:
    challenge = await db.get(DuelChallenge, challenge_id)
    if challenge is None or challenge.opponent_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    if challenge.status != "pending":
        return
    challenge.status = "declined"
    challenge.responded_at = datetime.now(UTC)
    await db.commit()


@router.post("/duels/challenges/{challenge_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_challenge(challenge_id: int, current_user: CurrentUser, db: DbSession) -> None:
    challenge = await db.get(DuelChallenge, challenge_id)
    if challenge is None or challenge.challenger_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    if challenge.status != "pending":
        return
    challenge.status = "cancelled"
    challenge.responded_at = datetime.now(UTC)
    await db.commit()
