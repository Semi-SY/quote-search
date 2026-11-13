import { Search, History, X, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  history: string[];
  onClearHistory: () => void;
  autoFocus?: boolean;
}

export default function SearchBar({
  value, onChange, onSubmit, history, onClearHistory, autoFocus,
}: Props) {
  const [focused, setFocused] = useState(false);

  function selectHistory(query: string) {
    onChange(query);
    onSubmit(query);
    setFocused(false);
  }

  return (
    <div
      className="search-shell"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <form
        className={`search-bar ${focused ? 'focused' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value.trim());
          setFocused(false);
        }}
      >
        <Search size={19} className="search-icon" />
        <input
          type="search"
          placeholder="搜索中英文台词，例如：passion、爱、世界…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          autoFocus={autoFocus}
          maxLength={80}
          aria-label="搜索台词"
        />
        {value && (
          <button
            type="button"
            className="search-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange('')}
            aria-label="清空搜索"
          >
            <X size={15} />
          </button>
        )}
      </form>

      {focused && !value && history.length > 0 && (
        <div className="search-history">
          <div className="history-heading">
            <span><History size={13} /> 最近搜索</span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClearHistory}
              aria-label="清空搜索历史"
            >
              <Trash2 size={13} /> 清空
            </button>
          </div>
          <div className="history-list">
            {history.map((query) => (
              <button
                type="button"
                key={query}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectHistory(query)}
              >
                <History size={13} /> {query}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
