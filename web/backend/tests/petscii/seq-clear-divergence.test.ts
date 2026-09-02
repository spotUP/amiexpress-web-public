/**
 * Task 7 / Task 6's divergence rule, in
 * `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`.
 *
 * THREE oracles have to agree on where the cursor is: the render-side
 * `PetsciiMachine` (`petscii-screen.render.ts`), the telnet emitter's
 * transducer (`connection-emitter.ts`) and the web client's machine
 * (`BBSTerminal.tsx`). They agree only if every byte that reaches the wire
 * also reaches the render machine.
 *
 * `displayScreen` clears the screen for nine screen names
 * (`SCREENS_REQUIRE_CLEAR`) by emitting `\x1b[2J\x1b[H` on `ansi-output`.
 * A C64 does not speak ANSI, and the render machine never sees that clear:
 * the terminal is homed while the machine still believes the cursor is
 * where the previous screen's art left it, so every substituted value on
 * the new screen is encoded against a stale row/column. In PETSCII the
 * clear must be `$93` (CLR) and must go out through the SAME chunk emitter
 * the art does, so the oracle observes it.
 *
 * `config.getConfig().dataDir` is redirected at a temp tree because the
 * clear is keyed on the screen NAME - an absolute path is never in
 * `SCREENS_REQUIRE_CLEAR`, so this test needs a real named lookup. The env
 * var is read in the ConfigManager constructor, which has already run by the
 * time a test body executes, so the accessor is spied instead.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-t7-clear-'));
fs.mkdirSync(path.join(DATA_DIR, 'Screens'), { recursive: true });
process.env.SKIP_DB_INIT = '1';

import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { config } from '../../src/config';
import { displayScreen } from '../../src/handlers/screen.handler';
import { petsciiRenderCtxFor, disposePetsciiRenderCtx } from '../../src/handlers/petscii-screen.render';

interface Emit {
  event: string;
  data: any;
}

function makeSocket(emits: Emit[]) {
  return {
    id: `t7-clear-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

function petsciiWire(emits: Emit[]): Buffer {
  return Buffer.concat(
    emits.filter(e => e.event === 'petscii-bytes').map(e => Buffer.from(e.data, 'base64')),
  );
}

function row(machine: PetsciiMachine, y: number): number[] {
  const { cols, screen } = machine.state;
  return Array.from(screen.slice(y * cols, (y + 1) * cols));
}

describe('a shouldClear PETSCII screen clears with $93, through the render machine (Task 7)', () => {
  let configSpy: jest.SpyInstance;

  beforeAll(() => {
    const real = config.getConfig();
    configSpy = jest.spyOn(config, 'getConfig').mockReturnValue({ ...real, dataDir: DATA_DIR });
  });

  afterAll(() => configSpy.mockRestore());

  it('the CLS reaches the wire as $93 and the oracle agrees with a fresh machine fed that wire', async () => {
    // Screen 1: two rows of art, absolute path (never a shouldClear name).
    const pre = path.join(DATA_DIR, 'PRE.SEQ');
    fs.writeFileSync(pre, Buffer.from([0x7e, 0x20, 0x41, 0x41, 0x0d, 0x42, 0x42, 0x0d]));
    // Screen 2: BULL, which IS in SCREENS_REQUIRE_CLEAR. A GLOBAL screen, so
    // it is read from `Screens/` - MENU is a CONF screen and, since the loader
    // stopped inventing cross-directory fallbacks, is only ever read from the
    // conference's own LOCATION.n directory.
    fs.writeFileSync(
      path.join(DATA_DIR, 'Screens', 'BULL.seq'),
      Buffer.from([0x7e, 0x20, 0x48, 0x49]),
    );

    const session: any = {
      petsciiMode: true,
      nodeId: 0,
      currentConf: 0,
      currentConfName: 'Main',
      user: { username: 'spot' },
    };
    disposePetsciiRenderCtx(session);

    const emits: Emit[] = [];
    const socket = makeSocket(emits);
    await displayScreen(socket, session, pre);

    const machine = (await petsciiRenderCtxFor(session)).machine;
    expect(machine.state.cursorY).toBe(2);   // the art left it on row 2

    const emitsAfter: Emit[] = [];
    const socket2 = makeSocket(emitsAfter);
    expect(await displayScreen(socket2, session, 'BULL')).toBe(true);

    // (1) The clear is on the PETSCII transport, as $93 - never an ANSI escape.
    const wire = petsciiWire(emitsAfter);
    expect(wire.length).toBeGreaterThan(0);
    expect(wire[0]).toBe(0x93);
    for (const e of emitsAfter) {
      expect(e.event).toBe('petscii-bytes');
    }

    // (2) The render machine OBSERVED it: the new screen starts at row 0, and
    //     the previous screen's art is gone from the matrix.
    expect(machine.state.cursorY).toBe(0);
    expect(row(machine, 0).slice(0, 3)).toEqual([0x20, 0x08, 0x09]);   // ' HI'
    expect(row(machine, 2).every(c => c === 0x20)).toBe(true);

    // (3) A fresh machine fed exactly what the terminal received ends in the
    //     same place - the transducer's oracle and the render oracle agree.
    const fresh = new PetsciiMachine();
    fresh.feed(Buffer.concat([petsciiWire(emits), wire]));
    expect(fresh.state.cursorX).toBe(machine.state.cursorX);
    expect(fresh.state.cursorY).toBe(machine.state.cursorY);
    expect(fresh.state.charsetBank).toBe(machine.state.charsetBank);
    expect(Array.from(fresh.state.screen)).toEqual(Array.from(machine.state.screen));
  });
});
