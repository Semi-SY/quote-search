import type { SearchItem, SearchResponse } from '../api/client';
import QuoteCard from './QuoteCard';
import { AlertCircle, Heart } from 'lucide-react';

interface Props {
  response: SearchResponse | null;
  loading: boolean;
  error: string | null;
  featured: SearchItem[];
  favoriteIds: Set<number>;
  onToggleFavorite: (item: SearchItem) => void;
  isFavoritesView?: boolean;
  sectionTitle?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onCardClick: (item: SearchItem) => void;
}

export default function QuoteGrid({
  response, loading, error, featured, favoriteIds, onToggleFavorite,
  isFavoritesView = false, sectionTitle, hasMore, loadingMore, onLoadMore, onCardClick,
}: Props) {
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

  if (!response) {
    if (featured.length === 0) {
      return <div className="empty-state"><p>输入关键词，搜索台词</p></div>;
    }
    return (
      <>
        <p className="section-subtitle">精选台词 · {featured.length} 条</p>
        <div className="grid">
          {featured.map((item, i) => (
            <QuoteCard
              key={item.id} item={item} hue={i} onClick={onCardClick}
              isFavorite={favoriteIds.has(item.id)} onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      </>
    );
  }

  if (response.items.length === 0) {
    if (isFavoritesView) {
      return (
        <div className="empty-state favorites-empty">
          <Heart size={42} />
          <h3>还没有收藏台词</h3>
          <p>点击视频卡片上的心形按钮，把常用素材放在这里。</p>
        </div>
      );
    }
    return (
      <div className="empty-state">
        <p>没找到「{response.query}」，试试这些</p>
        <div className="grid">
          {featured.map((item, i) => (
            <QuoteCard
              key={item.id} item={item} hue={i} onClick={onCardClick}
              isFavorite={favoriteIds.has(item.id)} onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="section-subtitle">
        {sectionTitle || `找到 ${response.total} 条 · ${response.took_ms}ms`}
      </p>
      <div className="grid">
        {response.items.map((item, i) => (
          <QuoteCard
            key={item.id} item={item} hue={i} onClick={onCardClick}
            isFavorite={favoriteIds.has(item.id)} onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
      {hasMore && !isFavoritesView && (
        <div className="load-more-wrap">
          <button className="load-more-btn" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? '加载中…' : '加载更多'}
          </button>
        </div>
      )}
    </>
  );
}
