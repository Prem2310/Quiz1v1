"""Matchmaking and real-time 1v1 duel gameplay.

Two WebSocket endpoints:
  - /ws/matchmaking  -- join the queue, get paired with an opponent of similar rating.
  - /ws/duels/{id}   -- the authoritative duel game loop (questions, timing, scoring, Elo).

Plus a small REST endpoint to fetch a duel's final summary (for the result page, which
should work even after the sockets have closed).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, insert, or_, select

from app.core.adaptive import pair_filter, record_question_stats, select_duel_questions
from app.core.scoring import answer_points, bump_daily_streak, duel_xp, elo_deltas, league_for_rating, rematch_factor
from app.core.security import decode_access_token
from app.db import SessionLocal
from app.dependencies import CurrentUser, DbSession
from app.models import DuelChallenge, DuelMatch, Question, QuizHistory, QuizQuestion, Topic, UserData, UserQuizHistory, UserQuizResponse
from app.schemas import DuelChallengeCreate, DuelChallengeRead, DuelOpponent, DuelPlayerAnswer, DuelQuestionReview, DuelSummary, HeadToHead, HeadToHeadResult

router = APIRouter(tags=["duels"])
logger = logging.getLogger(__name__)

DUEL_TIME_PER_QUESTION = 15
DUEL_NUM_QUESTIONS = 10
REVEAL_PAUSE_SECONDS = 1.5
QUEUE_MIN_TOLERANCE = 75
QUEUE_MAX_TOLERANCE = 400
QUEUE_WIDEN_PER_SECOND = 20
CHALLENGE_EXPIRY_SECONDS = 90
REMATCH_AVOID_SECONDS = 20  # prefer someone new for this long before matching the same opponent again
REMATCH_WINDOW = timedelta(minutes=30)
ELO_REMATCH_WINDOW = timedelta(hours=24)


async def _authenticate_ws(websocket: WebSocket) -> int | None:
    token = websocket.cookies.get("access_token") or websocket.query_params.get("token")
    return decode_access_token(token) if token else None


async def _close_quietly(websocket: WebSocket, message: dict[str, Any] | None = None, code: int = 1000) -> None:
    """Send a last message and a proper close frame. Returning from a handler without one reaches the browser
    as an abnormal 1006 close, which the client treats as a dropped connection and reconnects."""
    try:
        if message is not None:
            await websocket.send_json(message)
        await websocket.close(code=code)
    except Exception:
        pass  # the client is already gone


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
    recent_opponents: set[int] = field(default_factory=set)


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

    question_ids = await select_duel_questions(db, player1_id, player2_id, topic_id, num_questions)
    if not question_ids:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No questions are available for a duel right now")
    quiz.num_questions = len(question_ids)
    await db.execute(insert(QuizQuestion), [{"quiz_history_id": quiz.id, "question_id": qid, "question_order": i} for i, qid in enumerate(question_ids)])

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
            if elapsed < REMATCH_AVOID_SECONDS and (candidate.user_id in entry.recent_opponents or entry.user_id in candidate.recent_opponents):
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
    try:
        async with SessionLocal() as db:
            match = await _create_duel(db, entry.user_id, entry.rating, best.user_id, best.rating, topic_id)
    except Exception as exc:
        # Both players are already out of the queue: tell both, or the partner "searches" forever.
        logger.warning("Could not create duel for %s vs %s", entry.user_id, best.user_id, exc_info=True)
        detail = exc.detail if isinstance(exc, HTTPException) else "Couldn't start the duel. Please try again."
        for who in (entry, best):
            who.matched_duel_id = -1  # ends that player's matchmaking loop
            who.notified = True
            await _close_quietly(who.websocket, {"type": "error", "detail": detail}, code=1011)
        return None

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


async def _recent_opponents(db, user_id: int) -> set[int]:
    rows = (
        await db.execute(
            select(DuelMatch.player1_id, DuelMatch.player2_id).where(
                or_(DuelMatch.player1_id == user_id, DuelMatch.player2_id == user_id),
                DuelMatch.status == "completed",
                DuelMatch.completed_at >= datetime.now(UTC) - REMATCH_WINDOW,
            )
        )
    ).all()
    return {p2 if p1 == user_id else p1 for p1, p2 in rows}


@router.websocket("/ws/matchmaking")
async def matchmaking_socket(websocket: WebSocket, topic_id: int | None = Query(default=None)) -> None:
    user_id = await _authenticate_ws(websocket)
    if user_id is None:
        await websocket.close(code=1008, reason="Authentication required")
        return

    async with SessionLocal() as db:
        user = await db.get(UserData, user_id)
        recent_opponents = await _recent_opponents(db, user_id) if user else set()
    if user is None:
        await websocket.close(code=1008, reason="Unknown user")
        return

    await websocket.accept()
    entry = QueueEntry(user_id=user.id, username=user.username, name=user.name, rating=user.user_rating, topic_id=topic_id, websocket=websocket, recent_opponents=recent_opponents)
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
        if not entry.notified:
            # We were matched by the other side but its send to us failed; try once more ourselves.
            await websocket.send_json({"type": "match_found", "duel_id": entry.matched_duel_id, "opponent": entry.opponent.model_dump() if entry.opponent else None})
    except (WebSocketDisconnect, RuntimeError):
        pass  # RuntimeError: the socket was closed from the partner's task (duel creation failed)
    finally:
        async with _queue_lock:
            _queue.pop(user.id, None)
        await _close_quietly(websocket)


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
    answers: dict[int, tuple[str | None, bool, int]] = field(default_factory=dict)  # index -> (selected, correct, seconds)


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
        self.task: asyncio.Task | None = None

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
        if self.task is not None and self.task is not asyncio.current_task() and not self.task.done():
            self.task.cancel()  # stop the question loop: nobody is left to play it
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

    def answered_payload(self) -> list[str]:
        """Who has locked in an answer for the current question (lets the UI show "opponent answered")."""
        return [str(uid) for uid, conn in self.players.items() if conn.answered_index == self._current_index]

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
        seconds = round(max(0.0, time.monotonic() - self.question_started_at))
        conn.answers[index] = (selected, is_correct, seconds)
        if is_correct:
            conn.score += answer_points(True, seconds, self.time_per_question)
            conn.correct += 1
        else:
            conn.incorrect += 1
        await self.broadcast({"type": "score_update", "scores": self.scores_payload(), "answered": self.answered_payload()})
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

        async with SessionLocal() as db:
            match = await db.get(DuelMatch, self.duel_id)
            if match is None:
                return
            # Slots come from the match record, not socket join order: whoever connected first is not necessarily player1,
            # and every match.player1_* column below has to describe match.player1_id.
            p1_id, p2_id = match.player1_id, match.player2_id
            p1, p2 = self.players[p1_id], self.players[p2_id]
            u1 = await db.get(UserData, p1_id)
            u2 = await db.get(UserData, p2_id)
            if u1 is None or u2 is None:
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

            now = datetime.now(UTC)
            rematches = await db.scalar(
                select(func.count(DuelMatch.id)).where(
                    pair_filter(p1_id, p2_id), DuelMatch.status == "completed", DuelMatch.completed_at >= now - ELO_REMATCH_WINDOW
                )
            )
            factor = rematch_factor(int(rematches or 0))
            # The rating Elo really starts from. It can differ from the queue-time rating stored at creation when either
            # player finished another duel in between, so record it: rating_before + delta == rating_after, always.
            before1, before2 = u1.user_rating, u2.user_rating
            delta1, delta2 = elo_deltas(before1, before2, score_for_p1)
            delta1, delta2 = round(delta1 * factor, 1), round(delta2 * factor, 1)
            xp_gained: dict[int, int] = {}
            for user, conn, delta in ((u1, p1, delta1), (u2, p2, delta2)):
                outcome = "draw" if winner_id is None else "win" if winner_id == user.id else "loss"
                xp = duel_xp(conn.correct, outcome)
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
                # Every duel answer feeds the same mastery/weak-topic model as practice. Unanswered = missed.
                graded = []
                rows = []
                for index, question in enumerate(self.questions):
                    selected, ok, seconds = conn.answers.get(index, (None, False, self.time_per_question))
                    graded.append((question, ok))
                    rows.append(
                        {
                            "user_quiz_history_id": attempt.id,
                            "question_id": question.id,
                            "attempted_option": selected,
                            "selected_answer": selected,
                            "is_correct": ok,
                            "marks_obtained": 1 if ok else 0,
                            "time_taken_seconds": seconds,
                        }
                    )
                if rows:
                    await db.execute(insert(UserQuizResponse), rows)
                await record_question_stats(db, user.id, graded, now)
                if user.id == p1_id:
                    match.player1_attempt_id = attempt.id
                else:
                    match.player2_attempt_id = attempt.id

            match.status = "completed"
            match.winner_id = winner_id
            match.player1_rating_before, match.player2_rating_before = before1, before2
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
                    "rating_delta": {str(p1_id): delta1, str(p2_id): delta2},
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
        questions: list[Question] = []
        time_per_question = DUEL_TIME_PER_QUESTION
        # The second player joins a session that already holds the questions: skip reloading them (remote DB round trips).
        if match.status != "aborted" and duel_id not in _active_duels:
            questions = list(
                (
                    await db.scalars(
                        select(Question)
                        .join(QuizQuestion, QuizQuestion.question_id == Question.id)
                        .where(QuizQuestion.quiz_history_id == match.quiz_history_id)
                        .order_by(QuizQuestion.question_order)
                    )
                ).all()
            )
            time_per_question = await db.scalar(select(QuizHistory.time_per_question).where(QuizHistory.id == match.quiz_history_id)) or DUEL_TIME_PER_QUESTION

    await websocket.accept()
    if match.status == "aborted":
        # Accept first so the client gets opponent_left (and stops); a close before accept is just a failed handshake to it.
        await _close_quietly(websocket, {"type": "opponent_left"})
        return

    async with _active_duels_lock:
        session = _active_duels.get(duel_id)
        if session is None and questions:
            session = DuelSession(
                duel_id=duel_id,
                quiz_history_id=match.quiz_history_id,
                topic_id=match.topic_id,
                questions=questions,
                time_per_question=time_per_question,
            )
            _active_duels[duel_id] = session
        if session is not None:
            session.add_player(user_id, websocket)
            should_start = len(session.players) == 2 and not session.started
    if session is None:
        # The session ended (finished or aborted, then dropped) between our check and here; or there are no questions.
        await _close_quietly(websocket, {"type": "opponent_left"})
        return

    game_task: asyncio.Task | None = None
    try:
        await websocket.send_json({"type": "waiting_for_opponent"} if len(session.players) < 2 else {"type": "opponent_joined"})
        if should_start:
            game_task = asyncio.create_task(session.run())
            session.task = game_task
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                continue
            if message.get("type") == "answer":
                await session.submit_answer(user_id, int(message.get("index", -1)), message.get("answer"))
    except WebSocketDisconnect:
        if session.started and not session.finished:
            # Either player leaving ends a running duel. (Before, only the player whose connection started it did:
            # if the other left, the loop kept running and the leaver's duel was rated as a normal result.)
            opponent = session.opponent_of(user_id)
            if opponent is not None:
                try:
                    await opponent.websocket.send_json({"type": "opponent_left"})
                except Exception:
                    pass
            await session.abort()
        elif not session.started and getattr(session.players.get(user_id), "websocket", None) is websocket:
            del session.players[user_id]  # left while waiting: a stale socket must not count as "joined"
    finally:
        if game_task is not None and not game_task.done():
            game_task.cancel()


# --------------------------------------------------------------------------
# REST: duel summary (works after sockets close)
# --------------------------------------------------------------------------


def _opponent_read(user: UserData | None, user_id: int, rating: float) -> DuelOpponent:
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

    # One query for both attempts and one for both players (the remote DB's round trips dominate latency).
    attempt_ids = [i for i in (match.player1_attempt_id, match.player2_attempt_id) if i]
    attempts = {a.id: a for a in (await db.scalars(select(UserQuizHistory).where(UserQuizHistory.id.in_(attempt_ids)))).all()} if attempt_ids else {}
    users = {u.id: u for u in (await db.scalars(select(UserData).where(UserData.id.in_([match.player1_id, match.player2_id])))).all()}
    quiz = await db.get(QuizHistory, match.quiz_history_id)
    a1, a2 = attempts.get(match.player1_attempt_id), attempts.get(match.player2_attempt_id)

    def xp_of(attempt: UserQuizHistory | None, user_id: int) -> int | None:
        if attempt is None or match.status != "completed":
            return None
        return duel_xp(attempt.correct_count, "draw" if match.winner_id is None else "win" if match.winner_id == user_id else "loss")

    return DuelSummary(
        id=match.id,
        status=match.status,
        quiz_history_id=match.quiz_history_id,
        room_id=quiz.room_id if quiz else None,
        topic_id=match.topic_id,
        player1=_opponent_read(users.get(match.player1_id), match.player1_id, match.player1_rating_after or match.player1_rating_before),
        player2=_opponent_read(users.get(match.player2_id), match.player2_id, match.player2_rating_after or match.player2_rating_before),
        player1_score=a1.points_scored if a1 else 0,
        player2_score=a2.points_scored if a2 else 0,
        player1_correct=a1.correct_count if a1 else 0,
        player2_correct=a2.correct_count if a2 else 0,
        player1_xp=xp_of(a1, match.player1_id),
        player2_xp=xp_of(a2, match.player2_id),
        winner_id=match.winner_id,
        player1_rating_before=match.player1_rating_before,
        player2_rating_before=match.player2_rating_before,
        player1_rating_after=match.player1_rating_after,
        player2_rating_after=match.player2_rating_after,
        started_at=match.started_at,
        completed_at=match.completed_at,
    )


@router.get("/duels/{duel_id}/review", response_model=list[DuelQuestionReview])
async def duel_review(duel_id: int, current_user: CurrentUser, db: DbSession) -> list[DuelQuestionReview]:
    """Every question of a finished duel with both players' answers and the explanation."""
    match = await db.get(DuelMatch, duel_id)
    if match is None or current_user.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Duel not found")
    if match.status != "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The duel isn't finished yet")

    questions = (
        await db.scalars(
            select(Question)
            .join(QuizQuestion, QuizQuestion.question_id == Question.id)
            .where(QuizQuestion.quiz_history_id == match.quiz_history_id)
            .order_by(QuizQuestion.question_order)
        )
    ).all()

    async def answers_of(attempt_id: int | None) -> dict[str, UserQuizResponse]:
        if attempt_id is None:
            return {}
        rows = await db.scalars(select(UserQuizResponse).where(UserQuizResponse.user_quiz_history_id == attempt_id))
        return {row.question_id: row for row in rows}

    quiz = await db.get(QuizHistory, match.quiz_history_id)
    time_limit = (quiz.time_per_question if quiz else None) or DUEL_TIME_PER_QUESTION

    def answer_of(row: UserQuizResponse | None) -> DuelPlayerAnswer:
        if row is None:
            return DuelPlayerAnswer(selected_answer=None, is_correct=False)
        ok, seconds = bool(row.is_correct), row.time_taken_seconds if row.time_taken_seconds is not None else time_limit
        return DuelPlayerAnswer(selected_answer=row.selected_answer, is_correct=ok, time_taken_seconds=row.time_taken_seconds, points=answer_points(ok, seconds, time_limit))

    p1 = await answers_of(match.player1_attempt_id)
    p2 = await answers_of(match.player2_attempt_id)
    return [
        DuelQuestionReview(
            question_id=q.id,
            text=q.text,
            text_html=q.text_html,
            directions_html=q.directions_html,
            options=q.options,
            options_html=q.options_html,
            correct_answer=q.answer_letter or q.answer,
            explanation=q.explanation,
            explanation_html=q.explanation_html,
            player1=answer_of(p1.get(q.id)),
            player2=answer_of(p2.get(q.id)),
        )
        for q in questions
    ]


@router.get("/duels/head-to-head/{opponent_id}", response_model=HeadToHead)
async def head_to_head(opponent_id: int, current_user: CurrentUser, db: DbSession) -> HeadToHead:
    """The record between the signed-in user and one opponent, plus their most recent duels."""
    matches = list(
        (
            await db.scalars(
                select(DuelMatch)
                .where(pair_filter(current_user.id, opponent_id), DuelMatch.status == "completed")
                .order_by(DuelMatch.completed_at.desc())
                .limit(50)
            )
        ).all()
    )
    wins = sum(1 for m in matches if m.winner_id == current_user.id)
    draws = sum(1 for m in matches if m.winner_id is None)
    recent = []
    for m in matches[:5]:
        mine_is_p1 = m.player1_id == current_user.id
        before, after = (m.player1_rating_before, m.player1_rating_after) if mine_is_p1 else (m.player2_rating_before, m.player2_rating_after)
        recent.append(
            HeadToHeadResult(
                duel_id=m.id,
                result="draw" if m.winner_id is None else "win" if m.winner_id == current_user.id else "loss",
                rating_change=round((after or before) - before, 1),
                completed_at=m.completed_at,
            )
        )
    return HeadToHead(opponent_id=opponent_id, played=len(matches), wins=wins, losses=len(matches) - wins - draws, draws=draws, recent=recent)


# --------------------------------------------------------------------------
# Direct challenges: custom duels between two known users, and rematches
# --------------------------------------------------------------------------


async def _challenges_read(db: DbSession, challenges: list[DuelChallenge]) -> list[DuelChallengeRead]:
    """Serialise challenges with two bulk lookups (users, topics) instead of several queries per challenge."""
    if not challenges:
        return []
    user_ids = {c.challenger_id for c in challenges} | {c.opponent_id for c in challenges}
    users = {u.id: u for u in (await db.scalars(select(UserData).where(UserData.id.in_(user_ids)))).all()}
    topic_ids = {c.topic_id for c in challenges if c.topic_id is not None}
    topics = {t.id: t.name for t in (await db.scalars(select(Topic).where(Topic.id.in_(topic_ids)))).all()} if topic_ids else {}
    return [
        DuelChallengeRead(
            id=c.id,
            status=c.status,
            challenger=_opponent_from_user(users.get(c.challenger_id)),
            opponent=_opponent_from_user(users.get(c.opponent_id)),
            topic_id=c.topic_id,
            topic_name=topics.get(c.topic_id) if c.topic_id is not None else None,
            num_questions=c.num_questions,
            time_per_question=c.time_per_question,
            duel_match_id=c.duel_match_id,
            created_at=c.created_at,
            expires_at=c.expires_at,
        )
        for c in challenges
    ]


async def _challenge_read(db: DbSession, challenge: DuelChallenge) -> DuelChallengeRead:
    return (await _challenges_read(db, [challenge]))[0]


def _opponent_from_user(user: UserData | None) -> DuelOpponent:
    if user is None:
        return DuelOpponent(user_id=0, username="?", name="?", rating=1000, league="Novice")
    return DuelOpponent(user_id=user.id, username=user.username, name=user.name, rating=user.user_rating, league=league_for_rating(user.user_rating))


def _is_expired(challenge: DuelChallenge, now: datetime) -> bool:
    expires = challenge.expires_at if challenge.expires_at.tzinfo else challenge.expires_at.replace(tzinfo=UTC)  # SQLite drops tzinfo
    return expires < now


async def _expire_if_stale(db: DbSession, challenge: DuelChallenge) -> DuelChallenge:
    if challenge.status == "pending" and _is_expired(challenge, datetime.now(UTC)):
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
    now = datetime.now(UTC)
    stale = [c for c in challenges if _is_expired(c, now)]
    for challenge in stale:
        challenge.status = "expired"
        challenge.responded_at = now
    if stale:
        await db.commit()  # one commit for all of them
    return await _challenges_read(db, [c for c in challenges if c.status == "pending"])


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
