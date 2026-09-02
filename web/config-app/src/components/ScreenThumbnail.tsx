import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ScreenArt } from './ScreenArt';

/**
 * A screen's art, small, fetched only when it is scrolled to.
 *
 * One component because the gallery and the screen tables both want it, and a
 * second copy of the lazy-loading is a second chance to get it wrong - the
 * gallery's version already had to be fixed twice: once for thumbnails that
 * kept showing damage after a repair (a fetch into local state that
 * invalidateQueries could not see), and once for a card that allocated a full
 * 1280x800 editor canvas and shrank it with CSS.
 *
 * Two pieces of state, and the difference between them is the whole point:
 * `seen` is sticky and gates the FETCH, so a screen is requested once and
 * stays in the query cache. `onScreen` is not sticky and gates the PIXELS, so
 * a board of 872 screens never holds more canvases than fit on a screen.
 */
export function ScreenThumbnail({
  path, scale = 0.28, className,
}: { path: string; scale?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    // jsdom has no IntersectionObserver; a test environment simply draws.
    if (!element || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      setOnScreen(true);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      const showing = entries.some(entry => entry.isIntersecting);
      setOnScreen(showing);
      if (showing) setSeen(true);
      // 600px of margin: a row just past the edge keeps its pixels, so an
      // ordinary scroll never flickers.
    }, { rootMargin: '600px' });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The SAME key the file panel uses, so a repair that invalidates the file
  // redraws the thumbnail, and opening a screen costs no second fetch.
  const { data } = useQuery({
    queryKey: ['screen-file', path],
    queryFn: async () => (await apiClient.getScreenFile(path)).data,
    enabled: seen,
  });

  const art = (data as { content?: string } | undefined)?.content;

  return (
    <div ref={ref} className={className} data-testid="screen-thumbnail">
      {art && onScreen
        ? <ScreenArt
            content={art}
            scale={scale}
            testId="screen-thumbnail-canvas"
            // A screenful. Some files under this board's screen directories are
            // ordinary text - 430 lines of BBSHelp, 3,019 of a changelog - and
            // a preview of one asks for a canvas taller than a browser will
            // allocate.
            maxRows={25}
          />
        // Waiting looks like waiting: blank black reads as an empty screen,
        // which some of these actually are.
        : <div className="h-full w-full animate-pulse bg-surface-2/40" />}
    </div>
  );
}
