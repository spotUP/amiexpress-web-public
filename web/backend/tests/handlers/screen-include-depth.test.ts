/**
 * The include-recursion cap (`MAX_SCREEN_INCLUDE_DEPTH`, screen.handler.ts:402)
 * on the ANSI arm.
 *
 * `displayIncludedScreen` is the ONE guard standing between a sysop-editable
 * screen and a blown stack: a screen whose `~SS_` names itself recurses
 * `displayScreen` -> `parseMciCodes` -> the inline walker -> `~SS_` ->
 * `displayIncludedScreen` -> `displayScreen` for ever, and express.e has no
 * guard because its screens are hand-written data - ours are edited from the
 * config app (screen.handler.ts:394-401).
 *
 * The board takes the inline arm (`inlineMode = socket !== undefined`,
 * screen.handler.ts:666), so the cap that protects a live node is the one on
 * `displayIncludedScreen`, NOT the `includeDepth` option (that guards only the
 * socket-less preview route, screens-routes.ts:425). Every seq-mci test
 * exercises a PETSCII `.seq`; this pins the SAME guard on the ANSI `.txt`
 * include arm, which had no coverage at all.
 *
 * SKIP_DB_INIT + emit-spy socket + absolute-path idiom are copied from
 * `tests/petscii/seq-mci.test.ts`.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

import { displayScreen } from '../../src/handlers/screen.handler';

interface Emit {
  event: string;
  data: any;
}

function makeSocket(emits: Emit[]) {
  return {
    id: `include-depth-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

/** Everything the caller's terminal received, as one latin1 string. */
function wireText(emits: Emit[]): string {
  return emits
    .map((e) =>
      e.event === 'petscii-bytes'
        ? Buffer.from(e.data, 'base64').toString('latin1')
        : typeof e.data === 'string'
          ? e.data
          : '',
    )
    .join('');
}

describe('screen include-depth cap on the ANSI ~SS_ arm', () => {
  it('a screen that includes itself terminates, and never puts the token on the wire', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'include-depth-'));
    const selfPath = path.join(dir, 'SELF.TXT');
    // The include is the FIRST line so the first byte is `~` and MCI is armed
    // (allowMCI, screen.handler.ts:2079). It names this very file, so each
    // level recurses; the tail marker after it emits once per level as the
    // stack unwinds - a countable proof the walk was bounded, not a crash.
    fs.writeFileSync(selfPath, `~SS_${selfPath}\nMARK\n`, 'latin1');

    const emits: Emit[] = [];
    const socket = makeSocket(emits);
    const session: any = { nodeId: 0, currentConf: 0 };

    // The bug this guards against is unbounded recursion: without the cap this
    // call never returns (RangeError: Maximum call stack size exceeded).
    await displayScreen(socket, session, selfPath);

    const wire = wireText(emits);
    // (1) The recursion was bounded - the marker appears a finite, capped
    // number of times, not until the stack blows.
    const marks = wire.split('MARK').length - 1;
    expect(marks).toBeGreaterThan(0);
    expect(marks).toBeLessThanOrEqual(9); // cap 8 => at most 9 nested draws

    // (2) The include TOKEN itself never reaches the terminal, at any depth.
    expect(wire).not.toContain('~SS_');
  });
});
