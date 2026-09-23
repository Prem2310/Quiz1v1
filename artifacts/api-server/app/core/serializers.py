"""Small helpers that turn ORM rows into response schemas that need derived fields."""

from __future__ import annotations

from app.core.scoring import league_for_rating
from app.models import UserData
from app.schemas import UserRead


def to_user_read(user: UserData) -> UserRead:
    return UserRead(
        id=user.id,
        name=user.name,
        email=user.email,
        username=user.username,
        college_name=user.college_name,
        profile_picture_url=user.profile_picture_url,
        total_points=user.total_points,
        total_correct=user.total_correct,
        total_incorrect=user.total_incorrect,
        rank=user.rank,
        user_rating=user.user_rating,
        matches_played=user.matches_played,
        current_streak=user.current_streak,
        max_streak=user.max_streak,
        total_xp=user.total_xp,
        best_rating=user.best_rating,
        league=league_for_rating(user.user_rating),
        date_joined=user.date_joined,
    )
