import { Play, AlertTriangle } from 'lucide-react';
import type { SearchItem } from '../api/client';
import PosterImage from './PosterImage';

interface Props {
  item: SearchItem;
  hue: number;
  onClick: (item: SearchItem) => void;
}

export default function QuoteCard({ item, hue, onClick }: Props) {
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
        <span className="duration-badge">{Math.max(1, Math.round((item.end_ms - item.start_ms) / 1000))}"</span>
      </div>

      <div className="body">
        <p className="en clamp-2">{item.text_en}</p>
        {item.text_zh && <p className="zh clamp-1">{item.text_zh}</p>}

        <div className="meta">
          <span className="meta-chip">S{item.season.toString().padStart(2, '0')}E{item.episode.toString().padStart(2, '0')}</span>
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
