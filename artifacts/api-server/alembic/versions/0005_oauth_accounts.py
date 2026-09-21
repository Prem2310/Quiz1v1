"""Google/GitHub sign-in: password becomes optional, and the provider account is recorded on the user."""

from alembic import op
import sqlalchemy as sa

revision = "0005_oauth_accounts"
down_revision = "0004_question_directions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_data") as batch:
        batch.alter_column("password_hash", existing_type=sa.String(255), nullable=True)
        batch.add_column(sa.Column("auth_provider", sa.String(20), nullable=True))
        batch.add_column(sa.Column("provider_account_id", sa.String(255), nullable=True))
        batch.create_unique_constraint("uq_user_auth_provider_account", ["auth_provider", "provider_account_id"])


def downgrade() -> None:
    with op.batch_alter_table("user_data") as batch:
        batch.drop_constraint("uq_user_auth_provider_account", type_="unique")
        batch.drop_column("provider_account_id")
        batch.drop_column("auth_provider")
        batch.alter_column("password_hash", existing_type=sa.String(255), nullable=False)
