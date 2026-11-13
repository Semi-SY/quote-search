# 通用 Docker 部署 — 不装 ffmpeg，所有片段/DB 构建期预生成
# 兼容 Render、本地 docker run 等平台。HF Spaces 也能用，设 PORT=7860 即可。

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

# --- 创建非 root 用户（兼容性好，避免权限问题）---
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR /home/user/app

# --- apt 清理 + pip 依赖 ---
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# --- 应用 + 数据（--chown 给 user，避免权限层）---
COPY --chown=user app ./app
COPY --chown=user data ./data

USER user

EXPOSE 7860

# 注意: CMD 用 shell 形式才能展开 $PORT
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD sh -c 'curl -f http://127.0.0.1:${PORT}/api/health || exit 1'

CMD sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT}'
