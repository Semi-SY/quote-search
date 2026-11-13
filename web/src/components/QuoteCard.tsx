import { Play, AlertTriangle, Heart } from 'lucide-react';
import type { SearchItem } from '../api/client';
import PosterImage from './PosterImage';

interface Props {
  item: SearchItem;
  hue: number;
  onClick: (item: SearchItem) => void;
  isFavorite: boolean;
  onToggleFavorite: (item: SearchItem) => void;
}

export default function QuoteCard({ item, hue, onClick, isFavorite, onToggleFavorite }: Props) {
  const lowConf = item.align_confidence > 0 && item.align_confidence < 0.7;

  return (
    <article
      className="card"
      tabIndex={0}
      role="button"
      aria-label={`播放 ${item.text_en}`}
      onClick={() => onClick(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(item);
        }
      }}
    >
      <div className="poster-wrap">
        <PosterImage src={item.poster_url} alt={item.text_en} hue={hue} />
        <div className="play-badge" aria-hidden>
          <Play size={14} fill="white" />
        </div>
        <button
          type="button"
          className={`favorite-btn ${isFavorite ? 'saved' : ''}`}
          aria-label={isFavorite ? '取消收藏' : '收藏台词'}
          aria-pressed={isFavorite}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(item);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        <span className="duration-badge">{Math.max(1, Math.round((item.end_ms - item.start_ms) / 1000))}"</span>
      </div>

      <div className="body">
        <p className="en clamp-2">{item.text_en}</p>
        {item.text_zh && <p className="zh clamp-1">{item.text_zh}</p>}

        <div className="meta">
          <span className="meta-chip film">{item.episode_title_en || item.episode_title_zh}</span>
          <span className="meta-chip">{item.timecode}</span>
          {item.speaker && <span className="meta-chip">{item.speaker}</span>}
        </div>

        {lowConf && (
          <span className="confidence-tag" title="时间轴可能有偏差">
            <AlertTriangle size={12} /> 时间轴存疑
          </span>
        )}
      </div>
    </article>
  );
}
