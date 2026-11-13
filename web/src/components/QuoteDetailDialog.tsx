import { useEffect, useRef, useState } from 'react';
import { X, Link2, Check, Copy, Download, ChevronUp, ChevronDown, Film, MessageSquare } from 'lucide-react';
import type { SearchItem, LineDetail } from '../api/client';
import { fetchLineDetail, lineSrtUrl, episodeSrtUrl } from '../api/client';

interface Props {
  item: SearchItem | null;
  onClose: () => void;
}

/**
 * 详情浮层：播放器 + 完整中英文字 + 上下文对话 + 复制/下载/分享。
 * 支持切换「单条片段」与「完整对话场景片段」。
 */
export default function QuoteDetailDialog({ item, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [detail, setDetail] = useState<LineDetail | null>(null);
  const [useScene, setUseScene] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!item) return;
    setDetail(null);
    setUseScene(false);
    fetchLineDetail(item.id).then(setDetail).catch(() => {});

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current.load();
      }
    };
  }, [item, onClose]);

  if (!item) return null;
  const current = item;
  const videoSrc = useScene ? item.scene_clip_url : item.clip_url;

  async function handleShare() {
    const url = `${location.origin}${current.share_url}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('复制这个分享链接：', url);
    }
  }

  async function handleCopyText() {
    const text = `${current.text_en}${current.text_zh ? '\n' + current.text_zh : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      window.prompt('复制台词：', text);
    }
  }

  const ctx = detail?.context;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close-btn" onClick={onClose} aria-label="关闭">
          <X size={24} />
        </button>

        <div className="video-wrap">
          <video
            ref={videoRef}
            key={videoSrc}
            controls
            autoPlay
            playsInline
            preload="auto"
            poster={item.poster_url}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        </div>

        <div className="detail-body">
          <p className="en-full">{item.text_en}</p>
          {item.text_zh && <p className="zh-full">{item.text_zh}</p>}

          <div className="meta-row">
            <span>S{item.season.toString().padStart(2, '0')}E{item.episode.toString().padStart(2, '0')}</span>
            <span>·</span>
            <span>{item.timecode}</span>
            {item.speaker && (
              <>
                <span>·</span>
                <span>{item.speaker}</span>
              </>
            )}
            {item.align_confidence > 0 && item.align_confidence < 0.7 && (
              <span className="confidence-warning">时间轴可能有偏差</span>
            )}
          </div>

          {/* 播放模式切换 */}
          <div className="play-mode-toggle">
            <button
              className={`mode-btn ${!useScene ? 'active' : ''}`}
              onClick={() => setUseScene(false)}
            >
              <Film size={14} /> 单条片段
            </button>
            <button
              className={`mode-btn ${useScene ? 'active' : ''}`}
              onClick={() => setUseScene(true)}
            >
              <MessageSquare size={14} /> 完整对话
            </button>
          </div>

          {/* 上下文对话 */}
          {ctx && (ctx.prev.length > 0 || ctx.next.length > 0) && (
            <div className="context-block">
              <div className="context-label">上下文对话</div>
              {ctx.prev.map((p) => (
                <div key={`p-${p.id}`} className="context-line prev">
                  <ChevronUp size={12} className="ctx-arrow" />
                  <span className="ctx-en">{p.text_en}</span>
                  {p.text_zh && <span className="ctx-zh">{p.text_zh}</span>}
                </div>
              ))}
              <div className="context-line current">
                <span className="ctx-en">{item.text_en}</span>
                {item.text_zh && <span className="ctx-zh">{item.text_zh}</span>}
              </div>
              {ctx.next.map((n) => (
                <div key={`n-${n.id}`} className="context-line next">
                  <ChevronDown size={12} className="ctx-arrow" />
                  <span className="ctx-en">{n.text_en}</span>
                  {n.text_zh && <span className="ctx-zh">{n.text_zh}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="actions">
            <button className="action-btn" onClick={handleCopyText}>
              {copiedText ? <><Check size={16} /> 已复制</> : <><Copy size={16} /> 复制台词</>}
            </button>
            <a className="action-btn" href={lineSrtUrl(item.id, 2)} download>
              <Download size={16} /> 下载片段字幕
            </a>
            <a className="action-btn ghost" href={episodeSrtUrl(item.season, item.episode)} download>
              <Download size={16} /> 下载整集字幕
            </a>
            <a className="action-btn primary" onClick={handleShare} href={item.share_url} title={item.share_url}>
              {copied ? (
                <><Check size={16} /> 链接已复制</>
              ) : (
                <><Link2 size={16} /> 复制分享链接</>
              )}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
