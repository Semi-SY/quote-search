"""搜索路由：GET /api/search / GET /api/lines/{id} / GET /api/episodes。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app import search as search_core
from app import db

router = APIRouter(tags=["search"])


@router.get("/search")
def search(
    q: str = Query(..., min_length=1, max_length=80),
    season: int | None = None,
    episode: int | None = None,
    speaker: str | None = None,
    page: int = 1,
    size: int = 20,
) -> dict:
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")
    if len(q) < 1 or len(q) > 80:
        raise HTTPException(400, "query 长度 1~80")
    return search_core.search(
        q, season=season, episode=episode, speaker=speaker,
        page=page, size=size,
    )


@router.get("/episodes")
def episodes() -> dict:
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")
    return {"episodes": search_core.get_episodes()}


@router.get("/lines/{line_id}")
def get_line(line_id: int) -> dict:
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")
    item = search_core.get_line(line_id)
    if not item:
        raise HTTPException(404, "台词不存在")
    return item
