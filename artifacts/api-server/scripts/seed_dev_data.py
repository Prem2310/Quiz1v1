"""Seeds a small synthetic question bank for local development (SQLite by default).

Not the real IndiaBix import (see import_indiabix.py for that) — just enough
topics/subtopics/questions to exercise practice and duel flows end to end.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import Base, engine  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app import models  # noqa: E402,F401
from app.models import Question, Subtopic, Topic  # noqa: E402

TOPICS = [
    ("Aptitude", "aptitude"),
    ("Verbal Ability", "verbal-ability"),
    ("Data Interpretation", "data-interpretation"),
]

SUBTOPICS = {
    "aptitude": [("Percentage", "percentage"), ("Time and Work", "time-and-work")],
    "verbal-ability": [("Synonyms", "synonyms")],
    "data-interpretation": [("Table Charts", "table-charts")],
}

# Two questions sharing one IndiaBix-style "Directions to Solve" table — exercises
# question.directions_html end to end (practice, duel, and the review screen).
TABLE_CHART_DIRECTIONS_HTML = (
    '<p>Study the following table and answer the questions based on it.</p>'
    '<table><tbody>'
    '<tr><td>Year</td><td>Salary</td><td>Bonus</td></tr>'
    '<tr><td>1998</td><td>288</td><td>3.00</td></tr>'
    '<tr><td>1999</td><td>342</td><td>2.52</td></tr>'
    '</tbody></table>'
)
TABLE_CHART_QUESTIONS = [
    ("table-charts", "What was the salary in 1998?", ["288", "342", "3.00", "2.52"], "A"),
    ("table-charts", "What was the bonus in 1999?", ["288", "342", "3.00", "2.52"], "D"),
]

QUESTIONS = [
    ("percentage", "If 20% of a number is 50, what is the number?", ["200", "250", "300", "100"], "A"),
    ("percentage", "40% of 150 is equal to?", ["50", "55", "60", "65"], "C"),
    ("percentage", "A price increases from 80 to 100. What is the percentage increase?", ["20%", "25%", "30%", "15%"], "B"),
    ("percentage", "What is 15% of 200?", ["20", "25", "30", "35"], "C"),
    ("percentage", "75 is what percent of 300?", ["20%", "25%", "30%", "35%"], "B"),
    ("time-and-work", "A can do a job in 10 days, B in 15 days. Working together, how many days?", ["6", "8", "5", "12"], "A"),
    ("time-and-work", "If 6 workers finish a job in 12 days, how long for 4 workers?", ["18", "16", "14", "20"], "A"),
    ("time-and-work", "A does a job in 8 days. What fraction does A do in 2 days?", ["1/4", "1/2", "1/8", "3/4"], "A"),
    ("time-and-work", "A and B together finish in 6 days; A alone in 10. How long for B alone?", ["15", "12", "20", "9"], "A"),
    ("time-and-work", "A pipe fills a tank in 6 hours. In 2 hours, what fraction fills?", ["1/3", "1/2", "1/6", "2/3"], "A"),
    ("synonyms", "Choose the synonym of 'Benevolent'", ["Kind", "Cruel", "Selfish", "Angry"], "A"),
    ("synonyms", "Choose the synonym of 'Candid'", ["Frank", "Dishonest", "Shy", "Rude"], "A"),
    ("synonyms", "Choose the synonym of 'Diligent'", ["Hardworking", "Lazy", "Careless", "Slow"], "A"),
    ("synonyms", "Choose the synonym of 'Eloquent'", ["Articulate", "Silent", "Confused", "Boring"], "A"),
    ("synonyms", "Choose the synonym of 'Frugal'", ["Thrifty", "Wasteful", "Generous", "Rich"], "A"),
]

LETTERS = ["A", "B", "C", "D"]


async def run() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        topic_by_slug: dict[str, Topic] = {}
        for name, slug in TOPICS:
            topic = Topic(name=name, slug=slug, description=f"{name} practice questions")
            db.add(topic)
            topic_by_slug[slug] = topic
        await db.flush()

        subtopic_by_slug: dict[str, Subtopic] = {}
        for topic_slug, subs in SUBTOPICS.items():
            for name, slug in subs:
                subtopic = Subtopic(topic_id=topic_by_slug[topic_slug].id, name=name, slug=slug)
                db.add(subtopic)
                subtopic_by_slug[slug] = subtopic
        await db.flush()

        for index, (subtopic_slug, text, options, answer_letter) in enumerate(QUESTIONS):
            db.add(
                Question(
                    id=f"dev_{subtopic_slug}_{index}",
                    subtopic_id=subtopic_by_slug[subtopic_slug].id,
                    text=text,
                    options=options,
                    answer=options[LETTERS.index(answer_letter)],
                    answer_letter=answer_letter,
                    explanation=f"The correct answer is {options[LETTERS.index(answer_letter)]}.",
                    difficulty="easy",
                )
            )
        for index, (subtopic_slug, text, options, answer_letter) in enumerate(TABLE_CHART_QUESTIONS):
            db.add(
                Question(
                    id=f"dev_{subtopic_slug}_{index}",
                    subtopic_id=subtopic_by_slug[subtopic_slug].id,
                    text=text,
                    directions_html=TABLE_CHART_DIRECTIONS_HTML,
                    options=options,
                    answer=options[LETTERS.index(answer_letter)],
                    answer_letter=answer_letter,
                    explanation=f"The correct answer is {options[LETTERS.index(answer_letter)]}.",
                    difficulty="easy",
                )
            )
        await db.commit()

    total_questions = len(QUESTIONS) + len(TABLE_CHART_QUESTIONS)
    print(f"Seeded {len(TOPICS)} topics, {sum(len(v) for v in SUBTOPICS.values())} subtopics, {total_questions} questions.")


if __name__ == "__main__":
    asyncio.run(run())
