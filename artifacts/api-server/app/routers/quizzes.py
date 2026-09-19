from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import insert, select

from app.core.adaptive import record_question_stats, select_practice_questions
from app.core.scoring import bump_daily_streak
from app.dependencies import CurrentUser, DbSession
from app.models import Question, QuizHistory, QuizQuestion, UserQuizHistory, UserQuizResponse
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


async def _load_quiz_questions(db: DbSession, quiz_id: int) -> list[Question]:
    """The quiz's questions in play order: one joined query."""
    rows = await db.scalars(
        select(Question).join(QuizQuestion, QuizQuestion.question_id == Question.id).where(QuizQuestion.quiz_history_id == quiz_id).order_by(QuizQuestion.question_order)
    )
    return list(rows.all())


@router.post("", response_model=QuizRead, status_code=status.HTTP_201_CREATED)
async def create_quiz(payload: QuizCreate, current_user: CurrentUser, db: DbSession) -> QuizRead:
    # Both modes are adaptive (see app.core.adaptive); weak_topics just leans harder on reviews and weak subtopics.
    question_ids = await select_practice_questions(
        db, current_user.id, payload.topic_id, payload.subtopic_id, payload.num_questions, focus_weak=payload.quiz_mode == "weak_topics"
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
    await db.execute(insert(QuizQuestion), [{"quiz_history_id": quiz.id, "question_id": qid, "question_order": order} for order, qid in enumerate(question_ids)])
    await db.commit()
    return _quiz_read(quiz, question_ids)


@router.post("/{quiz_id}/start", response_model=QuizStart)
async def start_quiz(quiz_id: int, current_user: CurrentUser, db: DbSession) -> QuizStart:
    quiz = await db.get(QuizHistory, quiz_id)
    if quiz is None or not quiz.is_active:
        raise HTTPException(status_code=404, detail="Quiz not found")
    ordered_questions = await _load_quiz_questions(db, quiz_id)
    question_ids = [question.id for question in ordered_questions]
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


@router.post("/attempts/{attempt_id}/complete", response_model=QuizComplete)
async def complete_quiz(attempt_id: int, payload: QuizCompleteRequest, current_user: CurrentUser, db: DbSession) -> QuizComplete:
    """Grades every answer from the practice session in one call: no per-question round trips."""
    attempt = await db.scalar(select(UserQuizHistory).where(UserQuizHistory.id == attempt_id, UserQuizHistory.user_id == current_user.id))
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.completed_at is not None:
        raise HTTPException(status_code=409, detail="Attempt is already complete")

    ordered = await _load_quiz_questions(db, attempt.quiz_history_id)
    questions = {q.id: q for q in ordered}
    question_ids = [q.id for q in ordered]
    answers = {r.question_id: r for r in payload.responses if r.question_id in questions}

    now = datetime.now(UTC)
    review: list[QuestionReview] = []
    graded: list[tuple[Question, bool]] = []
    response_rows: list[dict] = []
    correct = 0
    for question_id in question_ids:
        question = questions[question_id]
        response = answers.get(question_id)
        selected = response.selected_answer if response else None
        is_correct = _is_correct(question, selected)
        if is_correct:
            correct += 1
        response_rows.append(
            {
                "user_quiz_history_id": attempt_id,
                "question_id": question.id,
                "attempted_option": selected,
                "selected_answer": selected,
                "is_correct": is_correct,
                "marks_obtained": 1 if is_correct else 0,
                "time_taken_seconds": response.time_taken if response else None,
            }
        )
        graded.append((question, is_correct))
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

    if response_rows:
        await db.execute(insert(UserQuizResponse), response_rows)
    await record_question_stats(db, current_user.id, graded, now)
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
