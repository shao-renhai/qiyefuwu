import os
import uuid
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from core.config import settings

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
os.makedirs(DB_DIR, exist_ok=True)
DATABASE_URL = settings.database_url

engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)

    users = relationship("User", back_populates="team")


class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)

    users = relationship("User", back_populates="role_ref")
    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")


class RolePermission(Base):
    __tablename__ = "role_permissions"
    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False, index=True)
    resource = Column(String, nullable=False)
    action = Column(String, nullable=False)
    scope = Column(String, default="own", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    role = relationship("Role", back_populates="permissions")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="consultant")  # founder / consultant / telesales
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)

    team = relationship("Team", back_populates="users")
    role_ref = relationship("Role", back_populates="users")
    clients = relationship("Client", back_populates="owner", cascade="all, delete-orphan")


class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    company_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    owner = relationship("User", back_populates="clients")
    credit_reports = relationship("CreditReport", back_populates="client", cascade="all, delete-orphan")
    bank_statements = relationship("BankStatement", back_populates="client", cascade="all, delete-orphan")
    diagnosis_records = relationship("DiagnosisRecord", back_populates="client")


class CreditReport(Base):
    __tablename__ = "credit_reports"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    parsed_data = Column(JSON, nullable=True)
    manual_data = Column(JSON, nullable=True)    # 手动录入数据（优先于 parsed_data）
    manual_mode = Column(String, nullable=True)  # 'quick' | 'detail'
    created_at = Column(DateTime, default=datetime.utcnow)
    client = relationship("Client", back_populates="credit_reports")


class CreditImage(Base):
    """征信报告原件图片库（最多100张/客户）"""
    __tablename__ = "credit_images"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    filename = Column(String, nullable=False)       # 服务器存储文件名
    original_name = Column(String, nullable=True)    # 原始文件名
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    client = relationship("Client")


class BankStatement(Base):
    __tablename__ = "bank_statements"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    filename = Column(String, nullable=False)
    bank_name = Column(String, nullable=True)
    raw_data = Column(JSON, nullable=True)
    analysis = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    client = relationship("Client", back_populates="bank_statements")


class DiagnosisRecord(Base):
    __tablename__ = "diagnosis_records"
    id = Column(Integer, primary_key=True, index=True)
    # 客户关联（新增）
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    client = relationship("Client", back_populates="diagnosis_records")
    # 兼容旧数据
    client_name = Column(String, nullable=False)
    company_name = Column(String, nullable=False)
    advisor_id = Column(Integer, ForeignKey("users.id"))
    answers = Column(JSON, default={})
    score_credit = Column(Float, default=0)
    score_cashflow = Column(Float, default=0)
    score_structure = Column(Float, default=0)
    score_collateral = Column(Float, default=0)
    score_intent = Column(Float, default=0)
    score_total = Column(Float, default=0)
    risk_flags = Column(JSON, default=[])
    loan_min = Column(Float, default=0)
    loan_max = Column(Float, default=0)
    status = Column(String, default="draft")
    # 分享与付费（新增）
    share_token = Column(String, unique=True, nullable=True, index=True)
    is_paid = Column(Boolean, default=False)
    paid_at = Column(DateTime, nullable=True)
    report_price = Column(Float, default=299)
    # 征信/流水融合数据快照（新增）
    credit_snapshot = Column(JSON, nullable=True)
    bank_snapshot = Column(JSON, nullable=True)
    #
    follow_up_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)


class BankAnalysisContext(Base):
    """客户级流水分析的人工补录数据（每客户一条）"""
    __tablename__ = "bank_analysis_context"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), unique=True, nullable=False)
    # 阶段 A 必填字段
    target_loan_amount = Column(Float, nullable=True)          # 目标贷款金额
    existing_monthly_payment = Column(Float, nullable=True)    # 现有贷款月还款总额
    # 阶段 B/C 预留字段（先建好，避免后期 ALTER）
    industry = Column(String, nullable=True)
    apply_deadline = Column(DateTime, nullable=True)
    related_parties = Column(JSON, default=[])                 # 关联方/家人公司名单
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)


def generate_share_token() -> str:
    return uuid.uuid4().hex[:12]


class Customer(Base):
    """V1 客户主档：客户池、状态与灯色分离。"""
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_by_id = Column(Integer, ForeignKey("users.id"))
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True, index=True)

    name = Column(String, nullable=False)
    phone = Column(String, index=True, nullable=True)
    company_name = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    company_size = Column(String, nullable=True)
    source = Column(String, nullable=True)

    # Compatibility alias for the pre-productized customer funnel.
    stage = Column(String, default="lead")
    pool = Column(String, default="lead", nullable=False, index=True)
    lead_status = Column(String, default="new", nullable=False, index=True)
    consulting_status = Column(String, default="not_visited", nullable=False, index=True)
    close_result = Column(String, nullable=True, index=True)

    signal_color = Column(String, default="yellow", nullable=False, index=True)
    signal_reason_code = Column(String, default="new_lead", nullable=False, index=True)
    signal_updated_at = Column(DateTime, nullable=True)

    intent_level = Column(Integer, default=3)
    target_amount = Column(Float, nullable=True)
    next_follow_up_at = Column(DateTime, nullable=True)
    last_followup_at = Column(DateTime, nullable=True)
    visited_at = Column(DateTime, nullable=True)

    company_age = Column(Integer, nullable=True)
    monthly_cashflow = Column(Float, nullable=True)
    has_tax_record = Column(Boolean, nullable=True)
    collateral_type = Column(String, nullable=True)
    collateral_value = Column(Float, nullable=True)
    credit_status = Column(String, nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    contacts = relationship("CustomerContact", back_populates="customer", cascade="all, delete-orphan")
    interactions = relationship("CustomerInteraction", back_populates="customer", cascade="all, delete-orphan")
    cases = relationship("Case", back_populates="customer")
    financing_cases = relationship("FinancingCase", back_populates="customer", cascade="all, delete-orphan")


class CustomerContact(Base):
    __tablename__ = "customer_contacts"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    title = Column(String, nullable=True)
    relation = Column(String, nullable=True)
    is_primary = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="contacts")


class CustomerInteraction(Base):
    """客户跟进记录：表名按 V1 产品化命名为 followups。"""
    __tablename__ = "followups"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    channel = Column(String)
    content = Column(Text)
    intent_level_after = Column(Integer, nullable=True)
    lead_status_after = Column(String, nullable=True)
    consulting_status_after = Column(String, nullable=True)
    close_result_after = Column(String, nullable=True)
    next_pool = Column(String, nullable=True)
    next_follow_up_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="interactions")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String, nullable=False, index=True)
    resource_type = Column(String, nullable=False, index=True)
    resource_id = Column(Integer, nullable=True, index=True)
    details = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class FinancingCase(Base):
    __tablename__ = "financing_cases"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True, index=True)
    case_no = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    status = Column(String, default="draft", nullable=False, index=True)
    loan_purpose = Column(String, nullable=True)
    target_amount = Column(Float, nullable=True)
    target_term_months = Column(Integer, nullable=True)
    urgency_level = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    close_result = Column(String, nullable=True, index=True)
    closed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="financing_cases")
    status_logs = relationship("CaseStatusLog", back_populates="case", cascade="all, delete-orphan")
    consent_records = relationship("ConsentRecord", back_populates="case", cascade="all, delete-orphan")
    uploaded_files = relationship("UploadedFile", back_populates="case", cascade="all, delete-orphan")
    analysis_tasks = relationship("AnalysisTask", back_populates="case", cascade="all, delete-orphan")


class CaseStatusLog(Base):
    __tablename__ = "case_status_logs"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("financing_cases.id"), nullable=False, index=True)
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False, index=True)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    change_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    case = relationship("FinancingCase", back_populates="status_logs")


class ConsentRecord(Base):
    __tablename__ = "consent_records"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("financing_cases.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    consent_type = Column(String, nullable=False, index=True)
    consent_version = Column(String, nullable=False)
    consent_text_snapshot = Column(Text, nullable=False)
    authorized_by_name = Column(String, nullable=False)
    authorized_by_phone = Column(String, nullable=True)
    authorized_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    status = Column(String, default="active", nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)

    case = relationship("FinancingCase", back_populates="consent_records")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("financing_cases.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    file_type = Column(String, nullable=False, index=True)
    file_name = Column(String, nullable=False)
    storage_key = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    sensitivity_level = Column(String, default="internal", nullable=False, index=True)
    status = Column(String, default="recorded", nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)

    case = relationship("FinancingCase", back_populates="uploaded_files")


class AnalysisTask(Base):
    __tablename__ = "analysis_tasks"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("financing_cases.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    file_id = Column(Integer, ForeignKey("uploaded_files.id"), nullable=True, index=True)
    task_type = Column(String, nullable=False, index=True)
    status = Column(String, default="pending", nullable=False, index=True)
    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow, default=datetime.utcnow)

    case = relationship("FinancingCase", back_populates="analysis_tasks")
    file = relationship("UploadedFile")


class Case(Base):
    """案例库：种子库（创始人审核发布）是 MVP 核心输出"""
    __tablename__ = "cases"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_by_id = Column(Integer, ForeignKey("users.id"))
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    narrative = Column(Text, nullable=False)

    industry = Column(String)
    company_size = Column(String, nullable=True)
    company_age = Column(Integer, nullable=True)
    credit_status = Column(String, nullable=True)
    monthly_cashflow = Column(Float, nullable=True)
    has_tax_record = Column(Boolean, nullable=True)
    collateral_type = Column(String, nullable=True)
    collateral_value = Column(Float, nullable=True)

    visit_reason = Column(Text, nullable=True)
    core_problem = Column(Text, nullable=True)
    urgency = Column(String, nullable=True)
    target_amount = Column(Float, nullable=True)

    solution_type = Column(String, nullable=True)
    recommended_bank = Column(String, nullable=True)
    preparation_actions = Column(Text, nullable=True)
    duration_days = Column(Integer, nullable=True)

    outcome = Column(String, nullable=True)
    approved_amount = Column(Float, nullable=True)
    actual_rate = Column(Float, nullable=True)
    bank_tier = Column(String, nullable=True)
    core_lessons = Column(Text, nullable=True)

    status = Column(String, default="draft")
    tier = Column(String, default="seed")
    review_notes = Column(Text, nullable=True)
    published_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    customer = relationship("Customer", back_populates="cases")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
