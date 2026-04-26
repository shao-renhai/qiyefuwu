"""capability 引擎与 UserCapability 模型测试。"""
from datetime import datetime, timedelta
import pytest


def test_user_capability_model_create(api_client):
    """UserCapability 可以插入、查询、唯一约束生效。"""
    from db.database import SessionLocal, User, UserCapability

    db = SessionLocal()
    u = User(username="t1", hashed_password="x", display_name="T1", role="junior_consultant")
    db.add(u)
    db.commit()
    db.refresh(u)

    cap = UserCapability(
        user_id=u.id,
        feature_key="bank_analysis",
        source="manual_grant",
        granted_by_id=u.id,
        expires_at=None,
    )
    db.add(cap)
    db.commit()
    db.refresh(cap)

    assert cap.id is not None
    assert cap.granted_at is not None
    assert cap.revoked_at is None

    # 查询
    rows = db.query(UserCapability).filter(UserCapability.user_id == u.id).all()
    assert len(rows) == 1
    assert rows[0].feature_key == "bank_analysis"
    db.close()


def test_user_capability_unique_constraint(api_client):
    """同 (user_id, feature_key, source) 不允许重复。"""
    from sqlalchemy.exc import IntegrityError
    from db.database import SessionLocal, User, UserCapability

    db = SessionLocal()
    u = User(username="t2", hashed_password="x", display_name="T2", role="junior_consultant")
    db.add(u)
    db.commit()
    db.refresh(u)

    db.add(UserCapability(user_id=u.id, feature_key="bank_analysis", source="manual_grant"))
    db.commit()
    db.add(UserCapability(user_id=u.id, feature_key="bank_analysis", source="manual_grant"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.close()
