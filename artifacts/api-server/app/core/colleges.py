"""The shared college list: cleaning a typed name and finding-or-adding it, so everyone spells a college the same way."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import College

MIN_LEN, MAX_LEN = 3, 180


def clean_name(name: str) -> str:
    """Collapse runs of whitespace; reject anything that can't be a college name."""
    cleaned = re.sub(r"\s+", " ", name).strip()
    if not (MIN_LEN <= len(cleaned) <= MAX_LEN) or len(re.findall(r"[^\W\d_]", cleaned)) < 3:
        raise ValueError("Enter your college's full name")
    return cleaned


def name_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


async def ensure_college(db: AsyncSession, name: str) -> College:
    """Return the listed college with this name (however it is cased or spaced), adding it first if it is new."""
    cleaned = clean_name(name)
    key = name_key(cleaned)
    existing = await db.scalar(select(College).where(College.name_key == key))
    if existing is not None:
        return existing
    college = College(name=cleaned, name_key=key, source="user")
    try:
        async with db.begin_nested():  # a savepoint: losing a race to add the same name must not poison the caller's transaction
            db.add(college)
    except IntegrityError:
        return await db.scalar(select(College).where(College.name_key == key))  # type: ignore[return-value]
    return college
