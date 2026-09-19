from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import DbSession
from app.models import Question, Subtopic, Topic
from app.redis_client import room_broker
from app.schemas import QuestionRead, SubtopicRead, TopicRead

router = APIRouter(tags=["catalog"])


CATALOG_TTL = 300  # topics/subtopics change only on import; every practice-page load asks for them


@router.get("/topics", response_model=list[TopicRead])
async def list_topics(db: DbSession) -> list[dict]:
    async def load() -> list[dict]:
        rows = (await db.scalars(select(Topic).where(Topic.is_active.is_(True)).order_by(Topic.name))).all()
        return [TopicRead.model_validate(t).model_dump(mode="json") for t in rows]

    return await room_broker.cached("topics", CATALOG_TTL, load)


@router.get("/topics/{topic_id}/subtopics", response_model=list[SubtopicRead])
async def list_subtopics(topic_id: int, db: DbSession) -> list[dict]:
    async def load() -> list[dict]:
        rows = (await db.scalars(select(Subtopic).where(Subtopic.topic_id == topic_id, Subtopic.is_active.is_(True)).order_by(Subtopic.name))).all()
        return [SubtopicRead.model_validate(t).model_dump(mode="json") for t in rows]

    return await room_broker.cached(f"subtopics:{topic_id}", CATALOG_TTL, load)


@router.get("/questions", response_model=list[QuestionRead])
async def list_questions(
    db: DbSession,
    topic_id: int | None = None,
    subtopic_id: int | None = None,
    difficulty: str | None = Query(default=None, pattern="^(easy|medium|hard)$"),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[Question]:
    query = select(Question).join(Question.subtopic).where(Question.is_active.is_(True), Subtopic.is_active.is_(True))
    if topic_id is not None:
        query = query.where(Subtopic.topic_id == topic_id)
    if subtopic_id is not None:
        query = query.where(Question.subtopic_id == subtopic_id)
    if difficulty is not None:
        query = query.where(Question.difficulty == difficulty)
    return list((await db.scalars(query.order_by(Question.id).limit(limit))).all())


@router.get("/questions/{question_id}", response_model=QuestionRead)
async def get_question(question_id: str, db: DbSession) -> Question:
    return await db.scalar(select(Question).where(Question.id == question_id, Question.is_active.is_(True))) or _not_found()


def _not_found():
    from fastapi import HTTPException

    raise HTTPException(status_code=404, detail="Question not found")