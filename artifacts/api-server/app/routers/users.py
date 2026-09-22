"""Public user profiles: the read-only card behind clicking a name on the leaderboard or friends list."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select

from app.core.scoring import league_for_rating
from app.dependencies import CurrentUser, DbSession
from app.models import FriendRequest, UserData
from app.schemas import PublicProfile

router = APIRouter(prefix="/users", tags=["users"])


async def _friend_status(db: DbSession, viewer_id: int, target_id: int) -> str:
    if viewer_id == target_id:
        return "self"
    existing = await db.scalar(
        select(FriendRequest).where(
            or_(
                (FriendRequest.requester_id == viewer_id) & (FriendRequest.addressee_id == target_id),
                (FriendRequest.requester_id == target_id) & (FriendRequest.addressee_id == viewer_id),
            )
        )
    )
    if existing is None:
        return "none"
    if existing.status == "accepted":
        return "friends"
    if existing.status != "pending":
        return "none"
    return "pending_outgoing" if existing.requester_id == viewer_id else "pending_incoming"


@router.get("/{username}", response_model=PublicProfile)
async def get_public_profile(username: str, current_user: CurrentUser, db: DbSession) -> PublicProfile:
    target = await db.scalar(select(UserData).where(UserData.username.ilike(username), UserData.is_active.is_(True)))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No user with that username")

    rank = await db.scalar(select(func.count(UserData.id)).where(UserData.is_active.is_(True), UserData.user_rating > target.user_rating))
    total = target.total_correct + target.total_incorrect
    accuracy = round(target.total_correct / total * 100, 2) if total else 0

    return PublicProfile(
        user_id=target.id,
        username=target.username,
        name=target.name,
        college_name=target.college_name,
        rating=target.user_rating,
        best_rating=target.best_rating,
        league=league_for_rating(target.user_rating),
        rank=int(rank or 0) + 1,
        current_streak=target.current_streak,
        max_streak=target.max_streak,
        total_xp=target.total_xp,
        matches_played=target.matches_played,
        total_correct=target.total_correct,
        total_incorrect=target.total_incorrect,
        accuracy=accuracy,
        friend_status=await _friend_status(db, current_user.id, target.id),
        joined_at=target.date_joined,
    )
