/**
 * Real DockablePanel construction (not source-shape regex) - proves two
 * fix-round-1 findings against the ACTUAL SDK widget, not just against
 * panels.ts's own source text.
 *
 * Same minimal fake-screen technique as edit-screen-behavior.test.ts:
 * this is already proven to let DockablePanel construct and operate
 * correctly (EditScreen.buildLayout() builds four of them against an
 * identical mock, exercised by every test in that file).
 */

import assert from 'assert';
import { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { makePanel, panelContentRect, resetPanelLayout } from '../panels';
import { LAYOUT } from '../layout';

function makeFakeScreen(): any {
  const screen: any = {
    width: 80,
    height: 24,
    children: [] as any[],
    _getCoords: () => ({ xi: 0, xl: 80, yi: 0, yl: 24 }),
    append(element: any) {
      element.parent = screen;
      element.screen = screen;
      screen.children.push(element);
      element.emit('attach');
    },
    remove(element: any) {
      screen.children = screen.children.filter((c: any) => c !== element);
    },
    render() {},
    clearRegion() {},
    on() {},
    removeListener() {},
    invalidateMouseIndex() {},
  };
  return screen;
}

/**
 * Fix round 1, Important 1. Traced against the SDK: setState()
 * (dockable-panel.ts:2503-2567) applies position/size FIRST and only
 * THEN, if `minimized` is present, calls minimize()/maximize()
 * (:2559-2565); maximize() (:2381-2405) restores position.left/top/
 * width/height from panelState.savedX/savedY/savedWidth/savedHeight -
 * the geometry captured by minimize() (:2344-2348) - unconditionally.
 * A single `setState({...rect, minimized:false})` call would therefore
 * apply the LAYOUT rect and then immediately have it overwritten by the
 * pre-minimize geometry. This is the repro from the brief: minimize any
 * pane, then Reset Layout, against a REAL minimized DockablePanel.
 */
export async function resetLayoutRestoresTheLayoutRectEvenWhenThePanelWasMinimized(): Promise<void> {
  const screen = makeFakeScreen();
  const rect = LAYOUT.edit.canvas;
  const panel = makePanel(screen, { key: 'canvas-fixture-minimized', title: ' Canvas ', rect });
  try {
    panel.minimize();
    assert.strictEqual(panel.isMinimized(), true, 'precondition: the panel must actually be minimized');

    resetPanelLayout(panel, rect);

    assert.strictEqual(panel.isMinimized(), false, 'Reset Layout must un-minimize the panel');
    assert.strictEqual((panel as any).position.left, rect.left,
      'left must match the LAYOUT rect, not the pre-minimize position maximize() would restore');
    assert.strictEqual((panel as any).position.top, rect.top,
      'top must match the LAYOUT rect, not the pre-minimize position maximize() would restore');
    assert.strictEqual((panel as any).position.width, rect.width,
      'width must match the LAYOUT rect, not the pre-minimize size maximize() would restore');
    assert.strictEqual((panel as any).position.height, rect.height,
      'height must match the LAYOUT rect, not the pre-minimize size maximize() would restore');
  } finally {
    panel.destroy();
  }
}

/** Reset Layout must still work (regression guard) on a panel that was never minimized. */
export async function resetLayoutStillWorksWhenThePanelWasNeverMinimized(): Promise<void> {
  const screen = makeFakeScreen();
  const rect = LAYOUT.browser.doors;
  const panel = makePanel(screen, { key: 'doors-fixture', title: ' Doors ', rect });
  try {
    // Simulate a drag/resize away from the LAYOUT rect.
    (panel as any).position.left = 5;
    (panel as any).position.top = 5;
    (panel as any).position.width = 10;
    (panel as any).position.height = 10;

    resetPanelLayout(panel, rect);

    assert.strictEqual((panel as any).position.left, rect.left);
    assert.strictEqual((panel as any).position.top, rect.top);
    assert.strictEqual((panel as any).position.width, rect.width);
    assert.strictEqual((panel as any).position.height, rect.height);
  } finally {
    panel.destroy();
  }
}

/**
 * Fix round 1, Important 2. Traced against element.ts's `_getCoords()`:
 * a panel of LAYOUT.edit.canvas's rect (top:1, height:19) has an
 * absolute span of rows 1..19; its border consumes rows 1 and 19,
 * leaving inner rows 2..18; the title bar (relative top:0 inside that
 * inner area) occupies exactly absolute row 2. A content child placed
 * by panelContentRect (relative top:1) must therefore start at absolute
 * row 3 - immediately after the title bar, no gap - and (with height
 * rect.height-3 = 16) must reach exactly to row 18, the last row before
 * the bottom border - no wasted blank row either.
 */
export async function contentChildOccupiesExactlyTheRowsTheTitleBarDoesNotCoverOrGap(): Promise<void> {
  const screen = makeFakeScreen();
  const rect = LAYOUT.edit.canvas;
  const panel = makePanel(screen, { key: 'canvas-fixture-geometry', title: ' Canvas ', rect });
  const cr = panelContentRect(rect);
  const box = new Box({
    parent: panel,
    top: cr.top, left: cr.left, width: cr.width, height: cr.height,
    border: { type: 'none' }, tags: true,
  });
  try {
    const panelCoords = (panel as any)._getCoords();
    const contentCoords = (box as any)._getCoords();
    const titleBarAbsoluteRow = panelCoords.yi + 1; // one row inside the top border

    assert.strictEqual(contentCoords.yi, titleBarAbsoluteRow + 1,
      'content must start immediately after the title bar row - no gap, no overlap');
    assert.strictEqual(contentCoords.yl, panelCoords.yl - 1,
      "content must reach exactly to the panel's bottom border - no wasted row");
  } finally {
    box.destroy();
    panel.destroy();
  }
}
