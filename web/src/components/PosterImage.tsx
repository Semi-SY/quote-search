import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  alt?: string;
  /** 16:9 占位的色调索引（用于无图兜底） */
  hue?: number;
}

/**
 * 缩略图懒加载 + 404 兜底为纯色占位块。
 * 容器固定 aspect-ratio: 16 / 9，避免布局抖动。
 */
export default function PosterImage({ src, alt = '', hue = 0 }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  // IntersectionObserver：进入视口才加载，实现真正的懒加载
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const hueColor = `hsl(${(hue * 47) % 360} 30% 22%)`;

  if (error) {
    return (
      <div className="poster placeholder" style={{ background: hueColor }}>
        <span className="placeholder-label">无图</span>
      </div>
    );
  }

  return (
    <div className="poster" ref={ref}>
      {!loaded && <div className="skeleton" style={{ background: hueColor }} />}
      {visible && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={loaded ? 'loaded' : ''}
        />
      )}
    </div>
  );
}
