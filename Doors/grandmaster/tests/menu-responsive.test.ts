/**
 * The main menu sits in the middle of whatever terminal it is given.
 *
 * "the menus in gmaster isnt responise" (2026-09-02). The menu is an 80x24
 * composition of fixed panels, and in a wide window it sat in the top-left
 * corner with the rest of the screen black - which is exactly what Alt+Enter
 * makes possible, so widening the door made the menu look broken.
 *
 * And it has to FOLLOW the size: Alt+Enter can be pressed while the menu is
 * up, and a composition centred once is centred for one size only.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { MenuScreen } from '../ui/menu';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const state: any = { playerName: 'sysop', settings: {}, stats: {} };

async function open(width: number, height: number) {
  const screen: any = new Screen({
    title: 'menu', responsive: width !== 80 || height !== 25, width, height,
  } as any);
  const menu: any = new MenuScreen(screen, state, sounds);
  void menu.show();          // resolves on selection; we only need the widgets
  // show() clears the terminal and waits for that to propagate (modem
  // speeds) before it builds anything.
  await new Promise(r => setTimeout(r, 260));
  const boxes = (): any[] => screen.children.filter((c: any) => !c.hidden);
  return { screen, boxes, destroy: () => screen.destroy() };
}

/** The panel carrying the mode list, by its label. */
function panel(h: any, label: string): any {
  return h.boxes().find((c: any) => String(c.options?.label ?? '').includes(label));
}

export async function eightyColumnsIsExactlyWhereItAlwaysWas(): Promise<void> {
  const h = await open(80, 25);
  try {
    const modes = panel(h, 'SELECT MODE');
    assert.ok(modes, 'the mode panel must exist');
    assert.strictEqual(modes.position.left, 2, 'two columns of margin, as before');
    assert.strictEqual(modes.position.top, 5);
  } finally { h.destroy(); }
}

export async function aWideTerminalCentresTheWholeComposition(): Promise<void> {
  const h = await open(200, 60);
  try {
    const modes = panel(h, 'SELECT MODE');
    assert.strictEqual(modes.position.left, 2 + Math.floor((200 - 80) / 2),
      'the block is centred horizontally, not pinned to the corner');
    assert.strictEqual(modes.position.top, 5 + Math.floor((60 - 24) / 2),
      'and vertically');
  } finally { h.destroy(); }
}

export async function thePanelsStayTogetherWhenCentred(): Promise<void> {
  const h = await open(200, 60);
  try {
    const modes = panel(h, 'SELECT MODE');
    const desc = panel(h, 'DESCRIPTION');
    const player = panel(h, 'PLAYER');
    assert.strictEqual(desc.position.left, modes.position.left + 26, 'description abuts the list');
    assert.strictEqual(player.position.left, desc.position.left + 30, 'and the player panel abuts that');
    assert.strictEqual(desc.position.top, modes.position.top, 'all three share a top edge');
    assert.strictEqual(player.position.top, modes.position.top);
  } finally { h.destroy(); }
}

export async function itFollowsTheTerminalWhenAltEnterIsPressed(): Promise<void> {
  const h = await open(80, 25);
  try {
    const modes = panel(h, 'SELECT MODE');
    assert.strictEqual(modes.position.left, 2);

    h.screen.resize(200, 60);      // what Alt+Enter leads to
    assert.strictEqual(modes.position.left, 2 + Math.floor((200 - 80) / 2),
      'the menu re-centres itself rather than staying in the corner');
    assert.strictEqual(modes.position.top, 5 + Math.floor((60 - 24) / 2));
  } finally { h.destroy(); }
}

/**
 * And the ground it is drawn on is a ground, not a frame.
 *
 * "outer border broken" (2026-09-02): the full-screen background box gets no
 * border key, and createBox's Panel default is a line - so the clearing box
 * drew a rectangle around the entire terminal, one row and one column outside
 * everything else.
 */
export async function theFullScreenBackgroundIsAGroundNotAFrame(): Promise<void> {
  const h = await open(80, 25);
  try {
    const background = h.boxes().find((c: any) =>
      c.options?.width === '100%' && c.options?.height === '100%');
    assert.ok(background, 'the menu paints a full-screen background');
    assert.ok(!background.border,
      'it clears the screen; it must not outline the whole terminal');
  } finally { h.destroy(); }
}
