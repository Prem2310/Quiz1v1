"""Idempotently create the indexes the adaptive queries rely on.

The Supabase database was created outside this repo's Alembic chain (its alembic_version matches no revision here),
so `alembic upgrade` can't be used on it. Every statement is IF NOT EXISTS: safe to run repeatedly, on any database.

    python scripts/ensure_indexes.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.db import engine  # noqa: E402

INDEXES = [
    # declared index=True in the models but missing from the live database
    ("ix_question_subtopic_id", "question", "subtopic_id"),
    ("ix_quiz_questions_quiz_history_id", "quiz_questions", "quiz_history_id"),
    ("ix_quiz_questions_question_id", "quiz_questions", "question_id"),
    ("ix_user_quiz_history_user_id", "user_quiz_history", "user_id"),
    ("ix_user_quiz_history_quiz_history_id", "user_quiz_history", "quiz_history_id"),
    ("ix_user_quiz_response_user_quiz_history_id", "user_quiz_response", "user_quiz_history_id"),
    ("ix_user_quiz_response_question_id", "user_quiz_response", "question_id"),
    # "what is due for this user, most urgent first" (selection + due_for_review count)
    ("ix_user_question_stats_user_due", "user_question_stats", "user_id, due_at"),
    # head-to-head history lookups
    ("ix_duel_match_pair_status", "duel_match", "player1_id, player2_id, status"),
]


async def main() -> None:
    async with engine.begin() as conn:
        for name, table, columns in INDEXES:
            await conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({columns})"))
            print(f"ok  {name}")
        if engine.dialect.name == "postgresql":
            for table in {t for _, t, _ in INDEXES}:
                await conn.execute(text(f"ANALYZE {table}"))
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
