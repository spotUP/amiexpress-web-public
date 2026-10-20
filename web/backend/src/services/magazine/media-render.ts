/**
 * MAGAZINE MEDIA RENDER (plan 2026-10-19-mag-linked-media-ascii, M7).
 *
 * At ingest each picture of a story is fetched once (shared budget), run
 * through the ONE SDK converter at every size in the Limits table, and the
 * rows are written to the story's sidecar. Failures are recorded once on
 * `story.media[i].failure` and never retried (D6); the story text is not
 * touched. A republish does not refetch a picture whose URL the sidecar holds.
 */
import * as fs from 'fs';
import {
  rowsForAspect,
  SIDECAR_RENDER_REVISION,
  sidecarPath,
  sidecarSizes,
  type SidecarPicture,
  type Story,
  type StoryMediaSidecar,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { cellsToAnsiRows, cellsToPetsciiRows, frameToAnsiCells, SUB_X, SUB_Y } from '@amiexpress/bbs-door-sdk/media/ascii';
import { fetchPoster, type MediaFetchDeps, type Pixels } from './media-fetch';

/** The converter, injectable so a test can count its calls. */
export interface RenderDeps extends MediaFetchDeps {
  convert?: typeof frameToAnsiCells;
}

/** RGBA to the RGB triples the converter reads. */
function rgbOf(p: Pixels): Uint8Array {
  const out = new Uint8Array(p.width * p.height * 3);
  for (let i = 0, o = 0; i < p.data.length; i += 4, o += 3) {
    out[o] = p.data[i]; out[o + 1] = p.data[i + 1]; out[o + 2] = p.data[i + 2];
  }
  return out;
}

type RgbSource = { data: Uint8Array; width: number; height: number; channels: 3 };

/**
 * The picture centred on black in a frame of the box's shape (cols x rows
 * cells of SUB_X x SUB_Y), the way ffmpeg pads a clip. The converter fills
 * whatever box it gets, so without this a fullscreen still, or a column
 * picture whose rows hit the cap, was stretched to the box.
 */
export function letterbox(src: RgbSource, cols: number, rows: number): RgbSource {
  const boxW = cols * SUB_X;
  const boxH = rows * SUB_Y;
  let width = src.width;
  let height = Math.round((src.width * boxH) / boxW);
  if (height < src.height) {
    height = src.height;
    width = Math.round((src.height * boxW) / boxH);
  }
  if (width === src.width && height === src.height) return src;
  const data = new Uint8Array(width * height * 3);
  const left = Math.floor((width - src.width) / 2);
  const top = Math.floor((height - src.height) / 2);
  for (let y = 0; y < src.height; y++) {
    data.set(src.data.subarray(y * src.width * 3, (y + 1) * src.width * 3), ((top + y) * width + left) * 3);
  }
  return { data, width, height, channels: 3 };
}

/** Every size of one decoded picture. */
export function renderPicture(p: Pixels, convert: typeof frameToAnsiCells = frameToAnsiCells): SidecarPicture['renderings'] {
  const source: RgbSource = { data: rgbOf(p), width: p.width, height: p.height, channels: 3 };
  const out: SidecarPicture['renderings'] = {};
  for (const size of sidecarSizes()) {
    // A fullscreen rendering is a fixed size (D11); a column still follows the aspect.
    const rows = size.placement === 'full' ? size.maxRows : rowsForAspect(p.width, p.height, size.cols, size.maxRows);
    const cells = convert(letterbox(source, size.cols, rows), size.cols, rows, { palette: size.terminal === 'petscii' ? 'c64' : 'amiga16' });
    out[size.key] = {
      cols: size.cols,
      rows: size.terminal === 'petscii'
        ? cellsToPetsciiRows(cells).map((r) => Buffer.from(r).toString('base64'))
        : cellsToAnsiRows(cells),
    };
  }
  return out;
}

export function readSidecar(storyFilePath: string): StoryMediaSidecar | null {
  try {
    const s = JSON.parse(fs.readFileSync(sidecarPath(storyFilePath), 'utf8')) as StoryMediaSidecar;
    return s.version === 1 && Array.isArray(s.pictures) ? s : null;
  } catch {
    return null;
  }
}

export interface RenderOutcome {
  /** The story's media with `failure` set where a picture was dropped. */
  media: Story['media'];
  rendered: number;
  failed: number;
  /** Pictures kept from the existing sidecar without a fetch. */
  reused: number;
}

/**
 * Render every picture of `story`. Writes the sidecar through `write` and
 * returns the media list with failures recorded. A picture that already has a
 * `failure` is skipped (never retried), except 'story-cap': stories ingested
 * while a per-story picture cap existed carry it, and the picture itself was
 * never tried. One the old sidecar holds for the
 * same URL under the current SIDECAR_RENDER_REVISION is reused, so a republish never refetches (M13; the retention half
 * is `removeStoryMedia` in index.ts).
 */
export async function renderStoryMedia(
  story: Pick<Story, 'media'>,
  storyFilePath: string,
  deps: RenderDeps,
  write: (target: string, contents: string) => void,
): Promise<RenderOutcome> {
  const media = (story.media ?? []).map((m) => ({ ...m }));
  for (const m of media) if (m.failure === 'story-cap') delete m.failure;
  const old = readSidecar(storyFilePath);
  const pictures: SidecarPicture[] = [];
  const out: RenderOutcome = { media, rendered: 0, failed: 0, reused: 0 };

  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    if (m.failure) continue;
    const kept = old?.pictures.find((p) => p.media === i && p.url === m.url && p.render === SIDECAR_RENDER_REVISION);
    if (kept) { pictures.push(kept); out.reused++; continue; }
    const got = await fetchPoster(m, deps);
    if (typeof got === 'string') { m.failure = got; out.failed++; continue; }
    pictures.push({ media: i, url: m.url, render: SIDECAR_RENDER_REVISION, renderings: renderPicture(got.pixels, deps.convert) });
    out.rendered++;
  }
  if (pictures.length) {
    const sidecar: StoryMediaSidecar = { version: 1, pictures };
    write(sidecarPath(storyFilePath), JSON.stringify(sidecar));
  }
  return out;
}
