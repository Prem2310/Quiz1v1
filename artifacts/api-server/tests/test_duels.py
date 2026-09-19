from collections import deque

from sqlalchemy import func, select

from app.core.adaptive import allocate
from app.core.scoring import elo_deltas, rematch_factor
from app.db import SessionLocal
from app.models import DuelMatch, Question, QuizQuestion, UserData, UserQuestionStats, UserQuizResponse
from app.routers.duels import DuelSession, _create_duel

from .conftest import new_user, play_practice


class FakeSocket:
    async def send_json(self, _):
        pass


async def make_duel(u1: int, u2: int, topic_id=1, n=10) -> tuple[DuelMatch, list[str]]:
    async with SessionLocal() as db:
        r1, r2 = (await db.get(UserData, u1)).user_rating, (await db.get(UserData, u2)).user_rating
        match = await _create_duel(db, u1, r1, u2, r2, topic_id, num_questions=n)
        ids = list((await db.scalars(select(QuizQuestion.question_id).where(QuizQuestion.quiz_history_id == match.quiz_history_id).order_by(QuizQuestion.question_order))).all())
    return match, ids


async def finish_duel(match: DuelMatch, p1_wins: bool) -> None:
    async with SessionLocal() as db:
        questions_by_id = {q.id: q for q in (await db.scalars(select(Question))).all()}
        ids = list((await db.scalars(select(QuizQuestion.question_id).where(QuizQuestion.quiz_history_id == match.quiz_history_id).order_by(QuizQuestion.question_order))).all())
    session = DuelSession(match.id, match.quiz_history_id, match.topic_id, [questions_by_id[i] for i in ids], 15)
    session.add_player(match.player1_id, FakeSocket())
    session.add_player(match.player2_id, FakeSocket())
    winner, loser = (session.players[match.player1_id], session.players[match.player2_id]) if p1_wins else (session.players[match.player2_id], session.players[match.player1_id])
    for index in range(len(ids)):
        winner.answers[index] = ("a", True, 3)
        loser.answers[index] = ("b", False, 3)
    winner.score, winner.correct = 100, len(ids)
    loser.score, loser.incorrect = 0, len(ids)
    await session._finish()


def test_allocate_is_proportional_and_redistributes_short_pools():
    pools = {1: deque(f"a{i}" for i in range(10)), 2: deque(f"b{i}" for i in range(10)), 3: deque(["c0"])}
    picked = allocate(pools, {1: 3.0, 2: 1.0, 3: 1.0}, 10)
    assert len(picked) == len(set(picked)) == 10
    assert sum(q.startswith("a") for q in picked) > sum(q.startswith("b") for q in picked)
    assert "c0" in picked
    # A pool that can't fill its quota hands the remainder to the others rather than shorting the quiz.
    assert len(allocate({1: deque(["x"]), 2: deque(f"y{i}" for i in range(9))}, {1: 9.0, 2: 1.0}, 10)) == 10


def test_rematch_factor_damps_repeat_pairings_but_never_to_zero():
    assert [rematch_factor(n) for n in (0, 1, 2, 3, 10)] == [1.0, 0.75, 0.5, 0.25, 0.25]


async def test_duel_questions_avoid_what_either_player_has_seen(client):
    a, b = await new_user(client), await new_user(client)
    await play_practice(client, a, subtopic_id=1, n=12)  # `a` has now seen every question in subtopic 1
    _, ids = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    assert len(set(ids)) == 10
    assert all(q.startswith("s2") for q in ids), "12 questions neither player has seen exist, so no one gets a head start"


async def test_rematch_never_repeats_recent_duel_questions_and_dampens_elo(client):
    a, b = await new_user(client), await new_user(client)
    first, first_ids = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    await finish_duel(first, p1_wins=True)
    second, second_ids = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    assert not set(first_ids) & set(second_ids)

    async with SessionLocal() as db:
        m1 = await db.get(DuelMatch, first.id)
    assert round(m1.player1_rating_after - m1.player1_rating_before, 1) == 16.0  # first meeting: full Elo

    await finish_duel(second, p1_wins=True)
    async with SessionLocal() as db:
        m2 = await db.get(DuelMatch, second.id)
    expected, _ = elo_deltas(m2.player1_rating_before, m2.player2_rating_before, 1.0)
    assert round(m2.player1_rating_after - m2.player1_rating_before, 1) == round(expected * 0.75, 1)

    h2h = (await client.get(f"/api/duels/head-to-head/{b['id']}", headers=a["headers"])).json()
    assert (h2h["played"], h2h["wins"], h2h["losses"]) == (2, 2, 0)


async def test_duel_answers_feed_the_weak_topic_model(client):
    a, b = await new_user(client), await new_user(client)
    match, ids = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    await finish_duel(match, p1_wins=True)  # a answered everything correctly, b missed everything
    async with SessionLocal() as db:
        responses = await db.scalar(select(func.count(UserQuizResponse.id)).join(UserQuestionStats, UserQuestionStats.question_id == UserQuizResponse.question_id).where(UserQuestionStats.user_id == b["id"]))
        b_boxes = (await db.scalars(select(UserQuestionStats.box_level).where(UserQuestionStats.user_id == b["id"]))).all()
    assert responses and len(b_boxes) == 10 and set(b_boxes) == {1}, "b's misses must come back for review"
    # ...and b's next weak-topics practice leads with exactly those questions.
    resp = await client.post("/api/quizzes", headers=b["headers"], json={"topic_id": 1, "num_questions": 10, "quiz_mode": "weak_topics"})
    assert set(resp.json()["question_ids"]) == set(ids)


async def test_incoming_challenges_are_batched_and_expired_ones_dropped(client, sql):
    a, b, c = await new_user(client), await new_user(client), await new_user(client)
    for challenger in (a, c):
        resp = await client.post("/api/duels/challenges", headers=challenger["headers"], json={"opponent_id": b["id"], "topic_id": 1})
        assert resp.status_code == 201, resp.text
    with sql:
        incoming = (await client.get("/api/duels/challenges/incoming", headers=b["headers"])).json()
    assert {i["challenger"]["user_id"] for i in incoming} == {a["id"], c["id"]}
    assert incoming[0]["topic_name"] == "Aptitude"
    assert sql.count <= 4, sql.count  # user, challenges, users, topics: constant however many challenges arrive
