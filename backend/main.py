import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import init_db
from routers import auth, clients, credit_report, bank_statement, analysis, export, customers, cases

app = FastAPI(title="企业融资数据智能分析工具", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://101.96.197.130", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount routers
app.include_router(auth.router)
app.include_router(clients.router)
app.include_router(credit_report.router)
app.include_router(bank_statement.router)
app.include_router(analysis.router)
app.include_router(export.router)
app.include_router(customers.router)
app.include_router(cases.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
