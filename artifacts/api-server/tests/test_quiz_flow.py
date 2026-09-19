from .conftest import new_user, play_practice


async def test_complete_quiz_round_trips(client, sql):
    """Round trips dominate latency (remote Postgres); grading N answers must not cost O(N) statements."""
    user = await new_user(client)
    h = user["headers"]
    quiz = (await client.post("/api/quizzes", headers=h, json={"topic_id": 1, "num_questions": 10})).json()
    started = (await client.post(f"/api/quizzes/{quiz['id']}/start", headers=h)).json()
    responses = [{"question_id": q["id"], "selected_answer": "a", "time_taken": 3} for q in started["questions"]]
    with sql:
        resp = await client.post(f"/api/quizzes/attempts/{started['attempt_id']}/complete", headers=h, json={"responses": responses})
    assert resp.status_code == 200
    print(f"\ncomplete_quiz statements for 10 questions: {sql.count}")
    assert sql.count <= 12


async def test_analytics_and_weakness_endpoints(client):
    user = await new_user(client)
    await play_practice(client, user, topic_id=1, n=10, answers={f"s1q{i:02d}": "b" for i in range(12)})
    h = user["headers"]
    me = (await client.get("/api/analytics/me", headers=h)).json()
    assert me["due_for_review"] > 0 and me["recommended_topic"] == "Aptitude"
    weak = (await client.get("/api/analytics/me/weakness", headers=h)).json()
    assert weak[0]["subtopic_name"] == "Percentage" and weak[0]["weakness"] > weak[-1]["weakness"]
    trend = (await client.get("/api/analytics/me/trend", headers=h)).json()
    assert trend and trend[0]["attempts"] == 10
    assert len((await client.get("/api/topics")).json()) == 2
    assert len((await client.get("/api/topics/1/subtopics")).json()) == 2


async def test_weakness_ranking_prefers_evidence_over_tiny_samples(client):
    user = await new_user(client)
    # subtopic 2: 12 misses (a pattern); subtopic 3: 2 misses (a hint). Subtopic 3 has the higher raw weakness score
    # per attempt but far less evidence, so it must rank below subtopic 2.
    await play_practice(client, user, subtopic_id=2, n=12, answers={f"s2q{i:02d}": "b" for i in range(12)})
    await play_practice(client, user, subtopic_id=3, n=2, answers={f"s3q{i:02d}": "b" for i in range(12)})
    weak = (await client.get("/api/analytics/me/weakness", headers=user["headers"])).json()
    assert [w["subtopic_id"] for w in weak[:2]] == [2, 3] and weak[1]["attempted"] == 2
