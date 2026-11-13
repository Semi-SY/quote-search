import { useEffect, useRef, useState } from 'react';
import { X, Link2, Check, Copy, Download, Film, MessageSquare, Play, Heart, Captions, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SearchItem, LineDetail, ContextLine, SrtLang } from '../api/client';
import { fetchLineDetail, lineSrtUrl, episodeSrtUrl } from '../api/client';

interface Props {
  item: SearchItem | null;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (item: SearchItem) => void;
}

const SRT_OPTIONS: { value: SrtLang; label: string }[] = [
  { value: 'bi', label: '双语' },
  { value: 'en', label: '纯英文' },
  { value: 'zh', label: '纯中文' },
];

function formatSeconds(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** 详情浮层：场景视频与上下文使用同一时间轴，播放时逐句高亮。 */
export default function QuoteDetailDialog({ item, onClose, isFavorite, onToggleFavorite }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [detail, setDetail] = useState<LineDetail | null>(null);
  const [useScene, setUseScene] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [srtLang, setSrtLang] = useState<SrtLang>('bi');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  useEffect(() => {
    if (!item) return;
    setDetail(null);
    setUseScene(false);
    setPlayTime(0);
    setSrtLang('bi');
    pendingSeekRef.current = null;
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
  const sceneStart = detail?.scene_start_ms ?? item.start_ms;
  const sceneEnd = detail?.scene_end_ms ?? item.end_ms;
  const sceneDuration = Math.max(0.1, (sceneEnd - sceneStart) / 1000);
  const dialogue = detail
    ? [...detail.context.prev, item, ...detail.context.next]
    : [];
  const absoluteMs = sceneStart + playTime * 1000;
  let playedIndex = -1;
  dialogue.forEach((line, index) => {
    if (absoluteMs >= line.start_ms) playedIndex = index;
  });
  const activeIndex = Math.max(0, playedIndex);
  const progress = Math.min(100, Math.max(0, (playTime / sceneDuration) * 100));

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

  function switchMode(scene: boolean) {
    pendingSeekRef.current = null;
    setPlayTime(0);
    setUseScene(scene);
  }

  function seekToLine(line: ContextLine | SearchItem) {
    if (!detail) return;
    const offset = Math.max(0, (line.start_ms - sceneStart) / 1000 + 0.01);
    if (!useScene) {
      pendingSeekRef.current = offset;
      setUseScene(true);
      return;
    }
    if (videoRef.current) {
      videoRef.current.currentTime = offset;
      setPlayTime(offset);
    }
  }

  function handleLoaded(video: HTMLVideoElement) {
    if (pendingSeekRef.current !== null) {
      video.currentTime = pendingSeekRef.current;
      setPlayTime(pendingSeekRef.current);
      pendingSeekRef.current = null;
    } else {
      setPlayTime(video.currentTime);
    }
  }

  const currentIndex = Math.max(0, dialogue.findIndex((line) => line.id === current.id));
  const playPosition = useScene ? activeIndex : currentIndex;
  const canPrev = playPosition > 0;
  const canNext = playPosition < dialogue.length - 1;

  function stepLine(delta: number) {
    const target = dialogue[playPosition + delta];
    if (target) seekToLine(target);
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
            key={videoSrc}
            controls
            autoPlay
            playsInline
            preload="auto"
            poster={item.poster_url}
            onLoadedMetadata={(e) => handleLoaded(e.currentTarget)}
            onTimeUpdate={(e) => setPlayTime(e.currentTarget.currentTime)}
            onSeeked={(e) => setPlayTime(e.currentTarget.currentTime)}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        </div>

        <div className="detail-body">
          {srtLang !== 'zh' && <p className="en-full">{item.text_en}</p>}
          {srtLang !== 'en' && (
            <p className={srtLang === 'zh' ? 'en-full zh-primary' : 'zh-full'}>
              {item.text_zh || item.text_en}
            </p>
          )}

          <div className="meta-row">
            {item.episode_title_en && (
              <>
                <span>{item.episode_title_en}</span>
                <span>·</span>
              </>
            )}
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

          <div className="play-mode-toggle" aria-label="播放范围">
            <button
              className={`mode-btn ${!useScene ? 'active' : ''}`}
              onClick={() => switchMode(false)}
            >
              <Film size={14} /> 单条片段
            </button>
            <button
              className={`mode-btn ${useScene ? 'active' : ''}`}
              onClick={() => switchMode(true)}
              disabled={!detail}
            >
              <MessageSquare size={14} /> 完整对话
            </button>
          </div>

          {useScene && detail && (
            <div className="scene-playback">
              <div className="scene-progress-copy">
                <span>台词进度</span>
                <span>{formatSeconds(playTime)} / {formatSeconds(sceneDuration)}</span>
              </div>
              <div
                className="scene-progress"
                role="progressbar"
                aria-label="完整对话播放进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {dialogue.length > 0 && (
            <div className="context-block">
              <div className="context-heading">
                <span className="context-label">对话内容 · {dialogue.length} 条</span>
                <div className="context-nav">
                  <button
                    type="button"
                    className="ctx-nav-btn"
                    onClick={() => stepLine(-1)}
                    disabled={!canPrev}
                    aria-label="上一句"
                    title="上一句"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    className="ctx-nav-btn"
                    onClick={() => stepLine(1)}
                    disabled={!canNext}
                    aria-label="下一句"
                    title="下一句"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
              {dialogue.map((line, index) => {
                const isCurrent = line.id === item.id;
                const isPlaying = useScene && index === activeIndex;
                return (
                  <button
                    type="button"
                    key={line.id}
                    className={`context-line ${isCurrent ? 'current' : ''} ${isPlaying ? 'playing' : ''}`}
                    onClick={() => seekToLine(line)}
                    aria-current={isPlaying ? 'true' : undefined}
                  >
                    <span className="ctx-index">
                      {isPlaying ? <Play size={11} fill="currentColor" /> : String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="ctx-copy">
                      {srtLang !== 'zh' && <span className="ctx-en">{line.text_en}</span>}
                      {srtLang !== 'en' && (
                        <span className="ctx-zh">{line.text_zh || line.text_en}</span>
                      )}
                      {line.speaker && <span className="ctx-speaker">{line.speaker}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="srt-download">
            <div className="srt-download-head">
              <span className="srt-label"><Captions size={14} /> 字幕语言</span>
              <div className="srt-lang-toggle" role="group" aria-label="字幕语言">
                {SRT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`srt-lang-btn ${srtLang === option.value ? 'active' : ''}`}
                    onClick={() => setSrtLang(option.value)}
                    aria-pressed={srtLang === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="srt-download-links">
              <a className="action-btn" href={lineSrtUrl(item.id, 2, srtLang)} download>
                <Download size={16} /> 下载片段字幕
              </a>
              <a className="action-btn ghost" href={episodeSrtUrl(item.season, item.episode, srtLang)} download>
                <Download size={16} /> 下载整集字幕
              </a>
            </div>
          </div>

          <div className="actions">
            <button
              className={`action-btn favorite-action ${isFavorite ? 'saved' : ''}`}
              onClick={() => onToggleFavorite(item)}
              aria-pressed={isFavorite}
            >
              <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
              {isFavorite ? '已收藏' : '收藏台词'}
            </button>
            <button className="action-btn" onClick={handleCopyText}>
              {copiedText ? <><Check size={16} /> 已复制</> : <><Copy size={16} /> 复制台词</>}
            </button>
            <button className="action-btn primary" onClick={handleShare} title={item.share_url}>
              {copied ? <><Check size={16} /> 链接已复制</> : <><Link2 size={16} /> 复制分享链接</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
