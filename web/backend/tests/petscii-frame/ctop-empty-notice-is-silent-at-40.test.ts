/**
 * Regression: at 40 columns, ctop's "- NO UPLOADERS ARE AVAILABLE IN THIS
 * CONFERENCE -" never reaches the caller, and the entry number it shared a row
 * with still does.
 *
 * Why it was removed (sysop, 2026-09-07): the door writes the sentence on the
 * same 64-column row as an entry number, the ladder answers `banner` and spends
 * THREE of the caller's 25 rows on it, and an empty list has already said it.
 *
 * The first test drives the REAL path - the captured ctop fixture through
 * `installC64DoorAdapter`'s patched emit, its own quiet-gap timer, the ladder
 * and renderDiff - and reads what was actually put on the wire across the whole
 * run, not just the last frame. The 80-column caller is asserted unchanged in
 * the same way: nothing adapts his screen, so he keeps the notice.
 */
import * as fs from 'fs';
import * as path from 'path';

import { makeFrame, type Cell } from '@amiexpress/bbs-door-sdk/petscii/frame';
import {
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';
import { stripNarrowNoise } from '../../src/server/c64-door-noise';

const FIXTURE = path.resolve(
  __dirname,
  '../../../../sdk/tests/petscii/frame/fixtures/ctop.ans',
);
const NOTICE = 'NO UPLOADERS ARE AVAILABLE IN THIS CONFERENCE';
/** Conftop-II's record line - proof the run painted the door's real screen. */
const SIGNATURE = '2,020,282,473';

const realSetTimeout = global.setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

/** Everything the door's output put on the wire, across every frame of the run. */
async function wireTextFor(adapted: boolean): Promise<string> {
  const seen: string[] = [];
  const socket: any = {
    emit: (_event: string, payload: any) => {
      if (typeof payload === 'string') seen.push(payload);
      return true;
    },
  };
  const session = adapted
    ? { terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25 }
    : { terminalType: 'modern', petsciiMode: false, screenWidth: 80, screenHeight: 24 };
  if (adapted) socket.session = session;
  const installed = adapted ? installC64DoorAdapter(socket, session) : null;
  if (adapted) expect(installed).not.toBeNull();

  const text = fs.readFileSync(FIXTURE, 'latin1');
  for (let i = 0; i < text.length; i += 64) {
    socket.emit('ansi-output', text.slice(i, i + 64));
    if (i % 512 === 0) await wait(12); // a quiet gap, so the adapter cuts frames mid-stream
  }
  await wait(60);
  if (adapted) uninstallC64DoorAdapter(socket);
  return seen.join('');
}

describe('ctop at 40 columns: the empty-conference notice is not spent on rows', () => {
  jest.setTimeout(20000);

  test('a 40-column caller never sees the notice, but does see the door', async () => {
    const wire = await wireTextFor(true);
    expect(wire).not.toContain(NOTICE);
    expect(wire).toContain(SIGNATURE);
  });

  test('an 80-column caller still gets the notice', async () => {
    const wire = await wireTextFor(false);
    expect(wire).toContain(NOTICE);
  });

  test('the row goes entirely, number and all', () => {
    const source = ' 5.            - NO UPLOADERS ARE AVAILABLE IN THIS CONFERENCE -';
    const row: Cell[] = Array.from(source.padEnd(80)).map((ch) => ({
      ch, fg: 5, bg: 0, bold: false, rvs: false,
    }));
    const stripped = stripNarrowNoise(makeFrame(80, 1, [row], { x: 0, y: 0 }));
    const text = stripped.cells[0].map((c) => c.ch).join('');
    expect(text).not.toContain(NOTICE);
    // The number goes too, and that is a CHANGE from the first version of this
    // rule (2026-09-07). Blanking the sentence and keeping ` 5.` left a lone
    // number in the middle of a screen whose other slots had been blanked -
    // reported from the live board the same day. The phrases are now blanked
    // FIRST and the whole-row test runs on what is left, so a slot that held
    // nothing but the notice is a slot that holds nothing.
    expect(text.trim()).toBe('');
  });

  test('a real uploader row that happens to mention uploaders is untouched', () => {
    const source = ' 5. UPLOADERS ANONYMOUS   Sweden (QTX)     12   1,234,567';
    const row: Cell[] = Array.from(source.padEnd(80)).map((ch) => ({
      ch, fg: 5, bg: 0, bold: false, rvs: false,
    }));
    const frame = makeFrame(80, 1, [row], { x: 0, y: 0 });
    // Same object back: nothing matched, so nothing was rebuilt.
    expect(stripNarrowNoise(frame)).toBe(frame);
  });
});
