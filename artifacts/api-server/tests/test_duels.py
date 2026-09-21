from collections import deque

from sqlalchemy import func, select

from app.core.adaptive import allocate
from app.core.scoring import answer_points, duel_xp, elo_deltas, rematch_factor
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


async def finish_duel(match: DuelMatch, p1_wins: bool, p2_joins_first: bool = False) -> None:
    async with SessionLocal() as db:
        questions_by_id = {q.id: q for q in (await db.scalars(select(Question))).all()}
        ids = list((await db.scalars(select(QuizQuestion.question_id).where(QuizQuestion.quiz_history_id == match.quiz_history_id).order_by(QuizQuestion.question_order))).all())
    session = DuelSession(match.id, match.quiz_history_id, match.topic_id, [questions_by_id[i] for i in ids], 15)
    joined = [match.player2_id, match.player1_id] if p2_joins_first else [match.player1_id, match.player2_id]
    for uid in joined:
        session.add_player(uid, FakeSocket())
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


async def test_duel_review_shows_both_players_answers_after_completion(client):
    a, b, c = await new_user(client), await new_user(client), await new_user(client)
    match, ids = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    assert (await client.get(f"/api/duels/{match.id}/review", headers=a["headers"])).status_code == 409  # not finished
    await finish_duel(match, p1_wins=True)
    review = (await client.get(f"/api/duels/{match.id}/review", headers=b["headers"])).json()
    assert [r["question_id"] for r in review] == ids
    assert all(r["player1"]["is_correct"] and not r["player2"]["is_correct"] and r["player2"]["selected_answer"] == "b" for r in review)
    assert (await client.get(f"/api/duels/{match.id}/review", headers=c["headers"])).status_code == 404  # not a participant


async def test_rating_history_lists_finished_duels_oldest_first(client):
    a, b = await new_user(client), await new_user(client)
    assert (await client.get("/api/analytics/me/rating-history", headers=a["headers"])).json() == []
    first, _ = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    await finish_duel(first, p1_wins=True)
    second, _ = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    await finish_duel(second, p1_wins=False)
    mine = (await client.get("/api/analytics/me/rating-history", headers=a["headers"])).json()
    theirs = (await client.get("/api/analytics/me/rating-history", headers=b["headers"])).json()
    assert [p["duel_id"] for p in mine] == [first.id, second.id]
    assert [p["result"] for p in mine] == ["win", "loss"] and [p["result"] for p in theirs] == ["loss", "win"]
    assert mine[0]["rating_after"] > mine[0]["rating_before"] and mine[0]["my_score"] == 100 and mine[0]["opponent_score"] == 0
    assert mine[1]["rating_before"] == mine[0]["rating_after"]


async def test_duel_record_is_attributed_by_player_not_by_join_order(client):
    a, b = await new_user(client), await new_user(client)
    match, _ = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    await finish_duel(match, p1_wins=True, p2_joins_first=True)  # b's socket connected before a's
    async with SessionLocal() as db:
        m = await db.get(DuelMatch, match.id)
        winner, loser = await db.get(UserData, a["id"]), await db.get(UserData, b["id"])
    assert m.winner_id == a["id"]
    assert m.player1_rating_after == winner.user_rating > m.player1_rating_before
    assert m.player2_rating_after == loser.user_rating < m.player2_rating_before
    summary = (await client.get(f"/api/duels/{match.id}", headers=a["headers"])).json()
    assert (summary["player1_score"], summary["player2_score"]) == (100, 0)
    mine = (await client.get("/api/analytics/me/rating-history", headers=a["headers"])).json()[0]
    assert (mine["result"], mine["my_score"], mine["opponent_score"]) == ("win", 100, 0)
    assert mine["rating_after"] == winner.user_rating


def test_points_reward_speed_and_only_correct_answers():
    assert answer_points(False, 1, 15) == 0
    assert answer_points(True, 0, 15) == 20 and answer_points(True, 15, 15) == 10
    # why more correct answers don't always win: three slow answers lose to two fast ones
    assert 3 * answer_points(True, 14, 15) < 2 * answer_points(True, 1, 15)
    assert duel_xp(3, "win") == 3 * 4 + 20 and duel_xp(0, "loss") == 4 and duel_xp(2, "draw") == 8 + 8


async def test_rating_before_is_the_rating_elo_actually_used(client):
    a, b = await new_user(client), await new_user(client)
    match, _ = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    async with SessionLocal() as db:  # a finishes something else while this duel is queued: their rating moves
        (await db.get(UserData, a["id"])).user_rating = 1100.0
        await db.commit()
    await finish_duel(match, p1_wins=True)
    async with SessionLocal() as db:
        m = await db.get(DuelMatch, match.id)
    assert m.player1_rating_before == 1100.0  # not the 1000 stored at creation
    assert round(m.player1_rating_after - m.player1_rating_before + (m.player2_rating_after - m.player2_rating_before), 1) == 0.0


async def test_leaving_a_running_duel_cancels_it_whichever_player_leaves(client):
    import asyncio

    a, b = await new_user(client), await new_user(client)
    match, ids = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    session = DuelSession(match.id, match.quiz_history_id, match.topic_id, [], 15)
    session.add_player(a["id"], FakeSocket())
    session.add_player(b["id"], FakeSocket())
    session.task = asyncio.create_task(asyncio.sleep(30))
    await session.abort()
    await asyncio.sleep(0)
    assert session.task.cancelled() and session.finished
    async with SessionLocal() as db:
        assert (await db.get(DuelMatch, match.id)).status == "aborted"


async def test_review_and_summary_explain_points_and_xp(client):
    a, b = await new_user(client), await new_user(client)
    match, _ = await make_duel(a["id"], b["id"], topic_id=1, n=10)
    await finish_duel(match, p1_wins=True)  # winner answered "a" correctly at 3s each
    review = (await client.get(f"/api/duels/{match.id}/review", headers=a["headers"])).json()
    assert review[0]["player1"]["points"] == answer_points(True, 3, 15) and review[0]["player2"]["points"] == 0
    summary = (await client.get(f"/api/duels/{match.id}", headers=b["headers"])).json()
    assert (summary["player1_correct"], summary["player2_correct"]) == (10, 0)
    assert (summary["player1_xp"], summary["player2_xp"]) == (duel_xp(10, "win"), duel_xp(0, "loss"))
