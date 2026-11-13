import { useEffect, useRef, useState } from 'react';
import { X, Link2, Check } from 'lucide-react';
import type { SearchItem } from '../api/client';

interface Props {
  item: SearchItem | null;
  onClose: () => void;
}

/**
 * 详情浮层：播放器 + 完整中英文字 + 上下文 + 分享。
 * Esc / 点遮罩关闭；关闭后 video 资源立即释放。
 */
export default function QuoteDetailDialog({ item, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!item) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      // 释放 video 资源
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current.load();
      }
    };
  }, [item, onClose]);

  if (!item) return null;
  const current = item; // 让 handleShare 闭包拿到非空引用

  async function handleShare() {
    const url = `${location.origin}${current.share_url}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：选中文本让用户手动复制
      window.prompt('复制这个分享链接：', url);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close-btn" onClick={onClose} aria-label="关闭">
          <X size={24} />
        </button>

        <div className="video-wrap">
          <video
            ref={videoRef}
            key={item.id}
            controls
            autoPlay
            playsInline
            preload="auto"
            poster={item.poster_url}
          >
            <source src={item.clip_url} type="video/mp4" />
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

          <div className="actions">
            <a className="share-btn" onClick={handleShare} href={item.share_url} title={item.share_url}>
              {copied ? (
                <>
                  <Check size={16} /> 链接已复制
                </>
              ) : (
                <>
                  <Link2 size={16} /> 复制分享链接
                </>
              )}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
