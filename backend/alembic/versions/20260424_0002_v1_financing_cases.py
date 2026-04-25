"""v1 financing case backend skeleton

Revision ID: 20260424_0002
Revises: 20260424_0001
Create Date: 2026-04-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260424_0002"
down_revision: Union[str, None] = "20260424_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "financing_cases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_to_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id"), nullable=True),
        sa.Column("case_no", sa.String(), nullable=False, unique=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("loan_purpose", sa.String(), nullable=True),
        sa.Column("target_amount", sa.Float(), nullable=True),
        sa.Column("target_term_months", sa.Integer(), nullable=True),
        sa.Column("urgency_level", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("close_result", sa.String(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_financing_cases_customer_id", "financing_cases", ["customer_id"])
    op.create_index("ix_financing_cases_created_by_id", "financing_cases", ["created_by_id"])
    op.create_index("ix_financing_cases_assigned_to_id", "financing_cases", ["assigned_to_id"])
    op.create_index("ix_financing_cases_team_id", "financing_cases", ["team_id"])
    op.create_index("ix_financing_cases_case_no", "financing_cases", ["case_no"])
    op.create_index("ix_financing_cases_status", "financing_cases", ["status"])
    op.create_index("ix_financing_cases_close_result", "financing_cases", ["close_result"])

    op.create_table(
        "case_status_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("financing_cases.id"), nullable=False),
        sa.Column("from_status", sa.String(), nullable=True),
        sa.Column("to_status", sa.String(), nullable=False),
        sa.Column("changed_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("change_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_case_status_logs_case_id", "case_status_logs", ["case_id"])
    op.create_index("ix_case_status_logs_to_status", "case_status_logs", ["to_status"])
    op.create_index("ix_case_status_logs_changed_by_id", "case_status_logs", ["changed_by_id"])


def downgrade() -> None:
    op.drop_table("case_status_logs")
    op.drop_table("financing_cases")
