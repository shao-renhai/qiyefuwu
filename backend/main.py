import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from core.config import settings
from db.database import init_db
from db.database import SessionLocal
from routers import (
    auth,
    clients,
    credit_report,
    credit_image,
    bank_statement,
    analysis,
    export,
    diagnosis,
    customers,
    cases,
    financing_cases,
    case_resources,
)

app = FastAPI(title=settings.app_name, version=settings.app_version)

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
app.include_router(credit_image.router)
app.include_router(bank_statement.router)
app.include_router(analysis.router)
app.include_router(export.router)
app.include_router(diagnosis.router)
app.include_router(customers.router)
app.include_router(cases.router)
app.include_router(financing_cases.router)
app.include_router(case_resources.router)


@app.exception_handler(HTTPException)
def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.status_code, "message": exc.detail}},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": 422, "message": "请求参数不合法", "details": exc.errors()}},
    )


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db():
    db_ok = True
    try:
        db = SessionLocal()
        db.execute(text("select 1"))
    except Exception:
        db_ok = False
    finally:
        try:
            db.close()
        except Exception:
            pass
    return {"status": "ok", "database": "ok" if db_ok else "error"}
