"""Idempotently add the Google/GitHub sign-in columns to a PostgreSQL database.

The Supabase database sits outside this repo's Alembic chain (see ensure_indexes.py), and it runs with
AUTO_CREATE_TABLES=false, so neither `alembic upgrade` nor `create_all` will add these. Safe to run repeatedly.

    python scripts/ensure_oauth_columns.py

Local SQLite (quizit.db) cannot be altered this way: delete the file and let the app recreate it.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.db import engine  # noqa: E402

STATEMENTS = [
    "ALTER TABLE user_data ALTER COLUMN password_hash DROP NOT NULL",
    "ALTER TABLE user_data ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20)",
    "ALTER TABLE user_data ADD COLUMN IF NOT EXISTS provider_account_id VARCHAR(255)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_auth_provider_account ON user_data (auth_provider, provider_account_id)",
]


async def main() -> None:
    if engine.dialect.name != "postgresql":
        raise SystemExit("This script is for PostgreSQL. For local SQLite, delete quizit.db and restart the API.")
    async with engine.begin() as conn:
        for statement in STATEMENTS:
            await conn.execute(text(statement))
    print(f"Applied {len(STATEMENTS)} statements.")


if __name__ == "__main__":
    asyncio.run(main())
