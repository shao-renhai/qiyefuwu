import pytest
from fastapi import HTTPException
from services.permissions import require_role


class FakeUser:
    def __init__(self, role):
        self.role = role


def test_require_role_single_match():
    dep = require_role("founder")
    assert dep(FakeUser("founder")).role == "founder"


def test_require_role_list_match():
    dep = require_role(["founder", "consultant"])
    assert dep(FakeUser("consultant")).role == "consultant"


def test_require_role_reject():
    dep = require_role("founder")
    with pytest.raises(HTTPException) as exc:
        dep(FakeUser("telesales"))
    assert exc.value.status_code == 403


def test_require_role_case_insensitive():
    dep = require_role("FOUNDER")
    assert dep(FakeUser("founder")).role == "founder"
