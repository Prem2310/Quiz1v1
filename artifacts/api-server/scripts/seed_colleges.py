"""Create the college table if needed and add every college in app/data/colleges_in.txt that is not already listed.
Colleges that users already typed into their profiles are listed too, so nobody has to retype theirs.

Safe to run repeatedly, on any database (this is how the Supabase database gets the table, since it sits outside the
Alembic chain and runs with AUTO_CREATE_TABLES=false):

    python scripts/seed_colleges.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.colleges import clean_name, name_key  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.models import College, UserData  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "app" / "data" / "colleges_in.txt"


def read_names() -> list[str]:
    return [line.strip() for line in DATA.read_text(encoding="utf-8").splitlines() if line.strip() and not line.startswith("#")]


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: College.__table__.create(sync_conn, checkfirst=True))
    async with SessionLocal() as db:
        listed = set((await db.scalars(select(College.name_key))).all())
        added = 0
        typed = (await db.scalars(select(UserData.college_name).where(UserData.college_name.is_not(None)).distinct())).all()
        for raw, source in [(n, "seed") for n in read_names()] + [(n, "user") for n in typed]:
            try:
                name = clean_name(raw)
            except ValueError:  # junk someone typed before there was validation: leave it on their profile, out of the list
                continue
            key = name_key(name)
            if key not in listed:
                db.add(College(name=name, name_key=key, source=source))
                listed.add(key)
                added += 1
        await db.commit()
    print(f"Added {added} colleges ({len(listed)} listed).")


if __name__ == "__main__":
    asyncio.run(main())
