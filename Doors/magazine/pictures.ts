/**
 * A story's pictures as rows the reader sets in a column (plan
 * 2026-10-19-mag-linked-media-ascii, M9). The converted rows live in the
 * story's sidecar (written by the backend); this turns the one stored at the
 * caller's column width into painted rows, reusing the art row readers so an
 * ANSI picture and a .seq picture reach the screen exactly as board art does.
 */
import { FULLSCREEN_COLS, renderingKey, type SidecarPlacement, type StoryMedia, type StoryMediaSidecar } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { artRowText, ansiRows, seqRows } from './art';
import { cellsToAnsiRows, cellsToPetsciiRows, type AnsiCellGrid } from '@amiexpress/bbs-door-sdk/media/ascii';

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

/** The widest `placement` rendering no wider than `width`, centred in it. Null when none. */
function placedRows(
  sidecar: StoryMediaSidecar | null,
  mediaIndex: number,
  petscii: boolean,
  placement: SidecarPlacement,
  width: number,
): PictureRow[] | null {
  const picture = sidecar?.pictures.find((p) => p.media === mediaIndex);
  if (!picture) return null;
  const terminal = petscii ? 'petscii' : 'ansi';
  let best: { cols: number; rows: string[] } | null = null;
  for (const [key, rendering] of Object.entries(picture.renderings)) {
    if (key === renderingKey(terminal, rendering.cols, placement) && rendering.cols <= width && rendering.rows.length > 0) {
      if (!best || rendering.cols > best.cols) best = rendering;
    }
  }
  if (!best) return null;
  return paintRows(best.rows, best.cols, petscii, Math.floor((width - best.cols) / 2));
}

/** The rendering for `colWidth`: the exact width, else the widest narrower one. Null when none. */
export function pictureRows(
  sidecar: StoryMediaSidecar | null,
  mediaIndex: number,
  petscii: boolean,
  colWidth: number,
): PictureRow[] | null {
  return placedRows(sidecar, mediaIndex, petscii, 'column', colWidth);
}

/**
 * The still set across every column of a spread, centred in `contentWidth`.
 * ANSI only: a C64 reads one column. Null when the sidecar predates it.
 */
export function spanRows(
  sidecar: StoryMediaSidecar | null,
  mediaIndex: number,
  contentWidth: number,
): PictureRow[] | null {
  return placedRows(sidecar, mediaIndex, false, 'span', contentWidth);
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

/**
 * One decoded video frame as painted rows, the way the stored fullscreen
 * rendering is painted (same emitters the ingest uses, same row readers), so a
 * frame and the poster it rests on look alike. `pad` blanks lead each row.
 */
export function frameRows(cells: AnsiCellGrid, petscii: boolean, pad: number): PictureRow[] {
  const cols = cells[0]?.length ?? 0;
  const stored = petscii
    ? cellsToPetsciiRows(cells).map((r) => Buffer.from(r).toString('base64'))
    : cellsToAnsiRows(cells);
  return paintRows(stored, cols, petscii, pad);
}
