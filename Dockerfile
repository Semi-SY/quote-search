# HF Spaces Docker SDK — 不装 ffmpeg，所有片段/DB 构建期预生成
# 文档: https://huggingface.com/docs/hub/spaces-sdks-docker

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# --- HF Spaces 要求: UID 1000 ---
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

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://127.0.0.1:7860/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
