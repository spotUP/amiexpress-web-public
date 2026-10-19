/**
 * A story's pictures as rows the reader sets in a column (plan
 * 2026-10-19-mag-linked-media-ascii, M9). The converted rows live in the
 * story's sidecar (written by the backend); this turns the one stored at the
 * caller's column width into painted rows, reusing the art row readers so an
 * ANSI picture and a .seq picture reach the screen exactly as board art does.
 */
import { FULLSCREEN_COLS, renderingKey, type StoryMedia, type StoryMediaSidecar } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { artRowText, ansiRows, seqRows } from './art';

/** The sidecar and the caller's terminal: what buildArticle needs to place pictures. */
export interface ArticleMedia {
  sidecar: StoryMediaSidecar | null;
  /** True when the caller reads .seq rows (a C64, or a screen of forty columns or fewer). */
  petscii: boolean;
}

export interface PictureRow {
  raw: string;
  text: string;
}

/** The rendering for `colWidth`: the exact width, else the widest narrower one. Null when none. */
export function pictureRows(
  sidecar: StoryMediaSidecar | null,
  mediaIndex: number,
  petscii: boolean,
  colWidth: number,
): PictureRow[] | null {
  const picture = sidecar?.pictures.find((p) => p.media === mediaIndex);
  if (!picture) return null;
  const terminal = petscii ? 'petscii' : 'ansi';
  let best: { cols: number; rows: string[] } | null = null;
  for (const [key, rendering] of Object.entries(picture.renderings)) {
    if (key === renderingKey(terminal, rendering.cols, 'column') && rendering.cols <= colWidth && rendering.rows.length > 0) {
      if (!best || rendering.cols > best.cols) best = rendering;
    }
  }
  if (!best) return null;
  return paintRows(best.rows, best.cols, petscii, Math.floor((colWidth - best.cols) / 2));
}

/** Stored rows as painted rows of `cols` cells, each led by `pad` blanks. */
function paintRows(rows: readonly string[], cols: number, petscii: boolean, pad: number): PictureRow[] {
  const lead = ' '.repeat(Math.max(0, pad));
  return rows.map((row) => {
    const raw = petscii
      ? seqRows(Buffer.from(row, 'base64'), 1, cols)[0] ?? ''
      : ansiRows(Buffer.from(row, 'latin1'), 1, cols, 'latin1')[0] ?? '';
    return { raw: lead + raw, text: lead + artRowText(raw).padEnd(cols) };
  });
}

/**
 * The fullscreen rendering the viewer shows (D11): 80x24 ANSI or 40x24 PETSCII,
 * always at the stored size (the viewer centres it). Null when the sidecar has none.
 */
export function fullscreenRows(
  sidecar: StoryMediaSidecar | null,
  mediaIndex: number,
  petscii: boolean,
): { cols: number; rows: PictureRow[] } | null {
  const picture = sidecar?.pictures.find((p) => p.media === mediaIndex);
  const terminal = petscii ? 'petscii' : 'ansi';
  const cols = FULLSCREEN_COLS[terminal];
  const rendering = picture?.renderings[renderingKey(terminal, cols, 'full')];
  if (!rendering || rendering.rows.length === 0) return null;
  return { cols, rows: paintRows(rendering.rows, cols, petscii, 0) };
}

/** What the item is and where it comes from (D7): `IMG site` or `VIDEO site`. */
export function mediaCredit(media: StoryMedia): string {
  return `${media.kind !== 'image' ? 'VIDEO' : 'IMG'}${media.site ? ' ' + media.site : ''}`;
}

/** `>> IMG site  [V] view` / `>> VIDEO site  [V] play`, in the source trailer's style (D11). */
export function creditLine(media: StoryMedia): string {
  return `>> ${mediaCredit(media)}  [V] ${media.kind !== 'image' ? 'play' : 'view'}`;
}
