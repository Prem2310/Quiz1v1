"""Add per-question directions_html (IndiaBix "Directions to Solve" context)."""

from alembic import op
import sqlalchemy as sa

revision = "0004_question_directions"
down_revision = "0003_social_and_challenges"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("question", sa.Column("directions_html", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("question", "directions_html")
