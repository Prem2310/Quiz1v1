"""One-time loader for the scraped IndiaBix dataset (topic/subtopic/question dumps).

Usage (run against the Postgres/Supabase database configured in .env, after
`alembic upgrade head` has created the schema):

    python scripts/import_indiabix.py \\
        --topic "C:/Users/premr/Downloads/topic_rows.sql" \\
        --subtopic "C:/Users/premr/Downloads/subtopic_rows.sql" \\
        --question "C:/Users/premr/Downloads/question_rows.sql"

Each file is a Supabase-exported `INSERT INTO ...` dump for one table. By default
existing rows in those three tables are truncated first (--no-replace to append/skip
instead) so the script is safe to re-run.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402

# These IndiaBix subtopics present each question as one of a set that shares a single
# "Directions to Solve" passage/table/chart, scraped into question.directions_html. A
# subtopic is only safe to show once every one of its questions carries that context —
# otherwise some questions in it would render with no way to answer them.
CONTEXT_DEPENDENT_SLUGS = (
    "table-charts",
    "bar-charts",
    "pie-charts",
    "line-charts",
    "comprehension",
    "closet-test",
)


def to_asyncpg_dsn(sqlalchemy_url: str) -> str:
    return sqlalchemy_url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def load_file(conn: asyncpg.Connection, path: Path, label: str) -> None:
    if not path.exists():
        raise FileNotFoundError(f"{label} file not found: {path}")
    sql = path.read_text(encoding="utf-8")
    print(f"Loading {label} from {path} ({len(sql):,} bytes)...")
    await conn.execute(sql)


async def run(args: argparse.Namespace) -> None:
    settings = get_settings()
    dsn = to_asyncpg_dsn(settings.async_database_url)
    if not dsn.startswith("postgresql://"):
        raise SystemExit(
            "This script only imports into Postgres/Supabase. "
            "Set SUPABASE_DATABASE_URL (or DATABASE_URL) in artifacts/api-server/.env first."
        )

    conn = await asyncpg.connect(dsn)
    try:
        async with conn.transaction():
            if args.replace:
                print("Truncating topic, subtopic, question (CASCADE)...")
                await conn.execute("TRUNCATE TABLE topic, subtopic, question RESTART IDENTITY CASCADE")

            await load_file(conn, args.topic, "topic")
            await load_file(conn, args.subtopic, "subtopic")
            await load_file(conn, args.question, "question")

            # A context-dependent subtopic goes active only once none of its questions are
            # still missing directions_html; otherwise (partially or fully un-scraped) it's
            # deactivated so it can't be picked for practice/duels yet.
            updated = await conn.fetch(
                """
                UPDATE subtopic
                SET is_active = NOT EXISTS (
                    SELECT 1 FROM question
                    WHERE question.subtopic_id = subtopic.id
                      AND question.directions_html IS NULL
                )
                WHERE slug = ANY($1::text[])
                RETURNING id, slug, is_active
                """,
                list(CONTEXT_DEPENDENT_SLUGS),
            )
            for row in updated:
                status = "activated" if row["is_active"] else "deactivated (missing directions_html)"
                print(f"Subtopic '{row['slug']}': {status}")

        counts = await conn.fetchrow(
            "SELECT (SELECT count(*) FROM topic) AS topics, "
            "(SELECT count(*) FROM subtopic) AS subtopics, "
            "(SELECT count(*) FROM question) AS questions"
        )
        print(f"Done. topics={counts['topics']} subtopics={counts['subtopics']} questions={counts['questions']}")
    finally:
        await conn.close()


def parse_args() -> argparse.Namespace:
    downloads = Path.home() / "Downloads"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topic", type=Path, default=downloads / "topic_rows.sql")
    parser.add_argument("--subtopic", type=Path, default=downloads / "subtopic_rows.sql")
    parser.add_argument("--question", type=Path, default=downloads / "question_rows.sql")
    parser.add_argument(
        "--no-replace",
        dest="replace",
        action="store_false",
        help="Do not truncate topic/subtopic/question before loading (append instead).",
    )
    parser.set_defaults(replace=True)
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
