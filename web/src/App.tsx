import { useEffect, useState, useCallback } from 'react';
import { Film, Heart, LayoutGrid, Layers } from 'lucide-react';
import SearchBar from './components/SearchBar';
import QuoteGrid from './components/QuoteGrid';
import QuoteDetailDialog from './components/QuoteDetailDialog';
import {
  fetchEpisodes, fetchGenres, fetchFeatured, search, useSearch,
  type SearchItem, type Episode, type Genre,
} from './api/client';

const GENRE_LABELS: Record<string, string> = {
  'sci-fi': '科幻',
  'fantasy': '奇幻',
  'horror-comedy': '恐怖喜剧',
  'animation': '动画',
  'other': '其他',
};

export default function App() {
  const [q, setQ] = useState('');
  const [filterEpisode, setFilterEpisode] = useState<{ season: number; episode: number } | null>(null);
  const [filterGenre, setFilterGenre] = useState<string | null>(null);
  const [browseAll, setBrowseAll] = useState(false);

  // 浏览全部模式：空查询也触发搜索
  const effectiveQ = browseAll ? (q || ' ') : q;
  const { data, loading, error } = useSearch({
    q: effectiveQ,
    season: filterEpisode?.season,
    episode: filterEpisode?.episode,
    genre: filterGenre || undefined,
  });

  const [active, setActive] = useState<SearchItem | null>(null);
  const [featured, setFeatured] = useState<SearchItem[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);

  // 分页：搜索结果追加
  const [allItems, setAllItems] = useState<SearchItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchEpisodes().then((r) => setEpisodes(r.episodes)).catch(() => {});
    fetchGenres().then((r) => setGenres(r.genres)).catch(() => {});
    fetchFeatured().then((r) => setFeatured(r.items)).catch(() => setFeatured([]));
  }, []);

  // 首次搜索/筛选 → 重置分页
  useEffect(() => {
    if (data) {
      setAllItems(data.items);
      setPage(data.page);
      setHasMore(data.items.length >= data.total ? false : data.page * data.size < data.total);
    } else {
      setAllItems([]);
      setHasMore(false);
    }
  }, [data]);

  const loadMore = useCallback(async () => {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await search(effectiveQ, {
        season: filterEpisode?.season,
        episode: filterEpisode?.episode,
        genre: filterGenre || undefined,
        page: next,
        size: 20,
      });
      setAllItems((prev) => [...prev, ...res.items]);
      setPage(next);
      setHasMore(next * res.size < res.total);
    } finally {
      setLoadingMore(false);
    }
  }, [data, page, effectiveQ, filterEpisode, filterGenre, loadingMore]);

  const epLabel = (ep: Episode) =>
    ep.title_zh || ep.title_en || `S${ep.season.toString().padStart(2, '0')}E${ep.episode.toString().padStart(2, '0')}`;

  const genreLabel = (g: string) => GENRE_LABELS[g] || g;

  // 退出浏览全部时，若无查询则回到精选
  const toggleBrowseAll = () => {
    setBrowseAll((v) => {
      const next = !v;
      if (!next) setQ('');
      return next;
    });
  };

  // 搜索结果用分页累积数据
  const searchData = data ? { ...data, items: allItems } : null;
  const showFeatured = !browseAll && !q.trim() && !filterEpisode && !filterGenre;

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <Film size={24} />
            <span>台词素材库</span>
          </div>
          <SearchBar value={q} onChange={setQ} autoFocus />
        </div>
      </header>

      <main className="main">
        <div className="container">
          {showFeatured && (
            <section className="hero">
              <h1 className="hero-title">找一句台词，剪一段素材</h1>
              <p className="hero-sub">Blender 开源短片 · 中英双语 · 一键播放与分享</p>
              <button className="browse-all-btn" onClick={toggleBrowseAll}>
                <Layers size={16} /> 浏览全部素材
              </button>
            </section>
          )}

          {/* 题材分类 */}
          {genres.length > 0 && (
            <div className="filter-row">
              <span className="filter-label">题材</span>
              <div className="filter-bar">
                <button
                  className={`chip ${filterGenre === null ? 'active' : ''}`}
                  onClick={() => setFilterGenre(null)}
                >
                  全部
                </button>
                {genres.map((g) => (
                  <button
                    key={g.genre}
                    className={`chip ${filterGenre === g.genre ? 'active' : ''}`}
                    onClick={() => setFilterGenre(filterGenre === g.genre ? null : g.genre)}
                  >
                    {genreLabel(g.genre)} <span className="chip-count">{g.line_count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 影片筛选 */}
          <div className="filter-row">
            <span className="filter-label">影片</span>
            <div className="filter-bar">
              <button
                className={`chip ${filterEpisode === null ? 'active' : ''}`}
                onClick={() => setFilterEpisode(null)}
              >
                <LayoutGrid size={14} /> 全部
              </button>
              {episodes.map((ep) => {
                const active_ = filterEpisode?.season === ep.season && filterEpisode?.episode === ep.episode;
                return (
                  <button
                    key={`${ep.season}-${ep.episode}`}
                    className={`chip ${active_ ? 'active' : ''}`}
                    onClick={() => setFilterEpisode(active_ ? null : { season: ep.season, episode: ep.episode })}
                  >
                    {epLabel(ep)} <span className="chip-count">{ep.line_count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <QuoteGrid
            response={searchData}
            loading={loading}
            error={error}
            featured={featured}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            onCardClick={setActive}
          />
        </div>
      </main>

      <footer className="footer">
        <span>
          <Heart size={12} /> Footage: Blender Open Movies | CC BY
        </span>
        <span className="build-info">
          {episodes.length > 0 ? `${episodes.length} 集入库` : '样本演示中'}
        </span>
      </footer>

      <QuoteDetailDialog item={active} onClose={() => setActive(null)} />
    </div>
  );
}
