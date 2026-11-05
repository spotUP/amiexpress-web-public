/**
 * WHIP opens, and it opens in the board's theme.
 *
 * This door reached the live board as TypeScript sources with no dist/ at
 * all - its own .gitignore hid the compiled output that every door ships -
 * so the thing the board tried to launch did not exist. Nobody had run it,
 * which is also how it kept four type errors and a palette of its own.
 *
 * Driven, not read: the door's real start handler runs against a stubbed
 * session, and the theme test compares what it PAINTS under two themes.
 */

import assert from 'assert';

interface Harness {
  writes: string[];
  output: string;
}

async function open(themeId?: string): Promise<Harness> {
  const door: any = (await import('../index')).default;
  const { themeById } = await import('@amiexpress/bbs-door-sdk/engines/ui/theme');

  const writes: string[] = [];
  const bbs: any = {
    write: (s: unknown) => writes.push(String(s)),
    writeLine: (s: unknown) => writes.push(`${String(s)}\n`),
    on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    getTheme: themeId ? () => themeById(themeId) : undefined,
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const ctx: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 25, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  };

  // The door holds itself open, so the handler is started and left running -
  // what matters is what it has painted by then.
  void Promise.all(door.startHandlers.map((h: (c: unknown) => Promise<void>) => h(ctx)));
  await new Promise((r) => setTimeout(r, 2000));

  return { writes, output: writes.join('') };
}

export async function theDoorStartsAndPaints(): Promise<void> {
  const h = await open();
  assert.ok(h.output.length > 500,
    `the door must paint something - it wrote ${h.output.length} bytes`);
}

export async function theDoorRegistersOneStartHandler(): Promise<void> {
  const door: any = (await import('../index')).default;
  assert.strictEqual(door.startHandlers.length, 1,
    'the board launches the door through this handler');
}

export async function twoThemesGiveTwoDifferentDoors(): Promise<void> {
  // The point of the theme migration: WHIP had a palette of its own, so it
  // looked the same whichever theme the sysop chose.
  const classic = await open('classic');
  const phosphor = await open('quiet-phosphor');

  assert.notStrictEqual(classic.output, phosphor.output,
    'a door that paints the same bytes in two themes is not theme aware');
}
