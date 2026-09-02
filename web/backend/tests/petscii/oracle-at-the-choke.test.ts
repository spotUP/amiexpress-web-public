/**
 * Task OC-1 of `thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`:
 * the RED suite.
 *
 * THE SYMPTOM: a PETSCII session's `.seq` render encodes and clips every
 * substituted value against `petsciiMachineFor(session)` - the bank it is in,
 * the row it may not scroll off, the column it may not wrap past. That only
 * holds while the oracle has seen everything the terminal has. Today the
 * oracle is fed by four SCOPED taps (`installPetsciiOracleTap`,
 * `screen.handler.ts:1521`) plus the render's own bytes, so everything
 * between two `.seq` screens - a paginated `.TXT`'s first page, a `.TXT`
 * displayed directly, a door's frame, a door's raw PETSCII - is invisible to
 * it. The next `.seq` is then encoded against a cursor nobody has.
 *
 * Every test below drives a PRODUCT entry point (`displayScreen`,
 * `handlePaginatedScreenInput`, the real `BBSApi` a door is handed) and then
 * asserts the ONE invariant: the session's oracle equals a fresh terminal fed
 * the whole wire. `wireMirror` is copied verbatim from
 * `tests/petscii/seq-pause-and-colour.test.ts:105-119` - it is the definition
 * of "what the terminal has".
 *
 * These five are RED until OC-4 moves the model to the transport choke. They
 * fail on a cursor / bank / pen mismatch, never on a crash or a missing
 * fixture.
 *
 * Fixtures are byte arrays built in code. Never write a `.seq` fixture
 * through Edit/Write: the UTF-8 round-trip destroys every high-bit byte.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

import { AnsiToPetsciiTransducer, PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import {
  displayScreen,
  handlePaginatedScreenInput,
} from '../../src/handlers/screen.handler';
import { petsciiMachineFor } from '../../src/handlers/petscii-screen.render';
import { createBBSApi } from '../../src/doors/BBSApi';

interface Emit {
  event: string;
  data: any;
}

/** Fixture builder: latin1 strings, single bytes and byte arrays, in order. */
function seqBytes(...parts: Array<string | number | number[]>): Buffer {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') out.push(...Array.from(Buffer.from(part, 'latin1')));
    else if (typeof part === 'number') out.push(part);
    else out.push(...part);
  }
  return Buffer.from(out);
}

function makeSocket(emits: Emit[]) {
  return {
    id: `oracle-choke-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => {
      emits.push({ event, data });
      return true;
    },
    on: () => {},
    off: () => {},
    removeListener: () => {},
  } as any;
}

const petsciiSession = (over: Record<string, any> = {}): any => ({
  petsciiMode: true,
  terminalType: 'c64',
  nodeId: 0,
  currentConf: 0,
  screenWidth: 40,
  screenHeight: 25,
  user: { username: 'Spot' },
  ...over,
});

/** A screen file on disk, named so it is NOT in `SCREENS_REQUIRE_CLEAR`. */
function writeScreen(base: string, bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-choke-'));
  const file = path.join(dir, base);
  fs.writeFileSync(file, bytes);
  return file;
}

/**
 * A fresh terminal fed EVERYTHING this socket put on the wire, consumed the
 * way a real one consumes it: `petscii-bytes` are raw PETSCII (`observe`),
 * `ansi-output` is ANSI that BOTH transports transduce before it reaches a
 * screen - the telnet emitter (`connection-emitter.ts:104`) and the web `P`
 * session's client-side transducer (`BBSTerminal.tsx`, the enqueuePetscii
 * feed).
 *
 * Copied verbatim from `seq-pause-and-colour.test.ts`.
 */
function wireMirror(emits: Emit[]): PetsciiMachine {
  const terminal = new AnsiToPetsciiTransducer();
  for (const e of emits) {
    if (e.event === 'petscii-bytes') {
      terminal.observe(Buffer.from(e.data, 'base64'));
    } else if (
      (e.event === 'ansi-output' || e.event === 'petscii-output') &&
      typeof e.data === 'string'
    ) {
      terminal.transduce(e.data);
    }
  }
  return terminal.machine;
}

/** The session's oracle must equal a fresh terminal fed the whole wire. */
function expectOracleMatchesWire(session: any, emits: Emit[]): void {
  const wire = wireMirror(emits); // fresh AnsiToPetsciiTransducer, whole wire
  const oracle = petsciiMachineFor(session); // what the render encodes against
  expect({
    x: oracle.state.cursorX,
    y: oracle.state.cursorY,
    bank: oracle.state.charsetBank,
    pen: oracle.state.pen,
    rvs: oracle.state.reverse,
  }).toEqual({
    x: wire.state.cursorX,
    y: wire.state.cursorY,
    bank: wire.state.charsetBank,
    pen: wire.state.pen,
    rvs: wire.state.reverse,
  });
}

/**
 * The `.seq` under test: the express.e gate byte, a space the tokenizer eats,
 * then ONE substituted value (`~N` - the caller's name) and one art byte. The
 * value is clipped and placed against the oracle, so it is the thing the
 * drift breaks.
 */
const VALUE_SEQ = seqBytes(0x7e, 0x20, '~N|', 'Z');

describe('OC-1 RED: the oracle drifts from the terminal between screens', () => {
  it('a .seq shown after a paged .TXT is encoded against the real cursor', async () => {
    const session = petsciiSession();
    const emits: Emit[] = [];
    const socket = makeSocket(emits);

    // A `.TXT` long enough to paginate: displayScreen parks a
    // `paginatedScreen` and puts the FIRST page on the wire through its own
    // `emitPage`/`emitWithModem` - outside every tap.
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) lines.push(`LINE ${i}`);
    const txt = writeScreen('PAGED.TXT', Buffer.from(lines.join('\r\n'), 'latin1'));

    expect(await displayScreen(socket, session, txt)).toBe(true);
    expect(session.paginatedScreen).toBeDefined();

    // Answer `More(y/n/ns)?` the way the socket input handler does.
    expect(await handlePaginatedScreenInput(socket, session, '')).toBe(true);

    // ...then a `.seq` with no `$93` to hide the drift.
    const seq = writeScreen('T.SEQ', VALUE_SEQ);
    expect(await displayScreen(socket, session, seq)).toBe(true);

    expectOracleMatchesWire(session, emits);
  });

  it('a .seq shown straight after a .TXT is encoded against the real cursor', async () => {
    const session = petsciiSession();
    const emits: Emit[] = [];
    const socket = makeSocket(emits);

    const txt = writeScreen('SHORT.TXT', Buffer.from('HELLO\r\nTHERE\r\n', 'latin1'));
    expect(await displayScreen(socket, session, txt)).toBe(true);

    const seq = writeScreen('T.SEQ', VALUE_SEQ);
    expect(await displayScreen(socket, session, seq)).toBe(true);

    expectOracleMatchesWire(session, emits);
  });

  it("a door's output moves the oracle", async () => {
    const session = petsciiSession();
    const emits: Emit[] = [];
    const socket = makeSocket(emits);

    // The seam every TypeScript door's prose and every blessed frame takes
    // (`BBSApi.write`, `doors/BBSApi.ts:166`).
    const api = createBBSApi(socket, session);
    api.write('\x1b[10;5H\x1b[33mDOOR FRAME');

    const seq = writeScreen('T.SEQ', VALUE_SEQ);
    expect(await displayScreen(socket, session, seq)).toBe(true);

    expectOracleMatchesWire(session, emits);
  });

  it("a door's raw PETSCII moves the oracle", async () => {
    const session = petsciiSession();
    const emits: Emit[] = [];
    const socket = makeSocket(emits);

    // `BBSApi.writePetscii(Buffer)` (`doors/BBSApi.ts:308`): clear, lower-case
    // bank, two cursor-downs. No server model observes it today.
    const api = createBBSApi(socket, session);
    api.writePetscii(Buffer.from([0x93, 0x8e, 0x11, 0x11]));

    const seq = writeScreen('T.SEQ', VALUE_SEQ);
    expect(await displayScreen(socket, session, seq)).toBe(true);

    expectOracleMatchesWire(session, emits);
  });

  it('a petscii-output string moves the oracle', async () => {
    const session = petsciiSession();
    const emits: Emit[] = [];
    const socket = makeSocket(emits);

    // `BBSApi.writePetsciiLine(string)` (`doors/BBSApi.ts:322-324`) emits on
    // `petscii-output`, which the tap ignores (`screen.handler.ts:1536-1547`).
    const api = createBBSApi(socket, session);
    api.writePetsciiLine('HELLO');

    const seq = writeScreen('T.SEQ', VALUE_SEQ);
    expect(await displayScreen(socket, session, seq)).toBe(true);

    expectOracleMatchesWire(session, emits);
  });
});
