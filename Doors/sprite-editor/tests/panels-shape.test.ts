/**
 * panels.ts's makePanel is the single options block every content pane in
 * both studio screens shares. This pins the exact shared-defaults contract
 * from the studio 2c task-3 brief - one place, not eight hand-tuned option
 * blocks that could drift apart pane by pane.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const raw = readFileSync(join(__dirname, '..', 'panels.ts'), 'utf8');
/** The source with line and block comments removed. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

export async function makePanelAppliesEveryRequiredDefault(): Promise<void> {
  for (const fragment of [
    'useTitleBar: true',
    'draggable: true',
    'resizable: true',
    'allowMinimize: true',
    'topConstraint: MENU_HEIGHT',
    'bottomConstraint: 1',
    "persistenceKey: 'sprited:' + key",
    'fitContent: false',
  ]) {
    assert.ok(code.includes(fragment), `makePanel must set ${fragment}`);
  }
}

/** MENU_HEIGHT is layout.ts's Task 2 constant, not a hand-copied literal. */
export async function topConstraintComesFromMenuHeightNotALiteral(): Promise<void> {
  assert.ok(code.includes("import { MENU_HEIGHT } from './menu'"),
    'panels.ts must import MENU_HEIGHT from menu.ts, the single source for the menu row height');
}

/** makePanel is exported with exactly the brief's signature: (screen, { key, title, rect }). */
export async function makePanelHasTheDocumentedSignature(): Promise<void> {
  assert.ok(/export function makePanel\(screen: Screen, opts: MakePanelOptions\): DockablePanel/.test(code),
    'makePanel must be exported as (screen: Screen, opts: MakePanelOptions): DockablePanel');
  assert.ok(/key: string;/.test(code) && /title: string;/.test(code) && /rect: Rect;/.test(code),
    'MakePanelOptions must carry key, title, and rect');
}

/** resetPanelLayout is the one place View -> Reset Layout restores a panel. */
export async function resetPanelLayoutRestoresFloatAndTheGivenRect(): Promise<void> {
  assert.ok(code.includes("export function resetPanelLayout"), 'resetPanelLayout must be exported');
  const idx = code.indexOf('export function resetPanelLayout');
  const body = code.slice(idx, idx + 400);
  assert.ok(/position: 'float'/.test(body), 'reset must undock the panel back to floating');
  assert.ok(/minimized: false/.test(body), 'reset must un-minimize the panel');
  assert.ok(/x: rect\.left/.test(body) && /y: rect\.top/.test(body) &&
            /width: rect\.width/.test(body) && /height: rect\.height/.test(body),
    'reset must restore the exact LAYOUT rect it was given');
}

/**
 * Fix round 1, Important 1: setState() applies position/size BEFORE
 * consulting `minimized` (dockable-panel.ts:2503-2567), and a `minimized:
 * false` there calls maximize() (:2381-2405), which restores position
 * from the pre-minimize saved geometry - clobbering any rect a single
 * combined call had just applied. resetPanelLayout must therefore be TWO
 * sequential setState() calls: one that ONLY un-minimizes, then one that
 * ONLY applies the rect (no `minimized` key, so setState's minimize
 * branch never runs for it) - not one call carrying both.
 * See panels-behavior.test.ts for the same contract proven against a
 * real, actually-minimized DockablePanel.
 */
export async function resetPanelLayoutUnminimizesBeforeApplyingGeometryInTwoCalls(): Promise<void> {
  const idx = code.indexOf('export function resetPanelLayout');
  const body = code.slice(idx, code.indexOf('\n}', idx));
  const setStateCalls = body.match(/panel\.setState\(\{[^}]*\}\)/g) || [];
  assert.strictEqual(setStateCalls.length, 2,
    'resetPanelLayout must call setState() twice - once to un-minimize, once to apply the rect - ' +
    `not combine them into one call (found ${setStateCalls.length})`);
  assert.ok(/^panel\.setState\(\{\s*minimized:\s*false\s*\}\)$/.test(setStateCalls[0]),
    'the FIRST call must un-minimize ALONE, with no rect fields that a maximize() restore could clobber');
  assert.ok(!/minimized/.test(setStateCalls[1]),
    'the SECOND call must carry no `minimized` key, or setState would run maximize() again ' +
    'and re-clobber the geometry this call is applying');
  assert.ok(/position: 'float'/.test(setStateCalls[1]) && /x: rect\.left/.test(setStateCalls[1]),
    'the second call must be the one that actually applies the LAYOUT rect');
}

/**
 * Fix round 1, Important 2: every panel sets useTitleBar: true, and the
 * title bar is a Box at relative top:0 inside the panel's border-
 * excluded content area, rendered LAST (bringUIToFront) so it draws OVER
 * row 0. panelContentRect must therefore place content at relative
 * top:1, one row shorter than the panel's full inner area (rect.height -
 * 2 for the border) to make room for that row - see
 * panels-behavior.test.ts for the same contract proven with real
 * absolute coordinates against a real DockablePanel + content Box.
 */
export async function panelContentRectSkipsTheTitleBarRow(): Promise<void> {
  const idx = code.indexOf('export function panelContentRect');
  assert.ok(idx >= 0, 'panelContentRect must be exported');
  const body = code.slice(idx, code.indexOf('\n}', idx));
  assert.ok(/top:\s*1/.test(body), 'content must sit at relative top:1, not top:0 (the title bar\'s row)');
  assert.ok(/left:\s*0/.test(body));
  assert.ok(/width:\s*rect\.width\s*-\s*2/.test(body), 'width excludes the panel\'s left+right border');
  assert.ok(/height:\s*rect\.height\s*-\s*3/.test(body),
    'height excludes the panel\'s top+bottom border (2) AND the title bar\'s row (1)');
}
