/**
 * The paint toolbar - real DockablePanel + Box construction (the same
 * fake-screen technique panels-behavior.test.ts and edit-screen-
 * behavior.test.ts already prove works), driving the ACTUAL click
 * handlers `createToolbar` registers rather than grepping its source.
 * Reviewers on this plan rejected source-regex-only coverage for mouse
 * behaviour claims - every click test here fires a real 'click' event at
 * the box's own real, computed absolute coordinates.
 */

import assert from 'assert';
import { createToolbar, toolLabels, tokenAtColumn, ToolbarState } from '../toolbar';
import { makePanel, panelContentRect } from '../panels';
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

const stripTags = (s: string): string => s.replace(/\{[^}]*\}/g, '');

function buildToolbar(state: ToolbarState) {
  const screen = makeFakeScreen();
  const rect = LAYOUT.edit.toolbar;
  const panel = makePanel(screen, { key: 'toolbar-fixture-' + Math.random(), title: ' Paint ', rect });
  const changes: ToolbarState[] = [];
  const handle = createToolbar(screen, panel, state, (next) => changes.push(next));
  const box = panel.children[0]; // the panel's only content child - see panels.ts's doc comment
  return { screen, panel, handle, box, changes };
}

export async function paletteRendersSixteenSwatches(): Promise<void> {
  const { panel, handle, box } = buildToolbar({ tool: 'paint', colour: 0 });
  try {
    const lines = stripTags(box.getContent()).split('\n');
    assert.strictEqual(lines.length, 2, 'the toolbar content is exactly two lines (the toolbar panel has only 2 content rows)');
    assert.strictEqual(lines[1].slice(0, 16), '0123456789ABCDEF',
      'row 1 must render all sixteen colour swatches, one hex-digit character each, back to back');
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

export async function toolButtonsRenderAsFourLabelledButtons(): Promise<void> {
  const { panel, handle, box } = buildToolbar({ tool: 'paint', colour: 0 });
  try {
    const lines = stripTags(box.getContent()).split('\n');
    assert.strictEqual(lines[0], '[Paint] [Erase] [Pick] [Fill]');
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

export async function clickingSwatchKCallsOnChangeWithColourK(): Promise<void> {
  const { panel, handle, box, changes } = buildToolbar({ tool: 'paint', colour: 0 });
  try {
    const coords = (box as any)._getCoords();
    box.emit('click', { x: coords.xi + 5, y: coords.yi + 1, button: 'left' });
    assert.strictEqual(changes.length, 1, 'the click must reach onChange exactly once');
    assert.deepStrictEqual(changes[0], { tool: 'paint', colour: 5 });
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

export async function clickingLastSwatchSelectsColourFifteen(): Promise<void> {
  const { panel, handle, box, changes } = buildToolbar({ tool: 'paint', colour: 0 });
  try {
    const coords = (box as any)._getCoords();
    box.emit('click', { x: coords.xi + 15, y: coords.yi + 1, button: 'left' });
    assert.deepStrictEqual(changes[0], { tool: 'paint', colour: 15 });
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

export async function clickingPastTheLastSwatchDoesNothing(): Promise<void> {
  const { panel, handle, box, changes } = buildToolbar({ tool: 'paint', colour: 0 });
  try {
    const coords = (box as any)._getCoords();
    box.emit('click', { x: coords.xi + 16, y: coords.yi + 1, button: 'left' }); // one past the palette
    assert.strictEqual(changes.length, 0, 'a click past the palette must not call onChange');
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

export async function clickingAToolButtonSetsThatTool(): Promise<void> {
  const { panel, handle, box, changes } = buildToolbar({ tool: 'paint', colour: 3 });
  try {
    const coords = (box as any)._getCoords();
    const eraseStart = toolLabels()[0].length + 1; // one space past the end of '[Paint]'
    assert.strictEqual(tokenAtColumn(toolLabels(), eraseStart), 1,
      'precondition: this column must actually land on the [Erase] token per the shared hit-test math');
    box.emit('click', { x: coords.xi + eraseStart, y: coords.yi + 0, button: 'left' });
    assert.strictEqual(changes.length, 1);
    assert.deepStrictEqual(changes[0], { tool: 'erase', colour: 3 },
      'clicking the [Erase] button must set the tool to erase without touching the current colour');
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

export async function clickingInTheGapBetweenToolButtonsDoesNothing(): Promise<void> {
  const { panel, handle, box, changes } = buildToolbar({ tool: 'paint', colour: 0 });
  try {
    const coords = (box as any)._getCoords();
    const gapColumn = toolLabels()[0].length; // the single space between [Paint] and [Erase]
    box.emit('click', { x: coords.xi + gapColumn, y: coords.yi + 0, button: 'left' });
    assert.strictEqual(changes.length, 0, 'a click in the gap between tokens must not call onChange');
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

export async function activeToolAndColourAreIndicatedInTheRenderedContent(): Promise<void> {
  const { panel, handle, box } = buildToolbar({ tool: 'fill', colour: 9 });
  try {
    const content = box.getContent();
    assert.ok(content.includes('{blue-bg}{lightyellow-fg}[Fill]{/}'),
      'the active tool must be tag-highlighted in the rendered content');
    assert.ok(!content.includes('{blue-bg}{lightyellow-fg}[Paint]{/}'),
      'an inactive tool must not carry the active-tool highlight');
    assert.ok(content.includes('Fill 9'), 'the status line must show the active tool and colour');
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

export async function refreshRepaintsAfterAnExternalStateChange(): Promise<void> {
  // The interface's `state` is a caller-owned, mutable object - refresh()
  // must re-render from its CURRENT fields, not a snapshot taken at
  // construction time (this is how EditScreen's own keyboard-driven fg/
  // tool changes reach the toolbar).
  const state: ToolbarState = { tool: 'paint', colour: 0 };
  const { panel, handle, box } = buildToolbar(state);
  try {
    state.tool = 'pick';
    state.colour = 4;
    handle.refresh();
    const content = box.getContent();
    assert.ok(content.includes('{blue-bg}{lightyellow-fg}[Pick]{/}'));
    assert.ok(content.includes('Pick 4'));
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

/**
 * Studio 2c task-3's fix round 1, Important 2 (panels.ts's
 * panelContentRect doc comment): a content child at relative top:0 sits
 * behind the panel's title bar. createToolbar computes its own
 * panelContentRect(LAYOUT.edit.toolbar) rather than taking a rect
 * parameter (the brief's fixed signature has none) - this proves that
 * still lands the box at the correct geometry against a REAL panel, the
 * same invariant edit-screen-shape.test.ts pins for the other three
 * panes by source grep.
 */
export async function theToolbarBoxSitsAtTheCorrectContentGeometry(): Promise<void> {
  const screen = makeFakeScreen();
  const rect = LAYOUT.edit.toolbar;
  const panel = makePanel(screen, { key: 'toolbar-fixture-geometry', title: ' Paint ', rect });
  const state: ToolbarState = { tool: 'paint', colour: 0 };
  const handle = createToolbar(screen, panel, state, () => {});
  try {
    const box = panel.children[0];
    const expected = panelContentRect(rect);
    const panelCoords = (panel as any)._getCoords();
    const boxCoords = (box as any)._getCoords();
    assert.strictEqual(boxCoords.yi, panelCoords.yi + 1 + expected.top,
      'the content box must sit below the panel border AND the title bar row');
    assert.strictEqual(boxCoords.xl - boxCoords.xi, expected.width);
    assert.strictEqual(boxCoords.yl - boxCoords.yi, expected.height);
  } finally {
    handle.destroy();
    panel.destroy();
  }
}

export async function destroyRemovesTheBoxFromThePanel(): Promise<void> {
  const { panel, handle, box } = buildToolbar({ tool: 'paint', colour: 0 });
  handle.destroy();
  // The panel's own title bar (useTitleBar: true) is a SECOND child that
  // legitimately survives - only the toolbar's own content box must go.
  assert.ok(!panel.children.includes(box), 'destroy() must remove the toolbar\'s own box, not leak it');
  panel.destroy();
}
