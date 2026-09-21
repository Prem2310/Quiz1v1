"""Repair duel_match rows whose per-player columns were written by socket join order instead of by player1_id/player2_id.

Before the fix in DuelSession._finish, `player1_attempt_id` / `player1_rating_after` described whichever player connected
first, so for a duel where player2 connected first they held player2's data. The attempt's own user_id tells us which
player each slot really belongs to; when the slots are crossed, swap the attempt ids and the rating_after values together.

Dry run by default (read-only). Nothing is written without --apply.

    python scripts/fix_duel_attribution.py            # report what would change
    python scripts/fix_duel_attribution.py --apply    # swap the crossed rows
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import DuelMatch, UserQuizHistory  # noqa: E402


async def main(apply: bool) -> None:
    async with SessionLocal() as db:
        matches = list((await db.scalars(select(DuelMatch).where(DuelMatch.status == "completed"))).all())
        attempts = {a.id: a for a in (await db.scalars(select(UserQuizHistory).where(UserQuizHistory.id.in_([i for m in matches for i in (m.player1_attempt_id, m.player2_attempt_id) if i])))).all()}

        crossed = []
        for m in matches:
            first, second = attempts.get(m.player1_attempt_id), attempts.get(m.player2_attempt_id)
            if first is not None and second is not None and first.user_id == m.player2_id and second.user_id == m.player1_id:
                crossed.append(m)

        print(f"{len(matches)} completed duels, {len(crossed)} with crossed player slots")
        for m in crossed:
            print(f"  duel {m.id}: p1={m.player1_id} after {m.player1_rating_after} / p2={m.player2_id} after {m.player2_rating_after}")
            if apply:
                m.player1_attempt_id, m.player2_attempt_id = m.player2_attempt_id, m.player1_attempt_id
                m.player1_rating_after, m.player2_rating_after = m.player2_rating_after, m.player1_rating_after
        if apply and crossed:
            await db.commit()
            print(f"swapped {len(crossed)} rows")
        elif crossed:
            print("dry run: re-run with --apply to swap them")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
