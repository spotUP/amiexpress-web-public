import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

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
 *
 * A concurrency limiter prevents the browser from firing 30+ requests at once
 * when the initial viewport fills with cards — on localhost tsx compilation
 * makes each ~500ms, saturating connection pools and blocking the UI thread.
 */

/** Max concurrent screen file fetches. */
const MAX_CONCURRENT = 4;

let pending: Array<() => void> = [];
let inFlight = 0;

function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise(resolve => { pending.push(resolve); });
}

function release(): void {
  const next = pending.shift();
  if (next) {
    next();
  } else {
    inFlight--;
  }
}
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
  /**
   * Whose art this is, when the gallery belongs to a theme.
   *
   * An artist's gallery holds both: the screens they have redrawn, and the
   * board's own art still showing through underneath. Absent in the board's
   * own view, where every card is the board's.
   */
  badge?: { label: string; kind: 'mine' | 'theirs' };
  /**
   * Which of the three formats this screen HAS, so an artist can see at a
   * glance how far along it is. A caller is served by extension - the loader
   * looks for `<stem>.rip` for a RIP terminal, `<stem>.seq` for a C64 and the
   * text/ANSI file otherwise - so a screen with only one of them is a screen
   * two thirds of the board cannot show properly.
   */
  formats?: { ansi: boolean; petscii: boolean; rip: boolean };
}

interface ScreenGalleryProps {
  items: GalleryItem[];
  onOpen: (path: string) => void;
  /** Draw placeholder cards while the board's index is on its way. */
  isLoading?: boolean;
}

/** One card. Draws nothing until it is scrolled to. */
function GalleryCard({ item, onOpen }: { item: GalleryItem; onOpen: (path: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
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

  /**
   * THE SAME QUERY KEY THE FILE PANEL USES, so a write refreshes the picture.
   *
   * This card fetched into local state guarded by `content !== null`: it asked
   * once and never again. `invalidateQueries` cannot reach local state, and
   * the card is not remounted - its key is the path, which does not change
   * when the file does - so a repaired screen went on showing its damage
   * ("i repaired some screens now it worked but their thumbnail didnt
   * regenerate in the gallery so they still look broken", sysop). The page
   * invalidates `['screen-file']` after a repair; being a query is what makes
   * that arrive.
   *
   * The concurrency limiter stays exactly where it was, INSIDE the fetch: it
   * is what stops a viewport of cards firing thirty requests at once, and
   * react-query does not limit concurrency of its own.
   */
  const { data: fetched } = useQuery({
    queryKey: ['screen-file', item.path],
    enabled: visible,
    queryFn: async () => {
      await acquire();
      try {
        const res = await apiClient.getScreenFile(item.path);
        return (res.data as { content?: string })?.content ?? '';
      } catch {
        return '';
      } finally {
        release();
      }
    },
  });
  const content = fetched ?? null;

  return (
    <button
      ref={ref}
      type="button"
      className="text-left border border-border hover:border-border-strong p-2 space-y-1"
      onClick={() => onOpen(item.path)}
    >
      <div className="h-32 overflow-hidden bg-black">
        {content
          ? <ScreenArt content={content} scale={0.28} />
          // A card that is waiting looks like it is waiting. Blank black reads
          // as an empty screen, which is a thing some of these actually are.
          : <div className="h-full w-full animate-pulse bg-surface-2/40" />}
      </div>
      <div className="text-xs">
        <span className="block text-content-primary truncate">{item.label}</span>
        {item.detail && (
          <span className={`block truncate ${item.problem ? 'text-status-warn' : 'text-content-secondary'}`}>
            {item.detail}
          </span>
        )}
        {item.credit && (
          <span className="block truncate text-content-muted">{item.credit}</span>
        )}
        {item.badge && (
          <span
            data-testid={`badge-${item.badge.kind}`}
            className={
              item.badge.kind === 'mine'
                ? 'mt-1 inline-block px-1 rounded-sm bg-surface-3 text-content-primary'
                : 'mt-1 inline-block px-1 rounded-sm border border-dashed border-border text-content-muted'
            }
          >
            {item.badge.label}
          </span>
        )}
        {item.formats && (
          <span className="mt-1 flex gap-1" data-testid="format-chips">
            {([
              ['ANSI', item.formats.ansi],
              ['SEQ', item.formats.petscii],
              ['RIP', item.formats.rip],
            ] as const).map(([label, have]) => (
              <span
                key={label}
                data-testid={`chip-${label.toLowerCase()}-${have ? 'have' : 'missing'}`}
                title={have ? `${label} version exists` : `no ${label} version - this screen falls back for those callers`}
                className={
                  have
                    ? 'px-1 rounded-sm bg-surface-3 text-content-primary'
                    : 'px-1 rounded-sm border border-dashed border-border text-content-muted'
                }
              >
                {label}
              </span>
            ))}
          </span>
        )}
      </div>
    </button>
  );
}

export function ScreenGallery({ items, onOpen, isLoading = false }: ScreenGalleryProps) {
  // The index is one request for the whole board - 891 files with their
  // readers, their SAUCE and their problems - so the page has a real wait
  // before there is anything to draw.
  if (isLoading) {
    return (
      <div
        data-testid="gallery-skeleton"
        className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="border border-border p-2 space-y-2">
            <div className="h-32 animate-pulse bg-surface-2" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }

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
