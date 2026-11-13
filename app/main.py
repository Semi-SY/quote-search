"""FastAPI 应用入口：挂路由、媒体目录与前端静态产物。"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import APP_VERSION, CLIPS_DIR, STATIC_DIR
from app.routes import meta, search, shares

app = FastAPI(title="Quote Search", version=APP_VERSION)

app.include_router(meta.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(shares.router)

if CLIPS_DIR.is_dir():
    app.mount("/media/clips", StaticFiles(directory=CLIPS_DIR), name="clips")

if (STATIC_DIR / "index.html").is_file():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="web")
