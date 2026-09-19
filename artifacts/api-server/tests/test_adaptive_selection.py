from collections import Counter

from .conftest import new_user, play_practice

ALL_S1 = {f"s1q{i:02d}": "b" for i in range(12)}  # answering "b" is always wrong in the seeded bank


def sub_of(qid: str) -> int:
    return int(qid[1])  # ids look like s{subtopic}q{nn}


async def create(client, user, **body):
    resp = await client.post("/api/quizzes", headers=user["headers"], json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["question_ids"]


async def test_cold_start_new_user_gets_full_spread_quiz(client, sql):
    user = await new_user(client)
    with sql:
        ids = await create(client, user, topic_id=1, num_questions=10)
    assert len(ids) == len(set(ids)) == 10
    assert set(map(sub_of, ids)) == {1, 2}, "a user with no history should see every subtopic in scope"
    assert sql.count <= 5, sql.count  # user, ONE bundled read (profile+due+unseen), quiz insert, questions insert, commit


async def test_fewer_questions_than_requested_is_not_an_error(client):
    user = await new_user(client)
    ids = await create(client, user, topic_id=2, num_questions=50)
    assert len(ids) == 12  # subtopic 3 only has 12


async def test_unseen_questions_are_served_before_any_repeat(client):
    user = await new_user(client)
    first, _ = await play_practice(client, user, subtopic_id=3, n=8)
    second = await create(client, user, subtopic_id=3, num_questions=8)
    never_seen = {f"s3q{i:02d}" for i in range(12)} - set(first)
    assert len(set(second)) == 8
    assert never_seen <= set(second)


async def test_weak_subtopic_dominates_weak_topics_session(client):
    user = await new_user(client)
    for _ in range(2):  # miss everything in subtopic 1 (ace nothing else)
        await play_practice(client, user, topic_id=1, n=10, answers=ALL_S1)
    counts = Counter(map(sub_of, await create(client, user, topic_id=1, num_questions=10, quiz_mode="weak_topics")))
    assert counts[1] > counts[2], counts


async def test_missed_question_returns_first_and_leaves_rotation_once_answered_correctly(client):
    user = await new_user(client)
    served, _ = await play_practice(client, user, subtopic_id=1, n=4, answers={"s1q00": "b"})
    assert served == ["s1q00", "s1q01", "s1q02", "s1q03"]  # fresh user: stable id order, no shuffle

    # The miss is due immediately, so it leads the next weak-topics session; the correct ones wait a day.
    again, _ = await play_practice(client, user, subtopic_id=1, n=5, mode="weak_topics")
    assert again[0] == "s1q00"
    assert not {"s1q01", "s1q02", "s1q03"} & set(again)

    # Answered correctly just now -> promoted out of box 1, no longer due.
    later = await create(client, user, subtopic_id=1, num_questions=5, quiz_mode="weak_topics")
    assert "s1q00" not in later[:1]
