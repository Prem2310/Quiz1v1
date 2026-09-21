"""Elo rating and league-tier helpers shared by duels and analytics."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import UserData

ELO_K = 32.0

# Duel scoring. A correct answer is worth BASE_POINTS plus a speed bonus that shrinks linearly to 0 at the time limit;
# wrong or unanswered is 0. So points, not the number of correct answers, decide a duel: two fast answers can beat three slow ones.
BASE_POINTS = 10
SPEED_BONUS_MAX = 10
XP_PER_CORRECT_DUEL = 4
DUEL_XP_BY_OUTCOME = {"win": 20, "draw": 8, "loss": 4}


def answer_points(correct: bool, seconds: int, time_limit: int) -> int:
    """Points for one duel answer. Whole seconds, so it can be recomputed from the stored answer and always matches the score."""
    if not correct:
        return 0
    remaining = max(0.0, (time_limit - seconds) / time_limit)
    return BASE_POINTS + round(SPEED_BONUS_MAX * remaining)


def duel_xp(correct: int, outcome: str) -> int:
    """XP for a finished duel: per correct answer plus a bonus for the outcome ("win" | "draw" | "loss")."""
    return correct * XP_PER_CORRECT_DUEL + DUEL_XP_BY_OUTCOME[outcome]

# Rating -> league label, ascending thresholds (matiks-style tiers).
LEAGUE_THRESHOLDS: list[tuple[float, str]] = [
    (1000, "Novice"),
    (1200, "Bronze"),
    (1400, "Silver"),
    (1600, "Gold"),
    (1800, "Platinum"),
    (float("inf"), "Diamond"),
]


def league_for_rating(rating: float) -> str:
    for ceiling, label in LEAGUE_THRESHOLDS:
        if rating < ceiling:
            return label
    return LEAGUE_THRESHOLDS[-1][1]


def elo_deltas(rating_a: float, rating_b: float, score_a: float, k: float = ELO_K) -> tuple[float, float]:
    """Standard Elo update. `score_a` is 1 for a win, 0.5 for a draw, 0 for a loss (player A's result).

    Returns (delta_a, delta_b) to add to each player's rating.
    """
    expected_a = 1 / (1 + 10 ** ((rating_b - rating_a) / 400))
    delta_a = k * (score_a - expected_a)
    return delta_a, -delta_a


def rematch_factor(recent_rematches: int) -> float:
    """Elo damping for the same two players duelling repeatedly in a short window (blocks rating farming)."""
    return max(0.25, 1 - 0.25 * recent_rematches)


def bump_daily_streak(user: "UserData", now: datetime | None = None) -> None:
    """Update a user's daily activity streak after any completed quiz/duel."""
    now = now or datetime.now(UTC)
    today = now.date()
    last = user.last_active_date.date() if user.last_active_date else None
    if last == today:
        pass  # already counted today
    elif last is not None and (today - last).days == 1:
        user.current_streak += 1
    else:
        user.current_streak = 1
    user.max_streak = max(user.max_streak, user.current_streak)
    user.last_active_date = now
