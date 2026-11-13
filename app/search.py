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


_CJK_RE = re.compile(r"[\u3000-\u9fff\u3400-\u4dbf\uf900-\ufaff]")


def _has_cjk(query: str) -> bool:
    """查询是否含中日韩字符。含中文走 trigram 子串，纯英文走 porter 词元。"""
    return bool(_CJK_RE.search(query))


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
    default_scene = f"clips/{ep_key}/{row['id']:06d}_scene.mp4"
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
        "scene_clip_url": f"/media/{default_scene}",
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
    genre: Optional[str] = None,
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

    # 选索引：中文 ≥3 字走 trigram；中文 1-2 字 trigram 无法命中，降级 LIKE
    # 纯英文走 porter 词元（词边界，"now" 不命中 "know"）
    has_cjk = _has_cjk(query)
    short_cjk = has_cjk and len(query) < 3
    use_fts = (has_cjk and not short_cjk) or (not has_cjk and len(query) >= 1)
    if short_cjk:
        like = _match_like(query)
        where.append(
            "(l.text_zh LIKE ? ESCAPE '\\' OR l.text_en LIKE ? ESCAPE '\\')"
        )
        params.extend([like, like])
    elif use_fts:
        if has_cjk:
            where.append("l.id IN (SELECT rowid FROM lines_fts WHERE lines_fts MATCH ?)")
        else:
            where.append("l.id IN (SELECT rowid FROM lines_fts_word WHERE lines_fts_word MATCH ?)")
        params.append(query)

    if season is not None:
        where.append("e.season = ?")
        params.append(season)
    if episode is not None:
        where.append("e.episode = ?")
        params.append(episode)
    if speaker:
        where.append("l.speaker = ?")
        params.append(speaker)
    if genre:
        where.append(
            "l.episode_id IN (SELECT episode_id FROM episode_genres WHERE genre = ?)"
        )
        params.append(genre)

    base_sql = f"SELECT {fields} {joins}"
    w = ("WHERE " + " AND ".join(where)) if where else ""

    with db.read_conn() as conn:
        # total
        total = int(conn.execute(f"SELECT count(*) FROM ({base_sql} {w})", params).fetchone()[0])

        # 排序 + 分页
        if use_fts:
            fts_table = "lines_fts" if has_cjk else "lines_fts_word"
            # bm25 + 短句加权；附加筛选条件（season/episode/speaker/genre）追加到 WHERE
            extra_where = where[1:]  # 跳过第一条 FTS MATCH
            extra_sql = (" AND " + " AND ".join(extra_where)) if extra_where else ""
            rank_sql = f"""
              SELECT {fields}, bm25({fts_table}) AS rank
              FROM {fts_table}
              JOIN lines l ON l.id = {fts_table}.rowid
              JOIN episodes e ON e.id = l.episode_id
              LEFT JOIN clips c ON c.line_id = l.id
              WHERE {fts_table} MATCH ?{extra_sql}
            """
            rank_params = [query] + params[1:]  # 跳过第一个（query 已给 FTS MATCH）
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


def get_random() -> Optional[dict]:
    """随机一条台词，供首页「换一句」使用。"""
    with db.read_conn() as conn:
        row = conn.execute(
            """SELECT l.id, e.season, e.episode, e.title_en AS episode_title_en,
                      e.title_zh AS episode_title_zh,
                      l.start_ms, l.end_ms, l.text_en, l.text_zh,
                      l.speaker, l.align_confidence,
                      c.object_key, c.poster_key
               FROM lines l
               JOIN episodes e ON e.id = l.episode_id
               LEFT JOIN clips c ON c.line_id = l.id
               ORDER BY RANDOM()
               LIMIT 1"""
        ).fetchone()
    return line_to_item(row) if row else None


def get_episodes() -> list[dict]:
    """季集列表（筛选器用），含多题材标签 / source。"""
    with db.read_conn() as conn:
        rows = conn.execute(
            """SELECT e.id AS episode_id, e.season, e.episode, e.title_en, e.title_zh,
                      e.genre, e.source, count(l.id) AS line_count
               FROM episodes e
               LEFT JOIN lines l ON l.episode_id = e.id
               GROUP BY e.season, e.episode
               ORDER BY e.season, e.episode"""
        ).fetchall()
        genre_rows = conn.execute(
            "SELECT episode_id, genre FROM episode_genres ORDER BY genre"
        ).fetchall()

    genres_by_episode: dict[int, list[str]] = {}
    for row in genre_rows:
        genres_by_episode.setdefault(int(row["episode_id"]), []).append(row["genre"])

    episodes = []
    for row in rows:
        item = dict(row)
        episode_id = int(item.pop("episode_id"))
        item["genres"] = genres_by_episode.get(episode_id, [])
        episodes.append(item)
    return episodes


def get_genres() -> list[dict]:
    """多题材分类统计（筛选器用），一个题材可覆盖多部影片。"""
    with db.read_conn() as conn:
        rows = conn.execute(
            """SELECT eg.genre AS genre,
                      count(DISTINCT eg.episode_id) AS episode_count,
                      count(l.id) AS line_count
               FROM episode_genres eg
               JOIN episodes e ON e.id = eg.episode_id
               LEFT JOIN lines l ON l.episode_id = e.id
               GROUP BY eg.genre
               ORDER BY line_count DESC, eg.genre"""
        ).fetchall()
    return [dict(r) for r in rows]


def get_speakers() -> list[dict]:
    """说话人分类统计（筛选器用）。"""
    with db.read_conn() as conn:
        rows = conn.execute(
            """SELECT speaker, count(*) AS line_count
               FROM lines
               WHERE speaker IS NOT NULL AND TRIM(speaker) <> ''
               GROUP BY speaker
               ORDER BY line_count DESC, speaker"""
        ).fetchall()
    return [dict(r) for r in rows]


_SCENE_MAX_GAP_MS = 12_000
_SCENE_MAX_DURATION_MS = 45_000


def _scene_window(
    rows: list[sqlite3.Row], index: int, context: int = 2
) -> list[sqlite3.Row]:
    """选取实际包含在场景视频里的上下文；规则与离线切片保持一致。"""
    start = index
    end = index + 1
    while index - start < context and start > 0:
        candidate = rows[start - 1]
        gap = rows[start]["start_ms"] - candidate["end_ms"]
        duration = rows[end - 1]["end_ms"] - candidate["start_ms"]
        if gap > _SCENE_MAX_GAP_MS or duration > _SCENE_MAX_DURATION_MS:
            break
        start -= 1
    while end - index - 1 < context and end < len(rows):
        candidate = rows[end]
        gap = candidate["start_ms"] - rows[end - 1]["end_ms"]
        duration = candidate["end_ms"] - rows[start]["start_ms"]
        if gap > _SCENE_MAX_GAP_MS or duration > _SCENE_MAX_DURATION_MS:
            break
        end += 1
    return rows[start:end]


def get_line(line_id: int) -> Optional[dict]:
    """单条详情 + 与场景视频完全一致的前后文。"""
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
        rows = conn.execute(
            """SELECT id, seq, start_ms, end_ms, text_en, text_zh, speaker
               FROM lines WHERE episode_id=? ORDER BY seq""",
            (row["episode_id"],),
        ).fetchall()

    current_index = next(i for i, r in enumerate(rows) if r["id"] == line_id)
    scene_rows = _scene_window(rows, current_index, context=2)
    item = line_to_item(row)
    item["scene_start_ms"] = scene_rows[0]["start_ms"]
    item["scene_end_ms"] = scene_rows[-1]["end_ms"]
    item["context"] = {
        "prev": [dict(r) for r in scene_rows if r["seq"] < row["seq"]],
        "next": [dict(r) for r in scene_rows if r["seq"] > row["seq"]],
    }
    return item


# === SRT 导出 ===

def _ms_to_srt_ts(ms: int) -> str:
    """毫秒 → SRT 时间戳 HH:MM:SS,mmm。"""
    ms = max(0, ms)
    h = ms // 3_600_000
    m = (ms // 60_000) % 60
    s = (ms // 1000) % 60
    frac = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d},{frac:03d}"


_SRT_LANGS = {"bi", "en", "zh"}


def _srt_text(text_en: str, text_zh: Optional[str], lang: str) -> str:
    """按语言模式拼接字幕文本：bi 双语、en 纯英文、zh 纯中文（缺失时回退英文）。"""
    if lang == "en":
        return text_en
    if lang == "zh":
        return text_zh or text_en
    return f"{text_en}\n{text_zh}" if text_zh else text_en


def line_to_srt(
    line_id: int, *, context: int = 0, lang: str = "bi"
) -> Optional[str]:
    """单条台词导出为 SRT。context=前N条+后N条一并导出（含当前行）。"""
    if lang not in _SRT_LANGS:
        raise ValueError(f"不支持的字幕语言：{lang}")
    with db.read_conn() as conn:
        row = conn.execute(
            "SELECT episode_id, seq FROM lines WHERE id=?", (line_id,)
        ).fetchone()
        if not row:
            return None
        ep_id = row["episode_id"]
        seq = row["seq"]
        all_rows = conn.execute(
            """SELECT id, seq, start_ms, end_ms, text_en, text_zh, speaker
               FROM lines WHERE episode_id=? ORDER BY seq""",
            (ep_id,),
        ).fetchall()

    current_index = next(i for i, r in enumerate(all_rows) if r["seq"] == seq)
    rows = _scene_window(all_rows, current_index, context=context)
    parts: list[str] = []
    for i, r in enumerate(rows, start=1):
        text_block = _srt_text(r["text_en"], r["text_zh"], lang)
        parts.append(
            f"{i}\n"
            f"{_ms_to_srt_ts(r['start_ms'])} --> {_ms_to_srt_ts(r['end_ms'])}\n"
            f"{text_block}\n"
        )
    return "\n".join(parts)


def episode_to_srt(season: int, episode: int, *, lang: str = "bi") -> Optional[str]:
    """整集台词导出为 SRT。"""
    if lang not in _SRT_LANGS:
        raise ValueError(f"不支持的字幕语言：{lang}")
    with db.read_conn() as conn:
        rows = conn.execute(
            """SELECT l.seq, l.start_ms, l.end_ms, l.text_en, l.text_zh
               FROM lines l
               JOIN episodes e ON e.id = l.episode_id
               WHERE e.season=? AND e.episode=?
               ORDER BY l.seq""",
            (season, episode),
        ).fetchall()
        if not rows:
            return None

    parts: list[str] = []
    for i, r in enumerate(rows, start=1):
        text_block = _srt_text(r["text_en"], r["text_zh"], lang)
        parts.append(
            f"{i}\n"
            f"{_ms_to_srt_ts(r['start_ms'])} --> {_ms_to_srt_ts(r['end_ms'])}\n"
            f"{text_block}\n"
        )
    return "\n".join(parts)
