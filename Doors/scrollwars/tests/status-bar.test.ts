/**
 * Scrollwars' footer says what it is for, and it has no frame.
 *
 * The bar was a `createBox` at the bottom, one row high, with no border key -
 * so it took Panel's default line border, and a one-row box with a frame has
 * no interior at all. It drew a rule where the keys were supposed to be. It
 * also padded its own string to 80 columns and joined its own fields with
 * " | ", which is what `StatusBar` is.
 *
 * Driven, not read: the door's real start handler runs against a stubbed
 * session and the test reads what it PAINTED.
 */

import assert from 'assert';

interface Harness {
  /**
   * What the door painted, with the escapes taken out and the whitespace
   * squeezed away.
   *
   * The screen writes a cell DIFF: runs of unchanged spaces come out as
   * cursor moves rather than blanks, so the painted row reads
   * "Users1/22|Yousysop" once the escapes are gone. Comparing without
   * whitespace is the only way to assert on it without asserting on the
   * diff's own choices.
   */
  painted: string;
}

function squeeze(output: string): string {
  return output
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\s+/g, '');
}

async function open(): Promise<Harness> {
  const door: any = (await import('../index')).default;

  const writes: string[] = [];
  const bbs: any = {
    write: (s: unknown) => writes.push(String(s)),
    writeLine: (s: unknown) => writes.push(`${String(s)}\n`),
    on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableGameMode: () => {},
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    id: 'test-socket-1',
    on: () => {}, once: () => {}, emit: () => {}, off: () => {},
    removeAllListeners: () => {},
  };
  const ctx: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 25, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  };

  // The door holds itself open until the screen is destroyed, so the handler
  // is started and left running - what matters is what it has painted by then.
  void Promise.all(door.startHandlers.map((h: (c: unknown) => Promise<void>) => h(ctx)));
  await new Promise((r) => setTimeout(r, 1500));

  return { painted: squeeze(writes.join('')) };
}

export async function theFooterPaintsItsKeysRatherThanARule(): Promise<void> {
  const { painted } = await open();

  assert.ok(painted.includes('Enterclears'),
    'the keys reach the screen - a one-row bordered box would paint a rule instead');
  assert.ok(painted.includes('ESCquit'),
    'including the one that gets the user out, which used to fall off the end');
}

export async function theFooterCountsWhoIsIn(): Promise<void> {
  const { painted } = await open();

  assert.ok(/Users\d+\/\d+/.test(painted), 'the bar carries the user count');
  assert.ok(painted.includes('Yousysop'), 'and says whose line is whose');
  assert.ok(painted.includes('Line1'), 'and which line that is');
}
