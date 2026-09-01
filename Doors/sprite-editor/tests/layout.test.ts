/**
 * LAYOUT is the single source of integer geometry for both studio
 * screens (Studio 2c) - no percent strings, no runtime rounding. These
 * tests pin the invariants that made the old percent layout unsafe:
 * every field is an integer, panes tile without overlapping, nothing
 * spills into the menu row (0) or the status row (24), and the two
 * screens' columns actually sum to the 80-column width they claim.
 */

import assert from 'assert';
import { LAYOUT, STATUS_ROW, Rect } from '../layout';

function isInt(n: number): boolean {
  return Number.isInteger(n);
}

/** [left, left+width) x [top, top+height) intersection test. */
function overlaps(a: Rect, b: Rect): boolean {
  const aRight = a.left + a.width;
  const bRight = b.left + b.width;
  const aBottom = a.top + a.height;
  const bBottom = b.top + b.height;
  return a.left < bRight && b.left < aRight && a.top < bBottom && b.top < aBottom;
}

export async function everyPaneFieldIsAnInteger(): Promise<void> {
  for (const screenName of ['edit', 'browser'] as const) {
    for (const [paneName, rect] of Object.entries(LAYOUT[screenName])) {
      for (const field of ['top', 'left', 'width', 'height'] as const) {
        assert.ok(isInt(rect[field]),
          `LAYOUT.${screenName}.${paneName}.${field} must be an integer, got ${rect[field]}`);
      }
    }
  }
}

export async function statusRowIsTheLastRowOfAn80x25Screen(): Promise<void> {
  assert.strictEqual(STATUS_ROW, 24, 'the door is 80x25 (rows 0-24); the status row is the last one');
  for (const screenName of ['edit', 'browser'] as const) {
    assert.strictEqual(LAYOUT[screenName].status.top, STATUS_ROW,
      `LAYOUT.${screenName}.status must sit at STATUS_ROW`);
  }
}

/**
 * The double-border root cause, made structurally impossible: no CONTENT
 * pane (everything but the status bar itself, which legitimately lives AT
 * STATUS_ROW by design) may have its bottom edge land on the status row.
 * Pre-flight finding: this check must exclude the status bar, or it is
 * trivially false.
 */
export async function noContentPaneBottomEdgeLandsOnTheStatusRow(): Promise<void> {
  for (const screenName of ['edit', 'browser'] as const) {
    for (const [paneName, rect] of Object.entries(LAYOUT[screenName])) {
      if (paneName === 'status') continue;
      const bottomEdge = rect.top + rect.height - 1;
      assert.notStrictEqual(bottomEdge, STATUS_ROW,
        `LAYOUT.${screenName}.${paneName} bottom edge must not land on STATUS_ROW`);
      assert.ok(bottomEdge <= 23,
        `LAYOUT.${screenName}.${paneName} bottom edge (row ${bottomEdge}) must not spill past row 23`);
    }
  }
}

/** Row 0 is reserved for the menu bar - no pane may start there. */
export async function noPaneStartsOnTheMenuRow(): Promise<void> {
  for (const screenName of ['edit', 'browser'] as const) {
    for (const [paneName, rect] of Object.entries(LAYOUT[screenName])) {
      if (paneName === 'status') continue;
      assert.ok(rect.top >= 1, `LAYOUT.${screenName}.${paneName} must not start on the menu row (0)`);
    }
  }
}

export async function panesTileWithoutOverlap(): Promise<void> {
  for (const screenName of ['edit', 'browser'] as const) {
    const rects = Object.entries(LAYOUT[screenName]);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [nameA, a] = rects[i];
        const [nameB, b] = rects[j];
        assert.ok(!overlaps(a, b),
          `LAYOUT.${screenName}.${nameA} must not overlap LAYOUT.${screenName}.${nameB}`);
      }
    }
  }
}

export async function editScreenColumnsSumToEightyColumns(): Promise<void> {
  const { canvas, preview, frames } = LAYOUT.edit;
  assert.strictEqual(canvas.width + preview.width, 80,
    'canvas + right column must span the full 80 columns');
  assert.strictEqual(preview.width, frames.width, 'the right column is one width, not two');
}

export async function editScreenRightColumnSumsToTheCanvasHeight(): Promise<void> {
  const { canvas, preview, frames } = LAYOUT.edit;
  assert.strictEqual(preview.height + frames.height, canvas.height,
    'preview+frames must exactly fill the canvas height - the split the ' +
    'old percent layout could not guarantee at every terminal height. The ' +
    'third pane (the Paint toolbar) is gone: the hosted ANSIEditor ships ' +
    'its own colour/tool sidebar, and its rows went to Frames.');
  assert.strictEqual(preview.top, canvas.top, 'the right column starts where the canvas does');
  assert.strictEqual(frames.top, preview.top + preview.height, 'frames must start exactly where preview ends');
  assert.strictEqual(frames.top + frames.height, canvas.top + canvas.height,
    'frames must end exactly where the canvas does - no blank rows left by the removed toolbar');
}

export async function browserColumnsSumToEightyColumns(): Promise<void> {
  const { doors, sprites, animations, preview } = LAYOUT.browser;
  assert.strictEqual(doors.width + sprites.width + preview.width, 80,
    'doors + middle column + preview must span the full 80 columns');
  assert.strictEqual(sprites.width, animations.width, 'the middle column is one width, not two');
  assert.strictEqual(doors.left, 0);
  assert.strictEqual(sprites.left, doors.left + doors.width);
  assert.strictEqual(preview.left, sprites.left + sprites.width);
}

/**
 * Studio 2c: every content pane in LAYOUT (everything but the status bar)
 * now becomes a DockablePanel (panels.ts's makePanel). DockablePanel
 * enforces an absolute floor during resize - ABS_MIN_WIDTH=5,
 * ABS_MIN_HEIGHT=3 (dockable-panel.ts) - below which it silently clamps a
 * panel back up. A LAYOUT rect smaller than that floor would make Reset
 * Layout (which restores exactly these numbers) immediately fight the
 * panel's own clamp.
 */
export async function everyPaneMeetsTheDockablePanelMinimumSize(): Promise<void> {
  const ABS_MIN_WIDTH = 5;
  const ABS_MIN_HEIGHT = 3;
  for (const screenName of ['edit', 'browser'] as const) {
    for (const [paneName, rect] of Object.entries(LAYOUT[screenName])) {
      if (paneName === 'status') continue;
      assert.ok(rect.width >= ABS_MIN_WIDTH,
        `LAYOUT.${screenName}.${paneName}.width (${rect.width}) must be at least DockablePanel's minimum (${ABS_MIN_WIDTH})`);
      assert.ok(rect.height >= ABS_MIN_HEIGHT,
        `LAYOUT.${screenName}.${paneName}.height (${rect.height}) must be at least DockablePanel's minimum (${ABS_MIN_HEIGHT})`);
    }
  }
}

export async function browserMiddleColumnSumsToTheOuterColumnsHeight(): Promise<void> {
  const { doors, sprites, animations, preview } = LAYOUT.browser;
  assert.strictEqual(sprites.height + animations.height, doors.height,
    'sprites+animations must exactly fill the same height as the doors column - the ' +
    'exact pair of independently-rounded percentages that used to desync');
  assert.strictEqual(doors.height, preview.height, 'doors and preview run the same height');
  assert.strictEqual(sprites.top, doors.top, 'the middle column starts where doors/preview do');
  assert.strictEqual(animations.top, sprites.top + sprites.height, 'animations must start exactly where sprites ends');
}
