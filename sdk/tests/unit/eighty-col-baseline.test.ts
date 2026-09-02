/**
 * 80-column render regression baseline (C64/40-col plan, Task 2).
 *
 * NON-NEGOTIABLE (b), sysop 2026-09-02: enabling responsive/XXS in the
 * blessed SDK must render byte-identically at 80 columns. These snapshots
 * are the proof. They land BEFORE any SDK layout change and must stay
 * green through every later task of the 40-col plan. If one of these
 * snapshots ever needs updating, that IS an 80-column rendering change -
 * stop and take it to the sysop.
 *
 * HOW THE GOLDENS WERE PRODUCED (regeneration recipe for a reviewer):
 *   cd sdk
 *   rm tests/unit/__snapshots__/eighty-col-baseline.test.ts.snap
 *   npx jest --testPathPattern=eighty-col-baseline
 * Jest writes the .snap file itself from the real painted screen buffer -
 * nothing in it is hand-typed. Each row is read straight out of
 * `screen.buffer` (the same buffer the renderer serialises to the wire),
 * one string per screen row, using the buffer-reading pattern proven in
 * `sdk/tests/unit/modal-centring.test.ts:17-38`. The widgets are the real
 * SDK widgets driven through their real constructors and `screen.render()`,
 * and the geometry cases go through `createScreen()` - the entry point
 * every blessed door actually calls.
 *
 * WHAT THE SNAPSHOT COVERS: both halves of every buffer cell. The buffer is
 * `[y][x] = [attr, char]` with attr 27-bit packed as
 * `(flags << 18) | (fg << 9) | bg` (screen.ts:38-41). Serialising only `char`
 * would let a colour or highlight regression through silently, so each row
 * appears TWICE in the snapshot: a `chr` line (the glyphs, delimited by `|` so
 * trailing spaces stay visible) and an `att` line (the packed attrs, hex,
 * run-length encoded as `<hex>*<count>` to keep the .snap reviewable). A glyph
 * change breaks the `chr` line; a colour change breaks the `att` line.
 *
 * To confirm the harness still bites, mutate one layout constant (e.g.
 * `sdk/engines/ui/blessed/core/screen.ts` line 107, `: 80` -> `: 79`) or one
 * colour (e.g. a widget's default border fg) and re-run: the geometry tests
 * and/or the painted-buffer snapshots must fail.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';
import { List } from '../../engines/ui/blessed/widgets/list';
import { Panel } from '../../engines/ui/blessed/widgets/panel';
import { createScreen } from '../../utils/blessed-helpers';

/** Every painted row of the screen, as plain strings (modal-centring pattern). */
function rows(screen: any): string[] {
  const out: string[] = [];
  for (let y = 0; y < screen.height; y++) {
    const row = screen.buffer[y];
    out.push(row ? row.map((c: [number, string]) => c[1]).join('') : '');
  }
  return out;
}

/**
 * The packed attributes of one row, run-length encoded as `<hex>*<count>`.
 * Attr is `(flags << 18) | (fg << 9) | bg`, so this catches a foreground,
 * background, bold or reverse change that leaves the glyphs untouched.
 */
function attrRuns(row: [number, string][] | undefined): string {
  if (!row) return '';
  const runs: string[] = [];
  let current = row[0]?.[0];
  let count = 0;
  for (const cell of row) {
    if (cell[0] === current) {
      count++;
    } else {
      runs.push(`${(current >>> 0).toString(16)}*${count}`);
      current = cell[0];
      count = 1;
    }
  }
  if (count > 0) runs.push(`${(current >>> 0).toString(16)}*${count}`);
  return runs.join(' ');
}

/**
 * The full painted screen: for each row, its glyphs AND its attributes.
 * This - not `rows()` alone - is what gets snapshotted, so that a colour
 * regression at 80 columns cannot pass silently.
 */
function paintedScreen(screen: any): string[] {
  const out: string[] = [];
  const chars = rows(screen);
  for (let y = 0; y < chars.length; y++) {
    const label = String(y).padStart(2, '0');
    out.push(`${label} chr |${chars[y]}|`);
    out.push(`${label} att ${attrRuns(screen.buffer[y])}`);
  }
  return out;
}

describe('80-column baseline: default Screen geometry', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('a bare Screen is exactly 80x24', () => {
    screen = new Screen({ title: 'baseline' } as any);
    expect(screen.getDimensions()).toEqual({ width: 80, height: 24 });
  });

  it('createScreen against an 80x25 BBS stays 80x25 (non-responsive path)', () => {
    const written: string[] = [];
    const bbs: any = {
      write: (t: string) => written.push(t),
      connectionType: 'web',
      getTerminalSize: () => ({ width: 80, height: 25 }),
    };
    screen = createScreen(bbs, { title: 'baseline' });
    expect(screen.getDimensions()).toEqual({ width: 80, height: 25 });
    // Non-responsive: setDimensions must pin width back to 80 even when
    // asked for less (screen.ts:540) - the legacy contract.
    screen.setDimensions(23, 60);
    expect(screen.getDimensions().width).toBe(80);
  });
});

describe('80-column baseline: painted buffers', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  /** Every painted row is exactly 80 cells wide - the byte-level invariant. */
  function expectEightyWide(painted: string[]): void {
    for (const row of painted) {
      expect(row).toHaveLength(80);
    }
  }

  it('masthead + footer + list/detail panel layout (doorman-shaped)', () => {
    screen = new Screen({ title: 'baseline', width: 80, height: 24 } as any);
    new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: 3, tags: true, focusable: false } as any);
    new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true, focusable: false } as any);
    const listPanel = new Panel({ parent: screen, top: 3, left: 0, width: '35%', height: '100%-6', focusable: false } as any);
    new List({
      parent: listPanel, top: 1, left: 1, width: '100%-2', height: '100%-2',
      keys: true, mouse: false, scrollable: true, tags: true,
      items: ['Alpha Door', 'Beta Door', 'Gamma Door', 'Delta Door'],
    } as any);
    new Box({
      parent: screen, top: 3, left: '35%', width: '65%', height: '100%-6',
      border: { type: 'line' }, tags: true, content: 'Detail panel content, eighty columns wide.',
    } as any);
    screen.render();
    expectEightyWide(rows(screen));
    expect(paintedScreen(screen)).toMatchSnapshot();
  });

  it('centered bordered modal (modal-centring-shaped)', () => {
    screen = new Screen({ title: 'baseline', width: 80, height: 24 } as any);
    new Box({
      parent: screen, top: 'center', left: 'center', width: 50, height: 10,
      border: { type: 'line' }, align: 'center', valign: 'middle', tags: true,
      content: 'Are you sure you want to continue?',
    } as any);
    screen.render();
    expectEightyWide(rows(screen));
    expect(paintedScreen(screen)).toMatchSnapshot();
  });

  it('full-width list with selection', () => {
    screen = new Screen({ title: 'baseline', width: 80, height: 24 } as any);
    const list = new List({
      parent: screen, top: 0, left: 0, width: '100%', height: '100%',
      keys: true, mouse: false, tags: true,
      items: Array.from({ length: 10 }, (_, i) => `Item number ${i + 1} with some descriptive text`),
    } as any);
    (list as any).select(3);
    screen.render();
    expectEightyWide(rows(screen));
    expect(paintedScreen(screen)).toMatchSnapshot();
  });
});
