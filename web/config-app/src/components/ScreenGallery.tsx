import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { AnsiCanvas, CELL_WIDTH } from './AnsiCanvas';
import { TELETEXT_CELL, TELETEXT_FONT_FAMILY, teletextCells } from './teletext-cells';
import { base64ToLatin1 } from '../pages/screen-bytes';

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

/** Max concurrent screen file fetches: the browser's own per-origin pool
 *  limit, so one gallery can never ask for more than the transport allows. */
export const MAX_CONCURRENT = 6;

const pending: Array<() => void> = [];
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
import { PetsciiScreenPreview } from './PetsciiScreenPreview';
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
  badge?: { label: string; kind: 'mine' | 'theirs' | 'todo' };
  /**
   * A screen the theme has not drawn yet: there is no file to fetch, and the
   * card is an invitation rather than a thumbnail.
   */
  placeholder?: boolean;
  /**
   * How many distinct CONTENTS this screen has across the board.
   *
   * 1 is the quiet case and says nothing on the card. More than one is DRIFT:
   * the same screen edited in one place and not the others, which is what
   * produced five versions of `logoff.txt` and six of `bull20.txt` on this
   * board. The card stands for the version the most scopes read.
   */
  versions?: number;
  /**
   * The versions this card stands in front of, most-read first - so the drift
   * can be shown INSIDE the card instead of as more cards the artist has to
   * recognise as the same screen.
   */
  otherVersions?: unknown[];
  /**
   * The format the gallery was ASKED to draw and this screen does not have.
   *
   * The card falls back to whatever the screen resolves to, so without saying
   * it a screen drawn in ANSI while PETSCII is selected looks exactly like one
   * that HAS a PETSCII drawing - and an artist reading the gallery to find
   * what is left to draw would be told the opposite of the truth.
   */
  missingFormat?: string;
  /** Scopes reading the version this card stands for. */
  scopes?: number;
  /** Scopes reading the OTHER versions of the same screen. */
  otherScopes?: number;
  /**
   * Which of the three formats this screen HAS, so an artist can see at a
   * glance how far along it is. A caller is served by extension - the loader
   * looks for `<stem>.rip` for a RIP terminal, `<stem>.seq` for a C64 and the
   * text/ANSI file otherwise - so a screen with only one of them is a screen
   * two thirds of the board cannot show properly.
   */
  formats?: { ansi: boolean; petscii: boolean; rip: boolean; teletext: boolean; teletextNative: boolean };
  /**
   * WHAT THIS FILE IS, so the thumbnail is drawn by the renderer that can read
   * it. Every card used to go through the CP437 ANSI canvas, so a `.seq` - a
   * file of C64 screen codes - came out as noise, and a `.rip` as its own
   * drawing commands in text. Absent means text or ANSI, the common case.
   */
  format?: 'ansi' | 'text' | 'petscii' | 'rip' | 'teletext' | 'teletext-native';
  /**
   * WHERE THE BYTES COME FROM, when they are not a screen file.
   *
   * A door's art slot is addressed by door, file and section, so it has no
   * path for the file route to read. Absent, the card reads `path` as a screen
   * file. The answer has the file route's shape: an object with `.content`.
   */
  source?: {
    queryKey: readonly unknown[];
    fetch: () => Promise<{ content?: string } | null>;
  };
}

/**
 * One card's picture, drawn by whatever can read the file.
 *
 * The gallery had ONE renderer - the CP437 ANSI canvas - for every screen on
 * the board, so the formats that are not CP437 were shown as noise: a `.seq`
 * is C64 screen codes and a `.rip` is drawing commands. The sysop, looking at
 * the studio: "the petscii previews dont display correctly in the admin ui
 * make them on par with how it displays in the bbs".
 *
 * PETSCII is drawn by the board's own surface (`PetsciiScreenPreview` ->
 * `PetsciiCanvas`), which is the component the terminal draws a C64 caller
 * with, so the thumbnail and the caller see the same screen.
 *
 * ANSI teletext (.ttx) is ANSI bytes like .txt, so the ordinary ScreenArt
 * canvas reads it - the TDAText face is a terminal concern, not a content
 * one. Native packet teletext (.tti) is drawn the way the board serves it:
 * renderNativeTti's rows on the same cell canvas, in TeletextUPR
 * (`TeletextThumbnail`), in the caller's teletext cell, as wide as an ANSI card.
 *
 * RIP has no thumbnail. Its picture needs the vendored RIPtermJS interpreter
 * and a canvas per card, and a gallery is hundreds of cards; naming the format
 * is honest, and the card still opens into the RIP editor which does draw it.
 */
function Thumbnail({ content, format }: { content: string; format?: GalleryItem['format'] }) {
  if (format === 'petscii') {
    return <PetsciiScreenPreview content={content} className="h-full w-full" />;
  }
  if (format === 'teletext-native') {
    return <TeletextThumbnail content={content} />;
  }
  if (format === 'rip') {
    return (
      <div
        data-testid="rip-thumbnail"
        className="flex h-full w-full items-center justify-center text-xs text-content-muted"
      >
        RIP graphics - open to view
      </div>
    );
  }
  /*
   * A SCREENFUL, in both directions. `Conf1/bull20.txt` on this board is 25
   * rows padded to 2807 characters: without the width cap its card is a canvas
   * 2807 cells wide showing its own top-left corner, which reads as a blank
   * screen next to a theme's card that draws fine.
   */
  return <ScreenArt content={content} scale={ANSI_CARD_SCALE} maxRows={25} maxCols={80} />;
}

/** An ANSI card: an 80-column VGA screen at this fraction of full size. */
const ANSI_CARD_SCALE = 0.28;

/** A .tti card drawn as wide as an ANSI card: forty teletext cells across. */
const TELETEXT_THUMBNAIL_SCALE = (80 * CELL_WIDTH * ANSI_CARD_SCALE) / (40 * TELETEXT_CELL.width);

/** A .tti card: the page rendered once per content, not once per paint. */
function TeletextThumbnail({ content }: { content: string }) {
  const cells = useMemo(() => teletextCells(base64ToLatin1(content)), [content]);
  return (
    <AnsiCanvas
      canvas={cells}
      scale={TELETEXT_THUMBNAIL_SCALE}
      fontFamily={TELETEXT_FONT_FAMILY}
      cell={TELETEXT_CELL}
      testId="teletext-native-thumbnail"
    />
  );
}

interface ScreenGalleryProps {
  items: GalleryItem[];
  onOpen: (path: string) => void;
  /** Draw placeholder cards while the board's index is on its way. */
  isLoading?: boolean;
  /** The theme this gallery is looking through, which the file route needs. */
  theme?: string;
  /**
   * Controls under a card. They sit outside the card's own <button>, because
   * a control inside a button is invalid HTML.
   */
  renderBelow?: (item: GalleryItem) => ReactNode;
}

/** One card. Draws nothing until it is scrolled to. */
function GalleryCard(
  { item, onOpen, theme }: { item: GalleryItem; onOpen: (path: string) => void; theme?: string },
) {
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
  const { data: fetched, isFetching } = useQuery({
    // The theme is part of the KEY because it is part of the ANSWER: the same
    // path read through two themes has different readers.
    queryKey: item.source?.queryKey ?? ['screen-file', item.path, theme ?? 'default'],
    // A placeholder has no file behind it; asking would be a 404 per card.
    // A card whose screen has no drawing in the CHOSEN format has nothing to
    // show: fetching the fallback would cost a request to draw art that
    // answers a different question from the one the gallery was asked.
    enabled: visible && !item.placeholder && !item.missingFormat,
    queryFn: async () => {
      await acquire();
      try {
        // The PAYLOAD, not the content string. ScreenFilesPage and the
        // artist's dialog cache this same key and both read `.content` off an
        // object; a card storing the bare string meant whichever mounted
        // second read `undefined` and tried to decode it - which is why every
        // screen in the studio said "These bytes cannot be read as ANSI art".
        // One key, one shape.
        if (item.source) return await item.source.fetch();
        const res = await apiClient.getScreenFile(item.path, theme);
        return (res.data ?? null) as { content?: string } | null;
      } catch {
        return null;
      } finally {
        release();
      }
    },
  });
  const content = fetched?.content ?? null;

  return (
    <button
      ref={ref}
      type="button"
      /* `block w-full` because this button is no longer the grid item itself -
         a wrapper holds it and the drift line below it. A button is
         inline-block by default, so without these it shrink-wraps its content
         and the card overflows its column, which is what broke the gallery
         layout the moment the drift line was added. */
      className="block w-full text-left border border-border hover:border-border-strong p-2 space-y-1"
      onClick={() => onOpen(item.path)}
    >
      <div className={`relative h-32 overflow-hidden ${item.placeholder || item.missingFormat ? 'bg-surface-2' : 'bg-black'}`}>
        {isFetching && !item.placeholder && (
          <span
            data-testid="card-updating"
            title="Fetching the latest bytes"
            className="absolute right-1 top-1 z-10 h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent"
          />
        )}
        {item.missingFormat
          /*
           * NOT DRAWN IN THE FORMAT THAT WAS ASKED FOR.
           *
           * Showing the ANSI art here was the complaint: "i still see the
           * fallbacks". A thumbnail of a drawing that exists in a DIFFERENT
           * format reads as "this screen has PETSCII" however the caption is
           * worded, so the gap is drawn as a gap - the same dashed box an
           * undrawn screen gets, which is exactly what this is.
           */
          ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed border-border text-content-muted">
              <span className="text-2xl leading-none">+</span>
              <span className="text-xs">No {item.missingFormat}</span>
            </div>
          )
          : item.placeholder
          // An invitation, not a thumbnail: there is no file yet, and the card
          // exists so an artist can see the gap and click into it.
          ? (
            <div className="flex h-full w-full items-center justify-center border border-dashed border-border text-content-muted">
              <span className="text-2xl leading-none">+</span>
            </div>
          )
          : content
            ? <Thumbnail content={content} format={item.format} />
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

        {item.missingFormat && (
          <span className="block truncate text-status-warn">
            Not drawn in {item.missingFormat}
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
                : item.badge.kind === 'todo'
                  ? 'mt-1 inline-block px-1 rounded-sm border border-dashed border-accent text-accent'
                  : 'mt-1 inline-block px-1 rounded-sm border border-dashed border-border text-content-muted'
            }
          >
            {item.badge.label}
          </span>
        )}
        {!item.placeholder && (
          /*
           * THE FILE THIS CARD STANDS FOR.
           *
           * A screen with a theme's redraw beside the board's own gets TWO
           * cards, which is the point - you can see what a caller is served
           * with the theme and without it. Both were captioned with the same
           * screen and the same scope, so the only thing telling them apart
           * was the badge: "still why is there two conf bulls for amiga demos
           * listed? doesnt make sense?" (sysop, 2026-09-19). The path is the
           * answer to that question and it was the one thing the card did not
           * say.
           */
          <span
            className="block truncate font-mono text-content-muted"
            title={item.path}
            data-testid="card-path"
          >
            {item.path}
          </span>
        )}
        {item.formats && (
          <span className="mt-1 flex gap-1" data-testid="format-chips">
            {([
              ['ANSI', item.formats.ansi],
              ['SEQ', item.formats.petscii],
              ['RIP', item.formats.rip],
              ['TTX', item.formats.teletext],
              ['TTI', item.formats.teletextNative],
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

/**
 * DRIFT, said once and quietly - and openable.
 *
 * This card stands for the version the most scopes read; the others are the
 * same screen edited somewhere else and never reconciled. Without this line
 * the grouping would simply HIDE them, and a node serving different art would
 * have no explanation anywhere in the admin, which is the failure this board
 * keeps finding - leaderboards frozen by a theme copy nobody could see,
 * quicknew serving last week's files.
 *
 * Opening it WRITES NOTHING. It names the other versions and where they are
 * read, and that is all: reconciling a screen rewrites files an artist did not
 * open, and a rewrite that happens because somebody looked at a card is not
 * something the revision store can make anybody comfortable about.
 */
function DriftDisclosure({ item }: { item: GalleryItem }) {
  const [open, setOpen] = useState(false);
  const others = (item.otherVersions ?? []) as Array<Array<{
    relPath?: string;
    readBy?: Array<{ scopeName?: string }>;
  }>>;

  return (
    <>
      <button
        type="button"
        onClick={event => { event.stopPropagation(); setOpen(value => !value); }}
        /* `text-xs` explicitly: the card's own labels get it from the text
           block INSIDE the button, and this line lives outside that button so
           it inherits the page size instead - which made the drift line the
           largest thing in the gallery. */
        className="block w-full text-left truncate text-xs text-status-warn underline decoration-dotted"
        data-testid="drift"
      >
        {item.versions} versions
        {item.scopes !== undefined && item.otherScopes !== undefined
          ? ` - serving ${item.scopes} of ${item.scopes + item.otherScopes} scopes`
          : ''}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 text-xs text-content-secondary">
          {others.map(version => {
            const file = version[0];
            const where = version
              .flatMap(copy => copy.readBy?.map(reader => reader.scopeName) ?? [])
              .filter(Boolean);
            return (
              <li key={file?.relPath ?? Math.random()} className="truncate">
                <span className="font-mono">{file?.relPath}</span>
                {where.length > 0 && <span> - {where.join(', ')}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function ScreenGallery({ items, onOpen, isLoading = false, theme, renderBelow }: ScreenGalleryProps) {
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
        <div key={item.path} className="min-w-0 space-y-1">
          <GalleryCard item={item} onOpen={onOpen} theme={theme} />
          {/* OUTSIDE the card's own <button>. A button inside a button is
              invalid HTML, and React says so - the drift control was briefly
              nested and every query for it matched two elements. */}
          {(item.versions ?? 1) > 1 && <DriftDisclosure item={item} />}
          {renderBelow?.(item)}
        </div>
      ))}
    </div>
  );
}
