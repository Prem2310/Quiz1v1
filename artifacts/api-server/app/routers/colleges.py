from fastapi import APIRouter, Query
from sqlalchemy import case, select

from app.core.colleges import name_key
from app.dependencies import DbSession
from app.models import College
from app.schemas import CollegeRead

router = APIRouter(prefix="/colleges", tags=["colleges"])


@router.get("", response_model=list[CollegeRead])
async def list_colleges(db: DbSession, q: str = Query(default="", max_length=100), limit: int = Query(default=25, ge=1, le=100)) -> list[CollegeRead]:
    """Search the college list. Public, so the signup form can use it. Every word must match; names starting with the query come first."""
    query = select(College)
    key = name_key(q)
    if key:
        for word in key.split():  # every word must appear, in any order: "delhi technology" finds "Technology, Delhi"
            query = query.where(College.name_key.contains(word))
        query = query.order_by(case((College.name_key.startswith(key), 0), else_=1), College.name)
    else:
        query = query.order_by(College.name)
    return [CollegeRead.model_validate(c) for c in (await db.scalars(query.limit(limit))).all()]
