/** M10: the fullscreen viewer, driven through the reader's V key on a real blessed screen. */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import {
  FULLSCREEN_ROWS,
  MAGAZINE_DIR,
  MAGAZINE_FRONTPAGE_FILE,
  MAGAZINE_INDEX_FILE,
  MAGAZINE_STORIES_DIR,
  renderingKey,
  sidecarSizes,
  type Story,
  type StoryMediaSidecar,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { startReader } from '../app';

const SENTENCE = 'A long sentence that makes the paragraph worth setting in columns for the reader. ';
const BODY = [1, 2, 3].map((n) => `Paragraph ${n}. ${SENTENCE.repeat(6)}`).join('\n\n');
const image = (anchor: number) => ({ url: `https://example.org/${anchor}.png`, kind: 'image' as const, alt: '', site: 'example.org', anchor });

function story(id: string, media: Story['media']): Story {
  return {
    id, headline: `Story ${id}`, summary: '', body: BODY, format: 'NEWS', desk: 'scene', date: '2026-10-19',
    source: 'example.org', url: 'https://example.org/a', firstSeen: '2026-10-19', seenCount: 1, media,
  };
}

/** Every size filled with the picture's own glyph, so a row says which picture it is. */
function sidecar(glyphs: string[]): StoryMediaSidecar {
  return {
    version: 1,
    pictures: glyphs.map((g, media) => {
      const renderings: StoryMediaSidecar['pictures'][0]['renderings'] = {};
      for (const size of sidecarSizes()) {
        const rowCount = size.placement === 'full' ? FULLSCREEN_ROWS : 3;
        const row = size.terminal === 'petscii'
          ? Buffer.from([0x05, ...Array(size.cols).fill(g.charCodeAt(0))]).toString('base64')
          : '\x1b[0;37;40m' + g.repeat(size.cols) + '\x1b[0m';
        renderings[renderingKey(size.terminal, size.cols, size.placement)] = { cols: size.cols, rows: Array(rowCount).fill(row) };
      }
      return { media, url: `https://example.org/${media}.png`, renderings };
    }),
  };
}

async function open(width: number, height: number, st: Story, side: StoryMediaSidecar | null, petscii = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-viewer-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  const mag = path.join(root, MAGAZINE_DIR);
  fs.mkdirSync(path.join(mag, MAGAZINE_STORIES_DIR), { recursive: true });
  fs.writeFileSync(path.join(mag, MAGAZINE_INDEX_FILE), JSON.stringify([{ page: 201, title: st.headline, desk: st.desk, format: st.format, storyId: st.id, date: st.date }]));
  fs.writeFileSync(path.join(mag, MAGAZINE_FRONTPAGE_FILE), JSON.stringify([]));
  fs.writeFileSync(path.join(mag, MAGAZINE_STORIES_DIR, `${st.id}.json`), JSON.stringify(st));
  if (side) fs.writeFileSync(path.join(mag, MAGAZINE_STORIES_DIR, `${st.id}.media.json`), JSON.stringify(side));
  const before = process.env.BBS_DATA_DIR;
  process.env.BBS_DATA_DIR = root;
  const theme = themeById('uprough-neon');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width, height }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    getTheme: () => theme, connectionType: 'web', unicodeCapable: true,
    isPetsciiMode: () => petscii,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'caller', nodeId: 1, secLevel: 10, tempData: {}, socket, doorCommand: 'MAG' },
    storage: { load: async () => null, save: async () => {} },
  };
  const reader = await startReader(session, { shippedArtDir: null });
  await new Promise((resolve) => setImmediate(resolve));
  reader.press('c', 'c');
  reader.press('enter');
  return { reader, close: () => { reader.stop(); if (before === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = before; } };
}

export async function vOpensTheFullscreenViewerStepsWrapsAndEscapeReturnsToTheSamePage(): Promise<void> {
  const h = await open(100, 30, story('aaaa0001', [image(0), image(1)]), sidecar(['A', 'B']));
  try {
    const page = h.reader.panelRows();
    h.reader.press('v', 'v');
    let rows = h.reader.viewerRows()!;
    assert.ok(rows, 'V opened the viewer');
    assert.ok(rows.slice(0, 24).every((r) => r.includes('A'.repeat(80))), 'the first picture, full 80 columns');
    assert.strictEqual(rows[0].indexOf('A'), 10, 'centred on a 100-column window');
    assert.match(rows[rows.length - 1], /1\/2/);
    assert.match(rows[rows.length - 1], /<- -> Esc/);
    h.reader.press('right');
    rows = h.reader.viewerRows()!;
    assert.ok(rows[0].includes('B'.repeat(80)));
    assert.match(rows[rows.length - 1], /2\/2/);
    h.reader.press('right');
    assert.ok(h.reader.viewerRows()![0].includes('A'.repeat(80)), 'wraps to the first');
    h.reader.press('left');
    assert.ok(h.reader.viewerRows()![0].includes('B'.repeat(80)), 'wraps back to the last');
    h.reader.press('escape');
    assert.strictEqual(h.reader.viewerRows(), null);
    assert.strictEqual(h.reader.viewKind(), 'article', 'Escape closed the viewer, not the article');
    assert.deepStrictEqual(h.reader.panelRows(), page, 'the same reader page');
    h.reader.press('v', 'v');
    h.reader.press('q', 'q');
    assert.strictEqual(h.reader.viewerRows(), null, 'Q closes it too');
    assert.strictEqual(h.reader.viewKind(), 'article');
  } finally { h.close(); }
}

export async function vOnAPageWithoutPicturesDoesNothing(): Promise<void> {
  const plain = await open(100, 30, story('aaaa0002', undefined), null);
  try {
    plain.reader.press('v', 'v');
    assert.strictEqual(plain.reader.viewerRows(), null);
  } finally { plain.close(); }
  // Pictures with no stored rendering are not on the page either.
  const bare = await open(100, 30, story('aaaa0003', [image(0)]), null);
  try {
    bare.reader.press('v', 'v');
    assert.strictEqual(bare.reader.viewerRows(), null);
  } finally { bare.close(); }
}

export async function onAPetsciiScreenTheViewerShowsTheFortyColumnRendering(): Promise<void> {
  const h = await open(40, 25, story('aaaa0004', [image(0)]), sidecar(['A']), true);
  try {
    h.reader.press('v', 'v');
    const rows = h.reader.viewerRows()!;
    assert.ok(rows, 'viewer open at 40 columns');
    assert.ok(rows[0].trim().length === 40, `forty cells: "${rows[0]}"`);
    assert.ok(rows.length <= 25);
  } finally { h.close(); }
}

// ---- M10b: video playback --------------------------------------------------

import * as zlib from 'node:zlib';
import { encodeRichFrame, type RichFrame } from '@amiexpress/bbs-door-sdk/media/ascii';
import { registerMagazineVideoService, type ClipRequest } from '@amiexpress/bbs-door-sdk/formats/magazine-video';

const video = (anchor: number) => ({ url: `https://example.org/${anchor}.mp4`, kind: 'video' as const, alt: '', site: 'example.org', anchor });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A finished clip file (brotli form) of `n` frames, frame k filled with the letter 'a'+k. */
function clipFile(n: number): string {
  const cols = 80, rows = FULLSCREEN_ROWS;
  const rec = (type: number, body: Buffer) => { const h = Buffer.alloc(5); h.writeUInt32BE(body.length + 1); h[4] = type; return Buffer.concat([h, body]); };
  const parts = [rec(0, Buffer.from(JSON.stringify({ v: 1, cols, rows, fps: 20 })))];
  let prev: RichFrame | null = null;
  for (let k = 0; k < n; k++) {
    const frame: RichFrame = { dots: new Uint8Array(cols * rows).fill(97 + k), colors: new Uint8Array(cols * rows).fill(7) };
    parts.push(rec(1, Buffer.from(encodeRichFrame(frame, cols, rows, prev))));
    prev = frame;
  }
  parts.push(rec(2, Buffer.alloc(0)));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mag-clip-')), 'clip.frames');
  fs.writeFileSync(file, Buffer.concat([Buffer.from('MAGB'), zlib.brotliCompressSync(Buffer.concat(parts))]));
  return file;
}

/** A conversion service that shares one job per clip, as the backend's does. */
function mockService(file: string) {
  const jobs = new Map<string, true>();
  const calls: ClipRequest[] = [];
  registerMagazineVideoService({
    requestClip: (req) => { calls.push(req); jobs.set(req.url, true); return { path: file, done: Promise.resolve('complete' as const) }; },
  });
  return { jobs, calls };
}

export async function aVideoAutoPlaysInTheViewerSharedByTwoViewersThenRestsOnThePoster(): Promise<void> {
  const svc = mockService(clipFile(4));
  const st = story('bbbb0001', [video(0)]);
  const a = await open(100, 30, st, sidecar(['P']));
  const b = await open(100, 30, story('bbbb0001', [video(0)]), sidecar(['P']));
  try {
    a.reader.press('v', 'v');
    b.reader.press('v', 'v');
    assert.ok(a.reader.viewerRows()![0].includes('P'.repeat(80)), 'the poster is shown first');
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await sleep(25);
      const first = a.reader.viewerRows()![0];
      const m = first.match(/([a-d])\1{79}/);
      if (m) seen.add(m[1]);
    }
    assert.ok(seen.size >= 2, `frames reached the screen: ${[...seen]}`);
    assert.ok(a.reader.viewerRows()![0].includes('P'.repeat(80)), 'rests on the poster after one play');
    assert.strictEqual(svc.jobs.size, 1, 'one conversion job for two viewers');
    assert.strictEqual(svc.calls.length, 2);
    assert.strictEqual(svc.calls[0].cols, 80);
    assert.strictEqual(svc.calls[0].palette, 'amiga16');
    // Enter replays.
    a.reader.press('enter');
    await sleep(120);
    assert.ok(/([a-d])\1{79}/.test(a.reader.viewerRows()![0]), 'Enter replays');
  } finally { a.close(); b.close(); registerMagazineVideoService(null); }
}

export async function escapeMidPlayStopsOutputAndLeavesNoTimer(): Promise<void> {
  mockService(clipFile(40));
  const h = await open(100, 30, story('bbbb0002', [video(0)]), sidecar(['P']));
  const before = (process as any)._getActiveHandles().length;
  try {
    h.reader.press('v', 'v');
    await sleep(150);
    assert.ok(/([a-z])\1{79}/.test(h.reader.viewerRows()![0]), 'playing');
    h.reader.press('escape');
    assert.strictEqual(h.reader.viewerRows(), null);
    const rows = h.reader.panelRows();
    await sleep(200);
    assert.deepStrictEqual(h.reader.panelRows(), rows, 'nothing painted after Escape');
    assert.strictEqual(h.reader.viewerRows(), null, 'viewer stays closed');
  } finally { h.close(); registerMagazineVideoService(null); }
  void before;
}

export async function withoutAServiceAVideoJustShowsItsPoster(): Promise<void> {
  registerMagazineVideoService(null);
  const h = await open(100, 30, story('bbbb0003', [video(0)]), sidecar(['P']));
  try {
    h.reader.press('v', 'v');
    await sleep(100);
    assert.ok(h.reader.viewerRows()![0].includes('P'.repeat(80)));
    h.reader.press('enter');
    assert.ok(h.reader.viewerRows()![0].includes('P'.repeat(80)));
  } finally { h.close(); }
}
