"""Backfill question.directions_html by re-fetching each question's own IndiaBix source_url.

Some subtopics (table-charts, bar-charts, pie-charts, line-charts, comprehension,
closet-test) present a set of questions that share one "Directions to Solve"
passage/table/chart — scraped separately from the question text, or not at all.
Every already-imported question kept its exact source_url, so we just re-fetch each
distinct URL once and copy its "Directions to Solve" block onto every question that
came from it. A subtopic is reactivated once none of its questions are missing it.

Usage (run against the Postgres/Supabase database configured in .env):

    python scripts/backfill_directions.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import asyncpg
import httpx
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402

REQUEST_DELAY_SECONDS = 0.5  # be polite to indiabix.com
REQUEST_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; QuizItBot/1.0)"}


def extract_directions_html(page_html: str) -> str | None:
    """Pull the cleaned "Directions to Solve" block out of an IndiaBix exercise page."""
    soup = BeautifulSoup(page_html, "html.parser")
    direction = soup.find(id="direction")
    if direction is None:
        return None
    for junk in direction.select('[class*="google"], script, ins, iframe'):
        junk.decompose()
    text_block = direction.find(class_="direction-text")
    html = (text_block or direction).decode_contents().strip()
    return html or None


async def run() -> None:
    settings = get_settings()
    dsn = settings.async_database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if not dsn.startswith("postgresql://"):
        raise SystemExit(
            "This script only backfills into Postgres/Supabase. "
            "Set SUPABASE_DATABASE_URL (or DATABASE_URL) in artifacts/api-server/.env first."
        )

    conn = await asyncpg.connect(dsn)
    try:
        rows = await conn.fetch(
            "SELECT DISTINCT source_url FROM question WHERE directions_html IS NULL AND source_url IS NOT NULL"
        )
        urls = [row["source_url"] for row in rows]
        print(f"{len(urls)} source page(s) to fetch.")

        async with httpx.AsyncClient(timeout=20, headers=REQUEST_HEADERS) as client:
            for i, url in enumerate(urls, 1):
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                except httpx.HTTPError as exc:
                    print(f"[{i}/{len(urls)}] FAILED to fetch {url}: {exc}")
                    continue

                directions = extract_directions_html(response.text)
                if directions is None:
                    print(f"[{i}/{len(urls)}] no Directions block on {url}, skipping")
                    continue

                result = await conn.execute(
                    "UPDATE question SET directions_html = $1 WHERE source_url = $2 AND directions_html IS NULL",
                    directions,
                    url,
                )
                print(f"[{i}/{len(urls)}] {url} -> {result}")
                await asyncio.sleep(REQUEST_DELAY_SECONDS)

        # Reactivate any subtopic that uses directions_html once none of its questions
        # are missing it anymore; leave everything else (already-active subtopics with
        # no directions concept) untouched.
        updated = await conn.fetch(
            """
            UPDATE subtopic
            SET is_active = NOT EXISTS (
                SELECT 1 FROM question
                WHERE question.subtopic_id = subtopic.id
                  AND question.directions_html IS NULL
            )
            WHERE id IN (SELECT DISTINCT subtopic_id FROM question WHERE directions_html IS NOT NULL)
            RETURNING slug, is_active
            """
        )
        for row in updated:
            status = "activated" if row["is_active"] else "left deactivated (still missing directions_html)"
            print(f"subtopic '{row['slug']}': {status}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run())
