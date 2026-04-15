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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
