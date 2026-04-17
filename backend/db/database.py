import os
import uuid
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import sessionmaker, declarative_base, relationship

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
os.makedirs(DB_DIR, exist_ok=True)
DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'finance.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="consultant")  # founder / consultant / telesales
    created_at = Column(DateTime, default=datetime.utcnow)
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


def generate_share_token() -> str:
    return uuid.uuid4().hex[:12]


class Customer(Base):
    """客户主档：含电销意向/谈单接待/成交全阶段，字段逐步补齐"""
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_by_id = Column(Integer, ForeignKey("users.id"))
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    name = Column(String, nullable=False)
    phone = Column(String, index=True, nullable=True)
    company_name = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    company_size = Column(String, nullable=True)
    source = Column(String, nullable=True)

    stage = Column(String, default="lead")
    intent_level = Column(Integer, default=3)
    target_amount = Column(Float, nullable=True)
    next_follow_up_at = Column(DateTime, nullable=True)

    company_age = Column(Integer, nullable=True)
    monthly_cashflow = Column(Float, nullable=True)
    has_tax_record = Column(Boolean, nullable=True)
    collateral_type = Column(String, nullable=True)
    collateral_value = Column(Float, nullable=True)
    credit_status = Column(String, nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    interactions = relationship("CustomerInteraction", back_populates="customer", cascade="all, delete-orphan")
    cases = relationship("Case", back_populates="customer")


class CustomerInteraction(Base):
    """客户跟进记录：电话/微信/到店等每次联系的记录"""
    __tablename__ = "customer_interactions"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    channel = Column(String)
    content = Column(Text)
    intent_level_after = Column(Integer, nullable=True)
    next_follow_up_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="interactions")


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
