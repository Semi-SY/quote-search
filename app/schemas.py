"""Pydantic 出入参模型：前后端契约的唯一来源。"""

from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    version: str
    db_ready: bool
    line_count: int
