"""
Bank statement parser: reads Excel/CSV files with Chinese column headers
and returns normalized transaction dicts.
"""

import os
import re
import pandas as pd
from typing import List, Dict, Any

# Mapping of Chinese column name variants to standard field names.
# Different banks use different column names for the same fields.
COLUMN_MAP: Dict[str, str] = {
    # Date variants
    "交易日期": "date",
    "日期": "date",
    "记账日期": "date",
    "交易时间": "date",
    "入账日期": "date",
    # Description variants
    "摘要": "description",
    "交易摘要": "description",
    "备注": "description",
    "用途": "description",
    "交易类型": "description",
    "交易备注": "description",
    # Counterparty variants
    "交易对手": "counterparty",
    "对方户名": "counterparty",
    "对方账户名": "counterparty",
    "收款人": "counterparty",
    "付款人": "counterparty",
    "对方名称": "counterparty",
    # Income variants
    "收入": "income",
    "贷方金额": "income",
    "存入金额": "income",
    "收入金额": "income",
    "贷方发生额": "income",
    "转入金额": "income",
    # Expense variants
    "支出": "expense",
    "借方金额": "expense",
    "支出金额": "expense",
    "取出金额": "expense",
    "借方发生额": "expense",
    "转出金额": "expense",
    # Balance variants
    "余额": "balance",
    "账户余额": "balance",
    "本次余额": "balance",
    "当前余额": "balance",
}

REQUIRED_FIELDS = {"date", "counterparty", "description", "income", "expense", "balance"}


def _clean_amount(value: Any) -> float:
    """Clean an amount value: remove commas, currency symbols, handle blanks."""
    if pd.isna(value) or value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    # Remove currency symbols and commas
    s = re.sub(r'[¥￥$,，\s]', '', s)
    if s == "" or s == "-":
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _normalize_date(value: Any) -> str:
    """Convert various date formats to YYYY-MM-DD string."""
    if pd.isna(value) or value is None:
        return ""
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    s = str(value).strip()
    # Try common date formats
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d", "%Y年%m月%d日", "%m/%d/%Y"):
        try:
            return pd.to_datetime(s, format=fmt).strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            continue
    # Fallback: let pandas guess
    try:
        return pd.to_datetime(s).strftime("%Y-%m-%d")
    except Exception:
        return s


def _map_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Map Chinese column names to standard field names."""
    rename = {}
    for col in df.columns:
        col_stripped = str(col).strip()
        if col_stripped in COLUMN_MAP:
            rename[col] = COLUMN_MAP[col_stripped]
    df = df.rename(columns=rename)
    return df


def parse_bank_statement(filepath: str) -> List[Dict[str, Any]]:
    """
    Parse a bank statement file (Excel or CSV) and return a list of
    transaction dicts with standardized field names, sorted by date.

    Each dict has keys: date, counterparty, description, income, expense, balance
    """
    ext = os.path.splitext(filepath)[1].lower()

    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(filepath)
    elif ext == ".csv":
        df = pd.read_csv(filepath)
    else:
        raise ValueError(f"Unsupported file format: {ext}")

    # Map column names
    df = _map_columns(df)

    # Ensure all required columns exist
    for field in REQUIRED_FIELDS:
        if field not in df.columns:
            df[field] = "" if field in ("counterparty", "description") else 0.0

    # Clean and normalize data
    df["date"] = df["date"].apply(_normalize_date)
    df["income"] = df["income"].apply(_clean_amount)
    df["expense"] = df["expense"].apply(_clean_amount)
    df["balance"] = df["balance"].apply(_clean_amount)
    df["counterparty"] = df["counterparty"].fillna("").astype(str)
    df["description"] = df["description"].fillna("").astype(str)

    # Sort by date
    df = df.sort_values("date").reset_index(drop=True)

    # Convert to list of dicts with only required fields
    transactions = []
    for _, row in df.iterrows():
        tx = {
            "date": row["date"],
            "counterparty": row["counterparty"],
            "description": row["description"],
            "income": row["income"],
            "expense": row["expense"],
            "balance": row["balance"],
        }
        transactions.append(tx)

    return transactions
