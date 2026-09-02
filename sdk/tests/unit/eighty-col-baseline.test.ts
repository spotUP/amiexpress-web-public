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
 * To confirm the harness still bites, mutate one layout constant (e.g.
 * `sdk/engines/ui/blessed/core/screen.ts` line 107, `: 80` -> `: 79`) and
 * re-run: the geometry tests and the painted-buffer snapshots must fail.
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
    const painted = rows(screen);
    expectEightyWide(painted);
    expect(painted).toMatchSnapshot();
  });

  it('centered bordered modal (modal-centring-shaped)', () => {
    screen = new Screen({ title: 'baseline', width: 80, height: 24 } as any);
    new Box({
      parent: screen, top: 'center', left: 'center', width: 50, height: 10,
      border: { type: 'line' }, align: 'center', valign: 'middle', tags: true,
      content: 'Are you sure you want to continue?',
    } as any);
    screen.render();
    const painted = rows(screen);
    expectEightyWide(painted);
    expect(painted).toMatchSnapshot();
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
    const painted = rows(screen);
    expectEightyWide(painted);
    expect(painted).toMatchSnapshot();
  });
});
