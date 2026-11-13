"""搜索路由：GET /api/search / GET /api/lines/{id} / SRT 下载 / 题材分类。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from app import search as search_core
from app import db

router = APIRouter(tags=["search"])


@router.get("/search")
def search(
    q: str = Query("", max_length=80),
    season: int | None = None,
    episode: int | None = None,
    speaker: str | None = None,
    genre: str | None = None,
    page: int = 1,
    size: int = 20,
) -> dict:
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")
    if len(q) > 80:
        raise HTTPException(400, "query 长度 0~80")
    return search_core.search(
        q, season=season, episode=episode, speaker=speaker, genre=genre,
        page=page, size=size,
    )


@router.get("/episodes")
def episodes() -> dict:
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")
    return {"episodes": search_core.get_episodes()}


@router.get("/genres")
def genres() -> dict:
    """题材分类列表（含每类台词数）。"""
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")
    return {"genres": search_core.get_genres()}


@router.get("/lines/{line_id}")
def get_line(line_id: int) -> dict:
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")
    item = search_core.get_line(line_id)
    if not item:
        raise HTTPException(404, "台词不存在")
    return item


@router.get("/lines/{line_id}/srt")
def download_line_srt(line_id: int, context: int = Query(0, ge=0, le=10)) -> PlainTextResponse:
    """导出单条台词为 SRT。context=前后各 N 条（含当前行）。"""
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")
    srt = search_core.line_to_srt(line_id, context=context)
    if srt is None:
        raise HTTPException(404, "台词不存在")
    return PlainTextResponse(
        srt,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="line_{line_id}.srt"'},
    )


@router.get("/episodes/{season}/{episode}/srt")
def download_episode_srt(season: int, episode: int) -> PlainTextResponse:
    """导出整集台词为 SRT（中英双语）。"""
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")
    srt = search_core.episode_to_srt(season, episode)
    if srt is None:
        raise HTTPException(404, "该集无台词")
    filename = f"s{season:02d}e{episode:02d}.srt"
    return PlainTextResponse(
        srt,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
