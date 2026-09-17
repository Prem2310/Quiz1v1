from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.mastery import due_at_for_box, next_box_level
from app.core.scoring import bump_daily_streak
from app.dependencies import CurrentUser, DbSession
from app.models import Question, QuizHistory, QuizQuestion, Subtopic, UserData, UserQuestionStats, UserQuizHistory, UserQuizResponse
from app.schemas import (
    QuestionRead,
    QuestionReview,
    QuizComplete,
    QuizCompleteRequest,
    QuizCreate,
    QuizRead,
    QuizStart,
)

router = APIRouter(prefix="/quizzes", tags=["quizzes"])

XP_PER_CORRECT = 5


def _quiz_read(quiz: QuizHistory, question_ids: list[str]) -> QuizRead:
    return QuizRead(
        id=quiz.id,
        room_id=quiz.room_id,
        topic_id=quiz.topic_id,
        time_per_question=quiz.time_per_question,
        num_questions=quiz.num_questions,
        quiz_mode=quiz.quiz_mode,
        question_ids=question_ids,
    )


async def _load_question_ids(db: DbSession, quiz_id: int) -> list[str]:
    rows = await db.scalars(select(QuizQuestion.question_id).where(QuizQuestion.quiz_history_id == quiz_id).order_by(QuizQuestion.question_order))
    return list(rows.all())


async def _pick_weak_topic_questions(db: DbSession, user_id: int, topic_id: int | None, subtopic_id: int | None, limit: int) -> list[str]:
    """Questions due for review (Leitner box), oldest-due first, in the requested scope."""
    query = (
        select(UserQuestionStats.question_id)
        .join(Subtopic, Subtopic.id == UserQuestionStats.subtopic_id)
        .where(UserQuestionStats.user_id == user_id, UserQuestionStats.due_at <= func.now(), Subtopic.is_active.is_(True))
        .order_by(UserQuestionStats.due_at)
    )
    if subtopic_id is not None:
        query = query.where(UserQuestionStats.subtopic_id == subtopic_id)
    elif topic_id is not None:
        query = query.where(Subtopic.topic_id == topic_id)
    return list((await db.scalars(query.limit(limit))).all())


async def _pick_random_questions(db: DbSession, topic_id: int | None, subtopic_id: int | None, limit: int, exclude: list[str]) -> list[str]:
    if limit <= 0:
        return []
    query = select(Question.id).join(Question.subtopic).where(Question.is_active.is_(True), Subtopic.is_active.is_(True))
    if topic_id is not None:
        query = query.where(Subtopic.topic_id == topic_id)
    if subtopic_id is not None:
        query = query.where(Question.subtopic_id == subtopic_id)
    if exclude:
        query = query.where(Question.id.not_in(exclude))
    return list((await db.scalars(query.order_by(func.random()).limit(limit))).all())


@router.post("", response_model=QuizRead, status_code=status.HTTP_201_CREATED)
async def create_quiz(payload: QuizCreate, current_user: CurrentUser, db: DbSession) -> QuizRead:
    question_ids: list[str] = []
    if payload.quiz_mode == "weak_topics":
        question_ids = await _pick_weak_topic_questions(db, current_user.id, payload.topic_id, payload.subtopic_id, payload.num_questions)
    # Always top up with random questions from the same scope. If fewer questions exist than
    # requested, use however many are actually available instead of failing the request.
    if len(question_ids) < payload.num_questions:
        question_ids += await _pick_random_questions(
            db, payload.topic_id, payload.subtopic_id, payload.num_questions - len(question_ids), exclude=question_ids
        )
    if not question_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No questions are available for this selection yet")

    quiz = QuizHistory(
        topic_id=payload.topic_id,
        time_per_question=payload.time_per_question,
        num_questions=len(question_ids),
        quiz_mode=payload.quiz_mode,
    )
    db.add(quiz)
    await db.flush()
    db.add_all([QuizQuestion(quiz_history_id=quiz.id, question_id=question_id, question_order=order) for order, question_id in enumerate(question_ids)])
    await db.commit()
    return _quiz_read(quiz, question_ids)


@router.post("/{quiz_id}/start", response_model=QuizStart)
async def start_quiz(quiz_id: int, current_user: CurrentUser, db: DbSession) -> QuizStart:
    quiz = await db.get(QuizHistory, quiz_id)
    if quiz is None or not quiz.is_active:
        raise HTTPException(status_code=404, detail="Quiz not found")
    question_ids = await _load_question_ids(db, quiz_id)
    questions = list((await db.scalars(select(Question).where(Question.id.in_(question_ids)))).all())
    ordered_questions = sorted(questions, key=lambda question: question_ids.index(question.id))
    attempt = UserQuizHistory(user_id=current_user.id, quiz_history_id=quiz.id)
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return QuizStart(attempt_id=attempt.id, quiz=_quiz_read(quiz, question_ids), questions=[QuestionRead.model_validate(question) for question in ordered_questions])


def _is_correct(question: Question, selected_answer: str | None) -> bool:
    if selected_answer is None:
        return False
    return selected_answer.strip().lower() in {
        (question.answer or "").strip().lower(),
        (question.answer_letter or "").strip().lower(),
    }


async def _upsert_question_stats(db: DbSession, user_id: int, question: Question, is_correct: bool, now: datetime) -> None:
    stats = await db.scalar(select(UserQuestionStats).where(UserQuestionStats.user_id == user_id, UserQuestionStats.question_id == question.id))
    if stats is None:
        stats = UserQuestionStats(
            user_id=user_id,
            question_id=question.id,
            subtopic_id=question.subtopic_id,
            box_level=1,
            times_seen=0,
            times_correct=0,
            times_incorrect=0,
        )
        db.add(stats)
    stats.times_seen += 1
    if is_correct:
        stats.times_correct += 1
    else:
        stats.times_incorrect += 1
    stats.box_level = next_box_level(stats.box_level, is_correct)
    stats.last_seen_at = now
    stats.due_at = due_at_for_box(stats.box_level, now)


@router.post("/attempts/{attempt_id}/complete", response_model=QuizComplete)
async def complete_quiz(attempt_id: int, payload: QuizCompleteRequest, current_user: CurrentUser, db: DbSession) -> QuizComplete:
    """Grades every answer from the practice session in one call: no per-question round trips."""
    attempt = await db.scalar(select(UserQuizHistory).where(UserQuizHistory.id == attempt_id, UserQuizHistory.user_id == current_user.id))
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.completed_at is not None:
        raise HTTPException(status_code=409, detail="Attempt is already complete")

    question_ids = await _load_question_ids(db, attempt.quiz_history_id)
    questions = {q.id: q for q in (await db.scalars(select(Question).where(Question.id.in_(question_ids)))).all()}
    answers = {r.question_id: r for r in payload.responses if r.question_id in questions}

    now = datetime.now(UTC)
    review: list[QuestionReview] = []
    correct = 0
    for question_id in question_ids:
        question = questions[question_id]
        response = answers.get(question_id)
        selected = response.selected_answer if response else None
        is_correct = _is_correct(question, selected)
        if is_correct:
            correct += 1
        db.add(
            UserQuizResponse(
                user_quiz_history_id=attempt_id,
                question_id=question.id,
                attempted_option=selected,
                selected_answer=selected,
                is_correct=is_correct,
                marks_obtained=1 if is_correct else 0,
                time_taken_seconds=response.time_taken if response else None,
            )
        )
        await _upsert_question_stats(db, current_user.id, question, is_correct, now)
        review.append(
            QuestionReview(
                question_id=question.id,
                text=question.text,
                text_html=question.text_html,
                directions_html=question.directions_html,
                options=question.options,
                options_html=question.options_html,
                selected_answer=selected,
                correct_answer=question.answer_letter or question.answer,
                is_correct=is_correct,
                explanation=question.explanation,
                explanation_html=question.explanation_html,
            )
        )

    total = len(question_ids)
    incorrect = total - correct
    xp_gained = correct * XP_PER_CORRECT
    attempt.correct_count = correct
    attempt.incorrect_count = incorrect
    attempt.points_scored = correct * 10
    attempt.status = "completed"
    attempt.completed_at = now
    current_user.total_correct += correct
    current_user.total_incorrect += incorrect
    current_user.total_points += attempt.points_scored
    current_user.total_xp += xp_gained
    bump_daily_streak(current_user, now)
    await db.commit()

    accuracy = round(correct / total * 100, 2) if total else 0
    return QuizComplete(
        attempt_id=attempt.id,
        score=attempt.points_scored,
        total_correct=correct,
        total_incorrect=incorrect,
        total_questions=total,
        accuracy=accuracy,
        xp_gained=xp_gained,
        review=review,
    )
