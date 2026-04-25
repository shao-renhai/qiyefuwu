# CUSTOMER_SIGNAL_RULES.md

## V1 客户灯色规则

客户灯色只在客户维度计算，不提供人工改灯入口。灯色变化不单独写审计日志；触发灯色变化的业务动作本身写审计日志。

## 输入字段

- `pool`: `lead` / `consulting` / `closed`
- `lead_status`
- `consulting_status`
- `close_result`
- `intent_level`
- `next_follow_up_at`
- `visited_at`

## 优先级

1. 已关闭且 `close_result=success`: `green / closed_success`
2. 已关闭且非成功结果: `red / closed_failed` 或 `red / closed_no_response`
3. 无效、无需求、拒绝、不符合准入: `red`
4. `next_follow_up_at` 已逾期: `red / followup_overdue`
5. 接待池已到访或进入方案/审批推进: `green`
6. 已邀约到店或高意向: `green`
7. 低意向但仍可跟进: `yellow / low_intent`
8. 新客户默认: `yellow / new_lead`

## 触发重算动作

- 创建客户
- 新增跟进
- 客户到访
- 修改 `lead_status`
- 修改 `consulting_status`
- 修改 `close_result`
- 客户流转到其他池
