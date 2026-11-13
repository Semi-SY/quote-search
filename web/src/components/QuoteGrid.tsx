import type { SearchItem, SearchResponse } from '../api/client';
import QuoteCard from './QuoteCard';
import { AlertCircle } from 'lucide-react';

interface Props {
  /** null = 还没开始搜（idle 状态，展示精选） */
  response: SearchResponse | null;
  loading: boolean;
  error: string | null;
  /** idle 状态或空结果时的精选卡片（样本数据） */
  featured: SearchItem[];
  onCardClick: (item: SearchItem) => void;
}

export default function QuoteGrid({ response, loading, error, featured, onCardClick }: Props) {
  // 骨架屏（8 张）
  if (loading) {
    return (
      <div className="grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div className="card skeleton" key={i}>
            <div className="poster-skel" />
            <div className="body">
              <div className="line-skel" style={{ width: '90%' }} />
              <div className="line-skel" style={{ width: '60%' }} />
              <div className="line-skel" style={{ width: '40%', marginTop: 8 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state error">
        <AlertCircle size={48} />
        <p>加载失败：{error}</p>
        <button className="retry" onClick={() => location.reload()}>重试</button>
      </div>
    );
  }

  // idle：没输入 → 展示精选
  if (!response) {
    if (featured.length === 0) {
      return (
        <div className="empty-state">
          <p>输入关键词，搜索台词</p>
        </div>
      );
    }
    return (
      <>
        <p className="section-subtitle">精选台词 · {featured.length} 条</p>
        <div className="grid">
          {featured.map((item, i) => (
            <QuoteCard key={item.id} item={item} hue={i} onClick={onCardClick} />
          ))}
        </div>
      </>
    );
  }

  // 搜索结果
  if (response.items.length === 0) {
    return (
      <div className="empty-state">
        <p>没找到「{response.query}」，试试这些</p>
        <div className="grid">
          {featured.map((item, i) => (
            <QuoteCard key={item.id} item={item} hue={i} onClick={onCardClick} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="section-subtitle">
        找到 {response.total} 条 · {response.took_ms}ms
      </p>
      <div className="grid">
        {response.items.map((item, i) => (
          <QuoteCard key={item.id} item={item} hue={i} onClick={onCardClick} />
        ))}
      </div>
    </>
  );
}
