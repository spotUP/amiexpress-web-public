import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { ScreenArt } from './ScreenArt';

/**
 * Every screen file as a picture.
 *
 * "How can we make it easy for artists to find everything? render mugshots of
 * all screen files?" - yes, and it is the only thing that makes a directory of
 * 891 files browsable: a designer recognises the art, never the path.
 *
 * The bytes are fetched only when a card comes into view. Fetching 891 screens
 * to fill one screenful would be slower than the list it replaces, and most of
 * them are never looked at.
 */
export interface GalleryItem {
  /** Relative path, which is also the fetch key. */
  path: string;
  /** What it is - the screen name, the bulletin's title, whatever is known. */
  label: string;
  /** The line under the label: who reads it, or what is wrong with it. */
  detail?: string;
  /** Shown in the corner - the artist, from SAUCE. */
  credit?: string;
  problem?: boolean;
}

interface ScreenGalleryProps {
  items: GalleryItem[];
  onOpen: (path: string) => void;
}

/** One card. Draws nothing until it is scrolled to. */
function GalleryCard({ item, onOpen }: { item: GalleryItem; onOpen: (path: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [content, setContent] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    // jsdom has no IntersectionObserver; a test environment simply draws.
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || content !== null) return;

    let cancelled = false;
    apiClient.getScreenFile(item.path)
      .then(res => { if (!cancelled) setContent((res.data as { content?: string })?.content ?? ''); })
      .catch(() => { if (!cancelled) setContent(''); });

    return () => { cancelled = true; };
  }, [visible, content, item.path]);

  return (
    <button
      ref={ref}
      type="button"
      className="text-left border border-border hover:border-border-strong p-2 space-y-1"
      onClick={() => onOpen(item.path)}
    >
      <div className="h-32 overflow-hidden bg-black">
        {content ? <ScreenArt content={content} scale={0.28} /> : null}
      </div>
      <div className="text-xs">
        <span className="block font-topaz text-content-primary truncate">{item.label}</span>
        {item.detail && (
          <span className={`block truncate ${item.problem ? 'text-status-warn' : 'text-content-secondary'}`}>
            {item.detail}
          </span>
        )}
        {item.credit && (
          <span className="block truncate text-content-muted">{item.credit}</span>
        )}
      </div>
    </button>
  );
}

export function ScreenGallery({ items, onOpen }: ScreenGalleryProps) {
  if (items.length === 0) {
    return <p className="text-sm text-content-secondary">Nothing to show here.</p>;
  }

  return (
    <div
      data-testid="screen-gallery"
      className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {items.map(item => (
        <GalleryCard key={item.path} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
