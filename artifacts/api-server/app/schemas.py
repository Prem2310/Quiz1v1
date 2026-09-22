from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class HealthStatus(BaseModel):
    status: str
    database: str = "not_checked"
    redis: str = "not_configured"


class PublicStats(BaseModel):
    registered_users: int
    online_now: int


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)
    college_name: str | None = Field(default=None, max_length=180)


class AuthProviders(BaseModel):
    providers: list[Literal["google", "github"]]


class CollegeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class UserLogin(BaseModel):
    email_or_username: str = Field(min_length=3)
    password: str = Field(min_length=1)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    username: str | None = Field(default=None, min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_]+$")
    college_name: str | None = Field(default=None, max_length=180)
    profile_picture_url: str | None = Field(default=None, max_length=500)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    username: str
    college_name: str | None = None
    profile_picture_url: str | None = None
    total_points: int
    total_correct: int
    total_incorrect: int
    rank: int | None = None
    user_rating: float
    matches_played: int
    current_streak: int
    max_streak: int
    total_xp: int
    best_rating: float
    league: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserRead


class TopicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None = None


class SubtopicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    topic_id: int
    name: str
    slug: str
    description: str | None = None


class QuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subtopic_id: int
    text: str
    text_html: str | None = None
    directions_html: str | None = None
    options: Any
    options_html: Any | None = None
    answer_letter: str | None = None
    explanation: str | None = None
    explanation_html: str | None = None
    difficulty: str | None = None


QuizMode = Literal["practice", "weak_topics", "personalized", "challenge", "duel"]


class QuizCreate(BaseModel):
    topic_id: int | None = None
    subtopic_id: int | None = None
    num_questions: int = Field(default=10, ge=1, le=100)
    time_per_question: int = Field(default=30, ge=5, le=300)
    quiz_mode: QuizMode = "practice"

    @field_validator("subtopic_id")
    @classmethod
    def require_scope(cls, value: int | None, info):
        if value is None and info.data.get("topic_id") is None:
            return None
        return value


class QuizRead(BaseModel):
    id: int
    room_id: str | None
    topic_id: int | None
    time_per_question: int | None
    num_questions: int | None
    quiz_mode: str
    question_ids: list[str]


class QuizStart(BaseModel):
    attempt_id: int
    quiz: QuizRead
    questions: list[QuestionRead]


class ResponseCreate(BaseModel):
    question_id: str
    selected_answer: str | None = None
    time_taken: int | None = Field(default=None, ge=0, le=3600)


class ResponseRead(BaseModel):
    question_id: str
    selected_answer: str | None
    is_correct: bool
    time_taken: int | None
    correct_answer: str | None = None
    explanation: str | None = None


class QuizCompleteRequest(BaseModel):
    """Practice mode sends every answer in one shot at the end (no per-question round trips)."""

    responses: list[ResponseCreate] = Field(default_factory=list)


class QuestionReview(BaseModel):
    """One reviewed question: what was asked, what the user picked, and the explanation."""

    question_id: str
    text: str
    text_html: str | None = None
    directions_html: str | None = None
    options: Any
    options_html: Any | None = None
    selected_answer: str | None
    correct_answer: str | None
    is_correct: bool
    explanation: str | None = None
    explanation_html: str | None = None


class QuizComplete(BaseModel):
    attempt_id: int
    score: int
    total_correct: int
    total_incorrect: int
    total_questions: int = 0
    accuracy: float
    xp_gained: int = 0
    review: list[QuestionReview] = Field(default_factory=list)


class AnalyticsSummary(BaseModel):
    total_points: int
    total_correct: int
    total_incorrect: int
    accuracy: float
    matches_played: int
    rating: float
    rank: int | None
    recommended_topic: str | None
    current_streak: int
    max_streak: int
    total_xp: int
    league: str
    due_for_review: int


class AttemptSummary(BaseModel):
    attempt_id: int
    quiz_id: int
    quiz_mode: str
    score: int
    total_correct: int
    total_incorrect: int
    accuracy: float
    completed_at: datetime | None


class TopicInsight(BaseModel):
    topic_id: int
    topic_name: str
    total_answered: int
    correct: int
    accuracy: float


class SubtopicWeakness(BaseModel):
    subtopic_id: int
    subtopic_name: str
    topic_id: int
    topic_name: str
    attempted: int
    accuracy: float
    weakness: float
    unresolved: int
    due_for_review: int


LeaderboardScope = Literal["global", "college", "friends"]


class RatingPoint(BaseModel):
    """One finished duel on the rating graph."""

    duel_id: int
    completed_at: datetime | None
    rating_before: float
    rating_after: float
    result: Literal["win", "loss", "draw"]
    opponent_name: str
    my_score: int
    opponent_score: int


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    username: str
    name: str
    college_name: str | None = None
    total_points: int
    user_rating: float
    league: str
    is_me: bool = False


class ProgressTrendPoint(BaseModel):
    date: str
    attempts: int
    correct: int
    incorrect: int
    accuracy: float


# --- Duels / matchmaking -------------------------------------------------


class DuelOpponent(BaseModel):
    user_id: int
    username: str
    name: str
    rating: float
    league: str


class DuelSummary(BaseModel):
    id: int
    status: str
    quiz_history_id: int
    room_id: str | None
    topic_id: int | None
    player1: DuelOpponent
    player2: DuelOpponent
    player1_score: int
    player2_score: int
    player1_correct: int = 0
    player2_correct: int = 0
    player1_xp: int | None = None
    player2_xp: int | None = None
    winner_id: int | None
    player1_rating_before: float
    player2_rating_before: float
    player1_rating_after: float | None
    player2_rating_after: float | None
    started_at: datetime | None
    completed_at: datetime | None


class DuelPlayerAnswer(BaseModel):
    selected_answer: str | None
    is_correct: bool
    time_taken_seconds: int | None = None
    points: int = 0


class DuelQuestionReview(BaseModel):
    """One duel question with both players' answers, for the post-duel review."""

    question_id: str
    text: str
    text_html: str | None = None
    directions_html: str | None = None
    options: Any
    options_html: Any | None = None
    correct_answer: str | None
    explanation: str | None = None
    explanation_html: str | None = None
    player1: DuelPlayerAnswer
    player2: DuelPlayerAnswer


class DuelChallengeCreate(BaseModel):
    opponent_id: int
    topic_id: int | None = None
    num_questions: int = Field(default=10, ge=1, le=50)
    time_per_question: int = Field(default=15, ge=5, le=120)


class DuelChallengeRead(BaseModel):
    id: int
    status: Literal["pending", "accepted", "declined", "cancelled", "expired"]
    challenger: DuelOpponent
    opponent: DuelOpponent
    topic_id: int | None
    topic_name: str | None = None
    num_questions: int
    time_per_question: int
    duel_match_id: int | None = None
    created_at: datetime
    expires_at: datetime


# --- Friends ---------------------------------------------------------------


class UserSummary(BaseModel):
    """Lightweight user card for search results, friend lists, and challenge targets."""

    user_id: int
    username: str
    name: str
    college_name: str | None = None
    rating: float
    league: str
    friend_status: Literal["none", "friends", "pending_outgoing", "pending_incoming", "self"] = "none"


class PublicProfile(BaseModel):
    """Another player's public card: identity, rating, and stats, plus how the viewer relates to them."""

    user_id: int
    username: str
    name: str
    college_name: str | None = None
    rating: float
    best_rating: float
    league: str
    rank: int
    current_streak: int
    max_streak: int
    total_xp: int
    matches_played: int
    total_correct: int
    total_incorrect: int
    accuracy: float
    friend_status: Literal["none", "friends", "pending_outgoing", "pending_incoming", "self"] = "none"
    joined_at: datetime


class FriendRequestRead(BaseModel):
    id: int
    status: Literal["pending", "accepted", "declined"]
    requester: DuelOpponent
    addressee: DuelOpponent
    created_at: datetime



class HeadToHeadResult(BaseModel):
    duel_id: int
    result: Literal["win", "loss", "draw"]
    rating_change: float
    completed_at: datetime | None = None


class HeadToHead(BaseModel):
    opponent_id: int
    played: int
    wins: int
    losses: int
    draws: int
    recent: list[HeadToHeadResult] = Field(default_factory=list)
