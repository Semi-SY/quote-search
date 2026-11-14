import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Film, Heart, LayoutGrid, Layers, Sparkles, Play, Captions,
  ArrowUpRight, Users, Shuffle, ArrowLeft, Palette, Dices,
} from 'lucide-react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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

function positiveParam(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isHome = location.pathname === '/';
  const isBrowse = location.pathname === '/browse';
  const isFavorites = location.pathname === '/favorites';
  const [searchDraft, setSearchDraft] = useState('');
  const [history, setHistory] = useState<string[]>(() => readLocalArray<string>('quote-search-history'));
  const [favorites, setFavorites] = useState<SearchItem[]>(() => readLocalArray<SearchItem>('quote-search-favorites'));

  const q = isBrowse ? searchParams.get('q') || '' : searchDraft;
  const query = isBrowse ? q.trim() : '';
  const filterSeason = isBrowse ? positiveParam(searchParams.get('season')) : undefined;
  const filterEpisodeNumber = isBrowse ? positiveParam(searchParams.get('episode')) : undefined;
  const filterEpisode = filterSeason !== undefined && filterEpisodeNumber !== undefined
    ? { season: filterSeason, episode: filterEpisodeNumber }
    : null;
  const filterGenre = isBrowse ? searchParams.get('genre') : null;
  const filterSpeaker = isBrowse ? searchParams.get('speaker') : null;

  const updateBrowseParams = useCallback((updates: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace });
    }
  }, [searchParams, setSearchParams]);

  const setFilterGenre = (genre: string | null) => updateBrowseParams({ genre });
  const setFilterSpeaker = (speaker: string | null) => updateBrowseParams({ speaker });
  const setFilterEpisode = (episode: { season: number; episode: number } | null) => {
    updateBrowseParams({
      season: episode ? String(episode.season) : null,
      episode: episode ? String(episode.episode) : null,
    });
  };

  const searchKey = isBrowse
    ? [query, filterSeason, filterEpisodeNumber, filterGenre, filterSpeaker].join('|')
    : '';
  const searchKeyRef = useRef(searchKey);
  useEffect(() => {
    searchKeyRef.current = searchKey;
  }, [searchKey]);

  const { data, loading, error } = useSearch({
    q: query,
    season: filterSeason,
    episode: filterEpisodeNumber,
    speaker: filterSpeaker || undefined,
    genre: filterGenre || undefined,
    browseAll: isBrowse,
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
    fetchFeatured().then((r) => setFeatured(r.items)).catch(() => setFeatured([]));
  }, []);

  // 筛选器联动：素材页按 URL 条件统计，其他页面恢复全量统计。
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all([
        fetchEpisodes({ q: query, genre: filterGenre || undefined, speaker: filterSpeaker || undefined }),
        fetchGenres({
          q: query,
          season: filterSeason,
          episode: filterEpisodeNumber,
          speaker: filterSpeaker || undefined,
        }),
        fetchSpeakers({
          q: query,
          season: filterSeason,
          episode: filterEpisodeNumber,
          genre: filterGenre || undefined,
        }),
      ]).then(([episodeData, genreData, speakerData]) => {
        if (cancelled) return;
        setEpisodes(episodeData.episodes);
        setGenres(genreData.genres);
        setSpeakers(speakerData.speakers);
        if (!isBrowse) return;

        const invalid: Record<string, string | null> = {};
        if (filterGenre && genreData.genres.length > 0
          && !genreData.genres.some((g) => g.genre === filterGenre && g.line_count > 0)) {
          invalid.genre = null;
        }
        if (filterSpeaker && speakerData.speakers.length > 0
          && !speakerData.speakers.some((s) => s.speaker === filterSpeaker && s.line_count > 0)) {
          invalid.speaker = null;
        }
        if (filterSeason !== undefined && filterEpisodeNumber !== undefined && episodeData.episodes.length > 0
          && !episodeData.episodes.some((e) => e.season === filterSeason
            && e.episode === filterEpisodeNumber && e.line_count > 0)) {
          invalid.season = null;
          invalid.episode = null;
        }
        if (Object.keys(invalid).length > 0) updateBrowseParams(invalid, true);
      }).catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isBrowse, query, filterSeason, filterEpisodeNumber, filterGenre, filterSpeaker, updateBrowseParams]);

  // 清理直接访问 URL 时的空参数与无效影片参数。
  useEffect(() => {
    if (!isBrowse) return;
    const updates: Record<string, string | null> = {};
    ['q', 'genre', 'speaker'].forEach((key) => {
      if (searchParams.get(key) === '') updates[key] = null;
    });
    if ((searchParams.has('season') || searchParams.has('episode'))
      && (filterSeason === undefined || filterEpisodeNumber === undefined)) {
      updates.season = null;
      updates.episode = null;
    }
    if (Object.keys(updates).length > 0) updateBrowseParams(updates, true);
  }, [isBrowse, searchParams, filterSeason, filterEpisodeNumber, updateBrowseParams]);

  useEffect(() => {
    setActive(null);
    document.title = isBrowse
      ? '浏览素材 · 拾句放映室'
      : isFavorites ? '我的收藏 · 拾句放映室' : '拾句放映室 · Pickup Reel';
  }, [location.pathname, isBrowse, isFavorites]);

  useEffect(() => {
    try { localStorage.setItem('quote-search-history', JSON.stringify(history)); } catch { /* 本机存储不可用时仅保留当前会话 */ }
  }, [history]);

  useEffect(() => {
    try { localStorage.setItem('quote-search-favorites', JSON.stringify(favorites)); } catch { /* 本机存储不可用时仅保留当前会话 */ }
  }, [favorites]);

  useEffect(() => {
    setAllItems([]);
    setPage(1);
    setHasMore(false);
    setLoadingMore(false);
  }, [searchKey]);

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
    if (!data || loading || loadingMore || !isBrowse) return;
    const requestKey = searchKey;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await search(query, {
        season: filterSeason,
        episode: filterEpisodeNumber,
        speaker: filterSpeaker || undefined,
        genre: filterGenre || undefined,
        page: next,
        size: 20,
      });
      if (searchKeyRef.current !== requestKey) return;
      setAllItems((prev) => [...prev, ...res.items]);
      setPage(next);
      setHasMore(next * res.size < res.total);
    } finally {
      if (searchKeyRef.current === requestKey) setLoadingMore(false);
    }
  }, [data, page, query, filterSeason, filterEpisodeNumber, filterSpeaker, filterGenre,
    loading, loadingMore, isBrowse, searchKey]);

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
    if (isBrowse) updateBrowseParams({ q: value || null }, true);
    else setSearchDraft(value);
  };

  const submitSearch = (value: string) => {
    const nextQuery = value.trim();
    if (nextQuery) {
      setHistory((prev) => [nextQuery, ...prev.filter((item) => item !== nextQuery)].slice(0, 8));
    }
    if (isBrowse) {
      updateBrowseParams({ q: nextQuery || null }, true);
      return;
    }
    setSearchDraft(nextQuery);
    const params = nextQuery ? `?q=${encodeURIComponent(nextQuery)}` : '';
    navigate(`/browse${params}`);
  };

  const goHome = () => {
    setSearchDraft('');
    if (!isHome) navigate('/');
  };

  const enterBrowse = (episode?: Episode) => {
    setSearchDraft('');
    const params = new URLSearchParams();
    if (episode) {
      params.set('season', String(episode.season));
      params.set('episode', String(episode.episode));
    }
    const queryString = params.toString();
    navigate(`/browse${queryString ? `?${queryString}` : ''}`);
  };

  const enterFavorites = () => {
    setSearchDraft('');
    if (!isFavorites) navigate('/favorites');
  };

  const searchData = isBrowse && data ? { ...data, items: allItems } : null;
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
            className={`header-favorites ${isFavorites ? 'active' : ''}`}
            onClick={enterFavorites}
            aria-pressed={isFavorites}
          >
            <Heart size={17} fill={isFavorites ? 'currentColor' : 'none'} />
            <span>收藏</span>
            <span className="favorite-count">{favorites.length}</span>
          </button>
        </div>
      </header>

      <main className="main">
        <div className="container page-view" key={location.pathname}>
          {!isHome && !isBrowse && !isFavorites && <Navigate to="/" replace />}
          {isHome && (
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
                    <button className="hero-secondary-btn" onClick={enterFavorites}>
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

          {isBrowse && (
            <div className="page-heading">
              <div>
                <span className="section-kicker">EXPLORE THE LIBRARY</span>
                <h1>浏览台词素材</h1>
                <p>按影片、题材和说话人组合筛选，找到可以直接使用的电影片段。</p>
              </div>
              <button className="back-home-btn" onClick={goHome}>
                <ArrowLeft size={14} /> 返回首页
              </button>
            </div>
          )}

          {isFavorites && (
            <div className="page-heading">
              <div>
                <span className="section-kicker">YOUR COLLECTION</span>
                <h1>我的台词收藏</h1>
                <p>收藏保存在当前浏览器中，随时可以回来继续剪辑。</p>
              </div>
              <button className="back-home-btn" onClick={() => enterBrowse()}>
                <LayoutGrid size={14} /> 返回素材库
              </button>
            </div>
          )}

          {isBrowse && (
            <section className="discovery-panel">
              <div className="discovery-heading">
                <div><span className="section-kicker">FIND YOUR SCENE</span><h2>按条件精准筛选</h2></div>
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
                        disabled={genre.line_count === 0 && filterGenre !== genre.genre}
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
                        disabled={ep.line_count === 0 && !selected}
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
                      <option
                        key={speaker.speaker}
                        value={speaker.speaker}
                        disabled={speaker.line_count === 0 && filterSpeaker !== speaker.speaker}
                      >
                        {speaker.speaker}（{speaker.line_count} 条）
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          )}

          <section className={`quotes-section ${isFavorites ? 'favorites-section' : ''}`}>
            <QuoteGrid
              response={isFavorites ? favoritesData : isBrowse ? searchData : null}
              loading={isBrowse ? loading : false}
              error={isBrowse ? error : null}
              featured={featured}
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
              isFavoritesView={isFavorites}
              sectionTitle={isFavorites ? `已收藏 ${favorites.length} 条台词` : undefined}
              hasMore={isBrowse && hasMore}
              loadingMore={isBrowse && loadingMore}
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
