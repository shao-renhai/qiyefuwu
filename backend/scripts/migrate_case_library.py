"""为生产库补齐 Customer/CustomerInteraction/Case 表及 users.role 列。

幂等：多次执行安全。用 SQLite ALTER TABLE 加列，用 Base.metadata.create_all
为缺失的表建表，不依赖 Alembic。

用法：
    cd backend
    python scripts/migrate_case_library.py
"""
import sys
from pathlib import Path

# Ensure backend package root is on sys.path when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect, text  # noqa: E402
from db.database import (  # noqa: E402,F401
    engine,
    Base,
    User,
    Customer,
    CustomerInteraction,
    Case,
)


def ensure_users_role() -> None:
    """为已有的 users 表补 role 列（SQLite 下 ALTER TABLE ADD COLUMN）。"""
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        print("[skip] users table does not exist yet; create_all will handle it")
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    if "role" in cols:
        print("[skip] users.role already exists")
        return
    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'consultant'")
        )
        conn.execute(text("UPDATE users SET role = 'consultant' WHERE role IS NULL"))
    print("[ok] added users.role (defaulted existing rows to 'consultant')")


def ensure_new_tables() -> None:
    """为缺失的 customers / customer_interactions / cases 建表。"""
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    needed = {"customers", "customer_interactions", "cases"}
    missing = needed - existing
    if not missing:
        print("[skip] all new tables exist")
        return
    # create_all 只创建缺失的表，不会动已有表。
    Base.metadata.create_all(bind=engine)
    print(f"[ok] created tables: {sorted(missing)}")


def main() -> None:
    print(f"Using DB engine: {engine.url}")
    ensure_users_role()
    ensure_new_tables()
    print("Migration complete.")


if __name__ == "__main__":
    main()
