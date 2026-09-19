from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

JsonType = JSON().with_variant(JSONB, "postgresql")


class UserData(Base):
    __tablename__ = "user_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    college_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    profile_picture_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    date_joined: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    total_points: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_correct: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_incorrect: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_rating: Mapped[float] = mapped_column(Float, default=1000, server_default="1000")
    matches_played: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    current_streak: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    max_streak: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_xp: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    best_rating: Mapped[float] = mapped_column(Float, default=1000, server_default="1000")
    last_active_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    preferred_mode: Mapped[str | None] = mapped_column(String(30), nullable=True)

    quiz_attempts: Mapped[list["UserQuizHistory"]] = relationship(back_populates="user", foreign_keys="UserQuizHistory.user_id")
    question_stats: Mapped[list["UserQuestionStats"]] = relationship(back_populates="user")


class Topic(Base):
    __tablename__ = "topic"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True)

    subtopics: Mapped[list["Subtopic"]] = relationship(back_populates="topic")


class Subtopic(Base):
    __tablename__ = "subtopic"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topic.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    slug: Mapped[str] = mapped_column(String(140), index=True)

    topic: Mapped["Topic"] = relationship(back_populates="subtopics")
    questions: Mapped[list["Question"]] = relationship(back_populates="subtopic")


class Question(Base):
    __tablename__ = "question"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    subtopic_id: Mapped[int] = mapped_column(ForeignKey("subtopic.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    text_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    # IndiaBix's "Directions to Solve" context (passage/table/chart) is shared by a group of
    # questions, but stored per-question (denormalized) so a quiz or duel can freely mix
    # questions from different subtopics without needing to also carry a grouping key.
    directions_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[Any] = mapped_column(JsonType)
    options_html: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_letter: Mapped[str | None] = mapped_column(String(4), nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(20), default="medium", index=True)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(255), default="indiabix", server_default="indiabix")
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    question_hash: Mapped[str | None] = mapped_column(String(160), nullable=True, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    subtopic: Mapped["Subtopic"] = relationship(back_populates="questions")


class QuizHistory(Base):
    __tablename__ = "quiz_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True, index=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topic.id"), nullable=True)
    time_per_question: Mapped[int | None] = mapped_column(Integer, nullable=True)
    num_questions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quiz_mode: Mapped[str] = mapped_column(String(30), default="practice", server_default="practice")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quiz_history_id: Mapped[int] = mapped_column(ForeignKey("quiz_history.id"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("question.id"), index=True)
    question_order: Mapped[int] = mapped_column(Integer, default=0)
    marks: Mapped[float] = mapped_column(Numeric, default=1, server_default="1")
    negative_marks: Mapped[float] = mapped_column(Numeric, default=0, server_default="0")


class UserQuizHistory(Base):
    __tablename__ = "user_quiz_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_data.id"), index=True)
    quiz_history_id: Mapped[int] = mapped_column(ForeignKey("quiz_history.id"), index=True)
    points_scored: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    correct_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    skipped_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    time_taken_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="in_progress", server_default="in_progress")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["UserData"] = relationship(back_populates="quiz_attempts", foreign_keys=[user_id])


class UserQuizResponse(Base):
    __tablename__ = "user_quiz_response"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_quiz_history_id: Mapped[int] = mapped_column(ForeignKey("user_quiz_history.id"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("question.id"), index=True)
    attempted_option: Mapped[str | None] = mapped_column(String(4), nullable=True)
    selected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    marks_obtained: Mapped[float] = mapped_column(Numeric, default=0, server_default="0")
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_taken_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserQuestionStats(Base):
    """Per-user, per-question mastery tracking (Leitner-style spaced repetition)."""

    __tablename__ = "user_question_stats"
    __table_args__ = (UniqueConstraint("user_id", "question_id", name="uq_user_question_stats_user_question"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_data.id"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("question.id"), index=True)
    subtopic_id: Mapped[int] = mapped_column(ForeignKey("subtopic.id"), index=True)
    box_level: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    times_seen: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    times_correct: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    times_incorrect: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped["UserData"] = relationship(back_populates="question_stats")


class FriendRequest(Base):
    """One row per friend request. Accepted requests (in either direction) are friendships."""

    __tablename__ = "friend_request"
    __table_args__ = (UniqueConstraint("requester_id", "addressee_id", name="uq_friend_request_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("user_data.id"), index=True)
    addressee_id: Mapped[int] = mapped_column(ForeignKey("user_data.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DuelChallenge(Base):
    """A direct 1v1 challenge between two known users (friends or rematches), outside matchmaking."""

    __tablename__ = "duel_challenge"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    challenger_id: Mapped[int] = mapped_column(ForeignKey("user_data.id"), index=True)
    opponent_id: Mapped[int] = mapped_column(ForeignKey("user_data.id"), index=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topic.id"), nullable=True)
    num_questions: Mapped[int] = mapped_column(Integer, default=10, server_default="10")
    time_per_question: Mapped[int] = mapped_column(Integer, default=15, server_default="15")
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    duel_match_id: Mapped[int | None] = mapped_column(ForeignKey("duel_match.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DuelMatch(Base):
    """Pairs two UserQuizHistory attempts (one per player) under a shared QuizHistory room."""

    __tablename__ = "duel_match"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quiz_history_id: Mapped[int] = mapped_column(ForeignKey("quiz_history.id"), unique=True, index=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topic.id"), nullable=True)
    player1_id: Mapped[int] = mapped_column(ForeignKey("user_data.id"), index=True)
    player2_id: Mapped[int] = mapped_column(ForeignKey("user_data.id"), index=True)
    player1_attempt_id: Mapped[int | None] = mapped_column(ForeignKey("user_quiz_history.id"), nullable=True)
    player2_attempt_id: Mapped[int | None] = mapped_column(ForeignKey("user_quiz_history.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="waiting", server_default="waiting")
    player1_rating_before: Mapped[float] = mapped_column(Float)
    player2_rating_before: Mapped[float] = mapped_column(Float)
    player1_rating_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    player2_rating_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("user_data.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
