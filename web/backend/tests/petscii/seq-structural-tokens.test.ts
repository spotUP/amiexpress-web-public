/**
 * Task 7 of `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`:
 * the STRUCTURAL MCI tokens inside a PETSCII `.seq` - `~SS_` (include),
 * `~SR_` (random numbered include), `~CC_` (run a command) and the inline
 * `~f` clear - plus the include-recursion depth guard and the include
 * resolver hole the shipped `Logoff.seq` exposes.
 *
 * Mechanism under test: `displayScreen`'s `isPetscii` branch hands a gated
 * `.seq` (first byte `~`, express.e:6800-6806) to the SAME inline sentinel
 * walker the ANSI path uses, with a PETSCII chunk emitter. Chunks are
 * rendered by `renderChunkBytes` - encode + feed the ONE oracle - and go out
 * on `petscii-bytes`, so a real C64 (telnet) and a web `P` session receive
 * identical bytes in document order.
 *
 * Every fixture is built as bytes in code: a `.seq` byte above 0x7F does not
 * survive a UTF-8 write (MEMORY: Edit/Write destroys high-bit bytes).
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

// The walker `require`s this module at call time for `~CC_`; it is the only
// place `screen.handler` touches it, so a factory mock cannot leak elsewhere.
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async () => true),
}));

import { AnsiToPetsciiTransducer, PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { displayScreen, loadScreenFile, parseMciCodes } from '../../src/handlers/screen.handler';
import { petsciiMachineFor } from '../../src/handlers/petscii-screen.render';
import {
  disposePetsciiSessionModel,
  installPetsciiModelChoke,
} from '../../src/utils/petscii-session-model';
import { processCommand } from '../../src/handlers/command.handler';
import { ANSI_ART_SKIPPED_NOTICE } from '../../src/utils/ansi-art-detect.util';

interface Emit {
  event: string;
  data: any;
}

/**
 * A socket with the session's terminal model choke on it, the way
 * `registerSocketHandlers` installs it on every real web socket
 * (`server/socket-handlers.ts`; `installPetsciiModelChoke`'s default resolver
 * reads `socket.session`, which is why the mock carries one). An `~SS_` that
 * resolves to a `.TXT` leaves on `ansi-output` and reaches the model there -
 * no scoped tap, the same path a menu, a door or a pause prompt takes.
 */
function makeSocket(emits: Emit[], session: any) {
  const socket = {
    id: `t7-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    session,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
  installPetsciiModelChoke(socket);
  return socket;
}

/** Every `petscii-bytes` payload, decoded, in emission order. */
function petsciiPayloads(emits: Emit[]): Buffer[] {
  return emits.filter(e => e.event === 'petscii-bytes').map(e => Buffer.from(e.data, 'base64'));
}

/** Everything the caller's terminal receives, as one latin1 string. */
function wireText(emits: Emit[]): string {
  return emits
    .map(e =>
      e.event === 'petscii-bytes'
        ? Buffer.from(e.data, 'base64').toString('latin1')
        : typeof e.data === 'string'
          ? e.data
          : '',
    )
    .join('');
}

/**
 * A fresh terminal fed EVERYTHING the socket put on the wire, consumed the
 * way a real one consumes it: `petscii-bytes` are raw PETSCII (`observe`),
 * `ansi-output` is ANSI that both transports transduce before it reaches a
 * screen - telnet in `connection-emitter.ts:104`, the web `P` session in
 * `BBSTerminal.tsx`. An `~SS_` that resolves to a `.TXT` legitimately takes
 * that ANSI arm, so this is the only honest model of where the cursor ends
 * up after an include.
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

/** The five machine fields a chunk is encoded against. */
function cursorState(state: PetsciiMachine['state']) {
  return {
    bank: state.charsetBank,
    x: state.cursorX,
    y: state.cursorY,
    pen: state.pen,
    reverse: state.reverse,
  };
}

const petsciiSession = (over: Record<string, any> = {}): any => ({
  petsciiMode: true,
  nodeId: 0,
  currentConf: 0,
  currentConfName: 'Main',
  user: { username: 'spot' },
  ...over,
});

/** latin1 `.seq` fixture: strings and raw byte arrays, in order. */
function seqBytes(...parts: Array<string | number | number[]>): Buffer {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') out.push(...Array.from(Buffer.from(part, 'latin1')));
    else if (typeof part === 'number') out.push(part);
    else out.push(...part);
  }
  return Buffer.from(out);
}

function tmpdir(tag: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `seq-t7-${tag}-`));
}

describe('structural MCI tokens in a PETSCII .seq (Task 7)', () => {
  beforeEach(() => {
    (processCommand as jest.Mock).mockClear();
  });

  it('~SS_ prefers a .seq sibling over the .TXT one', async () => {
    const dir = tmpdir('ss-seq');
    const includeArt = seqBytes(0x12, 0xa1, 0xb0, 0x92);
    fs.writeFileSync(path.join(dir, 'INC.SEQ'), includeArt);
    fs.writeFileSync(path.join(dir, 'INC.TXT'), 'TEXTVERSION', 'latin1');

    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~SS_', path.join(dir, 'INC'), '|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiSessionModel(session);
    expect(await displayScreen(makeSocket(emits, session), session, seqPath)).toBe(true);

    const all = Buffer.concat(petsciiPayloads(emits));
    expect(all.includes(includeArt)).toBe(true);
    expect(wireText(emits)).not.toContain('TEXTVERSION');
    expect(wireText(emits)).not.toContain('~SS_');
  });

  it('~SS_ falls back to the .TXT sibling when no .seq exists, and that content takes the ANSI path', async () => {
    const dir = tmpdir('ss-txt');
    fs.writeFileSync(path.join(dir, 'INC.TXT'), 'TEXTVERSION\r\n', 'latin1');

    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~SS_', path.join(dir, 'INC'), '|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiSessionModel(session);
    await displayScreen(makeSocket(emits, session), session, seqPath);

    // The include is ANSI text: it must NOT arrive on the PETSCII transport.
    expect(Buffer.concat(petsciiPayloads(emits)).toString('latin1')).not.toContain('TEXTVERSION');
    // ...but it must still reach the caller.
    expect(wireText(emits)).toContain('TEXTVERSION');
    // The host screen's own art still went out as PETSCII bytes.
    expect(Buffer.concat(petsciiPayloads(emits)).toString('latin1')).toContain('AA');
  });

  /**
   * The ANSI arm above leaves the oracle BLIND unless the include's bytes
   * are transduced into it: the terminal has drawn two lines and moved its
   * cursor, while the render machine still believes it is where the host
   * screen's art left it. Every chunk after the include - here a `~N|`
   * value - is then clipped and placed against a stale cursor.
   *
   * The discriminator is the mirror: a fresh terminal fed the whole wire the
   * way a real one consumes it. Oracle and terminal must agree.
   *
   * The include is no longer a SPECIAL case: it used to be covered by a
   * scoped tap `displayIncludedScreen` installed around it, and is now
   * covered by the transport choke, which sees every emit on the socket. The
   * second half of this test is the proof of exactly that - an `ansi-output`
   * emitted OUTSIDE any include, the way a door frame or a pause prompt
   * arrives, moves the same oracle.
   */
  it('an ANSI .TXT include still reaches the oracle, so the value after it lands where the terminal is', async () => {
    const dir = tmpdir('ss-txt-oracle');
    fs.writeFileSync(path.join(dir, 'INC.TXT'), 'hello\r\nthere\r\n', 'latin1');

    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~SS_', path.join(dir, 'INC'), '|~N|'));

    const emits: Emit[] = [];
    const session = petsciiSession({ user: { username: 'spot' } });
    disposePetsciiSessionModel(session);
    const socket = makeSocket(emits, session);
    expect(await displayScreen(socket, session, seqPath)).toBe(true);

    // The include really did take the ANSI arm.
    expect(wireText(emits)).toContain('hello');
    expect(Buffer.concat(petsciiPayloads(emits)).toString('latin1')).not.toContain('hello');

    const mirror = wireMirror(emits).state;
    expect(cursorState(petsciiMachineFor(session).state)).toEqual(cursorState(mirror));
    // The include moved the terminal off the host screen's row.
    expect(mirror.cursorY).toBeGreaterThan(0);

    // ...and an `ansi-output` with no include and no screen around it at all
    // moves the same oracle, because the choke is on the socket rather than
    // scoped to a render.
    const beforeLoose = cursorState(petsciiMachineFor(session).state);
    socket.emit('ansi-output', '\x1b[20;7H');
    const afterLoose = cursorState(petsciiMachineFor(session).state);
    expect(afterLoose).not.toEqual(beforeLoose);
    expect(afterLoose).toEqual(cursorState(wireMirror(emits).state));
  });

  it('~CC_ calls processCommand exactly once, with the same code the ANSI walker passes', async () => {
    const dir = tmpdir('cc');
    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~CC_JOIN|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiSessionModel(session);
    await displayScreen(makeSocket(emits, session), session, seqPath);

    expect(processCommand as jest.Mock).toHaveBeenCalledTimes(1);
    const petsciiCall = (processCommand as jest.Mock).mock.calls[0];
    expect(petsciiCall[2]).toBe('JOIN');
    expect(petsciiCall[3]).toBe('');
    expect(petsciiCall[4]).toBe(true);
    expect(wireText(emits)).not.toContain('~CC_');
    expect(wireText(emits)).not.toContain('\x00CC:');

    // ONE walker, so the ANSI path must reach processCommand identically -
    // the flavour only decides how the text AROUND the token is encoded.
    (processCommand as jest.Mock).mockClear();
    const ansiEmits: Emit[] = [];
    const ansiSession = { nodeId: 0, user: { username: 'spot' } } as any;
    const ansiSocket = makeSocket(ansiEmits, ansiSession);
    await parseMciCodes(
      'AA~CC_JOIN|BB',
      ansiSession,
      undefined,
      undefined,
      undefined,
      ansiSocket,
    );
    expect(processCommand as jest.Mock).toHaveBeenCalledTimes(1);
    const ansiCall = (processCommand as jest.Mock).mock.calls[0];
    expect(ansiCall.slice(2)).toEqual(petsciiCall.slice(2));
  });

  it('emits art / include / art as three payloads, in document order', async () => {
    const dir = tmpdir('order');
    const includeArt = seqBytes(0xa1, 0xa2);
    fs.writeFileSync(path.join(dir, 'INC.SEQ'), includeArt);

    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~SS_', path.join(dir, 'INC'), '|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiSessionModel(session);
    await displayScreen(makeSocket(emits, session), session, seqPath);

    const payloads = petsciiPayloads(emits);
    expect(payloads.length).toBe(3);
    expect(payloads[0].toString('latin1')).toBe(' AA');
    expect(Array.from(payloads[1])).toEqual(Array.from(includeArt));
    expect(payloads[2].toString('latin1')).toBe('BB');
    // Every emit on this screen is PETSCII - a gated .seq never falls through
    // to the 40-column reflow / art-skip path.
    expect(emits.every(e => e.event === 'petscii-bytes')).toBe(true);
    expect(wireText(emits)).not.toContain(ANSI_ART_SKIPPED_NOTICE);
  });

  it('a self-including .seq stops at the depth guard instead of blowing the stack', async () => {
    const dir = tmpdir('depth');
    const seqPath = path.join(dir, 'SELF.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ X~SS_', seqPath, '|'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiSessionModel(session);
    await displayScreen(makeSocket(emits, session), session, seqPath);

    // Cap 8 includes: the top-level render plus includes at depths 1..8.
    const xs = Buffer.concat(petsciiPayloads(emits)).toString('latin1').split('X').length - 1;
    expect(xs).toBe(9);
  });

  it('the inline ~f clear goes out as $93 on the PETSCII wire, never as an ANSI escape', async () => {
    const dir = tmpdir('clear');
    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~f|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiSessionModel(session);
    await displayScreen(makeSocket(emits, session), session, seqPath);

    const all = Buffer.concat(petsciiPayloads(emits));
    expect(Array.from(all)).toEqual([0x20, 0x41, 0x41, 0x93, 0x42, 0x42]);
    expect(wireText(emits)).not.toContain('\x1b[2J');
  });
});

describe('include resolver: a numbered name already carries its extension (Task 7)', () => {
  it('001.logoff.seq resolves to 001.logoff.txt when only the .txt exists', () => {
    const dir = tmpdir('resolve-txt');
    fs.writeFileSync(path.join(dir, '001.logoff.txt'), 'LOGOFF ART\r\n', 'latin1');

    const found = loadScreenFile(path.join(dir, '001.logoff.seq'), undefined, 0, petsciiSession());

    expect(found).not.toBeNull();
    expect(path.basename(found!.filePath)).toBe('001.logoff.txt');
    expect(found!.isPetscii).toBe(false);
  });

  it('001.logoff.seq resolves to the .seq when BOTH exist', () => {
    const dir = tmpdir('resolve-seq');
    fs.writeFileSync(path.join(dir, '001.logoff.txt'), 'LOGOFF ART\r\n', 'latin1');
    fs.writeFileSync(path.join(dir, '001.logoff.seq'), Buffer.from([0xa1, 0x0d]));

    const found = loadScreenFile(path.join(dir, '001.logoff.seq'), undefined, 0, petsciiSession());

    expect(found).not.toBeNull();
    expect(path.basename(found!.filePath)).toBe('001.logoff.seq');
    expect(found!.isPetscii).toBe(true);
  });

  /**
   * The resolver widened for `~SS_`/`~SR_` in Task 7 (a name that already
   * carries a screen extension gets it SWAPPED, not appended). These two
   * pin the edges of that widening, which nothing else covers.
   */
  it('an explicit .txt include still prefers the .seq sibling for a PETSCII session', () => {
    const dir = tmpdir('resolve-explicit-txt');
    fs.writeFileSync(path.join(dir, 'FOO.txt'), 'ANSI VERSION\r\n', 'latin1');
    fs.writeFileSync(path.join(dir, 'FOO.seq'), Buffer.from([0xa1, 0x0d]));

    const found = loadScreenFile(path.join(dir, 'FOO.txt'), undefined, 0, petsciiSession());

    // `resolvePetsciiPath` swaps the extension BEFORE the probe list runs,
    // so an `~SS_FOO.txt` written for the ANSI board still serves the C64
    // its own artwork.
    expect(found).not.toBeNull();
    expect(path.basename(found!.filePath)).toBe('FOO.seq');
    expect(found!.isPetscii).toBe(true);

    // An ANSI session on the same pair gets the file it asked for.
    const ansi = loadScreenFile(path.join(dir, 'FOO.txt'), undefined, 0, { nodeId: 0 } as any);
    expect(path.basename(ansi!.filePath)).toBe('FOO.txt');
    expect(ansi!.isPetscii).toBe(false);
  });

  it('a missing lowercase .txt resolves to the uppercase .TXT on disk', () => {
    const dir = tmpdir('resolve-case');
    // Only the legacy Amiga spelling exists - the case the shipped board is
    // full of.
    fs.writeFileSync(path.join(dir, 'BAR.TXT'), 'UPPER VERSION\r\n', 'latin1');

    const found = loadScreenFile(path.join(dir, 'BAR.txt'), undefined, 0, petsciiSession());

    expect(found).not.toBeNull();
    expect(path.basename(found!.filePath)).toBe('BAR.TXT');
    expect(found!.content).toContain('UPPER VERSION');
  });

  it('an extensionless name resolves exactly as today (ANSI pin)', () => {
    const dir = tmpdir('resolve-ansi');
    fs.writeFileSync(path.join(dir, 'MENU.txt'), 'MENU TEXT\r\n', 'latin1');

    const ansi = loadScreenFile(path.join(dir, 'MENU'), undefined, 0, { nodeId: 0 } as any);
    expect(ansi).not.toBeNull();
    expect(path.basename(ansi!.filePath)).toBe('MENU.txt');

    // An explicit extension that DOES exist is still used verbatim.
    const explicit = loadScreenFile(path.join(dir, 'MENU.txt'), undefined, 0, { nodeId: 0 } as any);
    expect(path.basename(explicit!.filePath)).toBe('MENU.txt');
  });
});
