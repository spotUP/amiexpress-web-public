/**
 * VOICE CHAT stops its rail when the LINE drops, not only when Q is pressed.
 *
 * The masthead repaints its row twenty times a second. That interval used to
 * be stopped in the quit-key handler alone, while the door parks on the
 * screen's `destroy` event - so a caller who dropped the line never pressed
 * Q, the door was torn down, and the interval went on writing into a
 * destroyed screen. That is the shape of failure that takes the session with
 * it, and it is invisible until somebody hangs up.
 *
 * Driven, not read: the door is started for real and the screen destroyed the
 * way a disconnect destroys it, and the assertions are on the masthead ROW
 * and on the process's live timer count - not on a call.
 */
import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

// The SDK's per-user Storage writes under the process's cwd; a test has no
// business creating data/doors/ in the door directory.
process.chdir(mkdtempSync(join(tmpdir(), 'voice-chat-chrome-')));

/** blessed tags are markup; the ROW is what is left when they are gone. */
function plain(text: unknown): string {
  return String(text ?? '').replace(/\{[^}]*\}/g, '');
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A caller: enough BBS and socket for the door to build its screen. */
function stubs(width = 80) {
  const theme = themeById('uprough-neon');
  const bbs: any = {
    write: () => undefined,
    writeLine: () => undefined,
    on: () => undefined,
    getTerminalSize: () => ({ width, height: 24 }),
    getTheme: () => theme,
    connectionType: 'web',
    unicodeCapable: true,
  };
  const socket: any = {
    on: () => undefined, once: () => undefined, off: () => undefined,
    emit: () => undefined, removeAllListeners: () => undefined, id: 'voice-test',
  };
  return { bbs, socket };
}

/**
 * Start the door and hand back the masthead row it drew into.
 *
 * The row is found on the screen rather than through a spy: what this test
 * is about is whether the ROW keeps changing, and a spy would only prove a
 * function was called.
 */
async function open(width = 80): Promise<{
  screen: any; masthead: any; writes: () => number;
}> {
  const { bbs, socket } = stubs(width);

  // The masthead comes back from the SDK call the door makes, which is the
  // only place that knows which element the rail is drawn into.
  //
  // chrome.js by path, not the theme barrel: the barrel re-exports through
  // getters, so assigning to it changes nothing the door will read. This is
  // the module object the barrel's getter reads FROM, and the door's
  // compiled call lands on it.
  const chrome = require(
    join(__dirname, '../../../sdk/dist/engines/ui/theme/chrome.js')
  );
  const real = chrome.attachDoorChrome;
  let masthead: any = null;
  let writes = 0;
  // The write counter is armed HERE, at the moment the door hands its
  // masthead over, so no test depends on catching it later - the rail's
  // draw-in starts immediately and a counter attached after a sleep is a
  // counter racing the animation.
  chrome.attachDoorChrome = (...args: any[]) => {
    const row = args[1]?.masthead;
    if (row) {
      masthead = row;
      const realSet = row.setContent.bind(row);
      row.setContent = (text: string) => { writes++; return realSet(text); };
    }
    return real(...args);
  };

  try {
    // dist, not src: dist/index.js is what the board runs, and it is CommonJS,
    // so its call goes through the very module object patched above. The
    // source under tsx would be ESM and its import is a live binding no test
    // can stand in front of.
    const door = require('../dist/index.js').default as any;
    // execute() does not resolve while the screen lives - that is the point.
    void door.execute({
      socket, bbs, user: { username: 'CALLER', id: 'caller-1' },
      bbsSession: { nodeId: 1 }, params: [],
    });
    await sleep(150);
  } finally {
    chrome.attachDoorChrome = real;
  }

  assert.ok(masthead, 'the door never asked the SDK for its chrome');
  const screen = masthead.screen;
  assert.ok(screen, 'the masthead is not attached to a screen');
  return { screen, masthead, writes: () => writes };
}

export async function theRailMovesWhileTheDoorIsOpen(): Promise<void> {
  const { screen, masthead } = await open();
  try {
    const first = plain(masthead.getContent());
    assert.ok(first.includes('VOICE CHAT'), `masthead has no title: ${JSON.stringify(first)}`);
    assert.ok(first.includes('/'), `masthead has no rail: ${JSON.stringify(first)}`);
    await sleep(200);
    assert.notStrictEqual(plain(masthead.getContent()), first, 'the rail never moved');
  } finally {
    try { screen.destroy(); } catch { /* leaving anyway */ }
  }
}

export async function destroyingTheScreenStopsTheRail(): Promise<void> {
  const { screen, writes } = await open();

  // Count the WRITES, not the content. A destroyed screen reports empty
  // content for every read, so comparing two reads after the destroy passes
  // whether or not the timer is still running - which is how a test like
  // this ends up proving nothing at all. What the bug DOES is keep writing,
  // so writing is what is counted.
  assert.ok(writes() > 0, 'the rail was not writing before the destroy');

  // The line drops. Nobody presses Q; the screen simply goes.
  screen.destroy();

  const atDestroy = writes();
  await sleep(300);
  assert.strictEqual(
    writes(),
    atDestroy,
    `the rail wrote ${writes() - atDestroy} more times after the screen was destroyed`
  );
}

export async function aFortyColumnCallerGetsNoMovingRail(): Promise<void> {
  const { screen, masthead } = await open(40);
  try {
    const first = plain(masthead.getContent());
    assert.ok(first.includes('VOICE CHAT'), `masthead has no title at 40: ${JSON.stringify(first)}`);
    assert.ok(!first.includes('/'), `a rail was drawn at 40 columns: ${JSON.stringify(first)}`);
    await sleep(250);
    assert.strictEqual(plain(masthead.getContent()), first, 'something moved at 40 columns');
  } finally {
    try { screen.destroy(); } catch { /* leaving anyway */ }
  }
}
