"""元信息路由：健康检查。"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter

from app import db, search as search_mod
from app.config import APP_VERSION
from app.schemas import HealthResponse

router = APIRouter(tags=["meta"])


@router.get("/featured")
def featured(limit: int = 12) -> dict:
    """首页精选台词；库未就绪时返回空列表，前端展示引导文案。"""
    if not db.is_ready():
        return {"items": []}
    try:
        return {"items": search_mod.get_featured(min(50, max(1, limit)))}
    except sqlite3.Error:
        return {"items": []}


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    db_ready = False
    line_count = 0
    if db.is_ready():
        try:
            line_count = db.count_lines()
            db_ready = True
        except sqlite3.Error:
            db_ready = False
    return HealthResponse(
        status="ok",
        version=APP_VERSION,
        db_ready=db_ready,
        line_count=line_count,
    )
