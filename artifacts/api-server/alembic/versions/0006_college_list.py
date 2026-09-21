"""The shared college list used by the profile college picker (rows come from scripts/seed_colleges.py)."""

from alembic import op
import sqlalchemy as sa

revision = "0006_college_list"
down_revision = "0005_oauth_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "college",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("name_key", sa.String(200), nullable=False),
        sa.Column("source", sa.String(10), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_college_name_key", "college", ["name_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_college_name_key", table_name="college")
    op.drop_table("college")
