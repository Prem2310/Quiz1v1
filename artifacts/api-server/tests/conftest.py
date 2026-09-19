"""Isolated test environment: throwaway SQLite DB, no Redis, never the Supabase database from .env."""

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="quizit-tests-")
os.environ.update(
    SUPABASE_DATABASE_URL="",
    DATABASE_URL=f"sqlite+aiosqlite:///{_tmp}/test.db",
    REDIS_URL="",
    AUTO_CREATE_TABLES="true",
    JWT_SECRET="test-secret-test-secret-test-secret",
)

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy import event  # noqa: E402

from app.db import SessionLocal, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Question, Subtopic, Topic  # noqa: E402

# topic 1 -> subtopics 1 (Percentage), 2 (Time and Work); topic 2 -> subtopic 3 (Synonyms)
QUESTIONS_PER_SUBTOPIC = 12


class SqlCounter:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def __enter__(self):
        self.statements.clear()
        event.listen(engine.sync_engine, "before_cursor_execute", self._on)
        return self

    def __exit__(self, *exc):
        event.remove(engine.sync_engine, "before_cursor_execute", self._on)

    def _on(self, conn, cursor, statement, *args):
        self.statements.append(statement)

    @property
    def count(self) -> int:
        return len(self.statements)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _database():
    await init_db()
    async with SessionLocal() as db:
        for topic_id, name in ((1, "Aptitude"), (2, "Verbal")):
            db.add(Topic(id=topic_id, name=name, slug=name.lower()))
        await db.flush()
        for subtopic_id, topic_id, name in ((1, 1, "Percentage"), (2, 1, "Time and Work"), (3, 2, "Synonyms")):
            db.add(Subtopic(id=subtopic_id, topic_id=topic_id, name=name, slug=name.lower().replace(" ", "-")))
        await db.flush()
        for subtopic_id in (1, 2, 3):
            for n in range(QUESTIONS_PER_SUBTOPIC):
                db.add(
                    Question(
                        id=f"s{subtopic_id}q{n:02d}",
                        subtopic_id=subtopic_id,
                        text=f"Question {n} of subtopic {subtopic_id}",
                        options={"a": "right", "b": "x", "c": "y", "d": "z"},
                        answer="right",
                        answer_letter="a",
                    )
                )
        await db.commit()
    yield


@pytest_asyncio.fixture(scope="session")
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def sql():
    return SqlCounter()


_user_seq = 0


async def new_user(client: httpx.AsyncClient) -> dict:
    """Registers a fresh user and returns {'id', 'headers'}."""
    global _user_seq
    _user_seq += 1
    payload = {"name": f"User {_user_seq}", "email": f"u{_user_seq}@example.com", "username": f"user{_user_seq}", "password": "Password123"}
    resp = await client.post("/api/auth/register", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return {"id": body["user"]["id"], "headers": {"Authorization": f"Bearer {body['access_token']}"}}


async def play_practice(client, user, *, topic_id=None, subtopic_id=None, n=10, mode="practice", answers: dict[str, str | None] | None = None):
    """Create + start + complete a practice quiz. `answers` maps question_id -> option letter (default: always 'a', i.e. correct)."""
    h = user["headers"]
    quiz = (await client.post("/api/quizzes", headers=h, json={"topic_id": topic_id, "subtopic_id": subtopic_id, "num_questions": n, "quiz_mode": mode})).json()
    started = (await client.post(f"/api/quizzes/{quiz['id']}/start", headers=h)).json()
    served = [q["id"] for q in started["questions"]]
    responses = [{"question_id": qid, "selected_answer": (answers or {}).get(qid, "a"), "time_taken": 5} for qid in served]
    done = await client.post(f"/api/quizzes/attempts/{started['attempt_id']}/complete", headers=h, json={"responses": responses})
    assert done.status_code == 200, done.text
    return served, done.json()
