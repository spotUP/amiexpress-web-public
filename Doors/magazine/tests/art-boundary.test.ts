/**
 * M11: the art loader boundary. Generated picture rows (the story's
 * `<id>.media.json` sidecar) are never read from, or overridden by,
 * `Magazine/art`; the art loader only ever answers to the closed ART_NAMES
 * set, so no story id, sidecar name or picture key can address it.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import {
  FULLSCREEN_ROWS,
  MAGAZINE_DIR,
  MAGAZINE_INDEX_FILE,
  MAGAZINE_STORIES_DIR,
  renderingKey,
  sidecarSizes,
  type Story,
  type StoryMediaSidecar,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { startReader } from '../app';
import { loadSidecar } from '../library';
import { ART_NAMES, loadArt } from '../art';

const BODY = [1, 2, 3].map((n) => `Paragraph ${n}. ${'A long sentence that makes the paragraph worth setting in columns for the reader. '.repeat(6)}`).join('\n\n');
// The id is an art name on purpose: the worst collision the id grammar allows.
const ID = 'mag_article_end';

const story: Story = {
  id: ID, headline: 'Collision', summary: '', body: BODY, format: 'NEWS', desk: 'scene', date: '2026-10-19',
  source: 'example.org', url: 'https://example.org/a', firstSeen: '2026-10-19', seenCount: 1,
  media: [{ url: 'https://example.org/0.png', kind: 'image', alt: '', site: 'example.org', anchor: 1 }],
};

function sidecar(glyph: string): StoryMediaSidecar {
  const renderings: StoryMediaSidecar['pictures'][0]['renderings'] = {};
  for (const size of sidecarSizes()) {
    const rowCount = size.placement === 'full' ? FULLSCREEN_ROWS : 3;
    const row = size.terminal === 'petscii'
      ? Buffer.from([0x05, ...Array(size.cols).fill(glyph.charCodeAt(0))]).toString('base64')
      : '\x1b[0;37;40m' + glyph.repeat(size.cols) + '\x1b[0m';
    renderings[renderingKey(size.terminal, size.cols, size.placement)] = { cols: size.cols, rows: Array(rowCount).fill(row) };
  }
  return { version: 1, pictures: [{ media: 0, url: story.media![0].url, renderings }] };
}

/** Every name a hand-made screen could take to collide with the generated picture of `ID`. */
const COLLIDING = [
  `${ID}.ans`, `${ID}.seq`, `${ID}.media.json`, `${ID}.media.ans`, `${ID}.media.seq`, `${ID}.json`,
  `art_${ID}.ans`, `${ID}-0.ans`, `${ID}.0.ans`, 'media.ans', 'picture.ans',
];

async function open(artDir: string, root: string) {
  const before = process.env.BBS_DATA_DIR;
  process.env.BBS_DATA_DIR = root;
  const theme = themeById('uprough-neon');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 100, height: 30 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    getTheme: () => theme, connectionType: 'web', unicodeCapable: true,
    isPetsciiMode: () => false,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'caller', nodeId: 1, secLevel: 10, tempData: {}, socket, doorCommand: 'MAG' },
    storage: { load: async () => null, save: async () => {} },
  };
  const reader = await startReader(session, { shippedArtDir: artDir });
  await new Promise((resolve) => setImmediate(resolve));
  reader.press('c', 'c');
  reader.press('enter');
  return { reader, close: () => { reader.stop(); if (before === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = before; } };
}

function board(withSidecar: boolean): { root: string; art: string; stories: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-artb-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  const mag = path.join(root, MAGAZINE_DIR);
  const stories = path.join(mag, MAGAZINE_STORIES_DIR);
  const art = path.join(mag, 'art');
  fs.mkdirSync(stories, { recursive: true });
  fs.mkdirSync(art, { recursive: true });
  fs.writeFileSync(path.join(mag, MAGAZINE_INDEX_FILE), JSON.stringify([{ page: 201, title: story.headline, desk: story.desk, format: story.format, storyId: story.id, date: story.date }]));
  fs.writeFileSync(path.join(stories, `${ID}.json`), JSON.stringify(story));
  if (withSidecar) fs.writeFileSync(path.join(stories, `${ID}.media.json`), JSON.stringify(sidecar('A')));
  return { root, art, stories };
}

export async function artFilesNamedLikeAStoryOrItsSidecarNeverReplaceOrFeedThePictureRows(): Promise<void> {
  const b = board(true);
  // Poison: colliding art files, one of them a complete foreign sidecar.
  for (const name of COLLIDING) {
    fs.writeFileSync(path.join(b.art, name), name.endsWith('.media.json') ? JSON.stringify(sidecar('Z')) : '\x1b[0;31;40m' + 'Z'.repeat(80) + '\x1b[0m\n'.repeat(3));
  }
  const h = await open(b.art, b.root);
  try {
    const page = h.reader.panelRows().join('\n');
    h.reader.press('v', 'v');
    const rows = h.reader.viewerRows();
    assert.ok(rows, 'V opened the viewer from the sidecar');
    assert.ok(rows.slice(0, 24).every((r) => r.includes('A'.repeat(80))), 'viewer rows are the sidecar rows');
    assert.ok(![page, ...rows].some((r) => r.includes('Z')), 'nothing from Magazine/art reached a picture row');
  } finally { h.close(); }
}

export async function aSidecarSittingOnlyInTheArtFolderGivesTheStoryNoPictures(): Promise<void> {
  const b = board(false);
  fs.writeFileSync(path.join(b.art, `${ID}.media.json`), JSON.stringify(sidecar('Z')));
  assert.strictEqual(loadSidecar(ID, path.join(b.root, MAGAZINE_DIR)), null, 'loadSidecar reads the stories folder only');
  const h = await open(b.art, b.root);
  try {
    h.reader.press('v', 'v');
    assert.strictEqual(h.reader.viewerRows(), null, 'no sidecar for the story, no viewer');
    assert.ok(!h.reader.panelRows().join('\n').includes('Z'));
  } finally { h.close(); }
}

export async function theArtLoaderAnswersOnlyToArtNamesAndNeverReadsASidecar(): Promise<void> {
  const b = board(true);
  fs.writeFileSync(path.join(b.art, `${ID}.media.json`), '{}');
  const sources = { shippedDir: b.art };
  for (const kind of ['ans', 'seq'] as const) {
    // A sidecar in the art folder is not art: no art name resolves to a .json file.
    assert.strictEqual(loadArt(`${ID}.media`, kind, sources), null);
  }
  assert.ok(ART_NAMES.every((n) => !/\.|\//.test(n)), 'every art name is a bare name: no extension, no path');
  // The generated sidecar in the stories folder is out of the loader's reach.
  fs.copyFileSync(path.join(b.stories, `${ID}.media.json`), path.join(b.stories, `${ID}.ans`));
  assert.strictEqual(loadArt(ID, 'ans', sources), null, 'the loader never looks outside its art folder');
}
