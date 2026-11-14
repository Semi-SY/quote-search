import { useEffect, useState } from 'react';

// === 类型 ===

export interface SearchItem {
  id: number;
  season: number;
  episode: number;
  episode_title_en: string | null;
  episode_title_zh: string | null;
  start_ms: number;
  end_ms: number;
  timecode: string;
  text_en: string;
  text_zh: string | null;
  speaker: string | null;
  align_confidence: number;
  clip_url: string;
  poster_url: string;
  scene_clip_url: string;
  share_url: string;
}

export interface SearchResponse {
  query: string;
  total: number;
  page: number;
  size: number;
  took_ms: number;
  items: SearchItem[];
}

export interface Episode {
  season: number;
  episode: number;
  title_en: string | null;
  title_zh: string | null;
  genre: string | null;
  genres: string[] | null;
  source: string | null;
  line_count: number;
}

export interface Genre {
  genre: string;
  episode_count: number;
  line_count: number;
}

export interface Speaker {
  speaker: string;
  line_count: number;
}

export interface ContextLine {
  id: number;
  seq: number;
  start_ms: number;
  end_ms: number;
  text_en: string;
  text_zh: string | null;
  speaker: string | null;
}

export interface LineDetail extends SearchItem {
  scene_start_ms: number;
  scene_end_ms: number;
  context: {
    prev: ContextLine[];
    next: ContextLine[];
  };
}

export interface HealthResponse {
  status: string;
  version: string;
  db_ready: boolean;
  line_count: number;
}

// === API client ===

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`API ${path} 返回 ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function search(
  q: string,
  params: { season?: number; episode?: number; speaker?: string; genre?: string; page?: number; size?: number } = {},
): Promise<SearchResponse> {
  const sp = new URLSearchParams({ q });
  if (params.season) sp.set('season', String(params.season));
  if (params.episode) sp.set('episode', String(params.episode));
  if (params.speaker) sp.set('speaker', params.speaker);
  if (params.genre) sp.set('genre', params.genre);
  if (params.page) sp.set('page', String(params.page));
  if (params.size) sp.set('size', String(params.size));
  return apiGet<SearchResponse>(`/api/search?${sp.toString()}`);
}

export interface FacetParams {
  q?: string;
  season?: number;
  episode?: number;
  genre?: string;
  speaker?: string;
}

function facetQuery(params: FacetParams): string {
  const sp = new URLSearchParams();
  if (params.q && params.q.trim()) sp.set('q', params.q.trim());
  if (params.season !== undefined) sp.set('season', String(params.season));
  if (params.episode !== undefined) sp.set('episode', String(params.episode));
  if (params.genre) sp.set('genre', params.genre);
  if (params.speaker) sp.set('speaker', params.speaker);
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function fetchEpisodes(params: FacetParams = {}): Promise<{ episodes: Episode[] }> {
  return apiGet<{ episodes: Episode[] }>(`/api/episodes${facetQuery(params)}`);
}

export function fetchGenres(params: FacetParams = {}): Promise<{ genres: Genre[] }> {
  return apiGet<{ genres: Genre[] }>(`/api/genres${facetQuery(params)}`);
}

export function fetchSpeakers(params: FacetParams = {}): Promise<{ speakers: Speaker[] }> {
  return apiGet<{ speakers: Speaker[] }>(`/api/speakers${facetQuery(params)}`);
}

export function fetchFeatured(): Promise<{ items: SearchItem[] }> {
  return apiGet<{ items: SearchItem[] }>('/api/featured');
}

/** 随机一条台词（首页「换一句」）。 */
export function fetchRandom(): Promise<SearchItem> {
  return apiGet<SearchItem>('/api/random');
}

export function fetchLineDetail(id: number): Promise<LineDetail> {
  return apiGet<LineDetail>(`/api/lines/${id}`);
}

export type SrtLang = 'bi' | 'en' | 'zh';

/** 单条台词 SRT 下载 URL（含 context 条上下文） */
export function lineSrtUrl(id: number, context = 0, lang: SrtLang = 'bi'): string {
  return `/api/lines/${id}/srt?context=${context}&lang=${lang}`;
}

/** 整集 SRT 下载 URL */
export function episodeSrtUrl(season: number, episode: number, lang: SrtLang = 'bi'): string {
  return `/api/episodes/${season}/${episode}/srt?lang=${lang}`;
}

// === Hook：防抖 + 取消请求 ===

export interface SearchParams {
  q: string;
  season?: number;
  episode?: number;
  speaker?: string;
  genre?: string;
  /** 浏览全部素材：即使没有关键词与筛选也要请求全库 */
  browseAll?: boolean;
}

export function useSearch({ q, season, episode, speaker, genre, browseAll = false }: SearchParams) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 空查询且无筛选且未进入浏览模式 = idle（不请求）
  const effective = !browseAll && !q.trim()
    && season === undefined && episode === undefined && !speaker && !genre;

  useEffect(() => {
    if (effective) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await search(q, { season, episode, speaker, genre, size: 20 });
        if (!ctrl.signal.aborted) setData(res);
      } catch (e: unknown) {
        if (!ctrl.signal.aborted) {
          setError(e instanceof Error ? e.message : '搜索失败');
          setData(null);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300); // 防抖 300ms

    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, season, episode, speaker, genre, browseAll, effective]);

  return { data, loading, error };
}
