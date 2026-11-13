import { Search, Clapperboard } from 'lucide-react';
import { useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}

export default function SearchBar({ value, onChange, autoFocus }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <div className={`search-bar ${focused ? 'focused' : ''}`}>
      <Search size={20} className="search-icon" />
      <input
        type="search"
        placeholder="输入关键词，中英文都可以…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        maxLength={80}
        aria-label="搜索台词"
      />
      {!value && <Clapperboard size={16} className="placeholder" />}
    </div>
  );
}
