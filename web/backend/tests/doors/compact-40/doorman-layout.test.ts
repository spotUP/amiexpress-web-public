/**
 * DOORMAN at 40x25 (C64/PETSCII XXS tier) - C64 40-col plan, Task 6, and the
 * sysop's 2026-09-02 screenshot report.
 *
 * RED, captured from the real layout through the construction createApp used
 * to perform (`new Screen({...})` with no geometry, a 40x25 caller), the byte
 * stream replayed onto a 40x25 grid. Max CUP column: 70, on a 40-column
 * screen.
 *
 *   03|.- INSTALLED DOORS --------..-----------
 *   04||--------------------------||
 *   05|| > [TS] Grandmaster       || Name:    G
 *   06|rand[TS]ePengo             || Command: G
 *   07|M   [68] Doorman Legacy    || Type:    T
 *   08|S                          || Size:    K
 *   09|B0                         || Status:  E
 *
 * The door built its Screen with no geometry, so it painted 80 columns wide
 * whatever the caller's canvas was: the 35%/65% pair landed at x=0 and x=28
 * of an 80-column layout on a 40-column screen, which is the folded name
 * column and the size cells on the wrong rows.
 *
 * The fix is the root: the Screen comes from createScreen(bbs), and
 * DoormanLayout asks the SDK's compact profile what to do with the width it
 * gets. This suite builds the REAL DoormanLayout against a real Screen and
 * asserts resolved coordinates and rendered cells - not a source pin.
 */
import * as fs from 'fs';
import * as path from 'path';
const { Screen } = require('../../../../../sdk/engines/ui/blessed');
// The compiled module the door actually loads (its package exports map points
// at sdk/dist), so a spy here is the spy the door sees through the barrel.
const chrome = require('../../../../../sdk/dist/engines/ui/theme/chrome');
const { createScreen } = require('../../../../../sdk/utils/blessed-helpers');
const { FrameReconstructor } = require('../../../../../sdk/petscii/frame/ansi-screen');
const { DoormanLayout } = require('../../../../../Doors/door-manager/doorman-layout');
const { installedFooter } = require('../../../../../Doors/door-manager/installed-footer');

type Coords = { xi: number; xl: number; yi: number; yl: number };

/** Printable width of a row, blessed tags and ANSI escapes removed. */
const printable = (s: string): number =>
  s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\{[^}]*\}/g, '').length;

function coords(el: any): Coords {
  const c = el._getCoords(true) || el._getCoords();
  return { xi: c.xi, xl: c.xl, yi: c.yi, yl: c.yl };
}

describe('DOORMAN layout on a 40x25 screen', () => {
  let screen: any;
  let layout: any;

  afterEach(() => {
    try { layout?.stopMasthead?.(); } catch { /* leaving anyway */ }
    try { screen?.destroy(); } catch { /* leaving anyway */ }
  });

  it('every panel stays inside 40 columns', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    screen.render();
    for (const panel of [layout.header, layout.footer, layout.listPanel, layout.infoPanel]) {
      const c = coords(panel);
      expect(c.xi).toBeGreaterThanOrEqual(0);
      expect(c.xl).toBeLessThanOrEqual(40);
    }
  });

  it('the list and the info pane are stacked, not squeezed side by side', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    screen.render();
    const list = coords(layout.listPanel);
    const info = coords(layout.infoPanel);
    // Both full width...
    expect(list.xl - list.xi).toBe(40);
    expect(info.xl - info.xi).toBe(40);
    // ...and one strictly below the other, so no row carries both.
    expect(info.yi).toBeGreaterThanOrEqual(list.yl);
  });

  it('the header and footer are one row, not three', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    expect(layout.compact.collapseChrome).toBe(true);
    const header = coords(layout.header);
    const footer = coords(layout.footer);
    expect(header.yl - header.yi).toBe(1);
    expect(footer.yl - footer.yi).toBe(1);
  });

  it('the list text column is sized from the screen, not from 35% of 80', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    expect(layout.narrow).toBe(true);
    expect(layout.width).toBe(34);
  });

  // Through the layout's OWN row builder, not a re-implementation of its
  // arithmetic here: if the two ever disagree, this test stops meaning
  // anything, so there is only one of them.
  it('a real installed-door row fits 40 columns, long name and all', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    const row = layout.installedRow({
      type: 'TS', name: 'DOORMAN Door Manager And Then Some More Name', size: 245760, enabled: true,
    });
    expect(printable(row)).toBeLessThanOrEqual(40);
    expect(row).toContain('[TS]');
    expect(row).toContain('240 KB');
  });

  it('the narrow footer fits the row the wide one folds', () => {
    expect(printable(installedFooter(true, true))).toBeLessThanOrEqual(40);
    expect(printable(installedFooter(true, false))).toBeGreaterThan(40);
  });

  // The effect gate. On the PETSCII canvas the sysop saw stray glyphs from
  // the masthead's moving rail; at XXS no timer is started at all and the
  // row carries the static title instead.
  it('40 columns: the masthead does not animate and the row shows the title', () => {
    screen = new Screen({ width: 40, height: 25, responsive: true } as any);
    layout = new DoormanLayout(screen, 1);
    // attachMasthead returns a real stop function; the no-op form is what the
    // gate substitutes. Calling it must be safe and must stop nothing.
    expect(typeof layout.stopMasthead).toBe('function');
    expect(layout.stopMasthead!()).toBeUndefined();
    const mastheadRow = layout.header.children[0];
    expect(mastheadRow.getContent()).toContain('DOORMAN');
    // A rail would have put its run of slashes on the row.
    expect(mastheadRow.getContent()).not.toContain('/');
  });

  // The gate, at the call itself. Content alone cannot tell the two apart on
  // a rail-less theme (attachMasthead writes ' DOORMAN ' too), so this spies
  // on the SDK function the door would have to call to start a timer.
  it('40 columns: the SDK masthead is never attached; 80 columns: it is', () => {
    const spy = jest.spyOn(chrome, 'attachMasthead');
    try {
      screen = new Screen({ width: 40, height: 25, responsive: true } as any);
      layout = new DoormanLayout(screen, 1);
      expect(spy).not.toHaveBeenCalled();
      layout.stopMasthead?.();
      screen.destroy();

      spy.mockClear();
      screen = new Screen({ width: 80, height: 24, responsive: false } as any);
      layout = new DoormanLayout(screen, 1);
      expect(spy).toHaveBeenCalledTimes(1);
      // ...and drawn to the SCREEN's width, not to a constant.
      expect(spy.mock.calls[0][2].width).toBe(77);
    } finally {
      spy.mockRestore();
    }
  });

  // The root of the sysop's report: the door used to build its Screen with
  // `new Screen({...})` and no geometry, so a 40-column caller got an
  // 80-column canvas. This is the composition createApp now performs.
  it('createScreen(bbs) on a PETSCII caller gives DOORMAN a narrow layout', () => {
    const bbs = {
      write: () => undefined,
      connectionType: 'web',
      getTerminalSize: () => ({ width: 40, height: 25 }),
    };
    screen = createScreen(bbs, { smartCSR: true, fullUnicode: true, title: 'DOORMAN v2' });
    expect(screen.width).toBe(40);
    layout = new DoormanLayout(screen, 1);
    expect(layout.narrow).toBe(true);
    screen.render();
    const info = coords(layout.infoPanel);
    expect(info.xl).toBeLessThanOrEqual(40);
  });

  // ...and that it is the composition the door performs, not one this file
  // invented: createApp builds its Screen through the helper, never directly.
  it('createApp builds its Screen through createScreen, not `new Screen`', () => {
    const app = fs.readFileSync(
      path.resolve(__dirname, '../../../../../Doors/door-manager/app.ts'), 'utf8');
    expect(app).toContain('createScreen(bbs, {');
    expect(app).not.toMatch(/=\s*new Screen\(/);
  });

  it('80 columns: the layout is the one the board has always drawn', () => {
    screen = new Screen({ width: 80, height: 24, responsive: false } as any);
    layout = new DoormanLayout(screen, 1);
    screen.render();
    expect(layout.narrow).toBe(false);
    expect(layout.width).toBe(20);
    const header = coords(layout.header);
    expect(header.yl - header.yi).toBe(3);
    const list = coords(layout.listPanel);
    const info = coords(layout.infoPanel);
    // Side by side, exactly as before: the list on the left 35%, the info
    // pane starting where it ends.
    expect(list.xi).toBe(0);
    expect(list.xl).toBe(28);
    expect(info.xi).toBe(28);
    expect(info.xl).toBe(80);
    expect(list.yi).toBe(3);
    expect(info.yi).toBe(3);
  });
});

// ─── The 80-column render, pinned cell by cell ───────────────────────────────
//
// The grid below was captured from the door BEFORE this change - main's
// DoormanLayout on `new Screen({ width: 80, height: 24, ... })`, the byte
// stream replayed onto an 80x24 (glyph, SGR) grid by the SDK's own
// FrameReconstructor. Painted through createScreen it is IDENTICAL, glyph for
// glyph and attribute for attribute; only the wire is shorter (5586 -> 4886
// bytes), because createScreen's screen style spares blessed a redundant
// blank-fill pass. A compact change that alters an 80-column board's screen
// is a regression, not a feature.
const EIGHTY_COL_GRID: string[] = [
  ".------------------------------------------------------------------------------.",
  "| DOORMAN                                                                      |",
  "`------------------------------------------------------------------------------'",
  ".- INSTALLED DOORS --------..--------------------------------------------------.",
  "|                          ||                                                  |",
  "| > [TS] Grandmaster       || Name:    Grandmaster                             |",
  "|   [TS] Pengo             || Command: GM                                      |",
  "|   [68] Doorman Legacy    || Type:    TS                                      |",
  "|                          || Size:    240 KB                                  |",
  "|                          || Status:  ENABLED                                 |",
  "|                          ||                                                  |",
  "|                          ||                                                  |",
  "|                          ||                                                  |",
  "|                          ||                                                  |",
  "|                          ||                                                  |",
  "|                          ||                                                  |",
  "|                          ||                                                  |",
  "|                          ||                                                  |",
  "|                          ||                                                  |",
  "|                          ||                                                  |",
  "`--------------------------'`--------------------------------------------------'",
  ".------------------------------------------------------------------------------.",
  "|      ENTER=Run Upload Info Files Del View doc E=Dis Strip Tab=Repo Quit      |",
  "`------------------------------------------------------------------------------'",
];
/** sha256 over { text, attrs } of the same capture - the SGR half of the pin. */
const EIGHTY_COL_HASH = '4b52a2367429e4b92385c5ec553abb2ce2a5e5a1235aaab536aa037f3df96180';

/** The fixed screen both captures paint: nothing here depends on a live BBS. */
const ROWS = [
  '[TS] Grandmaster       * 240 KB',
  '[TS] Pengo             * 128 KB',
  '[68] Doorman Legacy    -  64 KB',
];

describe('DOORMAN at 80x24 paints exactly what it painted before', () => {
  it('the rendered (glyph, SGR) grid is unchanged', () => {
    const out: string[] = [];
    const bbs = {
      write: (d: string) => { out.push(d); },
      connectionType: 'web',
      getTerminalSize: () => ({ width: 80, height: 24 }),
    };
    const screen = createScreen(bbs, { smartCSR: true, fullUnicode: true, title: 'DOORMAN v2' });
    const layout = new DoormanLayout(screen, 1);
    try {
      layout.showInstalledLayout();
      layout.setListLabel(' INSTALLED DOORS ');
      layout.setListItems(ROWS);
      layout.setListSelect(0);
      layout.setInfo('Name:    Grandmaster\nCommand: GM\nType:    TS\nSize:    240 KB\nStatus:  ENABLED');
      layout.setFooter(installedFooter(true, layout.narrow));
      screen.render();

      const fr = new FrameReconstructor({ cols: 80, rows: 24 });
      fr.write(out.join(''));
      const frame = fr.snapshot();
      const text = frame.cells.map((r: any[]) => r.map(c => c.ch).join(''));
      const attrs = frame.cells.map((r: any[]) =>
        r.map(c => `${c.fg}/${c.bg}/${c.bold ? 1 : 0}${c.rvs ? 'R' : ''}`).join(' '));
      expect(text).toEqual(EIGHTY_COL_GRID);
      const hash = require('crypto').createHash('sha256')
        .update(JSON.stringify({ text, attrs })).digest('hex');
      expect(hash).toBe(EIGHTY_COL_HASH);
    } finally {
      try { layout.stopMasthead?.(); } catch { /* leaving anyway */ }
      try { screen.destroy(); } catch { /* leaving anyway */ }
    }
  });
});
