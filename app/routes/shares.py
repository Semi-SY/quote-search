"""分享路由：GET /s/{slug}。

slug = base62(line_id) 的确定性计算，不写库。
运行期只读，没有 shares 表。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import search as search_core
from app import db

router = APIRouter(tags=["shares"])


@router.get("/s/{slug}", response_class=HTMLResponse, response_model=None)
def share(slug: str, request: Request) -> HTMLResponse:
    line_id = search_core._decode_base62(slug)
    if line_id is None:
        raise HTTPException(404, "短链无效")
    if not db.is_ready():
        raise HTTPException(503, "数据库尚未生成")

    item = search_core.get_line(line_id)
    if not item:
        raise HTTPException(404, "台词不存在")

    root_url = str(request.base_url).rstrip("/")
    html = _render_share_html(item, root_url)
    return HTMLResponse(html)


def _render_share_html(item: dict, root_url: str) -> str:
    title = f"{item['text_en'][:60]} · {item['text_zh'] or ''}"
    og_image = item["poster_url"]
    og_video = item["clip_url"]

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <meta name="description" content="{item['text_zh'] or item['text_en']}">
  <meta property="og:type" content="video">
  <meta property="og:title" content="{item['text_en'][:80]}">
  <meta property="og:description" content="{item['text_zh'] or ''}">
  <meta property="og:image" content="{og_image}">
  <meta property="og:video" content="{og_video}">
  <meta property="og:video:type" content="video/mp4">
</head>
<body>
  <video controls autoplay style="max-width:720px;width:100%">
    <source src="{og_video}" type="video/mp4">
  </video>
  <p><strong>EN</strong> {item['text_en']}</p>
  <p><strong>中文</strong> {item['text_zh'] or '—'}</p>
  <p><code>{item['season']:02d}E{item['episode']:02d}</code> · {item['timecode']}</p>
  <p><a href="{root_url}">← 返回首页</a></p>
</body>
</html>
"""
