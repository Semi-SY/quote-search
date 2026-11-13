---
title: Quote Search
emoji: 🎬
colorFrom: indigo
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# 台词检索 · Quote Search

用中文或英文关键词，找到影视作品里的那一句台词，并立刻看到、分享那一小段。

- 搜索：SQLite FTS5（trigram），中英子串都能命中；短查询降级 LIKE
- 展示：素材卡片流，每条台词带 16:9 缩略图，点击浮层播放
- 分享：`/s/{slug}`，slug 由 `line_id` 确定性计算，运行期不写库
- 部署：Hugging Face Spaces 免费 Docker 容器，端口 7860，总成本 ¥0

完整设计与任务拆分见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。

## 本地运行

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env          # 按需修改，不要提交 .env
uvicorn app.main:app --reload --port 8000
```

验证：

```bash
curl http://127.0.0.1:8000/api/health
# {"status":"ok","version":"0.1.0","db_ready":false,"line_count":0}
```

`db_ready` 在 `data/quotes.db` 生成前为 `false`，这是预期状态。

## 配置

所有配置走环境变量，模板见 [.env.example](./.env.example)。

- 本地：复制为 `.env` 后自行填写，`.env` 已被 git 忽略
- 线上：写在 Hugging Face Space 的 **Settings → Variables and secrets**
- 任何 Key / Token 都不要写进代码、README、测试或聊天记录

## 目录

```
app/        在线服务（FastAPI，只读）
pipeline/   离线管线（解析 → 清洗 → 对齐 → 入库 → 切片）
db/         schema.sql（唯一 DDL 来源）
data/       构建产物：quotes.db、clips/；raw/ 为原始素材，不入库
web/        前端（Vite + React + TS）
tests/      pytest
```

## 部署

```bash
make build      # 生成 db + clips + 前端产物（P0 完成后可用）
git add -A && git commit -m "build: refresh data" && git push
```

HF 检测到 push 后自动重建镜像。构建产物（`data/quotes.db`、`data/clips/`、`app/static/`）必须一起提交——云端不会替你跑 ffmpeg。

## 素材与许可

Footage: [Tears of Steel](https://mango.blender.org/) © Blender Foundation | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
Footage: [Sintel](https://durian.blender.org/) © Blender Foundation | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
