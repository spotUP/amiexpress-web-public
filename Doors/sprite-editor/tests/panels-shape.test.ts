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
