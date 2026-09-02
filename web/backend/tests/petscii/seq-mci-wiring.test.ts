/**
 * Task 6 of `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`:
 * ONE render, both transports.
 *
 * Task 5 built `renderPetsciiScreen` and nothing called it. These tests
 * drive the PRODUCT'S entry point - `displayScreen(socket, session,
 * screenName)`, the function command.handler.ts / menu.ts actually call -
 * and prove the render happens on the way to `petscii-bytes`:
 *
 *   1. reachability: a `.seq` opening with `~` reaches the wire with its
 *      MCI substituted, in the bank the art left the machine in, with the
 *      surrounding art byte-identical.
 *   2. transport parity: the SAME screen through `buildConnectionEmitter`
 *      (telnet/SSH, a real C64) and through a socket.io spy (web) puts the
 *      identical bytes on the wire. One render, two transports - the
 *      contract of decision 2.
 *   3. the web payload equality contract: the base64 `petscii-bytes`
 *      payload decodes to exactly what `renderPetsciiScreen` returns, which
 *      is what `BBSTerminal.tsx:2147-2153` feeds its canvas machine
 *      verbatim.
 *   4. the ANSI pin: an ANSI session displaying the same screen name (with
 *      a `.TXT` sibling) still produces byte-identical `ansi-output`.
 *
 * Fixtures are built as byte arrays in code, never through Edit/Write - the
 * UTF-8 round-trip in those tools destroys high-bit PETSCII bytes.
 * SKIP_DB_INIT + emit-spy socket + absolute-path idioms follow
 * `tests/handlers/petscii-bytes-transport.test.ts` and
 * `tests/petscii/seq-mci.test.ts`.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { displayScreen } from '../../src/handlers/screen.handler';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import {
  renderPetsciiScreen,
  petsciiRenderCtxFor,
  disposePetsciiRenderCtx,
} from '../../src/handlers/petscii-screen.render';

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

/**
 * The MCI gate byte plus a space: express.e consumes the opening `~` as an
 * unknown code, and the space keeps the art that follows out of it
 * (`tests/petscii/seq-mci.test.ts` documents the same seam).
 */
const GATE = [0x7e, 0x20];

/** `~` + art + `~N|` + art + `~CN|` + art, with the bank flip caller-chosen. */
function wiringFixture(bank: number): Buffer {
  return seqBytes(GATE, bank, 'HI ', '~N|', ' ', '~CN|', ' BYE');
}

function makeSocket(emits: Emit[]) {
  return {
    // getAnsiBuffer (via displayScreen's flushOutput) keys its per-socket
    // buffer on socket.id and registers a 'disconnect' listener.
    id: `seq-mci-wiring-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

const petsciiSession = (over: Record<string, any> = {}): any => ({
  petsciiMode: true,
  nodeId: 0,
  currentConf: 0,
  currentConfName: 'Amiga',
  user: { username: 'spot' },
  ...over,
});

/** Write one fixture into a fresh temp dir and hand back its absolute path. */
function writeSeq(name: string, bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-mci-wiring-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes);
  return file;
}

/** The single `petscii-bytes` payload, decoded. Fails loudly if there isn't exactly one. */
function petsciiWire(emits: Emit[]): Buffer {
  const events = emits.filter((e) => e.event === 'petscii-bytes');
  expect(events).toHaveLength(1);
  return Buffer.from(events[0].data, 'base64');
}

/** Row `y` of a fresh machine's screen matrix after being fed `bytes`. */
function screenRow(bytes: Buffer, y: number): number[] {
  const machine = new PetsciiMachine();
  machine.feed(bytes);
  const { cols, screen } = machine.state;
  return Array.from(screen.slice(y * cols, (y + 1) * cols));
}

describe('Task 6: displayScreen renders MCI into the petscii-bytes wire', () => {
  /**
   * The headline criterion. Everything below is a property of the bytes the
   * PRODUCT put on the wire, decoded and fed to a fresh `PetsciiMachine` -
   * the same machine `BBSTerminal.tsx` and a real C64's KERNAL run.
   *
   * Lower bank ($0E): 'spot' is PETSCII $53 $50 $4F $54 (screen codes $13
   * $10 $0F $14) and 'Amiga' opens with the shifted $C1 (screen code $41).
   * Upper bank ($8E): the same name folds to $41-$5A, none in $C1-$DA.
   */
  it.each([
    {
      label: 'lower-case bank ($0E)',
      bank: 0x0e,
      expectedBank: 1,
      name: [0x53, 0x50, 0x4f, 0x54],
      conf: [0xc1, 0x4d, 0x49, 0x47, 0x41],
      nameCells: [0x13, 0x10, 0x0f, 0x14],
      confCells: [0x41, 0x0d, 0x09, 0x07, 0x01],
    },
    {
      label: 'upper-case bank ($8E)',
      bank: 0x8e,
      expectedBank: 0,
      name: [0x53, 0x50, 0x4f, 0x54],
      conf: [0x41, 0x4d, 0x49, 0x47, 0x41],
      nameCells: [0x13, 0x10, 0x0f, 0x14],
      confCells: [0x01, 0x0d, 0x09, 0x07, 0x01],
    },
  ])(
    'displayScreen substitutes ~N and ~CN in the $label with the art byte-identical',
    async ({ bank, expectedBank, name, conf, nameCells, confCells }) => {
      const fixture = wiringFixture(bank);
      const seqPath = writeSeq('T.SEQ', fixture);

      const emits: Emit[] = [];
      const shown = await displayScreen(makeSocket(emits), petsciiSession(), seqPath);
      expect(shown).toBe(true);

      const wire = petsciiWire(emits);

      // The token never reaches the wire; the value did.
      expect(wire.toString('latin1')).not.toContain('~N|');
      expect(wire.toString('latin1')).not.toContain('~CN|');
      expect(Array.from(wire)).toEqual([
        0x20, bank, 0x48, 0x49, 0x20, ...name, 0x20, ...conf, 0x20, 0x42, 0x59, 0x45,
      ]);

      // Art either side of the substitutions, byte for byte.
      expect(wire.subarray(2, 5).equals(Buffer.from('HI ', 'latin1'))).toBe(true);
      expect(wire.subarray(wire.length - 4).equals(Buffer.from(' BYE', 'latin1'))).toBe(true);

      // Decisions 5 and 6: no bank switch, no colour byte, no reverse toggle
      // inside a substituted value.
      const values = [...name, ...conf];
      expect(values.some((b) => b === 0x0e || b === 0x8e || b === 0x12 || b === 0x92)).toBe(false);

      // Fed to a fresh machine - the terminal's own oracle - the cells spell
      // the username and the conference name.
      const row0 = screenRow(wire, 0);
      expect(row0.slice(4, 8)).toEqual(nameCells);
      expect(row0.slice(9, 14)).toEqual(confCells);

      const machine = new PetsciiMachine();
      machine.feed(wire);
      expect(machine.state.charsetBank).toBe(expectedBank);
    },
  );

  /**
   * Decision 2's whole point: ONE server-side render, two transports. The
   * telnet/SSH emitter (`connection-emitter.ts:130-141`) forwards the
   * `petscii-bytes` payload to the wire untouched, so a real C64 and a web
   * `P` session must receive the identical byte string.
   */
  it('telnet (buildConnectionEmitter) and web (socket.io spy) put identical bytes on the wire', async () => {
    const seqPath = writeSeq('T.SEQ', wiringFixture(0x0e));

    const emits: Emit[] = [];
    await displayScreen(makeSocket(emits), petsciiSession(), seqPath);
    const webBytes = petsciiWire(emits);

    const written: Buffer[] = [];
    const connection: any = {
      sessionId: 'telnet-wiring-test',
      write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1')),
      session: petsciiSession({ terminalType: 'c64' }),
      on: () => {},
    };
    const emitter = buildConnectionEmitter(connection);
    await displayScreen(emitter, connection.session, seqPath);

    expect(written).toHaveLength(1);
    expect(written[0].equals(webBytes)).toBe(true);

    // Not vacuous: both wires carry the SUBSTITUTED screen, not the raw file.
    expect(written[0].toString('latin1')).not.toContain('~N|');
    expect(Array.from(written[0]).slice(5, 9)).toEqual([0x53, 0x50, 0x4f, 0x54]);
  });

  /**
   * The web payload equality contract: `BBSTerminal.tsx:2147-2153` feeds the
   * decoded base64 to its `PetsciiMachine` verbatim, so the payload must be
   * exactly `renderPetsciiScreen`'s output for that file - no second
   * conversion, no PUA detour, nothing appended.
   */
  it('the base64 petscii-bytes payload decodes to exactly renderPetsciiScreen output', async () => {
    const fixture = wiringFixture(0x0e);
    const seqPath = writeSeq('T.SEQ', fixture);

    const emits: Emit[] = [];
    await displayScreen(makeSocket(emits), petsciiSession(), seqPath);

    const reference = petsciiSession();
    disposePetsciiRenderCtx(reference);
    const ctx = await petsciiRenderCtxFor(reference);
    const expected = await renderPetsciiScreen(fixture, reference, ctx);

    expect(petsciiWire(emits).equals(expected)).toBe(true);
  });

  /**
   * The ANSI pin. The same screen NAME, an ANSI session, a `.TXT` sibling:
   * the ANSI path must be byte-identical to what it emitted before Task 6
   * existed. The expected string is the pre-change capture, hard-coded.
   */
  it('an ANSI session displaying the same screen name is byte-identical (pin)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-mci-wiring-ansi-'));
    fs.writeFileSync(path.join(dir, 'T.SEQ'), wiringFixture(0x0e));
    fs.writeFileSync(path.join(dir, 'T.TXT'), Buffer.from('HI ~N| BYE\r\n', 'latin1'));

    const emits: Emit[] = [];
    const session: any = {
      nodeId: 0,
      currentConf: 0,
      currentConfName: 'Amiga',
      user: { username: 'spot' },
    };
    const shown = await displayScreen(makeSocket(emits), session, path.join(dir, 'T'));

    expect(shown).toBe(true);
    expect(emits.some((e) => e.event === 'petscii-bytes')).toBe(false);
    expect(emits.map((e) => e.event)).toEqual(['ansi-output']);
    // Captured from the tree BEFORE Task 6 touched emitPetsciiScreen: the
    // frame-buffer path's cursor-hide / home framing, the file's own text with
    // its `~N|` still literal (the .TXT does not open with `~`, so the ANSI
    // allowMCI gate keeps it verbatim - express.e:6800-6806), then the reset
    // and cursor-show.
    expect(emits[0].data).toBe('\x1b[?25l\x1b[HHI ~N| BYE\r\n\x1b[0m\x1b[?25h');
  });
});
