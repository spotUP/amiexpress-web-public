/**
 * Every door with a responsive layout can be asked to fill the terminal.
 *
 * The SDK's 80x25 / responsive switch does three things a door cannot skip
 * any of: ask the terminal to widen, follow the resize, and put the board's
 * 80 columns back on the way out (sdk/utils/terminal-mode.ts). Doors whose
 * layouts are written in percentages gain the most, and until 2026-09-02
 * they filled a terminal that had never been asked to grow.
 *
 * These doors have no test runner of their own, so the checks live here,
 * where CI already runs. They are source checks, and the shape they check
 * is the one that actually went wrong: the ANSI editor door shipped a call
 * to this same switch from a code path nobody reached - inside a dialog -
 * and threw on start for every caller. So the call has to sit WITH the
 * screen it is given, and the dispose with the teardown.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..', '..', '..', '..');

/** Doors that carry the switch, and the file that creates their screen. */
// card-lobby is NOT here: its index.ts is 2826 lines, over this repo's
// 2000-line ceiling, so the pre-commit hook refuses any change to it until
// somebody extracts from it first. The switch is a ten-line change waiting
// on that.
const DOORS: Array<[string, string]> = [
  ['grandmaster', 'app.ts'],
  ['sprite-editor', 'studio.ts'],
  ['ansi-editor', 'index.ts'],
  ['livechat', 'server.ts'],
  ['bug-tracker', 'app.ts'],
  ['bbs-dashboard', 'index.ts'],
  ['doors-menu', 'app.ts'],
  ['theme-picker', 'app.ts'],
  ['scrollwars', 'index.ts'],
];

function source(door: string, file: string): string {
  return readFileSync(join(repoRoot, 'Doors', door, file), 'utf8');
}

describe('doors that offer 80x25 / responsive', () => {
  it.each(DOORS)('%s creates the switch', (door, file) => {
    expect(source(door, file)).toContain('createTerminalModeSwitch({');
  });

  it.each(DOORS)('%s hands the columns back on the way out', (door, file) => {
    expect(source(door, file)).toMatch(/terminalMode[?.]*\.dispose\(\)/);
  });

  it.each(DOORS)('%s creates it on the way in, not from a dialog', (door, file) => {
    // What actually went wrong: the ANSI editor door created the switch
    // inside showBBSDirectoryDialog, a sysop-only browser, while its menu
    // read the switch at startup - so every caller who did not open that
    // dialog got a TypeError instead of a door. The enclosing function is
    // the thing to check, not the distance from createScreen.
    const text = source(door, file);
    const at = text.indexOf('createTerminalModeSwitch({');
    expect(at).toBeGreaterThan(-1);

    const before = text.slice(0, at);
    const enclosing = [...before.matchAll(/(?:function|private|public|async)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].pop();
    const name = enclosing?.[1] ?? '';
    expect(name).not.toMatch(/dialog|browser|picker|modal|prompt|requester/i);
  });

  it.each(DOORS.filter(([d]) => d !== 'livechat'))(
    '%s opens at the size the board serves', (door, file) => {
      // The switch defaults to 'wide' and taking that default made doors
      // open fullscreen inside the BBS, which the sysop rejected twice
      // (ansi-edit and SPRITED, 2026-09-02). LiveChat is the one exception:
      // its standalone /chat page IS the whole browser window.
      expect(source(door, file)).toMatch(/start: 'fixed'/);
    });

  it('livechat opens fixed in the BBS and wide on its own page', () => {
    expect(source('livechat', 'server.ts')).toContain("start: chatOnly ? 'wide' : 'fixed'");
  });
});
