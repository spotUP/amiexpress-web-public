/**
 * MAG MEDIA RENDERED AT INGEST (plan 2026-10-19-mag-linked-media-ascii, M6 + M7).
 *
 * ONE reachability test drives the real prefetch entry (`prefetchBodies`) with a
 * mocked article page holding three images and one video between paragraphs.
 * Everything else is tested where it lives: aspect/row cap, failure once,
 * reuse of a stored picture, oEmbed address.
 */
import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';
import {
  MAGAZINE_DIR,
  MAGAZINE_STORIES_DIR,
  renderingKey,
  rowsForAspect,
  sidecarPath,
  sidecarSizes,
  columnGeometry,
  MAX_MEASURE,
  type Story,
  type StoryMediaSidecar,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { frameToAnsiCells } from '@amiexpress/bbs-door-sdk/media/ascii';
import { createRobotsCache, defaultPrefetchDeps, prefetchBodies, type HttpResult } from '../../src/services/magazine/body-prefetch';
import { oembedEndpoint, fetchPoster, createMediaBudget } from '../../src/services/magazine/media-fetch';
import { readSidecar, renderStoryMedia } from '../../src/services/magazine/media-render';
import { writeAtomic } from '../../src/services/magazine';

jest.mock('axios');
const get = axios.get as unknown as jest.Mock;

function png(w: number, h: number): Buffer {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    p.data[o] = (x * 255) / w; p.data[o + 1] = (y * 255) / h; p.data[o + 2] = 90; p.data[o + 3] = 255;
  }
  return PNG.sync.write(p);
}
function jpg(w: number, h: number): Buffer {
  const data = Buffer.alloc(w * h * 4, 160);
  return jpeg.encode({ data, width: w, height: h }, 80).data;
}
const reply = (body: Buffer, type: string) => ({
  status: 200, data: body.buffer.slice(body.byteOffset, body.byteOffset + body.length), headers: { 'content-type': type },
});

const URL_A = 'https://www.example.org/news/2026/story.html';
const PARA = 'The relay chassis hums while the old contacts click through their sequence and the clock finds its second tick.';
const NOW = new Date('2026-10-19T12:00:00Z');

const PAGE = `<html><body><article><h1>T</h1>
<p>${PARA} 1.</p><img src="/p/a.png" alt="A">
<p>${PARA} 2.</p><img src="/p/b.jpg" alt="B">
<p>${PARA} 3.</p><img src="/p/c.png" alt="C">
<p>${PARA} 4.</p><video poster="/p/v.png"><source src="/p/clip.mp4"></video>
${Array.from({ length: 10 }, (_, i) => `<p>${PARA} n${i}.</p>`).join('')}</article></body></html>`;

let root: string;
const dir = (): string => path.join(root, MAGAZINE_DIR, MAGAZINE_STORIES_DIR);
const base: Story = {
  id: 's1', headline: 'Headline s1', summary: 'Teaser.', format: 'NEWS', desk: 'hack', date: '2026-10-19',
  source: 'example.org', url: URL_A, firstSeen: '2026-10-19T10:00:00Z', seenCount: 1, origin: 'feed',
};

beforeEach(() => {
  get.mockReset();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-render-'));
  fs.mkdirSync(dir(), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const robotsOk: HttpResult = { status: 200, body: 'User-agent: *\nDisallow:\n', contentType: 'text/plain' };

describe('prefetch renders the story pictures into the sidecar', () => {
  it('three images and a video poster: every size, tier width and row cap, anchors on the paragraphs, converter ran', async () => {
    fs.writeFileSync(path.join(dir(), 's1.json'), JSON.stringify(base));
    get.mockImplementation(async (url: string) => {
      if (url.endsWith('/a.png')) return reply(png(300, 150), 'image/png');
      if (url.endsWith('/b.jpg')) return reply(jpg(120, 400), 'image/jpeg');
      if (url.endsWith('/c.png')) return reply(png(200, 200), 'image/png');
      if (url.endsWith('/v.png')) return reply(png(320, 180), 'image/png');
      return { status: 404, data: new ArrayBuffer(0), headers: {} };
    });
    const convert = jest.fn(frameToAnsiCells);
    const http = jest.fn(async (url: string): Promise<HttpResult> =>
      url.endsWith('/robots.txt') ? robotsOk : { status: 200, body: PAGE, contentType: 'text/html' });
    const d = {
      ...defaultPrefetchDeps({ rootDir: () => root, now: () => NOW, log: () => {} }, createRobotsCache()),
      http, gate: jest.fn(async () => {}), convert,
    };
    const out = await prefetchBodies(d);
    expect(out.fetched).toBe(1);

    const storyPath = path.join(dir(), 's1.json');
    const story = JSON.parse(fs.readFileSync(storyPath, 'utf8')) as Story;
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath(storyPath), 'utf8')) as StoryMediaSidecar;
    expect(story.media).toHaveLength(4);
    expect(story.media!.every((m) => !m.failure)).toBe(true);
    // anchor = count of body paragraphs before the picture; the heading is paragraph 1
    const paras = story.body!.split('\n\n');
    story.media!.forEach((m, i) => expect(paras[m.anchor - 1]).toContain(` ${i + 1}.`));
    expect(sidecar.pictures.map((p) => p.media)).toEqual([0, 1, 2, 3]);

    const sizes = sidecarSizes();
    expect(sizes.map((s) => s.cols)).toEqual([columnGeometry(80).colWidth, MAX_MEASURE, columnGeometry(40).colWidth, 80, 40]);
    expect(convert).toHaveBeenCalledTimes(4 * sizes.length); // the SDK converter ran, once per picture per size
    for (const pic of sidecar.pictures) {
      expect(Object.keys(pic.renderings).sort()).toEqual(sizes.map((s) => s.key).sort());
      for (const s of sizes) {
        const r = pic.renderings[s.key];
        expect(r.cols).toBe(s.cols);
        expect(r.rows.length).toBeGreaterThanOrEqual(1);
        expect(r.rows.length).toBeLessThanOrEqual(s.maxRows);
        if (s.placement === 'full') expect(r.rows).toHaveLength(24);
        if (s.terminal === 'petscii') expect(Buffer.from(r.rows[0], 'base64').length).toBeGreaterThan(0);
      }
    }
    // The tall picture hits the column cap; the wide one stays under it.
    expect(sidecar.pictures[1].renderings[renderingKey('ansi', MAX_MEASURE, 'column')].rows).toHaveLength(12);
    expect(sidecar.pictures[0].renderings[renderingKey('ansi', MAX_MEASURE, 'column')].rows.length).toBeLessThan(12);
    // Measured for the plan's Storage paragraph.
    fs.writeFileSync('/private/tmp/claude-501/-Users-spot-Code-AmiExpress-amiexpress-web/e5cf2cb1-c5fb-4f2b-9b1d-b6454ce161ba/scratchpad/m7-size.txt', String(fs.statSync(sidecarPath(storyPath)).size / 4));
  });
});

describe('where the logic lives', () => {
  it('rowsForAspect: cells are twice as tall as wide, capped, at least one row', () => {
    expect(rowsForAspect(400, 200, 38, 12)).toBe(10); // 38 * 0.5 / 2 = 9.5
    expect(rowsForAspect(100, 1000, 38, 12)).toBe(12);
    expect(rowsForAspect(1000, 10, 38, 12)).toBe(1);
  });

  it('records a failure once on the media entry, leaves the others, and never refetches the failed one', async () => {
    get.mockImplementation(async (url: string) =>
      url.endsWith('/ok.png') ? reply(png(200, 100), 'image/png') : { status: 404, data: new ArrayBuffer(0), headers: {} });
    const deps = {
      now: () => NOW, robots: createRobotsCache(), gate: jest.fn(async () => {}),
      http: jest.fn(async () => robotsOk), convert: jest.fn(frameToAnsiCells),
    };
    const file = path.join(dir(), 's2.json');
    const media = [
      { url: 'https://img.example.org/ok.png', kind: 'image' as const, alt: '', site: 'example.org', anchor: 1 },
      { url: 'https://img.example.org/gone.png', kind: 'image' as const, alt: '', site: 'example.org', anchor: 2 },
    ];
    const first = await renderStoryMedia({ media }, file, deps, writeAtomic);
    expect(first.media![1].failure).toBe('404');
    expect(first.media![0].failure).toBeUndefined();
    expect(readSidecar(file)!.pictures.map((p) => p.media)).toEqual([0]);
    const calls = get.mock.calls.length;
    const second = await renderStoryMedia({ media: first.media }, file, deps, writeAtomic);
    expect(get.mock.calls.length).toBe(calls); // stored URL reused, failed one not retried
    expect(second).toMatchObject({ reused: 1, rendered: 0, failed: 0 });
  });

  it('oembedEndpoint maps YouTube and Vimeo embeds, refuses others', () => {
    expect(oembedEndpoint('https://www.youtube.com/embed/abc123')).toContain('youtube.com/oembed');
    expect(oembedEndpoint('https://player.vimeo.com/video/99')).toContain('vimeo.com/api/oembed.json');
    expect(oembedEndpoint('https://ads.example.net/frame')).toBeNull();
  });

  it('an embed poster is the oEmbed thumbnail through the image path; a clip with no ffmpeg is no-ffmpeg', async () => {
    get.mockResolvedValue(reply(png(160, 120), 'image/png'));
    const http = jest.fn(async (url: string): Promise<HttpResult> =>
      url.includes('oembed') ? { status: 200, body: JSON.stringify({ thumbnail_url: 'https://i.ytimg.com/vi/abc/hq.png' }) } : robotsOk);
    const deps = { now: () => NOW, robots: createRobotsCache(), gate: jest.fn(async () => {}), http, tools: { ffmpeg: null, ytDlp: null, ffprobe: null } };
    const r = await fetchPoster({ url: 'https://www.youtube.com/embed/abc', kind: 'embed' }, createMediaBudget(), deps);
    expect(r).toEqual({ pixels: expect.objectContaining({ width: 160, height: 120 }) });
    expect(await fetchPoster({ url: 'https://cdn.example.org/clip.mp4', kind: 'video' }, createMediaBudget(), deps)).toBe('no-ffmpeg');
  });
});
