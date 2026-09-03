/**
 * The dashboard's chrome stops moving on a 40-column caller.
 *
 * This door had the masthead, the glitches and the footer and no width gate
 * anywhere, so on a C64 the rail repainted twenty times a second and the
 * node list glitched - the stray glyphs mid-row the sysop reported from
 * DOORMAN, on the door nobody had checked. The fix routed all three through
 * attachDoorChrome, which carries the gate so the door cannot forget it.
 *
 * Driven, not read: the door is started for real at each width and the
 * assertions are on the chrome handle it got back and on the masthead ROW.
 */
import assert from 'assert';
import { join } from 'path';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

/** blessed tags are markup; the ROW is what is left when they are gone. */
function plain(text: unknown): string {
  return String(text ?? '').replace(/\{[^}]*\}/g, '');
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Start the door at `width` and hand back what the SDK was asked for.
 *
 * chrome.js is required by path rather than through the theme barrel: the
 * barrel re-exports through getters, so assigning to it changes nothing the
 * door will read. The write counter is armed at capture time, before any
 * sleep, so no assertion races the rail's draw-in.
 */
async function open(width: number): Promise<{
  screen: any; masthead: any; handle: any; writes: () => number;
}> {
  const chrome = require(
    join(__dirname, '../../../sdk/dist/engines/ui/theme/chrome.js')
  );
  const real = chrome.attachDoorChrome;
  let masthead: any = null;
  let handle: any = null;
  let writes = 0;
  chrome.attachDoorChrome = (...args: any[]) => {
    const row = args[1]?.masthead;
    if (row) {
      masthead = row;
      const realSet = row.setContent.bind(row);
      row.setContent = (text: string) => { writes++; return realSet(text); };
    }
    handle = real(...args);
    return handle;
  };

  const theme = themeById('uprough-neon');
  const bbs: any = {
    write: () => undefined, writeLine: () => undefined, on: () => undefined,
    getTerminalSize: () => ({ width, height: width === 40 ? 25 : 24 }),
    getTheme: () => theme, connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    on: () => undefined, once: () => undefined, off: () => undefined,
    emit: () => undefined, removeAllListeners: () => undefined, id: 'dash-test',
  };

  try {
    // dist, not src: dist/index.js is what the board runs, and it is
    // CommonJS, so its call goes through the very module object patched here.
    const door = require('../dist/index.js').default;
    void door.execute({
      socket, bbs, user: { username: 'SYSOP', id: 'sysop-1', secLevel: 255 },
      bbsSession: { nodeId: 1 }, params: [],
    });
    await sleep(200);
  } finally {
    chrome.attachDoorChrome = real;
  }

  assert.ok(handle, 'the door never asked the SDK for its chrome');
  assert.ok(masthead, 'the door handed the SDK no masthead');
  return { screen: masthead.screen, masthead, handle, writes: () => writes };
}

export async function eightyColumnsAnimates(): Promise<void> {
  const { screen, masthead, handle, writes } = await open(80);
  try {
    assert.strictEqual(handle.animated, true, 'the chrome did not animate at 80');
    const row = plain(masthead.getContent());
    assert.ok(row.includes('SYSOP DASHBOARD'), `no title at 80: ${JSON.stringify(row)}`);
    assert.ok(row.includes('/'), `no rail at 80: ${JSON.stringify(row)}`);
    assert.ok(writes() > 1, `the rail drew only ${writes()} times at 80`);
  } finally {
    try { screen.destroy(); } catch { /* leaving anyway */ }
  }
}

export async function fortyColumnsDoesNotAnimate(): Promise<void> {
  const { screen, handle } = await open(40);
  try {
    // The gate itself. A C64 has no spare cells for a moving rail and no
    // patience for 4KB a second of PETSCII for one row of decoration.
    assert.strictEqual(handle.animated, false, 'the chrome animated at 40 columns');
  } finally {
    try { screen.destroy(); } catch { /* leaving anyway */ }
  }
}

export async function fortyColumnsDrawsAStaticTitleAndNothingMoves(): Promise<void> {
  const { screen, masthead, writes } = await open(40);
  try {
    const row = plain(masthead.getContent());
    assert.ok(row.includes('SYSOP DASHBOARD'), `no title at 40: ${JSON.stringify(row)}`);
    // A rail would have put its run of slashes on the row.
    assert.ok(!row.includes('/'), `a rail was drawn at 40: ${JSON.stringify(row)}`);

    // ...and nothing repaints it, however long anyone waits.
    const drawn = writes();
    await sleep(300);
    assert.strictEqual(
      writes(),
      drawn,
      `the masthead repainted ${writes() - drawn} times at 40 columns`
    );
  } finally {
    try { screen.destroy(); } catch { /* leaving anyway */ }
  }
}
