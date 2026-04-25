"""v1 consent file metadata and analysis task skeleton

Revision ID: 20260424_0003
Revises: 20260424_0002
Create Date: 2026-04-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260424_0003"
down_revision: Union[str, None] = "20260424_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "consent_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("financing_cases.id"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("consent_type", sa.String(), nullable=False),
        sa.Column("consent_version", sa.String(), nullable=False),
        sa.Column("consent_text_snapshot", sa.Text(), nullable=False),
        sa.Column("authorized_by_name", sa.String(), nullable=False),
        sa.Column("authorized_by_phone", sa.String(), nullable=True),
        sa.Column("authorized_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_consent_records_case_id", "consent_records", ["case_id"])
    op.create_index("ix_consent_records_customer_id", "consent_records", ["customer_id"])
    op.create_index("ix_consent_records_consent_type", "consent_records", ["consent_type"])
    op.create_index("ix_consent_records_status", "consent_records", ["status"])
    op.create_index("ix_consent_records_created_by_id", "consent_records", ["created_by_id"])

    op.create_table(
        "uploaded_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("financing_cases.id"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("uploaded_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("file_type", sa.String(), nullable=False),
        sa.Column("file_name", sa.String(), nullable=False),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("sensitivity_level", sa.String(), nullable=False, server_default="internal"),
        sa.Column("status", sa.String(), nullable=False, server_default="recorded"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_uploaded_files_case_id", "uploaded_files", ["case_id"])
    op.create_index("ix_uploaded_files_customer_id", "uploaded_files", ["customer_id"])
    op.create_index("ix_uploaded_files_uploaded_by_id", "uploaded_files", ["uploaded_by_id"])
    op.create_index("ix_uploaded_files_file_type", "uploaded_files", ["file_type"])
    op.create_index("ix_uploaded_files_sensitivity_level", "uploaded_files", ["sensitivity_level"])
    op.create_index("ix_uploaded_files_status", "uploaded_files", ["status"])

    op.create_table(
        "analysis_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("financing_cases.id"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("file_id", sa.Integer(), sa.ForeignKey("uploaded_files.id"), nullable=True),
        sa.Column("task_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("requested_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_analysis_tasks_case_id", "analysis_tasks", ["case_id"])
    op.create_index("ix_analysis_tasks_customer_id", "analysis_tasks", ["customer_id"])
    op.create_index("ix_analysis_tasks_file_id", "analysis_tasks", ["file_id"])
    op.create_index("ix_analysis_tasks_task_type", "analysis_tasks", ["task_type"])
    op.create_index("ix_analysis_tasks_status", "analysis_tasks", ["status"])
    op.create_index("ix_analysis_tasks_requested_by_id", "analysis_tasks", ["requested_by_id"])


def downgrade() -> None:
    op.drop_table("analysis_tasks")
    op.drop_table("uploaded_files")
    op.drop_table("consent_records")
