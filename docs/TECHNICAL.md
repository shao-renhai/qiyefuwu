# 融资分析系统 — 技术文档

> 最后更新：2026-04-02

## 一、系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (React + Ant Design)              │
│    http://localhost:5173                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ UploadCredit │→ │ UploadBank   │→ │ AnalysisView  │  │
│  │  第一步：征信  │  │ 第二步：流水  │  │ 第三步：报告  │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP API
┌──────────────────────▼──────────────────────────────────┐
│                    后端 (FastAPI)                         │
│    http://localhost:8000                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ credit_report│  │ bank_statement│  │ analysis/export│  │
│  │   router     │  │   router      │  │   router       │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────────┘  │
│         │                │                                │
│  ┌──────▼──────┐  ┌──────▼───────┐                       │
│  │credit_parser│  │ bank_parser  │                       │
│  │credit_ocr   │  │ bank_analyzer│                       │
│  └─────────────┘  └──────────────┘                       │
│         │                                                 │
│  ┌──────▼──────────────────────────┐                     │
│  │         SQLite 数据库            │                     │
│  │  clients / credit_reports /     │                     │
│  │  bank_statements                │                     │
│  └─────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

## 二、目录结构

```
.
├── backend/
│   ├── main.py                    # FastAPI 入口
│   ├── requirements.txt           # Python 依赖
│   ├── db/
│   │   └── database.py            # SQLAlchemy 模型 + SQLite
│   ├── models/
│   │   └── schemas.py             # Pydantic 数据模型
│   ├── routers/
│   │   ├── credit_report.py       # 征信报告上传路由
│   │   ├── bank_statement.py      # 银行流水上传路由
│   │   ├── analysis.py            # 分析报告路由
│   │   └── export.py              # 导出 Excel/PDF 路由
│   ├── services/
│   │   ├── credit_parser.py       # 征信报告解析（核心）
│   │   ├── credit_ocr.py          # OCR 扫描件处理
│   │   ├── bank_parser.py         # 银行流水解析
│   │   ├── bank_analyzer.py       # 流水分析（去重/异常检测）
│   │   └── exporter.py            # Excel/PDF 导出
│   ├── tests/
│   │   ├── test_credit_parser.py  # 征信解析测试（20个）
│   │   ├── test_bank_parser.py    # 流水解析测试（7个）
│   │   └── test_exporter.py       # 导出测试（2个）
│   └── uploads/                   # 上传文件存储目录
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # 主应用（三步向导）
│   │   ├── pages/
│   │   │   ├── UploadCredit.tsx   # 征信上传页
│   │   │   ├── UploadBank.tsx     # 流水上传页
│   │   │   └── AnalysisView.tsx   # 分析报告页
│   │   ├── components/
│   │   │   ├── FileUploader.tsx   # 文件上传组件
│   │   │   ├── CreditSummary.tsx  # 征信摘要展示
│   │   │   └── BankSummary.tsx    # 流水摘要展示
│   │   └── services/
│   │       └── api.ts             # API 请求封装
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   └── TECHNICAL.md               # 本文档
├── README.md
└── .gitignore
```

## 三、征信报告解析 — 核心模块

### 3.1 双格式自动检测

系统支持两种征信报告格式，上传时自动识别：

| 格式 | 来源 | 解析方式 | 准确度 |
|------|------|----------|--------|
| 详版（扫描件） | 银行柜台打印 → 扫描PDF | OCR (Tesseract) → 正则提取 | 中等（受OCR质量影响） |
| 简版（电子版） | 征信中心网站下载PDF | pdfplumber 文本提取 → 正则 | 高（完美文本提取） |

**检测逻辑**（`_is_simplified_format()`）：
- 统计简版标记词（如"从未逾期过的贷记卡"、"已使用额度"）和详版标记词（如"循环贷账户"、"授信总额"）的出现次数
- 简版得分 > 详版得分 → 调用简版解析器
- 否则 → 调用详版解析器

### 3.2 解析流程

```
上传 PDF
  │
  ├─ pdfplumber 提取文本
  │    ├─ 成功 → 自动检测格式 → 对应解析器
  │    └─ 失败（无文本）→ 判定为扫描件
  │
  └─ Tesseract OCR (200 DPI)
       └─ OCR 文本 → 详版解析器（含OCR容错正则）
```

### 3.3 简版解析器（电子版 PDF）

文件：`backend/services/credit_parser.py`

#### 信用卡解析 `_parse_simplified_credit_cards()`
- 先做换行归一化：`信\n用额度` → `信用额度`
- 正则：`发放的贷记卡.{0,200}?信用额度\s*([\d,]+).{0,50}?已使用额度\s*([\d,]+)`
- 支持多张信用卡累加

#### 贷款解析 `_parse_simplified_loans()`
- **住房贷款**：`发放的\s*([\d,]+)\s*元.{0,100}?个人住房.{0,100}?贷款.{0,200}?余额\s*([\d,]+)`
- **其他贷款**：匹配 `消费|经营|其他` 关键词，排除住房和已结清
- **循环贷**：匹配 `授信...信用额度X元...余额为Y`
- **已结清计数**：统计全文"已结清"出现次数

#### 逾期解析 `_parse_simplified_overdue()`
- 解析信息概要表：`发生过逾期的账户数 -- -- -- --`（"--"表示无逾期）
- 解析90天以上逾期：`发生过90天以上逾期的账户数`
- 支持叙述式逾期明细提取

#### 查询记录解析 `_parse_simplified_queries()`
- 定位"机构查询记录明细"段落
- 正则按行匹配：`(\d{4}年\d{2}月\d{2}日)\s+(.+?)\s+(查询原因)`
- 支持的查询类型：信用卡审批、贷款审批、融资审批、贷后管理、担保资格审查、资信审查
- 按时间窗口统计：近1月/3月/6月/1年

### 3.4 详版解析器（扫描件 OCR）

#### OCR 配置
- DPI：200（实测优于 300/400，因原件为双页扫描）
- 语言：`chi_sim+eng`（简体中文 + 英文）
- 无水印去除处理（实测去水印反而降低识别率）

#### OCR 容错机制
查询记录的查询类型使用同义词列表匹配 OCR 误识别：
```python
loan_approval_synonyms = r"贷款审批|贷款中批|贷耸市批|货款审批|..."  # 15+ 变体
post_loan_synonyms = r"贷后管理|贷后答理|贷后宕理|..."              # 10+ 变体
```

### 3.5 解析结果数据结构

```json
{
  "total_debt": 539724.0,
  "total_balance": 539724.0,
  "institution_details": [
    {"type": "住房贷款", "count": 1, "balance": 539724.0, "original_amount": 550000.0}
  ],
  "active_loans": [...],
  "credit_card_total_limit": 33000.0,
  "credit_card_used": 27606.0,
  "credit_card_usage_rate": 83.7,
  "overdue_records": [],
  "query_records": {
    "recent_1m": {"loan_approval": 1, "corporate_review": 0},
    "recent_3m": {"loan_approval": 3, "corporate_review": 0},
    "recent_6m": {"loan_approval": 4, "corporate_review": 0},
    "recent_1y": {"loan_approval": 9, "corporate_review": 0},
    "total_post_loan": 29
  }
}
```

## 四、银行流水解析

### 4.1 支持格式

| 格式 | 解析方式 |
|------|----------|
| Excel (.xlsx/.xls) | pandas + openpyxl，自动映射中文列名 |
| CSV (.csv) | pandas，自动检测编码和分隔符 |
| PDF (.pdf) | pdfplumber 表格提取 |

### 4.2 中文列名自动映射

```python
COLUMN_MAP = {
    "交易日期": "date", "日期": "date",
    "交易金额": "amount", "金额": "amount", "发生额": "amount",
    "对方户名": "counterparty", "对方账号与户名": "counterparty",
    "摘要": "description", "交易摘要": "description",
    "余额": "balance", "账户余额": "balance",
}
```

### 4.3 PDF 银行流水特殊处理
- pdfplumber 提取表格
- 处理"借/贷"列或正负金额判断收支方向
- 从"对方账号与户名"字段中提取户名（取"/"后部分）

### 4.4 流水分析功能 (`bank_analyzer.py`)
- 收支汇总：总收入、总支出、净流入
- 月度统计：按月汇总收支
- 去重：相同金额+日期+对方的交易只计一次
- 异常交易检测：大额交易（超过均值3倍标准差）

## 五、API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/clients/` | 创建客户 |
| GET | `/api/clients/` | 客户列表 |
| GET | `/api/clients/{id}` | 客户详情 |
| POST | `/api/credit-report/upload` | 上传征信报告（form: file + client_id） |
| POST | `/api/bank-statement/upload` | 上传银行流水（form: file + client_id + client_name） |
| GET | `/api/analysis/{client_id}` | 获取分析报告 |
| GET | `/api/export/{client_id}/excel` | 导出 Excel |
| GET | `/api/export/{client_id}/pdf` | 导出 PDF |
| GET | `/api/health` | 健康检查 |

**API 文档**：启动后端后访问 http://localhost:8000/docs

## 六、前端页面

三步向导式交互：

### 第一步：上传征信报告 (`UploadCredit.tsx`)
- 输入客户姓名 → 自动创建客户
- 上传征信 PDF/图片 → 显示解析摘要
- 支持格式：`.pdf, .jpg, .jpeg, .png`

### 第二步：上传银行流水 (`UploadBank.tsx`)
- 可多次上传不同银行的流水
- 每次上传显示分析摘要
- 已上传文件列表展示
- 支持格式：`.xlsx, .xls, .csv, .pdf`

### 第三步：查看分析报告 (`AnalysisView.tsx`)
- 征信数据汇总
- 银行流水分析
- 导出 Excel / PDF

## 七、技术决策与经验

### 7.1 OCR 优化
| 尝试 | 结果 |
|------|------|
| 300 DPI | OCR 质量中等 |
| 400 DPI | 反而更差（双页扫描放大后噪点更多）|
| **200 DPI** | **最优**（字体大小适中，噪点少）|
| 水印去除（阈值法） | 失败（水印颜色与文字太接近） |
| 水印去除（自适应阈值） | 失败（部分文字被误删） |
| 水印去除（形态学运算） | 失败（效果最差） |
| 水印去除（背景除法） | 失败（引入新噪点） |

**结论**：对于纸质征信报告扫描件，200 DPI 原始 OCR 效果最好，不做预处理。

### 7.2 PDF 文本提取 vs OCR
- 电子版 PDF → pdfplumber 提取文本 → **完美提取**，零噪点
- 扫描版 PDF → pdfplumber 返回空 → 自动回退到 OCR
- 系统自动判断，用户无需关心

### 7.3 换行问题处理
pdfplumber 提取电子版 PDF 文本时，长行会被按页面宽度换行：
```
截至2026年02月，信
用额度33,000，已使用额度27,606。
```
解决：在正则匹配前做归一化处理 `re.sub(r"信\s*\n\s*用额度", "信用额度", text)`

### 7.4 环境问题
- macOS Homebrew 安装的 tesseract/poppler 在 `/opt/homebrew/bin`，Python venv 中可能找不到
- 解决：`credit_ocr.py` 启动时自动添加 `/opt/homebrew/bin` 到 PATH
- 项目路径含冒号（`:`）导致 venv 创建失败 → 在 `/tmp/` 创建 venv

## 八、已知限制与后续迭代

### 已验证
- [x] 电子版征信（简版）完整解析
- [x] 扫描版征信（详版）OCR 解析
- [x] Excel/CSV/PDF 银行流水解析
- [x] 37 个单元测试全部通过

### 待验证/完善
- [ ] 多张信用卡的简版征信解析
- [ ] 有逾期记录的简版征信解析
- [ ] 公积金贷款识别
- [ ] 担保信息提取
- [ ] 公共记录（法院执行、欠税等）提取
- [ ] 非信贷交易记录提取
- [ ] 不同银行的流水 PDF 格式适配
- [ ] 照片输入的质量标准和预处理

### 建议优先级
1. **收集更多样本** — 不同客户的简版征信，覆盖逾期、多卡、公积金等场景
2. **逾期解析验证** — 当前逻辑未被真实数据验证
3. **银行流水适配** — 不同银行导出的 PDF/Excel 格式差异较大

## 九、依赖清单

### 后端 Python 依赖
```
fastapi, uvicorn          # Web 框架
sqlalchemy                # ORM
pydantic                  # 数据验证
pdfplumber                # PDF 文本/表格提取
pytesseract               # OCR 引擎绑定
pdf2image                 # PDF 转图片（用于 OCR）
Pillow                    # 图像处理
pandas, openpyxl          # Excel 解析
reportlab                 # PDF 生成
python-multipart          # 文件上传
```

### 前端 Node 依赖
```
react, react-dom          # UI 框架
typescript                # 类型系统
antd, @ant-design/icons   # UI 组件库
axios                     # HTTP 请求
vite                      # 构建工具
```

### 系统依赖
```
tesseract                 # OCR 引擎
tesseract-lang            # 中文语言包
poppler                   # PDF 渲染（pdf2image 依赖）
```
