"""为生产库补建 bank_analysis_context 表。

幂等：多次执行安全。沿用 create_all 只建缺失表的策略。

用法：
    cd backend
    python scripts/migrate_bank_context.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect  # noqa: E402
from db.database import engine, Base, BankAnalysisContext  # noqa: E402,F401


def main() -> None:
    print(f"Using DB engine: {engine.url}")
    insp = inspect(engine)
    if "bank_analysis_context" in insp.get_table_names():
        print("[skip] bank_analysis_context already exists")
    else:
        Base.metadata.create_all(bind=engine)
        print("[ok] created table bank_analysis_context")
    print("Migration complete.")


if __name__ == "__main__":
    main()
