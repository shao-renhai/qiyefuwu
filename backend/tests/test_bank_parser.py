import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services.bank_parser import parse_bank_statement


def test_parse_excel_returns_transactions(sample_excel_file):
    """Parsing an Excel file should return 10 transactions."""
    result = parse_bank_statement(sample_excel_file)
    assert len(result) == 10


def test_parse_excel_has_required_fields(sample_excel_file):
    """Each transaction dict must have the required keys."""
    result = parse_bank_statement(sample_excel_file)
    required = {"date", "counterparty", "description", "income", "expense", "balance"}
    for tx in result:
        assert required.issubset(tx.keys()), f"Missing keys in {tx.keys()}"


def test_parse_csv(sample_csv_file):
    """Parsing a CSV file should return 10 transactions."""
    result = parse_bank_statement(sample_csv_file)
    assert len(result) == 10


def test_parse_returns_sorted_by_date(sample_excel_file):
    """Transactions should be sorted by date ascending."""
    result = parse_bank_statement(sample_excel_file)
    dates = [tx["date"] for tx in result]
    assert dates == sorted(dates)
