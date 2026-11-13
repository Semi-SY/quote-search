"""运行期搜索：FTS5 trigram + LIKE 降级 + 高亮 + 排序。

只读访问，走 app/db.py 的 mode=ro 连接。
"""

from __future__ import annotations

import math
import re
import sqlite3
import time
from typing import Optional

from app import db


def _match_like(query: str) -> str:
    """为 LIKE 转义 % _ \\，前后包 %。"""
    q = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{q}%"


def _highlight_html(text: Optional[str], terms: list[str]) -> str:
    if not text:
        return ""
    out = text
    for t in sorted(terms, key=len, reverse=True):
        if not t:
            continue
        # 大小写不敏感替换为 <em>...</em>
        out = re.sub(
            re.escape(t),
            lambda m: f"<em>{m.group(0)}</em>",
            out,
            flags=re.IGNORECASE,
        )
    return out


def _encode_base62(n: int) -> str:
    """把 int 转成 base62 短链。确定性，不需要落库。"""
    ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    if n < 0:
        raise ValueError("base62 不处理负数 line_id")
    if n == 0:
        return "0"
    out = []
    while n:
        n, r = divmod(n, 62)
        out.append(ALPHABET[r])
    return "".join(reversed(out))


def _decode_base62(slug: str) -> Optional[int]:
    ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    n = 0
    for ch in slug:
        idx = ALPHABET.find(ch)
        if idx < 0:
            return None
        n = n * 62 + idx
    return n if n > 0 else None


def line_to_item(row: sqlite3.Row) -> dict:
    """DB 行 → 搜索响应 item（含 clip_url / poster_url / share_url）。"""
    season = row["season"]
    episode = row["episode"]
    ep_key = f"s{season:02d}e{episode:02d}"
    default_mp4 = f"clips/{ep_key}/{row['id']:06d}.mp4"
    default_jpg = f"clips/{ep_key}/{row['id']:06d}.jpg"
    clips_key = row["object_key"] or default_mp4
    poster_key = row["poster_key"] or default_jpg
    return {
        "id": row["id"],
        "season": season,
        "episode": episode,
        "episode_title_en": row["episode_title_en"],
        "episode_title_zh": row["episode_title_zh"],
        "start_ms": row["start_ms"],
        "end_ms": row["end_ms"],
        "timecode": _ms_to_tc(row["start_ms"]),
        "text_en": row["text_en"],
        "text_zh": row["text_zh"],
        "speaker": row["speaker"],
        "align_confidence": row["align_confidence"],
        "clip_url": f"/media/{clips_key}",
        "poster_url": f"/media/{poster_key}",
        "share_url": f"/s/{_encode_base62(row['id'])}",
    }


def _ms_to_tc(ms: int) -> str:
    """毫秒 → "MM:SS" 或 "HH:MM:SS"。"""
    total_s = ms // 1000
    h = total_s // 3600
    m = (total_s % 3600) // 60
    s = total_s % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def search(
    query: str,
    *,
    season: Optional[int] = None,
    episode: Optional[int] = None,
    speaker: Optional[str] = None,
    page: int = 1,
    size: int = 20,
) -> dict:
    """主入口：走 FTS 或降级 LIKE。返回完整响应包。"""
    query = (query or "").strip()
    page = max(1, page)
    size = min(50, max(1, size))
    took_start = time.perf_counter()

    where: list[str] = []
    params: list = []
    joins = """
      FROM lines l
      JOIN episodes e ON e.id = l.episode_id
      LEFT JOIN clips c ON c.line_id = l.id
    """
    fields = """
      l.id, e.season, e.episode, e.title_en AS episode_title_en,
      e.title_zh AS episode_title_zh,
      l.start_ms, l.end_ms, l.text_en, l.text_zh,
      l.speaker, l.align_confidence,
      c.object_key, c.poster_key
    """

    # FTS 可用吗？查询长度 >= 3 才走 FTS
    use_fts = len(query) >= 3
    if use_fts:
        # trigram 需要 3+ 字符
        where.append("l.id IN (SELECT rowid FROM lines_fts WHERE lines_fts MATCH ?)")
        params.append(query)

    if season is not None:
        where.append("e.season = ?")
        params.append(season)
    if episode is not None:
        where.append("e.episode = ?")
        params.append(episode)
    if speaker:
        where.append("l.speaker LIKE ?")
        params.append(f"%{speaker}%")

    base_sql = f"SELECT {fields} {joins}"
    w = ("WHERE " + " AND ".join(where)) if where else ""

    with db.read_conn() as conn:
        # total
        total = int(conn.execute(f"SELECT count(*) FROM ({base_sql} {w})", params).fetchone()[0])

        # 排序 + 分页
        if use_fts:
            # bm25 + 短句加权
            rank_sql = f"""
              SELECT {fields}, bm25(lines_fts) AS rank
              FROM lines_fts
              JOIN lines l ON l.id = lines_fts.rowid
              JOIN episodes e ON e.id = l.episode_id
              LEFT JOIN clips c ON c.line_id = l.id
              WHERE lines_fts MATCH ?
            """
            rank_params = [query] + params[1:]  # 跳过第一个（query 已给 lines_fts MATCH）
            order = "ORDER BY rank ASC, length(l.text_en) ASC"
        else:
            rank_sql = f"{base_sql} {w}"
            rank_params = list(params)
            order = "ORDER BY length(l.text_en) ASC"

        offset = (page - 1) * size
        rows = conn.execute(
            f"{rank_sql} {order} LIMIT ? OFFSET ?",
            rank_params + [size, offset],
        ).fetchall()

    items = [line_to_item(r) for r in rows]
    took_ms = int((time.perf_counter() - took_start) * 1000)

    return {
        "query": query,
        "total": total,
        "page": page,
        "size": size,
        "took_ms": took_ms,
        "items": items,
    }


def get_featured(limit: int = 12) -> list[dict]:
    """首页精选台词（构建期写入 featured_lines，运行期只读）。"""
    with db.read_conn() as conn:
        rows = conn.execute(
            """SELECT l.id, e.season, e.episode, e.title_en AS episode_title_en,
                      e.title_zh AS episode_title_zh,
                      l.start_ms, l.end_ms, l.text_en, l.text_zh,
                      l.speaker, l.align_confidence,
                      c.object_key, c.poster_key
               FROM featured_lines f
               JOIN lines l ON l.id = f.line_id
               JOIN episodes e ON e.id = l.episode_id
               LEFT JOIN clips c ON c.line_id = l.id
               ORDER BY f.rank
               LIMIT ?""",
            (limit,),
        ).fetchall()
    return [line_to_item(r) for r in rows]


def get_episodes() -> list[dict]:
    """季集列表（筛选器用）。"""
    with db.read_conn() as conn:
        rows = conn.execute(
            """SELECT e.season, e.episode, e.title_en, e.title_zh,
                      count(l.id) AS line_count
               FROM episodes e
               LEFT JOIN lines l ON l.episode_id = e.id
               GROUP BY e.season, e.episode
               ORDER BY e.season, e.episode"""
        ).fetchall()
    return [dict(r) for r in rows]


def get_line(line_id: int) -> Optional[dict]:
    """单条详情 + 前后文各 2 条。"""
    with db.read_conn() as conn:
        row = conn.execute(
            """SELECT l.*, e.season, e.episode, e.title_en AS episode_title_en,
                      e.title_zh AS episode_title_zh, c.object_key, c.poster_key
               FROM lines l
               JOIN episodes e ON e.id = l.episode_id
               LEFT JOIN clips c ON c.line_id = l.id
               WHERE l.id = ?""",
            (line_id,),
        ).fetchone()
        if not row:
            return None
        prev_rows = conn.execute(
            """SELECT id, text_en, text_zh FROM lines
               WHERE episode_id=? AND seq < ? ORDER BY seq DESC LIMIT 2""",
            (row["episode_id"], row["seq"]),
        ).fetchall()
        next_rows = conn.execute(
            """SELECT id, text_en, text_zh FROM lines
               WHERE episode_id=? AND seq > ? ORDER BY seq ASC LIMIT 2""",
            (row["episode_id"], row["seq"]),
        ).fetchall()

    item = line_to_item(row)
    item["context"] = {
        "prev": [dict(r) for r in reversed(prev_rows)],
        "next": [dict(r) for r in next_rows],
    }
    return item
