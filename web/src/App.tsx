import { useEffect, useState } from 'react';
import { Film, Heart } from 'lucide-react';
import SearchBar from './components/SearchBar';
import QuoteGrid from './components/QuoteGrid';
import QuoteDetailDialog from './components/QuoteDetailDialog';
import { fetchEpisodes, fetchFeatured, useSearch, type SearchItem } from './api/client';

export default function App() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useSearch(q);
  const [active, setActive] = useState<SearchItem | null>(null);
  const [featured, setFeatured] = useState<SearchItem[]>([]);
  const [episodes, setEpisodes] = useState<{ season: number; episode: number; title_en: string | null; title_zh: string | null; line_count: number }[]>([]);

  useEffect(() => {
    fetchEpisodes()
      .then((r) => setEpisodes(r.episodes))
      .catch(() => { /* 静默忽略：库未生成时不炸首屏 */ });
    fetchFeatured()
      .then((r) => setFeatured(r.items))
      .catch(() => setFeatured([]));
  }, []);

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
          <QuoteGrid
            response={data}
            loading={loading}
            error={error}
            featured={featured}
            onCardClick={setActive}
          />
        </div>
      </main>

      <footer className="footer">
        <span>
          <Heart size={12} /> Footage: Tears of Steel © Blender Foundation | CC BY 3.0
        </span>
        <span className="build-info">
          {episodes.length > 0 ? `${episodes.length} 集入库` : '样本演示中'}
        </span>
      </footer>

      <QuoteDetailDialog item={active} onClose={() => setActive(null)} />
    </div>
  );
}
