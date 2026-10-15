/**
 * Regression: ctop and GWALL fit the 25 rows a C64 caller has, so xim/io.ts
 * never opens a pause on them - and what each one gives up to fit is exactly
 * what the sysop agreed to give up (2026-09-07).
 *
 *   ctop  - eleven blank rows between its ruled header and its totals, of
 *           which the reducer takes only as many as it needs.
 *   GWALL - the OLDEST comments on the wall, and ONLY because
 *           Commands/BBSCmd/GWALL.info declares C64_DROP_OLDEST=1. The same
 *           fixture without that declaration still pauses, which is the pin
 *           that stops the reducer becoming everyone's problem.
 *
 * `unseenRows()` is the assertion because it is the exact question the pause
 * asks (xim/io.ts:1553-1562).
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';
import { doorDropsOldestAt40 } from '../../src/utils/door-min-columns.util';
import { readTooltypeMap } from '../../src/utils/info-file.util';

const FIXTURES = path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures');
const realSetTimeout = global.setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

/** One fixture through the real adapter; returns what went to the wire and what is left unseen. */
async function run(id: string, dropOldest = false): Promise<{ wire: string; unseen: number }> {
  const seen: string[] = [];
  const socket: any = {
    emit: (_event: string, payload: any) => {
      if (typeof payload === 'string') seen.push(payload);
      return true;
    },
  };
  socket.session = { terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25 };
  const adapter = installC64DoorAdapter(socket, socket.session, { dropOldest });
  expect(adapter).not.toBeNull();

  const text = fs.readFileSync(path.join(FIXTURES, `${id}.ans`), 'latin1');
  for (let i = 0; i < text.length; i += 64) {
    socket.emit('ansi-output', text.slice(i, i + 64));
    if (i % 512 === 0) await wait(12);
  }
  await wait(60);
  const out = { wire: seen.join(''), unseen: adapter!.unseenRows() };
  uninstallC64DoorAdapter(socket);
  return out;
}

describe('a 40-column caller is not paged through ctop or the global wall', () => {
  jest.setTimeout(30000);

  test('ctop fits by giving up blank rows, and keeps its numbers and its totals', async () => {
    const { wire, unseen } = await run('ctop');
    expect(unseen).toBe(0);
    // The record the `stat` rung exists to keep whole, and the totals line.
    expect(['2,020,282,473', 'Total', 'Uploaded'].filter((w) => !wire.includes(w))).toEqual([]);
  });

  test('GWALL fits when the door declares C64_DROP_OLDEST, keeping the newest comments', async () => {
    const { wire, unseen } = await run('gwall', true);
    expect(unseen).toBe(0);
    // The newest comment on the wall, and the door's own prompt.
    expect(['Bowman', 'bUTTON'].filter((w) => !wire.includes(w))).toEqual([]);
  });

  test('the same wall without the declaration still pauses - nothing is dropped by default', async () => {
    const { unseen } = await run('gwall', false);
    expect(unseen).toBeGreaterThan(0);
  });

  test('GWALL is the door that declares it, and the resolver reads it', () => {
    const info = readTooltypeMap(
      path.resolve(__dirname, '../../../../Commands/BBSCmd/GWALL.info'),
    );
    expect(info.get('C64_DROP_OLDEST')).toBe('1');
    expect(doorDropsOldestAt40({ toolTypes: { C64_DROP_OLDEST: '1' } } as any)).toBe(true);
    expect(doorDropsOldestAt40({ toolTypes: { C64_ADAPT: '40' } } as any)).toBe(false);
    expect(doorDropsOldestAt40(null)).toBe(false);
  });
});
