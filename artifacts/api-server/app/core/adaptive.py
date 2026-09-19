"""Adaptive learning core shared by practice and duels: mastery recording, weakness profiling and question selection.

Design notes
- The database is remote (~100-300 ms per round trip), so query COUNT is the cost that matters. Everything here is
  bulk (IN lists, GROUP BY, window functions) and each selection reads everything it needs in ONE statement.
  No per-question queries, no ORDER BY random().
- "Not random" means deterministic priority, never "no fallback": due reviews -> unseen -> least-recently-seen.
  A brand-new user (no history) still gets a full quiz, spread evenly across the subtopics in scope.
"""

from __future__ import annotations

import math
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import Integer, String, and_, case, cast, exists, func, insert, literal_column, null, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.core.mastery import due_at_for_box, next_box_level
from app.models import DuelMatch, Question, QuizQuestion, Subtopic, Topic, UserQuestionStats
from app.redis_client import room_broker

REVIEW_SHARE_PRACTICE = 0.4  # portion of a practice quiz reserved for questions due for review
CATALOG_TTL = 300
H2H_LOOKBACK_MATCHES = 5  # questions from this many recent duels between the same two players are not reused


# --------------------------------------------------------------------------
# Catalog (topics/subtopics change rarely; cached so scope resolution costs no DB round trip)
# --------------------------------------------------------------------------


async def get_catalog(db: AsyncSession) -> dict:
    async def load() -> dict:
        rows = (
            await db.execute(
                select(Subtopic.id, Subtopic.topic_id, Subtopic.name, Topic.name)
                .join(Topic, Topic.id == Subtopic.topic_id)
                .where(Subtopic.is_active.is_(True), Topic.is_active.is_(True))
                .order_by(Subtopic.id)
            )
        ).all()
        return {"subtopics": [{"id": sid, "topic_id": tid, "name": name, "topic_name": topic_name} for sid, tid, name, topic_name in rows]}

    return await room_broker.cached("catalog", CATALOG_TTL, load)


def scope_subtopic_ids(catalog: dict, topic_id: int | None, subtopic_id: int | None) -> list[int]:
    if subtopic_id is not None:
        return [s["id"] for s in catalog["subtopics"] if s["id"] == subtopic_id]
    return [s["id"] for s in catalog["subtopics"] if topic_id is None or s["topic_id"] == topic_id]


# --------------------------------------------------------------------------
# Recording answers (one bulk lookup, then in-memory updates flushed together)
# --------------------------------------------------------------------------


async def record_question_stats(db: AsyncSession, user_id: int, graded: list[tuple[Question, bool]], now: datetime) -> None:
    """Leitner update for every graded question with a single SELECT (was one SELECT per question)."""
    if not graded:
        return
    ids = [question.id for question, _ in graded]
    existing = {
        s.question_id: s
        for s in (await db.scalars(select(UserQuestionStats).where(UserQuestionStats.user_id == user_id, UserQuestionStats.question_id.in_(ids)))).all()
    }
    new_rows: list[dict] = []
    for question, is_correct in graded:
        stats = existing.get(question.id)
        if stats is None:
            box = next_box_level(1, is_correct)
            new_rows.append(
                {
                    "user_id": user_id,
                    "question_id": question.id,
                    "subtopic_id": question.subtopic_id,
                    "box_level": box,
                    "times_seen": 1,
                    "times_correct": int(is_correct),
                    "times_incorrect": int(not is_correct),
                    "last_seen_at": now,
                    "due_at": due_at_for_box(box, now),
                }
            )
            continue
        stats.times_seen += 1
        if is_correct:
            stats.times_correct += 1
        else:
            stats.times_incorrect += 1
        stats.box_level = next_box_level(stats.box_level, is_correct)
        stats.last_seen_at = now
        stats.due_at = due_at_for_box(stats.box_level, now)
    if new_rows:
        await db.execute(insert(UserQuestionStats), new_rows)


# --------------------------------------------------------------------------
# Weakness profile
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class SubtopicProfile:
    seen: int  # answers given (lifetime)
    correct: int
    questions: int  # distinct questions attempted
    unresolved: int  # questions whose latest answer was wrong (box 1)
    due: int

    @property
    def accuracy(self) -> float:
        return (self.correct + 2) / (self.seen + 3)  # smoothed: 3 pseudo-attempts at ~67% so 1 miss doesn't brand a subtopic weak

    @property
    def weakness(self) -> float:
        unresolved_share = self.unresolved / self.questions if self.questions else 0.0
        return 0.6 * (1 - self.accuracy) + 0.4 * unresolved_share

    @property
    def priority(self) -> float:
        """Sampling weight: how weak it is, plus a bonus for territory the user has barely touched."""
        return self.weakness + 0.5 / (1 + self.seen)


EMPTY_PROFILE = SubtopicProfile(0, 0, 0, 0, 0)


# --------------------------------------------------------------------------
# One statement, several result sets. Each part is tagged with a kind in column `k` and padded to the same shape
# (k, uid, sid, qid, c0..c4), so a whole selection costs ONE network round trip instead of one per part.
# --------------------------------------------------------------------------


def _lit(kind: str):
    return literal_column(f"'{kind}'").label("k")


def _ni(name: str):
    return cast(null(), Integer).label(name)


def _ns(name: str):
    return cast(null(), String).label(name)


def _ci(expr, name: str):
    return cast(expr, Integer).label(name)


async def _bundle(db: AsyncSession, *parts: Select) -> dict[str, list]:
    out: dict[str, list] = defaultdict(list)
    for row in (await db.execute(union_all(*parts))).all():
        out[row.k].append(row)
    return out


def _profile_part(user_ids: list[int], now: datetime) -> Select:
    s = UserQuestionStats
    return (
        select(
            _lit("P"),
            s.user_id.label("uid"),
            s.subtopic_id.label("sid"),
            _ns("qid"),
            _ci(func.sum(s.times_seen), "c0"),
            _ci(func.sum(s.times_correct), "c1"),
            _ci(func.count(s.id), "c2"),
            _ci(func.sum(case((s.box_level <= 1, 1), else_=0)), "c3"),
            _ci(func.sum(case((s.due_at <= now, 1), else_=0)), "c4"),
        )
        .where(s.user_id.in_(user_ids))
        .group_by(s.user_id, s.subtopic_id)
    )


def _profiles_from(rows: list, user_ids: list[int]) -> dict[int, dict[int, SubtopicProfile]]:
    out: dict[int, dict[int, SubtopicProfile]] = {uid: {} for uid in user_ids}
    for r in rows:
        out[r.uid][r.sid] = SubtopicProfile(r.c0 or 0, r.c1 or 0, r.c2 or 0, r.c3 or 0, r.c4 or 0)
    return out


def _due_part(user_id: int, scope: list[int], now: datetime, cap: int) -> Select:
    """Questions due for review: unresolved misses (lowest box) first, then oldest due. c0 = priority rank."""
    s = UserQuestionStats
    ranked = (
        select(s.question_id.label("qid"), s.subtopic_id.label("sid"), func.row_number().over(order_by=(s.box_level, s.due_at)).label("rn"))
        .where(s.user_id == user_id, s.subtopic_id.in_(scope), s.due_at <= now)
        .subquery()
    )
    return select(_lit("D"), _ni("uid"), ranked.c.sid.label("sid"), ranked.c.qid.label("qid"), _ci(ranked.c.rn, "c0"), _ni("c1"), _ni("c2"), _ni("c3"), _ni("c4")).where(
        ranked.c.rn <= cap
    )


def _pool_part(scope: list[int], per_subtopic: int, unseen_for: list[int], exclude=None) -> Select:
    """Up to `per_subtopic` never-attempted question ids per subtopic, stable id order. c0 = position in subtopic."""
    seen = exists().where(and_(UserQuestionStats.question_id == Question.id, UserQuestionStats.user_id.in_(unseen_for)))
    ranked = select(
        Question.id.label("qid"), Question.subtopic_id.label("sid"), func.row_number().over(partition_by=Question.subtopic_id, order_by=Question.id).label("rn")
    ).where(Question.subtopic_id.in_(scope), Question.is_active.is_(True), ~seen)
    if exclude is not None:
        ranked = ranked.where(Question.id.not_in(exclude))
    ranked = ranked.subquery()
    return select(_lit("U"), _ni("uid"), ranked.c.sid.label("sid"), ranked.c.qid.label("qid"), _ci(ranked.c.rn, "c0"), _ni("c1"), _ni("c2"), _ni("c3"), _ni("c4")).where(
        ranked.c.rn <= per_subtopic
    )


def _pools_from(rows: list) -> dict[int, deque[str]]:
    pools: dict[int, deque[str]] = defaultdict(deque)
    for r in sorted(rows, key=lambda r: (r.sid, r.c0)):
        pools[r.sid].append(r.qid)
    return pools


MAX_SUBTOPIC_SHARE = 0.4  # no subtopic supplies more than this share of a quiz (0.6 in weak-topics mode)


def _per_subtopic(scope: list[int], n: int, share: float = MAX_SUBTOPIC_SHARE) -> int:
    """Candidates fetched per subtopic. Doubles as the cap on how much of one quiz a single subtopic may fill (so a
    weak subtopic can't crowd out everything else) and keeps the result small: on a slow link every extra
    KB costs TCP round trips. Always enough in total to fill the quiz."""
    cap = max(math.ceil(share * n), math.ceil(1.5 * n / len(scope)))
    return min(n, cap, max(3, math.ceil(300 / len(scope))))


async def load_profiles(db: AsyncSession, user_ids: list[int], now: datetime) -> dict[int, dict[int, SubtopicProfile]]:
    """{user_id: {subtopic_id: profile}} in one GROUP BY over user_question_stats."""
    return _profiles_from((await _bundle(db, _profile_part(user_ids, now)))["P"], user_ids)


# --------------------------------------------------------------------------
# Selection
# --------------------------------------------------------------------------


def allocate(pools: dict[int, deque[str]], weights: dict[int, float], n: int) -> list[str]:
    """Take `n` questions from per-subtopic pools, proportionally to weight (largest-remainder),
    redistributing whatever a short pool can't supply to the remaining subtopics."""
    picked: list[str] = []
    active = {sid for sid, pool in pools.items() if pool}
    while len(picked) < n and active:
        need = n - len(picked)
        total = sum(weights[sid] for sid in active) or 1.0
        order = sorted(active, key=lambda sid: (-weights[sid], sid))
        quotas = {sid: need * weights[sid] / total for sid in order}
        base = {sid: math.floor(q) for sid, q in quotas.items()}
        leftover = need - sum(base.values())
        for sid in sorted(order, key=lambda sid: (-(quotas[sid] - base[sid]), -weights[sid], sid))[:leftover]:
            base[sid] += 1
        progressed = False
        for sid in order:
            take = min(base[sid], len(pools[sid]), n - len(picked))
            for _ in range(take):
                picked.append(pools[sid].popleft())
                progressed = True
            if not pools[sid]:
                active.discard(sid)
        if not progressed:
            break
    return picked


async def select_practice_questions(db: AsyncSession, user_id: int, topic_id: int | None, subtopic_id: int | None, n: int, focus_weak: bool) -> list[str]:
    """Deterministic adaptive selection for practice.

    1. Questions due for review (unresolved misses first, then oldest due), capped so new material still appears.
    2. Never-seen questions, split across subtopics in proportion to how weak the user is there.
    3. If the scope is exhausted: the least-recently-seen questions already answered.
    """
    catalog = await get_catalog(db)
    scope = scope_subtopic_ids(catalog, topic_id, subtopic_id)
    if not scope:
        return []
    now = datetime.now(UTC)
    review_cap = n if focus_weak else math.ceil(n * REVIEW_SHARE_PRACTICE)

    parts = await _bundle(db, _profile_part([user_id], now), _due_part(user_id, scope, now, review_cap), _pool_part(scope, _per_subtopic(scope, n, 0.6 if focus_weak else MAX_SUBTOPIC_SHARE), [user_id]))
    profile = _profiles_from(parts["P"], [user_id])[user_id]
    chosen: list[str] = [r.qid for r in sorted(parts["D"], key=lambda r: r.c0)]

    if len(chosen) < n:
        power = 2 if focus_weak else 1
        weights = {sid: max(profile.get(sid, EMPTY_PROFILE).priority, 0.05) ** power for sid in scope}
        chosen += allocate(_pools_from(parts["U"]), weights, n - len(chosen))

    if len(chosen) < n:  # scope exhausted: revisit what was seen longest ago
        s = UserQuestionStats
        query = select(s.question_id).where(s.user_id == user_id, s.subtopic_id.in_(scope))
        if chosen:
            query = query.where(s.question_id.not_in(chosen))
        chosen += list((await db.scalars(query.order_by(s.box_level, s.last_seen_at).limit(n - len(chosen)))).all())
    return chosen


# --------------------------------------------------------------------------
# Duels
# --------------------------------------------------------------------------


def pair_filter(a: int, b: int):
    return or_(and_(DuelMatch.player1_id == a, DuelMatch.player2_id == b), and_(DuelMatch.player1_id == b, DuelMatch.player2_id == a))


def _recent_h2h_quizzes(a: int, b: int) -> Select:
    return (
        select(DuelMatch.quiz_history_id)
        .where(pair_filter(a, b), DuelMatch.status == "completed")
        .order_by(DuelMatch.created_at.desc())
        .limit(H2H_LOOKBACK_MATCHES)
    )


def _h2h_question_ids(a: int, b: int) -> Select:
    """Every question the two players already faced in their most recent duels against each other."""
    return select(QuizQuestion.question_id).where(QuizQuestion.quiz_history_id.in_(_recent_h2h_quizzes(a, b)))


def _h2h_part(a: int, b: int) -> Select:
    return select(_lit("H"), _ni("uid"), _ni("sid"), QuizQuestion.question_id.label("qid"), _ni("c0"), _ni("c1"), _ni("c2"), _ni("c3"), _ni("c4")).where(
        QuizQuestion.quiz_history_id.in_(_recent_h2h_quizzes(a, b))
    )


async def select_duel_questions(db: AsyncSession, p1: int, p2: int, topic_id: int | None, n: int) -> list[str]:
    """Deterministic, symmetric duel question set.

    Fair by construction: prefers questions NEITHER player has ever answered, never repeats what the two already
    faced in their recent duels, and weights subtopics by the players' *combined* weakness so neither side is
    favoured while both are pushed at their weak spots. Falls back tier by tier so a duel always fills up.
    """
    catalog = await get_catalog(db)
    scope = scope_subtopic_ids(catalog, topic_id, None) or scope_subtopic_ids(catalog, None, None)
    parts = await _bundle(
        db,
        _profile_part([p1, p2], datetime.now(UTC)),
        _h2h_part(p1, p2),
        _pool_part(scope, _per_subtopic(scope, n), [p1, p2], exclude=_h2h_question_ids(p1, p2)),
    )
    profiles = _profiles_from(parts["P"], [p1, p2])
    used = {r.qid for r in parts["H"]}

    weights = {sid: max((profiles[p1].get(sid, EMPTY_PROFILE).priority + profiles[p2].get(sid, EMPTY_PROFILE).priority) / 2, 0.05) for sid in scope}
    chosen = allocate(_pools_from(parts["U"]), weights, n)

    async def top_up(subtopic_ids: list[int], avoid: set[str], unseen_by_both: bool = False) -> None:
        need = n - len(chosen)
        if need <= 0 or not subtopic_ids:
            return
        query = select(Question.id).where(Question.subtopic_id.in_(subtopic_ids), Question.is_active.is_(True))
        if unseen_by_both:
            query = query.where(~exists().where(and_(UserQuestionStats.question_id == Question.id, UserQuestionStats.user_id.in_([p1, p2]))))
        skip = avoid | set(chosen)
        if skip:
            query = query.where(Question.id.not_in(skip))
        chosen.extend((await db.scalars(query.order_by(Question.id).limit(need))).all())

    everywhere = scope_subtopic_ids(catalog, None, None)
    await top_up(scope, used, unseen_by_both=True)  # candidates beyond the per-subtopic cap
    await top_up(scope, used)  # seen by one player, but not recently faced together
    await top_up(scope, set())  # small pool: allow repeats from earlier duels
    await top_up(everywhere, set())  # topic too small: borrow from anywhere
    return chosen
