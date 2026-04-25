# 企业融资数据智能分析工具

帮助融资顾问上传客户征信报告和银行流水，自动解析分析并输出结构化数据报告。

## 业务定位

本项目为融资顾问公司提供数字化作业系统（B2B SaaS），不开展征信、
撮合、放贷业务。所有命名、API 字段、对外文案须遵守
[docs/POSITIONING.md](docs/POSITIONING.md) 的边界声明。

---

## 功能

- **征信报告解析** — 上传PDF或图片，自动提取负债、逾期、查询记录等
- **银行流水分析** — 上传Excel/CSV，汇总收支、识别异常交易、去重统计
- **导出报告** — 在线查看 + 导出Excel/PDF

## 系统要求

- Python 3.10+
- Node.js 18+
- Tesseract OCR（用于图片识别）
- Poppler（用于PDF转图片）

## 安装

### 1. 安装系统依赖（macOS）

```bash
brew install tesseract poppler
brew install tesseract-lang  # 中文语言包
```

### 2. 安装后端依赖

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

> 注意：如果项目目录路径中含有特殊字符（如冒号），可能需要在其他位置创建虚拟环境：
> ```bash
> python3 -m venv /tmp/finance_backend_venv
> source /tmp/finance_backend_venv/bin/activate
> pip install -r requirements.txt
> ```

### 3. 安装前端依赖

```bash
cd frontend
npm install
```

## 启动

### 启动后端（端口8000）

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 启动前端（端口5173）

```bash
cd frontend
npm run dev
```

打开浏览器访问 http://localhost:5173

## 使用流程

1. **输入客户姓名** → 上传征信报告（PDF/图片）→ 查看解析结果
2. **上传银行流水**（Excel/CSV）→ 查看分析结果
3. **查看完整报告** → 导出Excel或PDF

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Ant Design 5 |
| 后端 | Python FastAPI |
| PDF解析 | pdfplumber |
| OCR | Tesseract |
| Excel | pandas + openpyxl |
| 数据库 | SQLite |

## 运行测试

```bash
cd backend
source venv/bin/activate
python -m pytest tests/ -v
```

## API文档

启动后端后访问 http://localhost:8000/docs 查看自动生成的API文档。
