# 台词检索 · Quote Search

用中文或英文关键词，找到影视作品里的那一句台词，并立刻看到、分享那一小段。

- 搜索：SQLite FTS5（trigram），中英子串都能命中；短查询降级 LIKE
- 展示：素材卡片流，每条台词带 16:9 缩略图，点击浮层播放
- 分享：`/s/{slug}`，slug 由 `line_id` 确定性计算，运行期不写库
- 部署：Render 免费 Docker 容器，750 小时/月，总成本 ¥0

完整设计见 `IMPLEMENTATION.md`（本地）。

## 本地运行

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

验证：

```bash
curl http://127.0.0.1:8000/api/health
# {"status":"ok","version":"0.1.0","db_ready":false,"line_count":0}
```

`db_ready` 在 `data/quotes.db` 生成前为 `false`，这是预期状态。

## 配置

所有配置走环境变量（本地 `.env` / Render Dashboard 里设）。任何 Key / Token 都不要写进代码或聊天记录。

## 目录

```
app/        在线服务（FastAPI，只读）
data/       构建产物：quotes.db、clips/
```

## 部署到 Render

**1. 网页创建 Web Service**

1. 打开 https://render.com 注册/登录（免费，**不需要绑信用卡**）
2. 点 **New → Web Service**
3. 选 **Docker** 作为 Runtime（Render 自动检测 Dockerfile）
4. 配置：
   - **Name**: `quote-search`（或你喜欢的）
   - **Region**: 选 `Ohio`（美国东部免费区）
   - **Plan**: `Free`（Micro 实例，750 小时/月）
   - **Branch**: `main`
5. 点 **Create Web Service**

**2. 等自动构建**

Render 会自动：
- 拉 `python:3.11-slim` 基础镜像
- pip 装 fastapi/uvicorn/jinja2
- COPY app/ + data/（7.4MB 数据已进镜像）
- 用 `uvicorn ... --port $PORT` 启动（Render 默认 PORT=10000）

首次构建约 2-3 分钟，完成后 `https://quote-search.onrender.com` 自动上线。

**3. 后续更新**

构建产物（`data/quotes.db`、`data/clips/`、`app/static/`）必须一起提交——Render 云端不会替你跑 ffmpeg。

```bash
git add -A && git commit -m "build: refresh data" && git push origin main
```

Render 检测到 push 后自动 rebuild + redeploy。

**关于 Free 版的休眠**：15 分钟无流量后实例休眠，下次请求冷启动约 30 秒。对轻量使用没影响。

## 素材与许可

Footage: [Tears of Steel](https://mango.blender.org/) © Blender Foundation | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)（官方英/中字幕）
Footage: [Sintel](https://durian.blender.org/) © Blender Foundation | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)（官方英文字幕；官方未发布中文，中文字幕为项目自行翻译）
