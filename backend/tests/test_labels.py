"""后端 labels.py 的标签覆盖率与禁用词测试。前端 labels.ts 由人工保持同步。"""
from pathlib import Path


# 禁用词:这些词不应出现在 labels.py / 前端标签 / 用户协议
FORBIDDEN_TERMS = [
    "信用评分",
    "智能诊断",
    "推荐银行",
    "评估额度",
    "撮合贷款",
    "我们能贷",
]


def test_label_dict_covers_all_score_fields():
    """labels.py 中必须为 DiagnosisRecord 的评分与额度字段提供对外标签。"""
    from services.labels import DIAGNOSIS_LABELS

    required = [
        "score_credit", "score_cashflow", "score_structure",
        "score_collateral", "score_intent", "score_total",
        "loan_min", "loan_max",
    ]
    for key in required:
        assert key in DIAGNOSIS_LABELS, f"missing label for {key}"
        label = DIAGNOSIS_LABELS[key]
        assert any(word in label for word in ["完整度", "诊断", "配合度", "参考"]), \
            f"{key} label '{label}' must clarify it's not credit score"


def test_no_forbidden_terms_in_label_dict():
    """labels.py 不能含禁用词。"""
    from services import labels
    src = Path(labels.__file__).read_text(encoding="utf-8")
    for term in FORBIDDEN_TERMS:
        assert term not in src, f"forbidden term '{term}' in labels.py"


def test_case_labels_present():
    """CASE_LABELS 必须包含 recommended_bank 和 approved_amount,
    且必须显式标注是历史记录,不构成对当前客户的推荐。"""
    from services.labels import CASE_LABELS
    assert "recommended_bank" in CASE_LABELS
    assert "approved_amount" in CASE_LABELS
    for key, label in CASE_LABELS.items():
        assert "历史" in label, \
            f"{key} label '{label}' must mark itself as historical"


def test_disclaimers_present_and_safe():
    """DISCLAIMERS 必须包含 diagnosis 与 case 两条,且不得含禁用词。"""
    from services.labels import DISCLAIMERS
    assert "diagnosis" in DISCLAIMERS
    assert "case" in DISCLAIMERS
    forbidden = ["信用评分", "智能诊断", "推荐银行", "评估额度",
                 "撮合贷款", "我们能贷"]
    for key, text in DISCLAIMERS.items():
        for term in forbidden:
            assert term not in text, \
                f"DISCLAIMERS[{key}] contains forbidden term '{term}'"
