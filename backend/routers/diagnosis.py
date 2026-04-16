from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta

from db.database import (
    get_db, DiagnosisRecord, Client, CreditReport, BankStatement,
    generate_share_token,
)
from services.auth import get_current_user
from services.scoring_engine import ScoringEngine, ScoringInput

router = APIRouter(prefix="/api/diagnosis", tags=["diagnosis"])
_engine = ScoringEngine()


# ─── Pydantic schemas ────────────────────────────────────────────────

class DiagnosisStart(BaseModel):
    client_name: str
    company_name: str
    client_id: Optional[int] = None  # 关联已有客户（可选）


class AnswerPayload(BaseModel):
    answers: dict
    scores: dict


class ReportRequest(BaseModel):
    diagnosis_id: int


# ─── 答案 → ScoringInput 映射 ────────────────────────────────────────

def _extract_score(answers: dict, key: str) -> int:
    val = answers.get(key)
    if val is None:
        return 0
    if isinstance(val, dict):
        return val.get("score", 0)
    if isinstance(val, (int, float)):
        return int(val)
    return 0


def _answers_to_input(answers: dict,
                       credit_data: dict = None,
                       bank_data: dict = None) -> ScoringInput:
    """将问卷答案映射为 ScoringInput，如果有征信/流水真实数据则覆盖"""

    a1 = _extract_score(answers, "a1")
    a2 = _extract_score(answers, "a2")
    a3 = _extract_score(answers, "a3")
    b1 = _extract_score(answers, "b1")
    b2 = _extract_score(answers, "b2")
    c1 = _extract_score(answers, "c1")
    c2 = _extract_score(answers, "c2")
    d1 = _extract_score(answers, "d1")
    d2 = _extract_score(answers, "d2")
    e1 = _extract_score(answers, "e1")
    e2 = _extract_score(answers, "e2")

    # ── 基础映射（问卷估算）──
    if a1 >= 28:    query_count = 1
    elif a1 >= 15:  query_count = 4
    else:           query_count = 9

    if a2 >= 22:    loan_count = 2
    elif a2 >= 10:  loan_count = 5
    else:           loan_count = 8

    if a3 >= 18:    has_overdue, overdue_current, overdue_months = False, False, 999
    elif a3 >= 8:   has_overdue, overdue_current, overdue_months = True, False, 6
    else:           has_overdue, overdue_current, overdue_months = True, True, 0

    if b1 >= 22:    monthly_cashflow = 5_000_000
    elif b1 >= 14:  monthly_cashflow = 1_500_000
    else:           monthly_cashflow = 300_000

    if b2 >= 17:    tax_years, has_tax_record = 3, True
    elif b2 >= 9:   tax_years, has_tax_record = 1, True
    else:           tax_years, has_tax_record = 0, False

    if c1 >= 18:    short_term_ratio = 0.2
    elif c1 >= 12:  short_term_ratio = 0.5
    else:           short_term_ratio = 0.8

    if c2 >= 17:    financing_cost_pct = 6.0
    elif c2 >= 9:   financing_cost_pct = 11.0
    else:           financing_cost_pct = 18.0

    if d1 >= 17:    collateral_value, has_second_mortgage = 300.0, False
    elif d1 >= 8:   collateral_value, has_second_mortgage = 100.0, True
    else:           collateral_value, has_second_mortgage = 0.0, False

    if d2 >= 13:    has_gov_contract, receivable_amount = True, 0.0
    elif d2 >= 8:   has_gov_contract, receivable_amount = False, 300.0
    else:           has_gov_contract, receivable_amount = False, 0.0

    if e1 >= 9:     loan_purpose = "working_capital"
    elif e1 >= 7:   loan_purpose = "expansion"
    else:           loan_purpose = "refinance"

    if e2 >= 9:     urgency = "relaxed"
    elif e2 >= 6:   urgency = "normal"
    else:           urgency = "urgent"

    cashflow_stable = True

    # ── 真实征信数据覆盖 ──
    if credit_data:
        # 查询记录
        qr = credit_data.get("query_records", {})
        real_queries = 0
        for period in ["recent_1y", "recent_6m", "recent_3m", "recent_1m"]:
            pr = qr.get(period, {})
            if pr:
                real_queries = max(real_queries,
                    pr.get("loan_approval", 0) + pr.get("corporate_review", 0))
        if real_queries > 0:
            query_count = real_queries

        # 贷款笔数
        active_loans = credit_data.get("active_loans", [])
        if active_loans:
            loan_count = len(active_loans)

        # 逾期
        overdue_records = credit_data.get("overdue_records", [])
        if overdue_records:
            has_overdue = True
            # 简化：有逾期记录但假定已还清
            overdue_current = False
            overdue_months = 6
        elif credit_data.get("overdue_records") is not None:
            has_overdue = False
            overdue_current = False
            overdue_months = 999

        # 信用卡使用率
        card_usage = credit_data.get("credit_card_usage_rate")
        if card_usage and card_usage > 0.8:
            cashflow_stable = False

        # 总负债
        total_debt = credit_data.get("total_debt", 0) or 0

    # ── 真实流水数据覆盖 ──
    if bank_data:
        real_income = bank_data.get("monthly_avg_income") or bank_data.get("deduped_monthly_avg_income")
        if real_income and real_income > 0:
            monthly_cashflow = real_income

        # 流水稳定性：看月度波动
        monthly = bank_data.get("monthly_summary", [])
        if len(monthly) >= 3:
            incomes = [m.get("income", 0) for m in monthly if m.get("income", 0) > 0]
            if incomes:
                avg = sum(incomes) / len(incomes)
                max_dev = max(abs(i - avg) for i in incomes) / avg if avg > 0 else 0
                if max_dev > 0.5:
                    cashflow_stable = False

    term_mismatch = short_term_ratio > 0.6 and loan_purpose == "expansion"
    concentrated_due = short_term_ratio > 0.6

    return ScoringInput(
        query_count=query_count,
        loan_count=loan_count,
        has_overdue=has_overdue,
        overdue_months=overdue_months,
        overdue_current=overdue_current,
        monthly_cashflow=monthly_cashflow,
        cashflow_stable=cashflow_stable,
        tax_years=tax_years,
        has_tax_record=has_tax_record,
        short_term_ratio=short_term_ratio,
        financing_cost_pct=financing_cost_pct,
        term_mismatch=term_mismatch,
        concentrated_due=concentrated_due,
        collateral_value=collateral_value,
        has_second_mortgage=has_second_mortgage,
        has_gov_contract=has_gov_contract,
        receivable_amount=receivable_amount,
        loan_purpose=loan_purpose,
        urgency=urgency,
        target_amount=100.0,
    )


# ─── 获取客户关联数据 ──────────────────────────────────────────────────

def _get_client_data(db: Session, client_id: int):
    """拉取客户最新的征信和流水数据，manual_data 优先于 parsed_data"""
    credit_data = None
    bank_data = None

    latest_credit = db.query(CreditReport).filter(
        CreditReport.client_id == client_id
    ).order_by(CreditReport.created_at.desc()).first()
    if latest_credit:
        # manual_data 最高优先级，parsed_data 兜底
        if latest_credit.manual_data:
            credit_data = _merge_manual_to_credit(latest_credit.manual_data, latest_credit.parsed_data)
        elif latest_credit.parsed_data:
            credit_data = latest_credit.parsed_data

    latest_bank = db.query(BankStatement).filter(
        BankStatement.client_id == client_id
    ).order_by(BankStatement.created_at.desc()).first()
    if latest_bank and latest_bank.analysis:
        bank_data = latest_bank.analysis

    return credit_data, bank_data


def _merge_manual_to_credit(manual: dict, parsed: dict = None) -> dict:
    """将手动录入数据转换为 _answers_to_input 期望的 credit_data 格式"""
    base = dict(parsed) if parsed else {}

    # 总负债
    total_balance = manual.get("total_balance", 0) or 0
    if total_balance:
        base["total_debt"] = total_balance
        base["total_balance"] = total_balance

    # 信用卡
    cards = manual.get("credit_cards", {})
    if cards:
        card_limit = cards.get("total_limit", 0) or 0
        card_used = cards.get("used", 0) or 0
        if card_limit > 0:
            base["credit_card_total_limit"] = card_limit
            base["credit_card_used"] = card_used
            base["credit_card_usage_rate"] = round(card_used / card_limit * 100, 1)

    # 查询记录
    qr = manual.get("query_records", {})
    if qr:
        base["query_records"] = qr

    # 在贷机构 → active_loans
    institutions = manual.get("institutions", [])
    if institutions:
        base["active_loans"] = institutions
        base["institution_details"] = institutions

    # 逾期（manual 目前不录入逾期，保留 parsed 的数据）

    return base


# ─── 开始诊断 ────────────────────────────────────────────────────────

@router.post("/start")
def start_diagnosis(
    payload: DiagnosisStart,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    client_id = payload.client_id

    # 如果没传 client_id，自动查找或创建客户
    if not client_id:
        existing = db.query(Client).filter(
            Client.user_id == current_user.id,
            Client.name == payload.client_name,
        ).first()
        if existing:
            client_id = existing.id
            # 更新 company_name
            if payload.company_name and not existing.company_name:
                existing.company_name = payload.company_name
                db.commit()
        else:
            new_client = Client(
                name=payload.client_name,
                company_name=payload.company_name,
                user_id=current_user.id,
            )
            db.add(new_client)
            db.commit()
            db.refresh(new_client)
            client_id = new_client.id

    record = DiagnosisRecord(
        client_id=client_id,
        client_name=payload.client_name,
        company_name=payload.company_name,
        advisor_id=current_user.id,
        share_token=generate_share_token(),
        status="draft",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "diagnosis_id": record.id,
        "client_id": client_id,
        "share_token": record.share_token,
        "status": "draft",
    }


# ─── 保存答案和分数 ──────────────────────────────────────────────────

@router.put("/{diagnosis_id}")
def update_diagnosis(
    diagnosis_id: int,
    payload: AnswerPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    record = db.query(DiagnosisRecord).filter(
        DiagnosisRecord.id == diagnosis_id,
        DiagnosisRecord.advisor_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="诊断记录不存在")

    record.answers = payload.answers
    scores = payload.scores
    record.score_credit     = scores.get("credit",     0)
    record.score_cashflow   = scores.get("cashflow",   0)
    record.score_structure  = scores.get("structure",  0)
    record.score_collateral = scores.get("collateral", 0)
    record.score_intent     = scores.get("intent",     0)
    record.score_total      = scores.get("total",      0)
    db.commit()
    return {"status": "ok"}


# ─── 生成报告（融合征信+流水真实数据） ────────────────────────────────

@router.post("/report")
def generate_report(
    payload: ReportRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    record = db.query(DiagnosisRecord).filter(
        DiagnosisRecord.id == payload.diagnosis_id,
        DiagnosisRecord.advisor_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="诊断记录不存在")

    answers = record.answers or {}

    # 拉取征信/流水真实数据
    credit_data = None
    bank_data = None
    data_sources = {"credit": False, "bank": False}

    if record.client_id:
        credit_data, bank_data = _get_client_data(db, record.client_id)
        if credit_data:
            data_sources["credit"] = True
            record.credit_snapshot = credit_data
        if bank_data:
            data_sources["bank"] = True
            record.bank_snapshot = bank_data

    # 调用评分引擎（真实数据覆盖问卷估算）
    try:
        scoring_input = _answers_to_input(answers, credit_data, bank_data)
        result = _engine.score(scoring_input)
    except Exception:
        result = None

    if result:
        final_total     = result["final_total"]
        loan_range      = result["loan_range"]
        record.loan_min = loan_range["min"]
        record.loan_max = loan_range["max"]
        record.score_total = final_total
        dims = result.get("dims", {})
        if dims:
            record.score_credit     = round(dims.get("credit",     {}).get("normalized", 0))
            record.score_cashflow   = round(dims.get("cashflow",   {}).get("normalized", 0))
            record.score_structure  = round(dims.get("structure",  {}).get("normalized", 0))
            record.score_collateral = round(dims.get("collateral", {}).get("normalized", 0))
            record.score_intent     = round(dims.get("intent",     {}).get("normalized", 0))
        record.risk_flags = {
            "flags":          result["risk_flags"],
            "top_priorities": result["top_priorities"],
            "penalties":      result["penalties"],
            "bonuses":        result["bonuses"],
            "grade":          result["grade"],
            "loan_range":     result["loan_range"],
            "dims":           {
                k: {
                    "name":       v["name"],
                    "normalized": v["normalized"],
                    "weighted":   v["weighted"],
                    "breakdown":  v["breakdown"],
                    "risk_flags": v["risk_flags"],
                }
                for k, v in dims.items()
            },
            "base_total":    result["base_total"],
            "penalty_total": result["penalty_total"],
            "bonus_total":   result["bonus_total"],
            "data_sources":  data_sources,
        }
    else:
        total = record.score_total or 0
        if total >= 85:   record.loan_min, record.loan_max = 500, 2000
        elif total >= 70: record.loan_min, record.loan_max = 200, 600
        elif total >= 55: record.loan_min, record.loan_max = 50, 200
        else:             record.loan_min, record.loan_max = 0, 50
        record.risk_flags = {"flags":[],"top_priorities":[],"penalties":[],"bonuses":[],"grade":{},"dims":{},"data_sources":data_sources}

    record.follow_up_at = datetime.now() + timedelta(days=90)
    record.status = "completed"
    db.commit()
    db.refresh(record)

    risk_data = record.risk_flags or {}
    return {
        "diagnosis_id":    record.id,
        "client_id":       record.client_id,
        "share_token":     record.share_token,
        "score_total":     record.score_total,
        "score_credit":    record.score_credit,
        "score_cashflow":  record.score_cashflow,
        "score_structure": record.score_structure,
        "score_collateral":record.score_collateral,
        "score_intent":    record.score_intent,
        "grade":           risk_data.get("grade", {}),
        "risk_flags":      risk_data.get("flags", []),
        "top_priorities":  risk_data.get("top_priorities", []),
        "penalties":       risk_data.get("penalties", []),
        "bonuses":         risk_data.get("bonuses", []),
        "dims":            risk_data.get("dims", {}),
        "loan_min":        record.loan_min,
        "loan_max":        record.loan_max,
        "loan_range":      risk_data.get("loan_range", {}),
        "base_total":      risk_data.get("base_total", 0),
        "penalty_total":   risk_data.get("penalty_total", 0),
        "bonus_total":     risk_data.get("bonus_total", 0),
        "data_sources":    risk_data.get("data_sources", {}),
        "follow_up_at":    record.follow_up_at.isoformat() if record.follow_up_at else None,
        "status":          record.status,
    }


# ─── 查询历史记录 ────────────────────────────────────────────────────

@router.get("/list")
def list_diagnoses(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    records = db.query(DiagnosisRecord).filter(
        DiagnosisRecord.advisor_id == current_user.id
    ).order_by(DiagnosisRecord.created_at.desc()).limit(50).all()

    return [
        {
            "id":           r.id,
            "client_id":    r.client_id,
            "client_name":  r.client_name,
            "company_name": r.company_name,
            "score_total":  r.score_total,
            "grade":        (r.risk_flags or {}).get("grade", {}),
            "loan_min":     r.loan_min,
            "loan_max":     r.loan_max,
            "share_token":  r.share_token,
            "is_paid":      r.is_paid,
            "status":       r.status,
            "created_at":   r.created_at.isoformat() if r.created_at else None,
            "follow_up_at": r.follow_up_at.isoformat() if r.follow_up_at else None,
        }
        for r in records
    ]


# ─── 获取/生成分享链接 ───────────────────────────────────────────────

@router.get("/{diagnosis_id}/share")
def get_share_link(
    diagnosis_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    record = db.query(DiagnosisRecord).filter(
        DiagnosisRecord.id == diagnosis_id,
        DiagnosisRecord.advisor_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="诊断记录不存在")

    if not record.share_token:
        record.share_token = generate_share_token()
        db.commit()

    return {
        "share_token": record.share_token,
        "is_paid": record.is_paid,
    }


# ─── 公开报告接口（无需登录） ────────────────────────────────────────

@router.get("/report/{share_token}")
def get_public_report(
    share_token: str,
    db: Session = Depends(get_db),
):
    record = db.query(DiagnosisRecord).filter(
        DiagnosisRecord.share_token == share_token,
        DiagnosisRecord.status == "completed",
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="报告不存在")

    risk_data = record.risk_flags or {}
    is_paid = record.is_paid

    # 基础数据（所有人可见）
    resp = {
        "client_name":     record.client_name,
        "company_name":    record.company_name,
        "score_total":     record.score_total,
        "score_credit":    record.score_credit,
        "score_cashflow":  record.score_cashflow,
        "score_structure": record.score_structure,
        "score_collateral":record.score_collateral,
        "score_intent":    record.score_intent,
        "grade":           risk_data.get("grade", {}),
        "loan_min":        record.loan_min,
        "loan_max":        record.loan_max,
        "is_paid":         is_paid,
        "report_price":    record.report_price,
    }

    # 免费版：只给 TOP3 风险标题
    all_flags = risk_data.get("flags", [])
    if not is_paid:
        resp["risk_count"]     = len(all_flags)
        resp["high_risk_count"]= len([f for f in all_flags if f.get("level") == "high"])
        resp["top3_risks"]     = [
            {"level": f.get("level"), "title": f.get("title")}
            for f in all_flags[:3]
        ]
    else:
        # 付费版：完整数据
        resp["risk_flags"]     = all_flags
        resp["top_priorities"] = risk_data.get("top_priorities", [])
        resp["penalties"]      = risk_data.get("penalties", [])
        resp["bonuses"]        = risk_data.get("bonuses", [])
        resp["dims"]           = risk_data.get("dims", {})
        resp["loan_range"]     = risk_data.get("loan_range", {})
        resp["base_total"]     = risk_data.get("base_total", 0)
        resp["penalty_total"]  = risk_data.get("penalty_total", 0)
        resp["bonus_total"]    = risk_data.get("bonus_total", 0)

    return resp
