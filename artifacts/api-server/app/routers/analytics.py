from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import Integer, desc, func, or_, select

from app.core.adaptive import get_catalog, load_profiles
from app.core.scoring import league_for_rating
from app.dependencies import CurrentUser, DbSession
from app.models import DuelMatch, FriendRequest, Question, QuizHistory, Subtopic, Topic, UserData, UserQuestionStats, UserQuizHistory, UserQuizResponse
from app.schemas import ActivityDay, ActivityDayDetail, AnalyticsSummary, AttemptSummary, LeaderboardEntry, LeaderboardScope, ProgressTrendPoint, RatingPoint, SubtopicWeakness, TopicInsight

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/me", response_model=AnalyticsSummary)
async def my_summary(current_user: CurrentUser, db: DbSession) -> AnalyticsSummary:
    total = current_user.total_correct + current_user.total_incorrect
    accuracy = round(current_user.total_correct / total * 100, 2) if total else 0
    now = datetime.now(UTC)
    catalog = await get_catalog(db)
    profile = (await load_profiles(db, [current_user.id], now))[current_user.id]
    due_for_review = sum(p.due for p in profile.values())
    topic = _weakest_topic(catalog, profile) or (catalog["subtopics"][0]["topic_name"] if catalog["subtopics"] else None)
    rank = await db.scalar(select(func.count(UserData.id)).where(UserData.is_active.is_(True), UserData.user_rating > current_user.user_rating))
    return AnalyticsSummary(
        total_points=current_user.total_points,
        total_correct=current_user.total_correct,
        total_incorrect=current_user.total_incorrect,
        accuracy=accuracy,
        matches_played=current_user.matches_played,
        rating=current_user.user_rating,
        rank=int(rank or 0) + 1,
        recommended_topic=topic,
        current_streak=current_user.current_streak,
        max_streak=current_user.max_streak,
        total_xp=current_user.total_xp,
        league=league_for_rating(current_user.user_rating),
        due_for_review=int(due_for_review or 0),
    )


def _weakest_topic(catalog: dict, profile: dict) -> str | None:
    """Topic with the lowest smoothed accuracy among topics the user has actually attempted."""
    per_topic: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # name -> [seen, correct]
    for sub in catalog["subtopics"]:
        p = profile.get(sub["id"])
        if p:
            per_topic[sub["topic_name"]][0] += p.seen
            per_topic[sub["topic_name"]][1] += p.correct
    ranked = [(((correct + 2) / (seen + 3)), name) for name, (seen, correct) in per_topic.items() if seen]
    return min(ranked)[1] if ranked else None


@router.get("/me/weakness", response_model=list[SubtopicWeakness])
async def my_weakness(current_user: CurrentUser, db: DbSession, limit: int = Query(default=10, ge=1, le=100)) -> list[SubtopicWeakness]:
    """Subtopics the user is demonstrably weak in, strongest evidence first."""
    catalog = await get_catalog(db)
    profile = (await load_profiles(db, [current_user.id], datetime.now(UTC)))[current_user.id]
    rows = [
        SubtopicWeakness(
            subtopic_id=sub["id"],
            subtopic_name=sub["name"],
            topic_id=sub["topic_id"],
            topic_name=sub["topic_name"],
            attempted=profile[sub["id"]].seen,
            accuracy=round(profile[sub["id"]].accuracy * 100, 1),
            weakness=round(profile[sub["id"]].weakness, 3),
            unresolved=profile[sub["id"]].unresolved,
            due_for_review=profile[sub["id"]].due,
        )
        for sub in catalog["subtopics"]
        if sub["id"] in profile
    ]
    # Rank by weakness discounted for thin evidence: 4 misses is a hint, 30 attempts is a pattern. (Selection keeps its
    # own exploration bonus for barely-touched subtopics; this ordering is only for what we tell the user.)
    return sorted(rows, key=lambda r: (-r.weakness * min(1.0, r.attempted / 10), -r.attempted))[:limit]


def _entry(user: UserData, rank: int, is_me: bool) -> LeaderboardEntry:
    return LeaderboardEntry(
        rank=rank,
        user_id=user.id,
        username=user.username,
        name=user.name,
        college_name=user.college_name,
        total_points=user.total_points,
        user_rating=user.user_rating,
        league=league_for_rating(user.user_rating),
        is_me=is_me,
    )


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    db: DbSession,
    current_user: CurrentUser,
    scope: LeaderboardScope = Query(default="global"),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[LeaderboardEntry]:
    query = select(UserData).where(UserData.is_active.is_(True))
    if scope == "college":
        if not current_user.college_name:
            return []
        query = query.where(UserData.college_name == current_user.college_name)
    elif scope == "friends":
        friend_rows = list(
            (
                await db.scalars(
                    select(FriendRequest).where(
                        FriendRequest.status == "accepted",
                        or_(FriendRequest.requester_id == current_user.id, FriendRequest.addressee_id == current_user.id),
                    )
                )
            ).all()
        )
        friend_ids = {r.addressee_id if r.requester_id == current_user.id else r.requester_id for r in friend_rows}
        friend_ids.add(current_user.id)
        if len(friend_ids) <= 1:
            return []
        query = query.where(UserData.id.in_(friend_ids))

    query = query.order_by(desc(UserData.user_rating), desc(UserData.total_points), UserData.username).limit(limit)
    users = list((await db.scalars(query)).all())
    entries = [_entry(user, rank, user.id == current_user.id) for rank, user in enumerate(users, start=1)]

    # Always surface the signed-in user's own standing, even outside the top N.
    if not any(e.is_me for e in entries) and scope != "friends":
        base_query = select(func.count(UserData.id)).where(UserData.is_active.is_(True), UserData.user_rating > current_user.user_rating)
        if scope == "college":
            base_query = base_query.where(UserData.college_name == current_user.college_name)
        my_rank = int((await db.scalar(base_query)) or 0) + 1
        entries.append(_entry(current_user, my_rank, True))

    return entries


@router.get("/me/history", response_model=list[AttemptSummary])
async def my_history(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=100),
    topic_id: int | None = Query(default=None),
    mode: str | None = Query(default=None),
) -> list[AttemptSummary]:
    query = select(UserQuizHistory).where(UserQuizHistory.user_id == current_user.id, UserQuizHistory.status == "completed")
    if topic_id is not None or mode is not None:
        query = query.join(QuizHistory, QuizHistory.id == UserQuizHistory.quiz_history_id)
        if topic_id is not None:
            query = query.where(QuizHistory.topic_id == topic_id)
        if mode is not None:
            query = query.where(QuizHistory.quiz_mode == mode)
    query = query.order_by(desc(UserQuizHistory.started_at)).limit(limit)
    attempts = list((await db.scalars(query)).all())
    return await _attempt_summaries(db, attempts)


@router.get("/me/topics", response_model=list[TopicInsight])
async def my_topic_insights(current_user: CurrentUser, db: DbSession, days: int | None = Query(default=None, ge=1, le=365)) -> list[TopicInsight]:
    query = (
        select(
            Topic.id,
            Topic.name,
            func.count(UserQuizResponse.id),
            func.sum(func.cast(UserQuizResponse.is_correct, Integer)),
        )
        .join(Subtopic, Subtopic.topic_id == Topic.id)
        .join(Question, Question.subtopic_id == Subtopic.id)
        .join(UserQuizResponse, UserQuizResponse.question_id == Question.id)
        .join(UserQuizHistory, UserQuizHistory.id == UserQuizResponse.user_quiz_history_id)
        .where(UserQuizHistory.user_id == current_user.id)
    )
    if days is not None:
        since = datetime.now(UTC) - timedelta(days=days)
        query = query.where(UserQuizResponse.created_at >= since)
    query = query.group_by(Topic.id, Topic.name).order_by(desc(func.count(UserQuizResponse.id)))
    rows = (await db.execute(query)).all()
    return [
        TopicInsight(
            topic_id=topic_id,
            topic_name=topic_name,
            total_answered=int(total_answered or 0),
            correct=int(correct or 0),
            accuracy=round(int(correct or 0) / int(total_answered) * 100, 2) if total_answered else 0,
        )
        for topic_id, topic_name, total_answered, correct in rows
    ]


@router.get("/me/rating-history", response_model=list[RatingPoint])
async def my_rating_history(current_user: CurrentUser, db: DbSession, limit: int = Query(default=100, ge=1, le=500)) -> list[RatingPoint]:
    """The user's rating after each finished duel, oldest first — the data behind the profile rating graph."""
    me = current_user.id
    matches = list(
        (
            await db.scalars(
                select(DuelMatch)
                .where(or_(DuelMatch.player1_id == me, DuelMatch.player2_id == me), DuelMatch.status == "completed", DuelMatch.player1_rating_after.is_not(None))
                .order_by(desc(DuelMatch.completed_at))
                .limit(limit)
            )
        ).all()
    )
    return await _rating_points(db, me, list(reversed(matches)))


async def _attempt_summaries(db: DbSession, attempts: list[UserQuizHistory]) -> list[AttemptSummary]:
    quiz_ids = {attempt.quiz_history_id for attempt in attempts}
    quizzes = {
        quiz.id: quiz
        for quiz in (await db.scalars(select(QuizHistory).where(QuizHistory.id.in_(quiz_ids)))).all()
    } if quiz_ids else {}
    return [
        AttemptSummary(
            attempt_id=attempt.id,
            quiz_id=attempt.quiz_history_id,
            quiz_mode=quizzes[attempt.quiz_history_id].quiz_mode,
            score=attempt.points_scored,
            total_correct=attempt.correct_count,
            total_incorrect=attempt.incorrect_count,
            accuracy=round(attempt.correct_count / (attempt.correct_count + attempt.incorrect_count) * 100, 2)
            if attempt.correct_count + attempt.incorrect_count
            else 0,
            completed_at=attempt.completed_at,
        )
        for attempt in attempts
        if attempt.quiz_history_id in quizzes
    ]


async def _rating_points(db: DbSession, me: int, matches: list[DuelMatch]) -> list[RatingPoint]:
    """Finished duels as rating points, in the order given."""
    if not matches:
        return []
    opponent_ids = {m.player2_id if m.player1_id == me else m.player1_id for m in matches}
    names = {u.id: u.name for u in (await db.scalars(select(UserData).where(UserData.id.in_(opponent_ids)))).all()}
    attempt_ids = {a for m in matches for a in (m.player1_attempt_id, m.player2_attempt_id) if a}
    scores = {a.id: a.points_scored for a in (await db.scalars(select(UserQuizHistory).where(UserQuizHistory.id.in_(attempt_ids)))).all()} if attempt_ids else {}

    points: list[RatingPoint] = []
    for m in matches:
        is_p1 = m.player1_id == me
        opponent_id = m.player2_id if is_p1 else m.player1_id
        my_attempt, their_attempt = (m.player1_attempt_id, m.player2_attempt_id) if is_p1 else (m.player2_attempt_id, m.player1_attempt_id)
        points.append(
            RatingPoint(
                duel_id=m.id,
                completed_at=m.completed_at,
                rating_before=m.player1_rating_before if is_p1 else m.player2_rating_before,
                rating_after=(m.player1_rating_after if is_p1 else m.player2_rating_after) or 0,
                result="draw" if m.winner_id is None else "win" if m.winner_id == me else "loss",
                opponent_name=names.get(opponent_id, "?"),
                my_score=scores.get(my_attempt, 0),
                opponent_score=scores.get(their_attempt, 0),
            )
        )
    return points


def _local_date(moment: datetime, tz_offset: int) -> date:
    # SQLite hands back naive datetimes; every stored timestamp is UTC.
    aware = moment if moment.tzinfo else moment.replace(tzinfo=UTC)
    return (aware.astimezone(UTC) + timedelta(minutes=tz_offset)).date()


# Minutes east of UTC, as the browser reports it (-new Date().getTimezoneOffset()), so days are the player's own calendar days.
TzOffset = Query(default=0, ge=-720, le=840)


@router.get("/me/activity", response_model=list[ActivityDay])
async def my_activity(current_user: CurrentUser, db: DbSession, days: int = Query(default=371, ge=1, le=371), tz_offset: int = TzOffset) -> list[ActivityDay]:
    """Per-day activity for the profile heatmap: only days with something finished, oldest first.

    Grouped in Python rather than SQL so the day boundary can follow the player's timezone on every dialect;
    it is one narrow row per finished attempt, a few hundred a year for a heavy player.
    """
    since = datetime.now(UTC) - timedelta(days=days)
    rows = (
        await db.execute(
            select(UserQuizHistory.completed_at, QuizHistory.quiz_mode, UserQuizHistory.correct_count, UserQuizHistory.incorrect_count, UserQuizHistory.points_scored)
            .join(QuizHistory, QuizHistory.id == UserQuizHistory.quiz_history_id)
            .where(UserQuizHistory.user_id == current_user.id, UserQuizHistory.status == "completed", UserQuizHistory.completed_at >= since)
        )
    ).all()
    by_day: dict[date, ActivityDay] = {}
    for completed_at, mode, correct, incorrect, points in rows:
        day = _local_date(completed_at, tz_offset)
        entry = by_day.setdefault(day, ActivityDay(date=day.isoformat(), practice=0, duels=0, questions=0, correct=0, points=0))
        if mode == "duel":
            entry.duels += 1
        else:
            entry.practice += 1
        entry.questions += correct + incorrect
        entry.correct += correct
        entry.points += points
    return [by_day[d] for d in sorted(by_day)]


@router.get("/me/activity/day", response_model=ActivityDayDetail)
async def my_activity_day(current_user: CurrentUser, db: DbSession, day: date = Query(alias="date"), tz_offset: int = TzOffset) -> ActivityDayDetail:
    """Everything finished on one of the player's calendar days: rated duels and practice sessions, oldest first."""
    start = datetime.combine(day, time.min, tzinfo=UTC) - timedelta(minutes=tz_offset)
    end = start + timedelta(days=1)
    me = current_user.id
    attempts = list(
        (
            await db.scalars(
                select(UserQuizHistory)
                .join(QuizHistory, QuizHistory.id == UserQuizHistory.quiz_history_id)
                .where(
                    UserQuizHistory.user_id == me,
                    UserQuizHistory.status == "completed",
                    QuizHistory.quiz_mode != "duel",
                    UserQuizHistory.completed_at >= start,
                    UserQuizHistory.completed_at < end,
                )
                .order_by(UserQuizHistory.completed_at)
            )
        ).all()
    )
    matches = list(
        (
            await db.scalars(
                select(DuelMatch)
                .where(
                    or_(DuelMatch.player1_id == me, DuelMatch.player2_id == me),
                    DuelMatch.status == "completed",
                    DuelMatch.player1_rating_after.is_not(None),
                    DuelMatch.completed_at >= start,
                    DuelMatch.completed_at < end,
                )
                .order_by(DuelMatch.completed_at)
            )
        ).all()
    )
    return ActivityDayDetail(date=day.isoformat(), practice=await _attempt_summaries(db, attempts), duels=await _rating_points(db, me, matches))


@router.get("/me/trend", response_model=list[ProgressTrendPoint])
async def my_progress_trend(current_user: CurrentUser, db: DbSession, days: int = Query(default=30, ge=7, le=180)) -> list[ProgressTrendPoint]:
    """Daily accuracy trend: grouped in the database (one small result set instead of every response row)."""
    since = datetime.now(UTC) - timedelta(days=days)
    day = func.date(UserQuizResponse.created_at)
    rows = (
        await db.execute(
            select(day, func.count(UserQuizResponse.id), func.sum(func.cast(UserQuizResponse.is_correct, Integer)))
            .join(UserQuizHistory, UserQuizHistory.id == UserQuizResponse.user_quiz_history_id)
            .where(UserQuizHistory.user_id == current_user.id, UserQuizResponse.created_at >= since)
            .group_by(day)
            .order_by(day)
        )
    ).all()
    return [
        ProgressTrendPoint(
            date=str(d),
            attempts=int(attempts),
            correct=int(correct or 0),
            incorrect=int(attempts) - int(correct or 0),
            accuracy=round(int(correct or 0) / int(attempts) * 100, 2) if attempts else 0,
        )
        for d, attempts, correct in rows
    ]
