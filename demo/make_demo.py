"""拾句放映室 · 演示视频生成脚本

流程：
1. 用 edge-tts 生成每段中文男声旁白（无字幕，只有语音）。
2. 用 Playwright 以 1920x1080 录制一段连续屏幕操作：
   - 每段操作对应一段旁白，通过 CSS transform 做“放大聚焦操作、缩小看结果”的动画。
3. 用 ffmpeg 把录音视频和旁白音轨合成，输出 16:9 MP4。
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

import edge_tts
import qrcode
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DEMO_DIR = Path(__file__).resolve().parent
ASSET_DIR = DEMO_DIR / "assets"
ASSET_DIR.mkdir(exist_ok=True)

APP_URL = "http://127.0.0.1:8001"
SHARE_URL = "https://quote-search.onrender.com"
SHARE_TEXT = "quote-search.onrender.com"

# 更快的自然男声
VOICE = "zh-CN-YunxiNeural"
VOICE_RATE = "+16%"
VOICE_PITCH = "+0Hz"

# 目标分辨率 16:9
WIDTH, HEIGHT = 1920, 1080
FPS = 30

# ---------------------------------------------------------------------------
# 旁白脚本（亲切、真实，像向朋友推荐）
# ---------------------------------------------------------------------------
NARRATION = [
    {
        "id": "intro",
        "text": "你好，这是拾句放映室，英文名 Pickup Reel。一个帮你从开源电影里找台词、找画面的小工具。",
    },
    {
        "id": "audience",
        "text": "如果你平时做短视频、剪混剪，或者在学英语、想收藏一句打动你的台词，它都能帮上忙。所有素材来自 Blender 开源电影，免费可商用。",
    },
    {
        "id": "search",
        "text": "想找一句话，直接输入关键词就行，中英文都可以。比如搜 love，所有相关的台词和对应画面立刻就出来了。",
    },
    {
        "id": "filter",
        "text": "也可以按影片、题材、说话人来筛选。选了一部电影，其他维度会自动联动，不会点到空结果。",
    },
    {
        "id": "play",
        "text": "点开任意一张卡片，就能播放对应的电影片段，中英双语台词和时间码都在这里。",
    },
    {
        "id": "download",
        "text": "需要字幕的话，一键下载 SRT 文件，中英文可以切换，直接拖进剪辑软件就能用。",
    },
    {
        "id": "favorite",
        "text": "看到喜欢的台词，点一下爱心就收藏了。内容只存在你本地浏览器，随时能回来。",
    },
    {
        "id": "random",
        "text": "没灵感的时候，点一下随机一条，让电影替你选一句。",
    },
    {
        "id": "mood",
        "text": "觉得背景太单调，右上角可以切换配色，找一个你喜欢的氛围。",
    },
    {
        "id": "context",
        "text": "想看上下文？在详情里切换上一句下一句，连续对话不会断。",
    },
    {
        "id": "closing",
        "text": "工具完全免费，链接和二维码放在这里了，欢迎试试，也期待你的反馈。",
    },
]


# ---------------------------------------------------------------------------
# 音频生成
# ---------------------------------------------------------------------------
async def gen_audio(text: str, out_path: Path) -> float:
    """生成单段旁白，返回时长（秒）。"""
    communicate = edge_tts.Communicate(text, VOICE, rate=VOICE_RATE, pitch=VOICE_PITCH)
    await communicate.save(str(out_path))
    # 用 ffprobe 读取时长
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)],
        capture_output=True, text=True, check=True,
    )
    return float(res.stdout.strip())


async def build_audio() -> list[dict]:
    segs = []
    for item in NARRATION:
        out = ASSET_DIR / f"seg_{item['id']}.mp3"
        dur = await gen_audio(item["text"], out)
        segs.append({**item, "path": out, "duration": dur})
        print(f"[audio] {item['id']}: {dur:.2f}s")

    # 合并成一条总音轨
    list_file = ASSET_DIR / "audio_list.txt"
    with open(list_file, "w", encoding="utf-8") as f:
        for s in segs:
            f.write(f"file '{s['path'].as_posix()}'\n")
    full_audio = ASSET_DIR / "narration_full.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
         "-c", "copy", str(full_audio)],
        capture_output=True, check=True,
    )
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(full_audio)],
        capture_output=True, text=True, check=True,
    )
    total = float(res.stdout.strip())
    print(f"[audio] total narration: {total:.2f}s")
    for s in segs:
        s["full_audio"] = full_audio
    return segs, total


# ---------------------------------------------------------------------------
# 二维码
# ---------------------------------------------------------------------------
def make_qr() -> Path:
    qr = qrcode.QRCode(version=None, box_size=10, border=2,
                       error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(SHARE_URL)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#1b0d0a", back_color="white").convert("RGB")
    out = ASSET_DIR / "share_qr.png"
    img.save(out)
    return out


def make_closing_html(qr_path: Path) -> Path:
    """生成片尾 HTML：logo、感谢语、二维码、分享链接。"""
    import base64
    qr_b64 = base64.b64encode(qr_path.read_bytes()).decode()
    html = f"""<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html,body {{ width:1920px; height:1080px; overflow:hidden; }}
  body {{
    background: radial-gradient(1200px 800px at 30% 20%, #2a1a14 0%, #120a0d 55%, #080506 100%);
    color:#f5e8dd; font-family: "PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:38px;
  }}
  .brand {{ display:flex; align-items:center; gap:22px; }}
  .logo {{ width:96px; height:96px; border-radius:28px;
    background:linear-gradient(135deg,#ffd08a,#ff8a5c 55%,#c2456b);
    display:grid; place-items:center; box-shadow:0 18px 40px rgba(255,121,92,.25); }}
  .logo svg {{ width:54px; height:54px; }}
  .name {{ font-size:58px; font-weight:800; letter-spacing:2px; }}
  .name small {{ display:block; font-size:22px; font-weight:600; letter-spacing:.42em;
    color:#ffb98a; margin-top:4px; }}
  .thanks {{ font-size:34px; color:#f0d8c6; font-weight:500; max-width:1100px; text-align:center; line-height:1.6; }}
  .qr-wrap {{ display:flex; align-items:center; gap:36px; padding:26px 40px;
    border:1px solid rgba(255,180,140,.25); border-radius:24px;
    background:rgba(255,255,255,.04); backdrop-filter:blur(6px); }}
  .qr {{ width:200px; height:200px; border-radius:14px; background:#fff; padding:10px; }}
  .qr img {{ width:100%; height:100%; }}
  .url {{ font-size:30px; font-weight:700; color:#ffd9b8; letter-spacing:1px; }}
  .hint {{ font-size:20px; color:#c9a98f; margin-top:8px; }}
</style></head>
<body>
  <div class="brand">
    <div class="logo">
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="1" y="1" width="46" height="46" rx="15" fill="url(#g)"/>
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1b0d0a" stop-opacity=".9"/></linearGradient></defs>
        <path d="M12.5 14.5h9.5v9.6h-5.9c0 3.5 1.7 5.6 4.9 6.4v3.3c-5.3-.9-8.5-4.6-8.5-10.1V14.5Zm14 0H36v9.6h-5.9c0 3.5 1.7 5.6 4.9 6.4v3.3c-5.3-.9-8.5-4.6-8.5-10.1V14.5Z" fill="#1b0d0a" opacity=".9"/>
      </svg>
    </div>
    <div class="name">拾句放映室<small>PICKUP REEL</small></div>
  </div>
  <div class="thanks">完全免费，欢迎试试<br>也期待你的反馈</div>
  <div class="qr-wrap">
    <div class="qr"><img src="data:image/png;base64,{qr_b64}"/></div>
    <div>
      <div class="url">{SHARE_TEXT}</div>
      <div class="hint">扫码或访问链接即可使用</div>
    </div>
  </div>
</body></html>"""
    out = ASSET_DIR / "closing.html"
    out.write_text(html, encoding="utf-8")
    return out


# ---------------------------------------------------------------------------
# 缩放辅助：通过 CSS transform 做“放大聚焦/缩小看全”
# ---------------------------------------------------------------------------
ZOOM_CSS = """
#zoom-root { transition: transform .55s cubic-bezier(.22,.61,.36,1), transform-origin .55s ease; will-change: transform; }
"""


def inject_zoom(page):
    page.add_style_tag(content=ZOOM_CSS)
    # 给最外层包一层可缩放容器
    page.evaluate("""() => {
      const shell = document.querySelector('.app-shell');
      if (!shell) return;
      const wrap = document.createElement('div');
      wrap.id = 'zoom-root';
      shell.parentNode.insertBefore(wrap, shell);
      wrap.appendChild(shell);
    }""")


def zoom_to(page, selector_or_box, scale=2.3):
    """缩放到指定元素中心。box 为 {x,y,w,h}（相对页面坐标）。"""
    if isinstance(selector_or_box, str):
        box = page.evaluate("""(sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width/2, y: r.top + r.height/2 };
        }""", selector_or_box)
    else:
        box = selector_or_box
    if not box:
        return
    page.evaluate("""({x, y, scale}) => {
      const root = document.getElementById('zoom-root');
      if (!root) return;
      root.style.transformOrigin = x + 'px ' + y + 'px';
      root.style.transform = 'scale(' + scale + ')';
    }""", {"x": box["x"], "y": box["y"], "scale": scale})


def zoom_out(page):
    page.evaluate("""() => {
      const root = document.getElementById('zoom-root');
      if (!root) return;
      root.style.transform = 'scale(1)';
    }""")


# ---------------------------------------------------------------------------
# 每段视觉动作
# ---------------------------------------------------------------------------
def action_intro(page):
    page.goto(APP_URL, wait_until="networkidle")
    page.wait_for_timeout(900)
    # 聚焦 logo
    zoom_to(page, ".brand", scale=1.6)
    page.wait_for_timeout(700)
    zoom_out(page)


def action_audience(page):
    # 展示首页整体（hero + 数据）
    zoom_out(page)
    page.wait_for_timeout(800)


def action_search(page):
    zoom_to(page, ".search-shell", scale=2.0)
    page.wait_for_timeout(500)
    page.click(".search-shell input")
    page.wait_for_timeout(200)
    page.keyboard.type("love", delay=110)
    page.wait_for_timeout(250)
    page.keyboard.press("Enter")
    page.wait_for_timeout(1100)
    zoom_out(page)
    page.wait_for_timeout(700)


def action_filter(page):
    # 筛选面板聚焦
    zoom_to(page, ".discovery-panel", scale=1.7)
    page.wait_for_timeout(500)
    # 选一部影片（Elephants Dream）
    page.evaluate("""() => {
      const btns = Array.from(document.querySelectorAll('.film-card, .chip'));
      const target = btns.find(b => /Elephants Dream/.test(b.textContent || ''));
      if (target) target.click();
    }""")
    page.wait_for_timeout(1100)
    zoom_out(page)
    page.wait_for_timeout(700)


def action_play(page):
    # 点开第一张卡片
    zoom_to(page, ".quotes-section .card:first-child", scale=1.5)
    page.wait_for_timeout(500)
    page.click(".quotes-section .card:first-child")
    page.wait_for_timeout(1300)
    zoom_out(page)
    page.wait_for_timeout(600)


def action_download(page):
    # 聚焦字幕下载按钮
    zoom_to(page, ".srt-download", scale=1.9)
    page.wait_for_timeout(500)
    page.click(".srt-download")
    page.wait_for_timeout(1000)
    zoom_out(page)
    page.wait_for_timeout(600)


def action_favorite(page):
    # 聚焦详情里的收藏按钮
    zoom_to(page, ".favorite-action", scale=2.0)
    page.wait_for_timeout(400)
    page.click(".favorite-action")
    page.wait_for_timeout(800)
    zoom_out(page)
    # 关闭详情
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)


def action_random(page):
    zoom_to(page, ".lucky-shuffle", scale=2.0)
    page.wait_for_timeout(400)
    page.click(".lucky-shuffle")
    page.wait_for_timeout(1000)
    zoom_out(page)
    page.wait_for_timeout(600)


def action_mood(page):
    zoom_to(page, ".theme-toggle", scale=2.2)
    page.wait_for_timeout(400)
    page.click(".theme-toggle")
    page.wait_for_timeout(700)
    page.click(".theme-toggle")
    page.wait_for_timeout(700)
    zoom_out(page)
    page.wait_for_timeout(500)


def action_context(page):
    # 打开第一张卡片，聚焦上下句
    page.click(".quotes-section .card:first-child")
    page.wait_for_timeout(700)
    zoom_to(page, ".context-nav", scale=2.0)
    page.wait_for_timeout(400)
    # 上一句 / 下一句
    try:
        page.locator(".ctx-nav-btn").first.click()
        page.wait_for_timeout(700)
    except Exception:
        pass
    try:
        page.locator(".ctx-nav-btn").last.click()
        page.wait_for_timeout(800)
    except Exception:
        pass
    zoom_out(page)
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)


def action_closing(page, closing_html: Path):
    page.goto(closing_html.as_uri(), wait_until="load")
    page.wait_for_timeout(1200)


ACTIONS = {
    "intro": action_intro,
    "audience": action_audience,
    "search": action_search,
    "filter": action_filter,
    "play": action_play,
    "download": action_download,
    "favorite": action_favorite,
    "random": action_random,
    "mood": action_mood,
    "context": action_context,
}


# ---------------------------------------------------------------------------
# 录制
# ---------------------------------------------------------------------------
def record_video(segments: list[dict], closing_html: Path, total_audio: float) -> Path:
    raw = ASSET_DIR / "raw_record.webm"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=1,
            record_video_dir=str(ASSET_DIR),
            record_video_size={"width": WIDTH, "height": HEIGHT},
        )
        page = context.new_page()
        inject_zoom(page)

        started = time.monotonic()
        for seg in segments:
            seg_start = time.monotonic()
            act = ACTIONS.get(seg["id"])
            if act:
                act(page)
            elif seg["id"] == "closing":
                action_closing(page, closing_html)
            elapsed = time.monotonic() - seg_start
            # 补齐到该段音频时长
            remain = seg["duration"] - elapsed
            if remain > 0:
                page.wait_for_timeout(int(remain * 1000))

        # 确保总时长不短于音频
        total_elapsed = time.monotonic() - started
        if total_elapsed < total_audio:
            page.wait_for_timeout(int((total_audio - total_elapsed) * 1000) + 500)

        context.close()
        # playwright 会把视频存到 record_video_dir 下，取最新的 webm
        videos = sorted(ASSET_DIR.glob("*.webm"), key=lambda f: f.stat().st_mtime)
        if not videos:
            raise RuntimeError("未找到录制视频")
        latest = videos[-1]
        latest.rename(raw)
        browser.close()
    return raw


# ---------------------------------------------------------------------------
# 合成
# ---------------------------------------------------------------------------
def compose(raw_video: Path, full_audio: Path, total_audio: float) -> Path:
    out = ROOT / "quote-search-demo-v3.mp4"
    # 把 webm 转成 h264 mp4，并把音轨压上去；视频裁到音频时长
    cmd = [
        "ffmpeg", "-y",
        "-i", str(raw_video),
        "-i", str(full_audio),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-t", f"{total_audio + 0.4:.2f}",
        "-movflags", "+faststart",
        str(out),
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return out


# ---------------------------------------------------------------------------
def main():
    print("[1/4] 生成旁白音频...")
    segments, total = asyncio.run(build_audio())

    print("[2/4] 生成二维码与片尾...")
    qr = make_qr()
    closing = make_closing_html(qr)

    print("[3/4] 录制屏幕操作...")
    raw = record_video(segments, closing, total)

    print("[4/4] 合成视频...")
    out = compose(raw, segments[0]["full_audio"], total)

    # 清理临时 webm
    for f in ASSET_DIR.glob("*.webm"):
        f.unlink(missing_ok=True)

    print(f"\n完成: {out}")
    print(f"时长: {total:.2f}s  分辨率: {WIDTH}x{HEIGHT}  音轨: 旁白男声，无字幕")


if __name__ == "__main__":
    main()
