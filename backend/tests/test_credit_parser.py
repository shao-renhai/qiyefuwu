import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services.credit_parser import (
    _extract_amount,
    parse_debt_summary,
    parse_credit_card_info,
    parse_overdue_records,
    parse_query_records,
    extract_credit_data,
)


def test_extract_amount_wan():
    assert _extract_amount("85万") == 850000.0


def test_extract_amount_decimal_wan():
    assert _extract_amount("23.5万") == 235000.0


def test_extract_amount_yuan():
    assert _extract_amount("1000元") == 1000.0


def test_extract_amount_plain_number():
    assert _extract_amount("50000") == 50000.0


def test_extract_amount_no_match():
    assert _extract_amount("无") == 0.0


def test_parse_debt_summary():
    text = """
    信贷交易信息提示
    个人住房贷款 笔数1 余额85万
    信用卡 笔数3 已用额度23.5万 授信总额50万
    其他贷款 笔数2 余额20万
    """
    result = parse_debt_summary(text)
    assert result["total_balance"] > 0


def test_parse_debt_summary_with_multiple_loan_types():
    text = """
    信贷交易信息提示
    个人住房贷款 笔数1 余额85万
    商用房贷款 笔数1 余额100万
    其他贷款 笔数2 余额20万
    消费贷 笔数1 余额5万
    经营贷 笔数1 余额30万
    """
    result = parse_debt_summary(text)
    assert result["active_loans"] == 6
    assert result["total_balance"] == 2400000.0


def test_parse_credit_card_info():
    text = """
    信用卡 授信总额50万 已用额度23.5万
    """
    result = parse_credit_card_info(text)
    assert result["total_limit"] == 500000.0
    assert result["used"] == 235000.0
    assert result["usage_rate"] == pytest.approx(47.0, abs=0.1)


def test_parse_credit_card_info_zero_limit():
    text = "没有信用卡信息"
    result = parse_credit_card_info(text)
    assert result["total_limit"] == 0.0
    assert result["usage_rate"] == 0.0


def test_parse_overdue_records():
    text = """
    逾期记录: 当前逾期2笔 历史逾期5笔
    """
    result = parse_overdue_records(text)
    assert result["current_overdue"] == 2
    assert result["historical_overdue"] == 5


def test_parse_overdue_records_none():
    text = """
    逾期记录: 当前逾期0笔 历史逾期0笔
    """
    result = parse_overdue_records(text)
    assert result["current_overdue"] == 0
    assert result["historical_overdue"] == 0


def test_parse_query_records():
    text = """
    查询记录
    2026-03-01 贷款审批 某银行
    2026-02-15 贷款审批 某银行
    2026-01-10 贷款审批 某机构
    2025-12-01 法人资格审查 某银行
    2025-10-01 贷款审批 某银行
    2025-06-01 法人资格审查 某机构
    """
    result = parse_query_records(text, reference_date="2026-03-31")
    assert result["recent_1m"]["loan_approval"] >= 1
    assert result["recent_3m"]["loan_approval"] >= 2
    assert result["recent_6m"]["corporate_review"] >= 1


def test_parse_query_records_with_credit_card():
    text = """
    查询记录
    2026-03-15 信用卡审批 某银行
    2026-03-01 贷款审批 某银行
    """
    result = parse_query_records(text, reference_date="2026-03-31")
    assert result["recent_1m"]["loan_approval"] >= 1


def test_parse_query_records_corporate_review_variants():
    text = """
    查询记录
    2026-03-10 法人审查 某银行
    2026-03-05 法人资格审查 某机构
    """
    result = parse_query_records(text, reference_date="2026-03-31")
    assert result["recent_1m"]["corporate_review"] == 2


def test_extract_credit_data_returns_structure():
    text = """
    个人信用报告
    信贷交易信息提示
    住房贷款 余额85万
    信用卡 授信总额50万 已用额度23.5万
    逾期记录: 当前逾期0笔 历史逾期1笔
    查询记录
    2026-03-01 贷款审批 某银行
    """
    result = extract_credit_data(text)
    assert "total_debt" in result
    assert "total_balance" in result
    assert "credit_card_total_limit" in result
    assert "credit_card_used" in result
    assert "credit_card_usage_rate" in result
    assert "query_records" in result
    assert "overdue_records" in result


def test_extract_credit_data_with_reference_date():
    text = """
    住房贷款 余额85万
    信用卡 授信总额50万 已用额度23.5万
    查询记录
    2026-03-01 贷款审批 某银行
    """
    result = extract_credit_data(text, reference_date="2026-03-31")
    assert result["query_records"]["recent_1m"]["loan_approval"] >= 1


# Need pytest for approx
import pytest
