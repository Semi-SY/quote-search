import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Film, Heart, LayoutGrid, Layers, Sparkles, Play, Captions,
  ArrowUpRight, Users, Shuffle, ArrowLeft, Palette, Dices,
} from 'lucide-react';
import SearchBar from './components/SearchBar';
import QuoteGrid from './components/QuoteGrid';
import QuoteDetailDialog from './components/QuoteDetailDialog';
import {
  fetchEpisodes, fetchGenres, fetchSpeakers, fetchFeatured, fetchRandom, search, useSearch,
  type SearchItem, type Episode, type Genre, type Speaker,
} from './api/client';

const GENRE_LABELS: Record<string, string> = {
  'sci-fi': '科幻',
  'fantasy': '奇幻',
  'action': '动作',
  'adventure': '冒险',
  'drama': '剧情',
  'romance': '爱情',
  'horror': '恐怖',
  'comedy': '喜剧',
  'animation': '动画',
  'horror-comedy': '恐怖喜剧',
  'other': '其他',
};

const MOODS = [
  { id: 'ember', label: '暖橙' },
  { id: 'ocean', label: '深海' },
  { id: 'forest', label: '森林' },
  { id: 'violet', label: '紫夜' },
  { id: 'rose', label: '玫瑰' },
] as const;

/** 首页三张影片海报的叠放位置：0 为最前，1、2 依次靠后。 */
const HERO_LAYOUT = [
  { top: '37%', left: '8%', width: '78%', rotate: '-2deg', z: 3, opacity: 1, brightness: 1 },
  { top: '1%', left: '0%', width: '78%', rotate: '-7deg', z: 1, opacity: 0.8, brightness: 0.68 },
  { top: '20.5%', left: '22%', width: '78%', rotate: '6deg', z: 2, opacity: 0.9, brightness: 0.82 },
] as const;

function readLocalArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [q, setQ] = useState('');
  const [filterEpisode, setFilterEpisode] = useState<{ season: number; episode: number } | null>(null);
  const [filterGenre, setFilterGenre] = useState<string | null>(null);
  const [filterSpeaker, setFilterSpeaker] = useState<string | null>(null);
  const [browseAll, setBrowseAll] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [history, setHistory] = useState<string[]>(() => readLocalArray<string>('quote-search-history'));
  const [favorites, setFavorites] = useState<SearchItem[]>(() => readLocalArray<SearchItem>('quote-search-favorites'));

  const { data, loading, error } = useSearch({
    q,
    season: filterEpisode?.season,
    episode: filterEpisode?.episode,
    speaker: filterSpeaker || undefined,
    genre: filterGenre || undefined,
    browseAll,
  });

  const [active, setActive] = useState<SearchItem | null>(null);
  const [featured, setFeatured] = useState<SearchItem[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [allItems, setAllItems] = useState<SearchItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lucky, setLucky] = useState<SearchItem | null>(null);
  const [luckyLoading, setLuckyLoading] = useState(false);
  const [moodIndex, setMoodIndex] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    fetchEpisodes().then((r) => setEpisodes(r.episodes)).catch(() => {});
    fetchGenres().then((r) => setGenres(r.genres)).catch(() => {});
    fetchSpeakers().then((r) => setSpeakers(r.speakers)).catch(() => {});
    fetchFeatured().then((r) => setFeatured(r.items)).catch(() => setFeatured([]));
  }, []);

  useEffect(() => {
    try { localStorage.setItem('quote-search-history', JSON.stringify(history)); } catch { /* 本机存储不可用时仅保留当前会话 */ }
  }, [history]);

  useEffect(() => {
    try { localStorage.setItem('quote-search-favorites', JSON.stringify(favorites)); } catch { /* 本机存储不可用时仅保留当前会话 */ }
  }, [favorites]);

  useEffect(() => {
    if (data) {
      setAllItems(data.items);
      setPage(data.page);
      setHasMore(data.items.length < data.total && data.page * data.size < data.total);
    } else {
      setAllItems([]);
      setHasMore(false);
    }
  }, [data]);

  const loadRandom = useCallback(async () => {
    setLuckyLoading(true);
    try {
      setLucky(await fetchRandom());
    } catch {
      /* 随机接口不可用时保留当前句子 */
    } finally {
      setLuckyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRandom();
  }, [loadRandom]);

  useEffect(() => {
    document.documentElement.dataset.mood = MOODS[moodIndex].id;
  }, [moodIndex]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMoodIndex((value) => (value + 1) % MOODS.length);
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const heroItems = useMemo(() => {
    const perFilm = episodes
      .map((ep) => featured.find((item) => item.season === ep.season && item.episode === ep.episode))
      .filter((item): item is SearchItem => Boolean(item));
    return perFilm.length > 0 ? perFilm : featured.slice(0, 3);
  }, [episodes, featured]);

  useEffect(() => {
    if (heroItems.length < 2) return;
    const timer = window.setInterval(() => {
      setHeroIndex((value) => (value + 1) % heroItems.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [heroItems.length]);

  const loadMore = useCallback(async () => {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await search(q, {
        season: filterEpisode?.season,
        episode: filterEpisode?.episode,
        speaker: filterSpeaker || undefined,
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
  }, [data, page, q, filterEpisode, filterSpeaker, filterGenre, loadingMore]);

  const epLabel = (ep: Episode) =>
    ep.title_en || ep.title_zh || `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}`;
  const epGenreLabels = (ep: Episode) => {
    const list = ep.genres?.length ? ep.genres : (ep.genre ? [ep.genre] : []);
    return list.map((genre) => GENRE_LABELS[genre] || genre);
  };
  const genreLabel = (genre: string) => GENRE_LABELS[genre] || genre;
  const totalLines = episodes.reduce((sum, ep) => sum + ep.line_count, 0);
  const favoriteIds = new Set(favorites.map((item) => item.id));
  const closeDetail = useCallback(() => setActive(null), []);

  const toggleFavorite = useCallback((item: SearchItem) => {
    setFavorites((prev) =>
      prev.some((saved) => saved.id === item.id)
        ? prev.filter((saved) => saved.id !== item.id)
        : [item, ...prev],
    );
  }, []);

  const handleQueryChange = (value: string) => {
    setQ(value);
    setShowFavorites(false);
  };

  const submitSearch = (value: string) => {
    const query = value.trim();
    setQ(query);
    setShowFavorites(false);
    if (query) {
      setHistory((prev) => [query, ...prev.filter((item) => item !== query)].slice(0, 8));
    }
  };

  const clearFilters = () => {
    setQ('');
    setFilterEpisode(null);
    setFilterGenre(null);
    setFilterSpeaker(null);
  };

  const goHome = () => {
    setShowFavorites(false);
    setBrowseAll(false);
    clearFilters();
  };

  const enterBrowse = (episode?: Episode) => {
    setShowFavorites(false);
    setBrowseAll(true);
    setQ('');
    setFilterGenre(null);
    setFilterSpeaker(null);
    setFilterEpisode(episode ? { season: episode.season, episode: episode.episode } : null);
  };

  const searchData = data ? { ...data, items: allItems } : null;
  const showFeatured = !showFavorites && !browseAll && !q.trim() && !filterEpisode && !filterGenre && !filterSpeaker;
  const favoritesData = {
    query: '', total: favorites.length, page: 1, size: favorites.length,
    took_ms: 0, items: favorites,
  };
  const nextMood = MOODS[(moodIndex + 1) % MOODS.length];

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <button className="brand" onClick={goHome} aria-label="返回首页">
            <span className="brand-mark">
              <svg className="brand-logo" viewBox="0 0 48 48" aria-hidden="true">
                <defs>
                  <linearGradient id="brandGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffd08a" />
                    <stop offset="55%" stopColor="#ff8a5c" />
                    <stop offset="100%" stopColor="#c2456b" />
                  </linearGradient>
                </defs>
                <rect x="1" y="1" width="46" height="46" rx="15" fill="url(#brandGradient)" />
                <path d="M12.5 14.5h9.5v9.6h-5.9c0 3.5 1.7 5.6 4.9 6.4v3.3c-5.3-.9-8.5-4.6-8.5-10.1V14.5Zm14 0H36v9.6h-5.9c0 3.5 1.7 5.6 4.9 6.4v3.3c-5.3-.9-8.5-4.6-8.5-10.1V14.5Z" fill="#1b0d0a" opacity="0.9" />
                <circle cx="38.5" cy="9.5" r="2.2" fill="#fff" opacity="0.6" />
                <circle cx="9.5" cy="38.5" r="1.5" fill="#fff" opacity="0.35" />
              </svg>
            </span>
            <span className="brand-copy">拾句放映室<small>PICKUP REEL</small></span>
          </button>
          <SearchBar
            value={q}
            onChange={handleQueryChange}
            onSubmit={submitSearch}
            history={history}
            onClearHistory={() => setHistory([])}
            autoFocus
          />
          <button
            className="theme-toggle"
            onClick={() => setMoodIndex((value) => (value + 1) % MOODS.length)}
            aria-label={`切换背景配色，当前${MOODS[moodIndex].label}`}
            title={`切换背景配色（下一款：${nextMood.label}）`}
          >
            <Palette size={17} />
          </button>
          <button
            className={`header-favorites ${showFavorites ? 'active' : ''}`}
            onClick={() => setShowFavorites((value) => !value)}
            aria-pressed={showFavorites}
          >
            <Heart size={17} fill={showFavorites ? 'currentColor' : 'none'} />
            <span>收藏</span>
            <span className="favorite-count">{favorites.length}</span>
          </button>
        </div>
      </header>

      <main className="main">
        <div className="container">
          {showFeatured && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-eyebrow"><Sparkles size={14} /> PICKUP REEL STUDIO</span>
                  <h1 className="hero-title">找到那句台词，<br /><span>让灵感开始播放。</span></h1>
                  <p className="hero-sub">搜索中英双语台词，即刻定位电影画面。单条剪辑、连续对话与字幕文件，一站备齐。</p>
                  <div className="hero-actions">
                    <button className="browse-all-btn" onClick={() => enterBrowse()}>
                      <Layers size={17} /> 浏览全部素材 <ArrowUpRight size={16} />
                    </button>
                    <button className="hero-secondary-btn" onClick={() => setShowFavorites(true)}>
                      <Heart size={16} /> 我的收藏
                    </button>
                  </div>
                  <div className="hero-stats">
                    <div><strong>{totalLines || '—'}</strong><span>双语台词</span></div>
                    <div><strong>{episodes.length || '—'}</strong><span>开源影片</span></div>
                    <div><strong>{speakers.length || '—'}</strong><span>角色分类</span></div>
                  </div>
                </div>
                <div className="hero-visual">
                  {Array.from({ length: Math.min(3, heroItems.length) }, (_, position) => {
                    const index = (heroIndex + position) % heroItems.length;
                    const item = heroItems[index];
                    const layout = HERO_LAYOUT[position];
                    return (
                      <button
                        className="hero-poster"
                        key={item.id}
                        style={{
                          top: layout.top,
                          left: layout.left,
                          width: layout.width,
                          zIndex: layout.z,
                          opacity: layout.opacity,
                          transform: `rotate(${layout.rotate})`,
                          filter: `brightness(${layout.brightness})`,
                        }}
                        onClick={() => {
                          if (position === 0) setActive(item);
                          else setHeroIndex(index);
                        }}
                        aria-label={position === 0 ? `播放 ${item.text_en}` : `切换到 ${item.episode_title_en}`}
                        aria-current={position === 0}
                      >
                        <img src={item.poster_url} alt={item.episode_title_en || '电影片段'} />
                        <span className="hero-poster-shade" />
                        <span className="hero-poster-play"><Play size={16} fill="currentColor" /></span>
                        <span className="hero-poster-film">{item.episode_title_en}</span>
                        <span className="hero-poster-quote">{item.text_en}</span>
                      </button>
                    );
                  })}
                  <span className="hero-float-badge"><Captions size={15} /> 逐句字幕联动</span>
                  <div className="hero-dots" role="tablist" aria-label="推荐影片切换">
                    {heroItems.map((item, index) => (
                      <button
                        key={item.id}
                        role="tab"
                        aria-selected={index === heroIndex}
                        aria-label={`切换到 ${item.episode_title_en || '推荐影片'}`}
                        className={`hero-dot ${index === heroIndex ? 'active' : ''}`}
                        onClick={() => setHeroIndex(index)}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <div className="feature-strip">
                <span><Play size={15} /> 即搜即播</span>
                <span><Captions size={15} /> 字幕语言可选</span>
                <span><Users size={15} /> 角色精确筛选</span>
                <span><Heart size={15} /> 本机收藏素材</span>
              </div>

              <section className="lucky-strip" aria-label="随机台词">
                <span className="lucky-icon"><Dices size={22} /></span>
                <div className="lucky-copy">
                  <span className="lucky-kicker">LUCKY QUOTE</span>
                  {lucky ? (
                    <>
                      <button className="lucky-en" onClick={() => setActive(lucky)}>{lucky.text_en}</button>
                      {lucky.text_zh && <span className="lucky-zh">{lucky.text_zh}</span>}
                      <span className="lucky-meta">
                        {lucky.episode_title_en} · {lucky.timecode}
                        {lucky.speaker ? ` · ${lucky.speaker}` : ''}
                      </span>
                    </>
                  ) : (
                    <span className="lucky-en">正在抽取一句…</span>
                  )}
                </div>
                <div className="lucky-actions">
                  <button className="lucky-shuffle" onClick={loadRandom} disabled={luckyLoading}>
                    <Shuffle size={15} /> {luckyLoading ? '抽取中…' : '换一句'}
                  </button>
                  {lucky && (
                    <button className="lucky-play" onClick={() => setActive(lucky)}>
                      <Play size={14} /> 播放
                    </button>
                  )}
                </div>
              </section>

              <section className="film-library">
                <div className="section-heading">
                  <div><span className="section-kicker">CURATED COLLECTIONS</span><h2>从一部影片开始探索</h2></div>
                  <button onClick={() => enterBrowse()}>全部影片 <ArrowUpRight size={15} /></button>
                </div>
                <div className="film-cards">
                  {episodes.map((ep) => {
                    const poster = featured.find((item) => item.season === ep.season && item.episode === ep.episode);
                    return (
                      <button
                        className="film-card"
                        key={`${ep.season}-${ep.episode}`}
                        onClick={() => enterBrowse(ep)}
                      >
                        {poster ? <img src={poster.poster_url} alt={epLabel(ep)} /> : <span className="film-placeholder"><Film size={32} /></span>}
                        <span className="film-card-shade" />
                        <span className="film-card-content">
                          <span className="film-card-meta">{ep.source || 'Open Movie'} · {epGenreLabels(ep).join(' / ')}</span>
                          <strong>{epLabel(ep)}</strong>
                          <span>{ep.line_count} 条台词 <ArrowUpRight size={14} /></span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {!showFavorites && (
            <section className="discovery-panel">
              <div className="discovery-heading">
                <div><span className="section-kicker">FIND YOUR SCENE</span><h2>{showFeatured ? '按条件精准筛选' : '筛选台词素材'}</h2></div>
                <div className="discovery-actions">
                  {!showFeatured && (
                    <button className="back-home-btn" onClick={goHome}>
                      <ArrowLeft size={14} /> 返回首页
                    </button>
                  )}
                </div>
              </div>

              {genres.length > 0 && (
                <div className="filter-row">
                  <span className="filter-label">题材</span>
                  <div className="filter-bar">
                    <button className={`chip ${filterGenre === null ? 'active' : ''}`} onClick={() => setFilterGenre(null)}>全部</button>
                    {genres.map((genre) => (
                      <button
                        key={genre.genre}
                        className={`chip ${filterGenre === genre.genre ? 'active' : ''}`}
                        onClick={() => setFilterGenre(filterGenre === genre.genre ? null : genre.genre)}
                      >
                        {genreLabel(genre.genre)} <span className="chip-count">{genre.line_count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="filter-row">
                <span className="filter-label">影片</span>
                <div className="filter-bar">
                  <button className={`chip ${filterEpisode === null ? 'active' : ''}`} onClick={() => setFilterEpisode(null)}>
                    <LayoutGrid size={14} /> 全部
                  </button>
                  {episodes.map((ep) => {
                    const selected = filterEpisode?.season === ep.season && filterEpisode?.episode === ep.episode;
                    return (
                      <button
                        key={`${ep.season}-${ep.episode}`}
                        className={`chip ${selected ? 'active' : ''}`}
                        onClick={() => setFilterEpisode(selected ? null : { season: ep.season, episode: ep.episode })}
                      >
                        {epLabel(ep)} <span className="chip-count">{ep.line_count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {speakers.length > 0 && (
                <div className="filter-row speaker-row">
                  <span className="filter-label"><Users size={13} /> 说话人</span>
                  <select
                    className="speaker-select"
                    value={filterSpeaker || ''}
                    onChange={(e) => setFilterSpeaker(e.target.value || null)}
                    aria-label="按说话人筛选"
                  >
                    <option value="">全部说话人</option>
                    {speakers.map((speaker) => (
                      <option key={speaker.speaker} value={speaker.speaker}>
                        {speaker.speaker}（{speaker.line_count} 条）
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          )}

          <section className={`quotes-section ${showFavorites ? 'favorites-section' : ''}`}>
            {showFavorites && (
              <div className="section-heading favorites-heading">
                <div><span className="section-kicker">YOUR COLLECTION</span><h2>我的台词收藏</h2></div>
                <button onClick={() => setShowFavorites(false)}>返回素材库 <ArrowUpRight size={15} /></button>
              </div>
            )}
            <QuoteGrid
              response={showFavorites ? favoritesData : searchData}
              loading={showFavorites ? false : loading}
              error={showFavorites ? null : error}
              featured={featured}
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
              isFavoritesView={showFavorites}
              sectionTitle={showFavorites ? `已收藏 ${favorites.length} 条台词` : undefined}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              onCardClick={setActive}
            />
          </section>
        </div>
      </main>

      <footer className="footer">
        <span>PICKUP REEL · Footage: Blender Open Movies · CC BY</span>
        <span className="build-info">{episodes.length} 部影片 · {totalLines} 条精选语料</span>
      </footer>

      <QuoteDetailDialog
        item={active}
        onClose={closeDetail}
        isFavorite={active ? favoriteIds.has(active.id) : false}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
}
