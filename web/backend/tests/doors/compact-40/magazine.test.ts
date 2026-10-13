/**
 * MAG, the Underground Mag reader, on the three screens the board serves
 * (door-three-screens skill, section 5).
 *
 *  - V1  80x24 is pinned, 40x25 stays inside 40 columns with chrome of one row
 *        and no effect running, 132x40 sets three columns.
 *  - V2  the front page is the editor's frontpage.json and nothing else:
 *        empty -> AWAITING EDITOR, never a story picked by the reader.
 *  - V3  REACHABILITY, once: the shipped bundle (Doors/magazine/dist, driven
 *        through `door.execute()` exactly as executeTypeScriptDoor calls it) is
 *        run against a Magazine/ written by the board's OWN writer
 *        (`refreshMagazine`), and a token that exists only in a story file is on
 *        the wire after the keys that open it. jest cannot `import()` a door by
 *        file URL, so this runs in a child process like drive-grandmaster-40.
 *  - V4  the .info mark is read off the real file the board registers; the
 *        executeDoor gate itself is exercised for MAG in
 *        marked-doors-launch-on-c64.test.ts.
 *
 * Every other behaviour is tested where it lives: the column maths in
 * Doors/magazine/tests/columns.test.ts, the rows in layout.test.ts, the keys
 * and effects on a driven screen in reader.test.ts. They run under
 * `npm test` through dev/scripts/run-door-suites.ts.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { AnsiToPetsciiTransducer, PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

jest.mock('../../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../../src/services/DoorDropFileManager');
jest.mock('../../../src/services/CallersLogManager');

import { executeDoor, getDoors, initializeDoors, setDoors, setHelpers } from '../../../src/handlers/door.handler';
import { doorDropFileManager } from '../../../src/services/DoorDropFileManager';
import { loadCommandFromInfo } from '../../../src/utils/amiga-command-parser.util';
import { readTooltypeMap } from '../../../src/utils/info-file.util';
import { refreshMagazine, writeApproved } from '../../../src/services/magazine';
import { storyId } from '../../../src/services/magazine/story-store';
import { config } from '../../../src/config';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import { buildAwaitingEditor, buildArticle, buildLayout, buildListing, rowText } from '../../../../../Doors/magazine/layout';
import { columnCount, columnGeometry } from '../../../../../Doors/magazine/columns';
import type { Story } from '@amiexpress/bbs-door-sdk/formats/magazine';

setHelpers({ callersLog: async () => undefined, getRecentCallerActivity: async () => [] });

const REPO = path.resolve(__dirname, '../../../../..');
const MAG_INFO = path.join(REPO, 'Commands/BBSCmd/MAG.info');
const DRIVER = path.join(__dirname, 'fixtures/drive-magazine.cjs');

// ---------------------------------------------------------------------------
// V1: the three screens
// ---------------------------------------------------------------------------

const STORY: Story = {
  id: 'a1',
  headline: 'Skaven releases Copper Lights, a new 64k intro for the Amiga',
  summary: ('The Amiga demoscene has a new release this week. It runs on a stock A500 with half a megabyte.\n\n'
    + 'A second paragraph explains how the music was composed in a tracker and ported to the player. ').repeat(5),
  format: 'RELEASE', desk: 'scene', date: '2026-10-13', source: 'demozoo.org', url: 'https://demozoo.org/p/1/',
  firstSeen: '2026-10-13', seenCount: 1,
};

describe('MAG across the three screens', () => {
  it('80x24: two columns of 37 with a 3-wide gutter, regions pinned', () => {
    const l = buildLayout(80, 24);
    expect(l.geometry).toEqual({ cols: 2, colWidth: 37, gutter: 3, margin: 1, contentWidth: 77 });
    expect({ ticker: l.tickerRow, panelTop: l.panelTop, panelHeight: l.panelHeight, progress: l.progressRow, footer: l.footerRow })
      .toEqual({ ticker: 1, panelTop: 2, panelHeight: 20, progress: 22, footer: 23 });
    const rows = buildArticle(STORY, l).spreads[0].map(rowText);
    expect(rows[0]).toBe(' [ RELEASE // SCENE // 2026-10-13 ]'.padEnd(78));
    expect(rows[3]).toBe(' The Amiga demoscene has a new release │ A second paragraph explains how the  ');
  });

  it('40x25: one column, every painted row within 40, chrome of one row, no effect', () => {
    const l = buildLayout(40, 25);
    expect(l.geometry.cols).toBe(1);
    expect(l.collapseChrome).toBe(true);
    expect(l.effects).toBe(false);
    expect(l.tickerRow).toBeNull();
    const spreads = [
      ...buildArticle({ ...STORY, summary: STORY.summary.repeat(6) }, l).spreads,
      buildAwaitingEditor(l),
    ];
    for (const spread of spreads) {
      expect(spread).toHaveLength(l.panelHeight);
      for (const row of spread) expect(rowText(row).length).toBeLessThanOrEqual(40);
    }
    const listing = buildListing(
      [{ kind: 'item', item: { storyId: 'x', page: 120, title: 'A long headline '.repeat(6), unread: true, bookmarked: true } }],
      'x', l, { left: 'CONTENTS - ALL SECTIONS', right: '2026-10-13' },
    );
    for (const row of listing.spreads[0]) expect(rowText(row).length).toBeLessThanOrEqual(40);
  });

  it('132x40: three columns that keep a readable measure', () => {
    const l = buildLayout(132, 40);
    expect(columnCount(132)).toBe(3);
    expect(l.geometry.cols).toBe(3);
    expect(l.geometry.colWidth).toBeLessThanOrEqual(38);
    expect(l.geometry.margin).toBeGreaterThan(1);
    for (const row of buildArticle(STORY, l).spreads[0]) expect(rowText(row).length).toBeLessThanOrEqual(132);
  });

  it('the column count is read from the width, never fixed (width rule)', () => {
    expect([40, 80, 100, 120, 132].map((w) => columnGeometry(w).cols)).toEqual([1, 2, 2, 3, 3]);
  });
});

// ---------------------------------------------------------------------------
// V2 + V3: a Magazine/ written by the board's own writer, read through MAG
// ---------------------------------------------------------------------------

const TOKEN = 'REDACTED';
const HEADLINE = 'Skaven releases Copper Lights for Amiga';

let root: string;
const realConfigGet = config.get.bind(config);
const saved = { data: process.env.BBS_DATA_DIR, bbs: process.env.BBS_ROOT };

function writeMagazine(approve: boolean): string {
  const deps = { rootDir: () => root, now: () => new Date('2026-10-13T12:00:00Z'), log: () => {} };
  const incoming = path.join(root, 'Magazine', 'incoming');
  fs.mkdirSync(incoming, { recursive: true });
  fs.writeFileSync(path.join(incoming, 'feed.json'), JSON.stringify([
    {
      headline: HEADLINE,
      summary: `The demoscene group released a new intro. ${TOKEN} appears nowhere except in this story file.`,
      source: 'demozoo.org',
      date: '2026-10-13',
    },
  ]));
  if (approve) writeApproved(root, [storyId(HEADLINE)]);
  refreshMagazine(deps);
  return storyId(HEADLINE);
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-launch-'));
  process.env.BBS_DATA_DIR = root;
  process.env.BBS_ROOT = root;
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'Doors/magazine'), path.join(root, 'Doors/magazine'));
  fs.copyFileSync(MAG_INFO, path.join(root, 'Commands/BBSCmd/MAG.info'));
});

afterAll(() => {
  for (const [key, value] of [['BBS_DATA_DIR', saved.data], ['BBS_ROOT', saved.bbs]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  jest.spyOn(config, 'get').mockImplementation((key: any) => (key === 'dataDir' ? root : realConfigGet(key)));
  (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
  setDoors([]);
  fs.rmSync(path.join(root, 'Magazine'), { recursive: true, force: true });
});

afterEach(() => jest.restoreAllMocks());

async function registerMag() {
  const def = loadCommandFromInfo(path.join(root, 'Commands/BBSCmd/MAG.info'));
  if (!def) throw new Error('MAG.info did not parse');
  const { commandCache } = require('../../../src/handlers/command-execution.handler');
  commandCache.bbscmd.clear();
  commandCache.bbscmd.set(def.name, def);
  await initializeDoors();
  return getDoors().find((d) => d.command === 'MAG')!;
}

interface Drive {
  /** Everything the door wrote, in order. */
  captured: string[];
  errors: string[];
  ended: boolean;
  /** The wire with escape sequences removed: what a person would read. */
  text: string;
  /** Screen codes of a C64 after the bytes were replayed (petscii runs only). */
  glass: number[];
}

function drive(spec: { cols: number; rows: number; petscii: boolean; steps: Array<{ key: string; wait: number }> }): Drive {
  const out = execFileSync(process.execPath, [DRIVER, JSON.stringify(spec)], {
    cwd: path.dirname(DRIVER),
    env: { ...process.env, BBS_DATA_DIR: root, BBS_ROOT: root },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const { captured, errors, ended } = JSON.parse(out) as { captured: string[]; errors: string[]; ended: boolean };
  let glass: number[] = [];
  if (spec.petscii) {
    const transducer = new AnsiToPetsciiTransducer();
    const machine = new PetsciiMachine();
    for (const chunk of captured) machine.feed(transducer.transduce(chunk));
    glass = Array.from(machine.state.screen).slice(0, spec.cols * spec.rows);
  }
  return { captured, errors, ended, glass, text: captured.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '') };
}

jest.setTimeout(120000);

describe('MAG: the shipped bundle reads the magazine the board wrote', () => {
  it('opens a story from the board\'s own files, and the front page waits for the editor (V2 + V3)', () => {
    writeMagazine(false);
    const run = drive({
      cols: 80, rows: 24, petscii: false,
      steps: [{ key: 'c', wait: 300 }, { key: '\r', wait: 600 }, { key: 'q', wait: 300 }],
    });
    expect(run.errors).toEqual([]);
    // V2: nothing approved, so the front page says so and prints no story.
    // The first frame is what the caller sees before pressing anything.
    const firstFrame = run.captured.slice(0, Math.max(1, run.captured.findIndex((c) => c.includes('CONTENTS')))).join('');
    expect(firstFrame.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')).toContain('AWAITING EDITOR');
    expect(firstFrame).not.toContain(HEADLINE.toUpperCase());
    // V3: the token lives only in the story file, so seeing it on the wire
    // proves library.ts read Magazine/stories/<id>.json written by the board.
    expect(run.text).toContain('CONTENTS - ALL SECTIONS');
    expect(run.text).toContain('SKAVEN RELEASES COPPER LIGHTS');
    expect(run.text).toContain(TOKEN);
    expect(run.ended).toBe(true);
  });

  it('shows the front page the editor approved', () => {
    writeMagazine(true);
    const run = drive({ cols: 80, rows: 24, petscii: false, steps: [{ key: 'q', wait: 300 }] });
    expect(run.errors).toEqual([]);
    expect(run.text).not.toContain('AWAITING EDITOR');
    expect(run.text).toContain('Skaven releases Copper Lights');
  });

  it('on a 40x25 PETSCII caller the headline is on the glass, in one column, with nothing unmappable', () => {
    writeMagazine(true);
    const run = drive({
      cols: 40, rows: 25, petscii: true,
      steps: [{ key: '\r', wait: 600 }],
    });
    expect(run.errors).toEqual([]);
    expect(run.glass).toHaveLength(40 * 25);
    const lines: string[] = [];
    for (let y = 0; y < 25; y++) {
      lines.push(run.glass.slice(y * 40, (y + 1) * 40).map((c) => screenCodeChar(c)).join(''));
    }
    const screenText = lines.join('\n');
    expect(screenText).toContain('SKAVEN RELEASES COPPER');
    // The footer legitimately says `?: Help`; the panel must hold no `?` of its own,
    // which is what an unmappable glyph (a story's curly quote, a rule) would print.
    expect(lines.slice(1, 23).join('\n')).not.toContain('?');
    expect(screenText).toContain('REDACTED');
    expect(lines.filter((l) => l.trim()).length).toBeGreaterThan(8);
  });
});

/**
 * C64 screen code to the character the oracle shows. In the lowercase/uppercase
 * set the board uses, ASCII lowercase sits at 1-26 and ASCII uppercase at
 * 65-90; anything the test did not draw on purpose comes back as `#`.
 */
function screenCodeChar(code: number): string {
  const c = code & 0x7f;
  if (c === 0 || c === 32) return ' ';
  if (c >= 1 && c <= 26) return String.fromCharCode(96 + c);
  if (c >= 65 && c <= 90) return String.fromCharCode(c);
  if (c >= 33 && c <= 63) return String.fromCharCode(c);
  return '#';
}

// ---------------------------------------------------------------------------
// V4: the mark, read off the file the board registers
// ---------------------------------------------------------------------------

describe('MAG.info', () => {
  it('is marked MIN_COLUMNS=40, so a C64 caller is let in', async () => {
    const tt = Object.fromEntries(readTooltypeMap(MAG_INFO));
    expect(tt.MIN_COLUMNS).toBe('40');
    expect(tt.BBSCMD).toBe('MAG');
    expect(tt.LOCATION).toBe('Doors/magazine');
    const door = await registerMag();
    expect(door.minColumns).toBe(40);
  });
});
