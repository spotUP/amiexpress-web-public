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
