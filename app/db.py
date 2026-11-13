"""SQLite 只读访问层：统一连接参数、row_factory 与就绪检查。"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from app.config import DB_PATH


def is_ready() -> bool:
    return DB_PATH.is_file()


@contextmanager
def read_conn() -> Iterator[sqlite3.Connection]:
    uri = f"{DB_PATH.resolve().as_uri()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")
    try:
        yield conn
    finally:
        conn.close()


def count_lines() -> int:
    with read_conn() as conn:
        row = conn.execute("SELECT count(*) FROM lines").fetchone()
    return int(row[0])
