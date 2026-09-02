/**
 * Task 1 of `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`:
 * the RED test for the shipped `Logoff.seq` bug.
 *
 * FACT. Twelve shipped conference screens are a 39-byte MCI include and
 * nothing else - `~SR_WORK:bbs/Screens/logoff/logoff.seq\n`:
 *
 *   Conf2/Screens/Logoff.seq   Conf3/Screens/Logoff.seq
 *   Conf4/Screens/Logoff.seq   Conf5/Screens/Logoff.seq
 *   Conf6/Screens/Logoff.seq   Conf7/Screens/Logoff.seq
 *   Conf8/Screens/Logoff.seq   Conf9/Screens/Logoff.seq
 *   Conf10/Screens/Logoff.seq  Conf11/Screens/Logoff.seq
 *   Conf12/Screens/Logoff.seq  Conf13/Screens/Logoff.seq
 *
 * A C64 caller logging off sees that literal text on screen, because
 * `displayScreen` early-returns on `isPetscii`
 * (`screen.handler.ts:1960-1964`) before `parseMciCodes` (`:379`) and
 * before the `allowMCI` gate (`:2086-2091`). express.e's first-byte `~`
 * gate (`express.e:6800-6806`) says a screen opening with `~` is MCI.
 *
 * GREEN as of Task 7, which wired the inline sentinel walker into the
 * PETSCII path and fixed the include resolver these files depend on
 * (`001.logoff.seq` -> `001.logoff.txt`). Both tests were `it.failing`
 * until then, because the whole backend suite gates CI
 * (`.github/workflows/backend-tests.yml` runs `npx jest ... --ci` on every
 * push/PR to main).
 *
 * SKIP_DB_INIT + emit-spy socket + absolute-path idiom are copied from
 * `tests/handlers/petscii-bytes-transport.test.ts`.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

import { displayScreen, setConferences } from '../../src/handlers/screen.handler';
import { ANSI_ART_SKIPPED_NOTICE } from '../../src/utils/ansi-art-detect.util';

/**
 * The shipped payload, byte for byte, built in code. Never write a `.seq`
 * fixture through Edit/Write: the UTF-8 round-trip in those tools turns
 * an Amiga/PETSCII high-bit byte into EF BF BD. latin1 keeps 1 char = 1
 * byte both ways.
 */
const SHIPPED_LOGOFF_SEQ = Buffer.from(
  '~SR_WORK:bbs/Screens/logoff/logoff.seq\n',
  'latin1',
);

interface Emit {
  event: string;
  data: any;
}

function makeSocket(emits: Emit[]) {
  return {
    // getAnsiBuffer (via displayScreen's flushOutput) keys its per-socket
    // buffer on socket.id and registers a 'disconnect' listener.
    id: `seq-mci-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

/**
 * Everything the caller's terminal receives, as one latin1 string:
 * `petscii-bytes` payloads decoded from base64, plus the text events.
 * The token must not survive on ANY of them - a `~SR_` that resolves to
 * a `.TXT` sibling legitimately arrives as `ansi-output` (Task 7's
 * fallback arm), so restricting the check to `petscii-bytes` would make
 * the assertion unsatisfiable rather than strict.
 */
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

describe('MCI inside a PETSCII .seq screen (Task 1: shipped Logoff.seq)', () => {
  let randomSpy: jest.SpyInstance;

  beforeEach(() => {
    // `~SR_` with no width prefix picks 1..99 at random
    // (screen.handler.ts:1211). Pin the draw to 001 so the assertion is
    // about MCI processing, not about a 1-in-99 dice roll. (The data-side
    // follow-up - editing the 12 shipped files to `~3SR_` - is recorded
    // in the plan's Task 7.)
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it(
    'a C64 logging off never sees the literal ~SR_ token, and does get art bytes',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-mci-logoff-'));
      const seqPath = path.join(dir, 'LOGOFF.SEQ');
      fs.writeFileSync(seqPath, SHIPPED_LOGOFF_SEQ);

      const emits: Emit[] = [];
      const socket = makeSocket(emits);
      const session: any = { petsciiMode: true, nodeId: 0 };

      const shown = await displayScreen(socket, session, seqPath);
      expect(shown).toBe(true);

      // (1) The bug of record: the token itself must never reach the wire.
      expect(wireText(emits)).not.toContain('~SR_');

      // (2) Strengthened per the plan (Task 7's resolver hole): absence of
      // the token is not proof the include resolved. A silently-empty
      // include emits nothing, or only the fixture's trailing newline.
      //
      // What this asserts is RESOLUTION, not what the include happens to
      // contain today. `~SR_WORK:bbs/Screens/logoff/logoff.seq` ->
      // `001.logoff.seq` -> (resolver fix) `Screens/logoff/001.logoff.*`,
      // and what that file IS is the sysop's data: today an 80-column ANSI
      // `.txt` (skipped with the ASCII token, `petsciiTextScreenPlan` ->
      // 'art-skip'), tomorrow the 40-column `00N.logoff.seq` handoff.md asks
      // for, which would put real PETSCII art on the wire. Both are a
      // resolved include; only an UNRESOLVED one leaves the wire with
      // nothing but the pre-clear and the fixture's own newline. Pinning the
      // skip token here would turn CI red the day the sysop fixes the data.
      // The next test owns the `.seq` arm, and the fixture test below owns
      // the art-skip arm.
      expect(emits.length).toBeGreaterThan(0);
      // The pre-clear ~SR_ sends before a full-screen file is $93 on the
      // PETSCII wire, never an ANSI escape (plan Task 6's divergence rule).
      const petsciiFirst = emits.find((e) => e.event === 'petscii-bytes');
      expect(petsciiFirst).toBeDefined();
      expect(Buffer.from(petsciiFirst!.data, 'base64')[0]).toBe(0x93);
      // Content beyond the clear, the fixture's newline and blank space:
      // the include brought something back.
      const beyondTheClear = wireText(emits).replace(/[\x93\r\n\x00 ]/g, '');
      expect(beyondTheClear.length).toBeGreaterThan(0);
      expect(wireText(emits)).not.toContain('\x1b[2J');

      // (3) Strengthened again in Task 6 (which wired the renderer into
      // `emitPetsciiScreen`): from that commit on, the `~SR_` TOKEN is gone
      // from the wire - the dispatch turns it into a NUL-delimited
      // structural sentinel (`mci-dispatch.ts:49-57`) and the renderer
      // passes it through untouched for the walker that Task 7 adds. Without
      // this assertion (1) and (2) both pass on that sentinel, and a C64
      // would be sent `\x00SR:...\x00` instead of the included art - the
      // same bug wearing different bytes. A sentinel is an INTERNAL marker
      // and must never reach a terminal.
      for (const sentinel of ['\x00SR:', '\x00SS:', '\x00CC:', '\x00SP\x00', '\x00F\x00']) {
        expect(wireText(emits)).not.toContain(sentinel);
      }
    },
  );

  /**
   * The same requirement, isolated from the shipped file's resolver
   * reality (only `Screens/logoff/00N.logoff.txt` exist on disk, so the
   * include above lands on the ANSI arm). Here the include target IS a
   * `.seq`, so Task 7 must put its art on `petscii-bytes` - the one
   * transport a real C64 and the web `P` session share
   * (`connection-emitter.ts:130-141`).
   */
  it(
    'a ~SR_ include that resolves to a .seq puts that art on petscii-bytes',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-mci-include-'));
      const incDir = path.join(dir, 'logoff');
      fs.mkdirSync(incDir);

      // Raw PETSCII art: clear, reverse-on, a high-bit graphic byte,
      // reverse-off, CR. Built in code for the same reason as above.
      const art = Buffer.from([0x93, 0x12, 0xa1, 0xb0, 0x92, 0x0d]);
      fs.writeFileSync(path.join(incDir, '001.logoff.seq'), art);

      // `~1SR_` - width 1 caps the random draw at 001 deterministically
      // (screen.handler.ts:1211 maxCount). The base path has no Amiga
      // assign, so it is used as-is.
      const seq = Buffer.from(
        `~1SR_${path.join(incDir, 'logoff.seq')}\n`,
        'latin1',
      );
      const seqPath = path.join(dir, 'LOGOFF.SEQ');
      fs.writeFileSync(seqPath, seq);

      const emits: Emit[] = [];
      const socket = makeSocket(emits);
      const session: any = { petsciiMode: true, nodeId: 0 };

      await displayScreen(socket, session, seqPath);

      expect(wireText(emits)).not.toContain('~1SR_');
      const petsciiPayloads = emits
        .filter((e) => e.event === 'petscii-bytes')
        .map((e) => Buffer.from(e.data, 'base64'));
      expect(petsciiPayloads.length).toBeGreaterThan(0);
      expect(Buffer.concat(petsciiPayloads).includes(art)).toBe(true);
    },
  );

  /**
   * The OTHER arm of the same include, on a fixture of its own: when the
   * numbered file that comes back is 80-column ANSI art, a PETSCII session
   * never reflows it - `petsciiTextScreenPlan` returns 'art-skip' and the
   * caller gets the ASCII token instead of a smeared picture.
   *
   * This is what the shipped `Logoff.seq` happens to hit today. Pinning it
   * on the shipped data would make a sysop's future 40-column
   * `00N.logoff.seq` turn CI red, so the rule is pinned here, where the test
   * owns the bytes.
   */
  it(
    'a ~SR_ include that resolves to 80-column ANSI art is skipped with the ASCII token',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-mci-artskip-'));
      const incDir = path.join(dir, 'logoff');
      fs.mkdirSync(incDir);

      // Absolute cursor addressing is rule 1 of the art detector
      // (`ansi-art-detect.util.ts`: a layout at coordinates is never a
      // paragraph), so this file is art whatever its row count.
      fs.writeFileSync(
        path.join(incDir, '001.logoff.txt'),
        '\x1b[2;10HTOP\r\n\x1b[12;40HMIDDLE\r\n',
        'latin1',
      );

      const seqPath = path.join(dir, 'LOGOFF.SEQ');
      fs.writeFileSync(
        seqPath,
        Buffer.from(`~1SR_${path.join(incDir, 'logoff.seq')}\n`, 'latin1'),
      );

      const emits: Emit[] = [];
      const session: any = { petsciiMode: true, nodeId: 0 };
      await displayScreen(makeSocket(emits), session, seqPath);

      expect(wireText(emits)).toContain(ANSI_ART_SKIPPED_NOTICE);
      // The picture itself never reached the caller, in either transport.
      expect(wireText(emits)).not.toContain('MIDDLE');
    },
  );
});

// ---------------------------------------------------------------------------
// Task 5 of the same plan: `renderPetsciiScreen`.
//
// One render path serves both C64 transports (decision 2). These tests drive
// the renderer directly - Task 6 wires it into `emitPetsciiScreen`, Task 7
// into the sentinel walker - and pin the rulings the plan settled:
//
//   * gate: only a `.seq` whose FIRST byte is `0x7E` is MCI (decision 3,
//     express.e:6800-6806); anything else comes back byte-identical.
//   * the PetsciiMachine is the ONLY bank/cursor/pen oracle, fed every byte
//     the render emits, so a token's encoding is positional.
//   * a substituted value never writes column 39 (`cols - 2` is the last
//     column it may occupy), so the machine - which has no deferred-wrap
//     latch - can never wrap or scroll inside a substitution (decision 4).
//   * no `$0E`/`$8E`, no colour byte and no `$12`/`$92` inside a value
//     (decisions 5 and 6): a value inherits the art's bank, pen and reverse.
//   * `PETSCII_RAW_CMDS` spans are already PETSCII bytes and pass through.
//   * `~x`/`~y` arrive as MOVE sentinels and resolve through the SDK's ONE
//     `petsciiMoveTo` walk against the LIVE machine.
//   * `~~` unescapes to one `~` AFTER tokenization (lane C's finding: the
//     ANSI path keeps that replace last, so the renderer needs its own).
//
// Every fixture is built as a byte array in code. A `.seq` byte above 0x7F
// does not survive a UTF-8 read/write cycle (MEMORY: Edit/Write destroys
// high-bit bytes).
// ---------------------------------------------------------------------------
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import {
  renderPetsciiScreen,
  petsciiRenderCtxFor,
  disposePetsciiRenderCtx,
} from '../../src/handlers/petscii-screen.render';

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
 * The MCI gate byte, followed by a space.
 *
 * express.e consumes the opening `~` as an (unknown) MCI code and prints the
 * rest of the line; our tokenizer does the same, reading the code up to the
 * next space / CR / LF / terminator. A space right after the gate byte keeps
 * the following art out of that first code - without it the art up to the
 * next `|` would be swallowed as one giant unknown code.
 */
const GATE = [0x7e, 0x20];

const petsciiSession = (over: Record<string, any> = {}): any => ({
  petsciiMode: true,
  nodeId: 0,
  currentConf: 0,
  currentConfName: 'Main',
  user: { username: 'spot' },
  ...over,
});

/** Render one fixture through a fresh context (a fresh oracle per test). */
async function render(fixture: Buffer, session: any): Promise<{ out: Buffer; machine: PetsciiMachine }> {
  disposePetsciiRenderCtx(session);
  const ctx = await petsciiRenderCtxFor(session);
  const out = await renderPetsciiScreen(fixture, session, ctx);
  return { out, machine: ctx.machine };
}

/** Row `y` of the machine's screen matrix, as plain screen codes. */
function row(machine: PetsciiMachine, y: number): number[] {
  const { cols, screen } = machine.state;
  return Array.from(screen.slice(y * cols, (y + 1) * cols));
}

describe('renderPetsciiScreen (Task 5)', () => {
  it('substitutes ~N in the LOWER-CASE bank ($0E): A-Z land in $C1-$DA', async () => {
    const session = petsciiSession({ user: { username: 'SpOt' } });
    const fixture = seqBytes(GATE, 0x0e, 'AB', '~N|', 'CD');

    const { out, machine } = await render(fixture, session);

    // space (art), $0E, art "AB", value, art "CD".
    expect(Array.from(out)).toEqual([
      0x20, 0x0e, 0x41, 0x42, 0xd3, 0x50, 0xcf, 0x54, 0x43, 0x44,
    ]);
    // Both art runs survive byte for byte.
    expect(out.subarray(2, 4).equals(Buffer.from('AB', 'latin1'))).toBe(true);
    expect(out.subarray(8, 10).equals(Buffer.from('CD', 'latin1'))).toBe(true);
    // The value carries no bank switch, no colour byte, no reverse toggle.
    const value = Array.from(out.subarray(4, 8));
    expect(value.some((b) => b === 0x0e || b === 0x8e || b === 0x12 || b === 0x92)).toBe(false);
    // The oracle saw it: the cells spell the name at columns 3..6.
    expect(machine.state.charsetBank).toBe(1);
    expect(row(machine, 0).slice(0, 9)).toEqual([
      0x20, 0x01, 0x02, 0x53, 0x10, 0x4f, 0x14, 0x03, 0x04,
    ]);
  });

  it('substitutes ~N in the UPPER-CASE bank ($8E): a mixed-case name folds up, no bank flip', async () => {
    const session = petsciiSession({ user: { username: 'SpOt' } });
    const fixture = seqBytes(GATE, 0x8e, 'AB', '~N|', 'CD');

    const { out, machine } = await render(fixture, session);

    expect(Array.from(out)).toEqual([
      0x20, 0x8e, 0x41, 0x42, 0x53, 0x50, 0x4f, 0x54, 0x43, 0x44,
    ]);
    const value = Array.from(out.subarray(4, 8));
    expect(value.every((b) => b >= 0x41 && b <= 0x5a)).toBe(true);
    expect(value.some((b) => b >= 0xc1 && b <= 0xda)).toBe(false);
    expect(value.some((b) => b === 0x0e || b === 0x8e)).toBe(false);
    // Bank 0 is where the art left it - the value never flipped it.
    expect(machine.state.charsetBank).toBe(0);
    expect(row(machine, 0).slice(0, 9)).toEqual([
      0x20, 0x01, 0x02, 0x13, 0x10, 0x0f, 0x14, 0x03, 0x04,
    ]);
  });

  it('substitutes ~CN in both banks, folding up in the upper bank', async () => {
    const session = petsciiSession({ currentConfName: 'Amiga' });

    const lower = await render(seqBytes(GATE, 0x0e, '~CN|'), session);
    expect(Array.from(lower.out)).toEqual([0x20, 0x0e, 0xc1, 0x4d, 0x49, 0x47, 0x41]);

    const upper = await render(seqBytes(GATE, 0x8e, '~CN|'), session);
    expect(Array.from(upper.out)).toEqual([0x20, 0x8e, 0x41, 0x4d, 0x49, 0x47, 0x41]);
    expect(Array.from(upper.out.subarray(2)).some((b) => b >= 0xc1 && b <= 0xda)).toBe(false);
  });

  it('a .seq that does NOT open with 0x7E round-trips byte for byte, and still feeds the oracle', async () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    // The plan names `Node1/Screens/BBSTITLE.SEQ`; the unreachable per-node
    // screen trees were moved under quarantine/ after the plan was written.
    const artCandidates = [
      path.join(repoRoot, 'Node1/Screens/BBSTITLE.SEQ'),
      path.join(repoRoot, 'quarantine/unreachable-node-screens/Node1/Screens/BBSTITLE.SEQ'),
    ];
    const artPath = artCandidates.find((p) => fs.existsSync(p));
    expect(artPath).toBeDefined();

    const art = fs.readFileSync(artPath as string);
    expect(art.length).toBe(864);
    expect(art[0]).toBe(0x1f);            // NOT 0x7E: art, never MCI
    expect(art.filter((b) => b === 0x0e).length).toBe(11);
    expect(art.filter((b) => b === 0x8e).length).toBe(11);

    const session = petsciiSession();
    const { out, machine } = await render(art, session);
    expect(out.equals(art)).toBe(true);
    // Identical Buffer, not just identical bytes - the gate is a fast path.
    expect(out).toBe(art);
    // The oracle still observed all 22 bank flips and the art itself.
    expect(row(machine, 0).some((c) => c !== 0x20)).toBe(true);

    // The second shipped shape: 1834 bytes, first byte 0x20, zero 0x7E.
    const plain = fs.readFileSync(path.join(repoRoot, 'Node1/BBSTITLE.SEQ'));
    expect(plain.length).toBe(1834);
    expect(plain[0]).toBe(0x20);
    expect(plain.filter((b) => b === 0x7e).length).toBe(0);
    const plainOut = await render(plain, petsciiSession());
    expect(plainOut.out.equals(plain)).toBe(true);
  });

  it('encodes the SAME token differently either side of a mid-file bank flip', async () => {
    const session = petsciiSession({ user: { username: 'SpOt' } });
    const fixture = seqBytes(GATE, 0x8e, '~N|', 0x0e, '~N|');

    const { out } = await render(fixture, session);

    expect(Array.from(out)).toEqual([
      0x20,
      0x8e, 0x53, 0x50, 0x4f, 0x54,   // upper bank: folded
      0x0e, 0xd3, 0x50, 0xcf, 0x54,   // lower bank: S and O in $C1-$DA
    ]);
    expect(Array.from(out.subarray(2, 6))).not.toEqual(Array.from(out.subarray(7, 11)));
  });

  it('clips a value at column 38 - never column 39, never a wrap, never a scroll', async () => {
    // 25 art spaces (the gate byte's own trailing space plus 24 more) put the
    // cursor on column 25; a 30-character name then has room for 14 columns
    // (25..38 inclusive).
    const session = petsciiSession({ user: { username: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123' } });
    expect(session.user.username.length).toBe(30);
    const fixture = seqBytes(GATE, ' '.repeat(24), '~N|');

    const { out, machine } = await render(fixture, session);

    const value = Array.from(out.subarray(25));
    expect(value.length).toBe(14);
    expect(value).toEqual(Array.from(Buffer.from('ABCDEFGHIJKLMN', 'latin1')));
    expect(machine.state.cursorY).toBe(0);
    expect(machine.state.cursorX).toBe(machine.state.cols - 1);   // 39, parked
    // Column 39 was never written, and the row below is untouched.
    expect(row(machine, 0)[machine.state.cols - 1]).toBe(0x20);
    expect(row(machine, 1).every((c) => c === 0x20)).toBe(true);
  });

  it('a value inherits the art pen and reverse state without emitting either', async () => {
    const session = petsciiSession();
    // art: space, $1C (red), $12 (reverse on), then the token.
    const fixture = seqBytes(GATE, 0x1c, 0x12, '~N|');

    const { out, machine } = await render(fixture, session);

    expect(Array.from(out)).toEqual([0x20, 0x1c, 0x12, 0x53, 0x50, 0x4f, 0x54]);
    const value = Array.from(out.subarray(3));
    expect(value.some((b) => b === 0x12 || b === 0x92)).toBe(false);
    expect(value.some((b) => b === 0x1c || b === 0x05 || b === 0x9a)).toBe(false);
    // The cells carry the art's pen (VIC 2 = red) and its reverse bit.
    for (let col = 1; col <= 4; col++) {
      expect(machine.state.colorRam[col]).toBe(2);
      expect(machine.state.screen[col] & 0x80).toBe(0x80);
    }
  });

  it('~c1| emits the VIC red PETSCII byte $1C, never an ANSI SGR run', async () => {
    const session = petsciiSession();
    const { out, machine } = await render(seqBytes(GATE, '~c1|', 'Z'), session);

    expect(Array.from(out)).toEqual([0x20, 0x1c, 0x5a]);
    expect(out.includes(0x1b)).toBe(false);
    expect(machine.state.pen).toBe(2);
  });

  it('unescapes ~~ to a single ~ AFTER tokenization', async () => {
    // "~ ~~~X\r": the gate eats the first `~`; the tokenizer's strict
    // fall-through re-emits the unknown code `~~X` verbatim, so a `~~` pair
    // reaches the output and only the renderer's own last pass can collapse
    // it (the ANSI path does the same replace at the end of parseMciCodes).
    const session = petsciiSession();
    const { out } = await render(seqBytes(GATE, '~~~X', 0x0d), session);

    expect(Array.from(out)).toEqual([0x20, 0x7e, 0x58, 0x0d]);
    expect(Buffer.from(out).toString('latin1')).not.toContain('~~');
  });

  it('resolves the ~x / ~y MOVE sentinels through petsciiMoveTo against the live cursor', async () => {
    const session = petsciiSession();

    // ~x10| = row 1, column 10 -> 0-based (9, 0). The art space already moved
    // the cursor to column 1, so the walk is eight cursor-rights.
    const x = await render(seqBytes(GATE, '~x10|', 'Z'), session);
    expect(Array.from(x.out)).toEqual([0x20, ...new Array(8).fill(0x1d), 0x5a]);
    expect(x.out.includes(0x1b)).toBe(false);
    expect(x.machine.state.cursorY).toBe(0);
    expect(x.machine.state.cursorX).toBe(10);   // 'Z' landed on column 9

    // ~y5| = row 5, column 1 -> 0-based (0, 4): four downs, one left.
    const y = await render(seqBytes(GATE, '~y5|', 'Z'), session);
    expect(Array.from(y.out)).toEqual([0x20, 0x11, 0x11, 0x11, 0x11, 0x9d, 0x5a]);
    expect(y.machine.state.cursorY).toBe(4);
    expect(y.machine.state.cursorX).toBe(1);

    // Out-of-range targets clamp to the machine's own geometry - no literal 40.
    const clamped = await render(seqBytes(GATE, '~x99|'), session);
    expect(Array.from(clamped.out)).toEqual([0x20, ...new Array(38).fill(0x1d)]);
    expect(clamped.machine.state.cursorX).toBe(clamped.machine.state.cols - 1);
  });

  it('caches ONLY the machine on the session, and disposes it on demand', async () => {
    const session = petsciiSession();

    const first = await petsciiRenderCtxFor(session);
    const second = await petsciiRenderCtxFor(session);
    // The oracle is carried across renders (a ~SP resume or a ~SS_ include
    // must continue the same bank and cursor)...
    expect(second.machine).toBe(first.machine);
    // ...while the volatile dispatch is rebuilt every time (caching it would
    // freeze ~TL / ~DT / ~CN at login).
    expect(second.dispatch).not.toBe(first.dispatch);

    disposePetsciiRenderCtx(session);
    const third = await petsciiRenderCtxFor(session);
    expect(third.machine).not.toBe(first.machine);
  });
});

describe('renderPetsciiScreen - structural tokens and the pre-pass hand-off (Task 5)', () => {
  it('passes a NUL sentinel through untouched and never lets the oracle print it', async () => {
    // Inline mode turns `~CC_` into `\x00CC:<cmd>\x00` for the caller's
    // walker (Task 7). Those bytes are not screen bytes: they must reach the
    // walker verbatim and must NOT be fed to the machine, or the art would
    // gain a stray "CC:TEST" and every later cursor reading would be wrong.
    const session = petsciiSession();
    disposePetsciiRenderCtx(session);
    const ctx = await petsciiRenderCtxFor(session, { inlineMode: true });
    const out = await renderPetsciiScreen(seqBytes(GATE, '~CC_TEST|', 'Z'), session, ctx);

    expect(Buffer.from(out).toString('latin1')).toBe(' \x00CC:TEST\x00Z');
    // The oracle saw the space and the Z, and nothing in between.
    expect(ctx.machine.state.cursorX).toBe(2);
    expect(row(ctx.machine, 0).slice(0, 3)).toEqual([0x20, 0x1a, 0x20]);
  });

  it('runs the shared pre-passes: ~D. retargets the terminator and the ctx keeps it', async () => {
    const session = petsciiSession();
    disposePetsciiRenderCtx(session);
    const ctx = await petsciiRenderCtxFor(session);
    const out = await renderPetsciiScreen(seqBytes(GATE, '~D.', '~N.'), session, ctx);

    // `~D.` is consumed by applyMciPrePasses, and `~N.` then substitutes
    // against the new terminator.
    expect(Array.from(out)).toEqual([0x20, 0x53, 0x50, 0x4f, 0x54]);
    expect(ctx.terminator).toBe('.');
    // The pre-pass result is handed back for Tasks 6 and 7 (queued commands,
    // include files, slow mode) - the render returns bytes only.
    expect(ctx.lastPrePass).toBeDefined();
    expect(ctx.lastPrePass?.terminator).toBe('.');
  });
});

/**
 * Follow-ups to the Task 5 review.
 *
 * IMPORTANT 1 - the clip guarded the COLUMN but not the ROW: a `$0D` inside a
 * value on row 24 reaches `PetsciiMachine.carriageReturn`, which scrolls the
 * whole screen. Decision 4 is "never wrap, never scroll".
 *
 * IMPORTANT 2 - text the PRE-PASSES generate (`~CL.`, `~CD.`, `~ML.`, `~MD.`,
 * `%NODELIST`, a `~CR_` prompt) reaches the walk with no substitution span,
 * so it was copied byte for byte and landed on graphics glyphs in the `$0E`
 * bank. Decision 1 (FULL parity) was unmet for those tokens. The pre-passes
 * now wrap what they generate in `MCI_GENERATED` markers and the renderer
 * encodes those runs per bank, exactly like a value.
 */
describe('renderPetsciiScreen - review follow-ups', () => {
  const CONFERENCES = [
    { id: 1, name: 'Main Conference' },
    { id: 2, name: 'Amiga Chat' },
  ];

  afterAll(() => setConferences([]));

  it('never scrolls: a multi-row value on the bottom row ends at the row edge', async () => {
    // `~AK`-shaped: a value carrying its own newlines. Placed on row 25
    // (0-based 24) by ~y25|, its second row would `carriageReturn` off the
    // bottom and scroll row 0 away.
    const session = petsciiSession({ user: { username: 'AB\nCD\nEF' } });
    disposePetsciiRenderCtx(session);
    const ctx = await petsciiRenderCtxFor(session);

    // Paint a marker on row 0 first, so a scroll is visible.
    await renderPetsciiScreen(seqBytes(GATE, 'MARK'), session, ctx);
    const rowZeroBefore = row(ctx.machine, 0);
    expect(rowZeroBefore[1]).toBe(0x0d);   // 'M' as a screen code

    const out = await renderPetsciiScreen(seqBytes(GATE, '~y25|', '~N|'), session, ctx);

    // The value stops at its first `$0D`: 'AB' lands, the rest is dropped.
    expect(Array.from(out).filter((b) => b === 0x0d)).toEqual([]);
    expect(Array.from(out.subarray(-2))).toEqual([0x41, 0x42]);
    expect(ctx.machine.state.cursorY).toBe(ctx.machine.state.rows - 1);
    // No scroll: row 0 still carries the marker painted before the value.
    expect(row(ctx.machine, 0)).toEqual(rowZeroBefore);
  });

  it('encodes %NODELIST generated text per bank ($0E: lower-case bank codes)', async () => {
    const session = petsciiSession({ nodeId: 0 });
    const { out, machine } = await render(seqBytes(GATE, 0x0e, '%NODELIST'), session);

    // "Node 0:  You" - 'N' and 'Y' are UPPER case, so in the $0E bank they
    // must be $CE / $D9, not the raw ASCII $4E / $59 the art path would copy.
    expect(out.includes(0xce)).toBe(true);
    expect(out.includes(0xd9)).toBe(true);
    expect(row(machine, 0).slice(1, 13)).toEqual([
      0x4e, 0x0f, 0x04, 0x05, 0x20, 0x30, 0x3a, 0x20, 0x20, 0x59, 0x0f, 0x15,
    ]);
    // The rows are separated by a single $0D, never a raw \r\n pair.
    expect(out.includes(0x0a)).toBe(false);
  });

  it('encodes ~CL. generated text per bank ($8E: folded to the upper bank)', async () => {
    setConferences(CONFERENCES);
    const session = petsciiSession({ user: { username: 'spot', confAccess: 'XXXXX' } });
    const { out, machine } = await render(seqBytes(GATE, 0x8e, '~CL.'), session);

    // Bank 0 has no $C1-$DA letters at all: 'M' of "Main Conference" folds to
    // $4D, and nothing in the run may land in the graphics range.
    expect(Array.from(out).some((b) => b >= 0xc1 && b <= 0xda)).toBe(false);
    expect(out.includes(0x4d)).toBe(true);
    // Row 0: "    1) Main Conference" narrow-clipped, starting at column 1.
    const codes = row(machine, 0);
    expect(codes.slice(8, 12)).toEqual([0x0d, 0x01, 0x09, 0x0e]);   // M A I N
    // No SGR bytes survived into the PETSCII wire.
    expect(out.includes(0x1b)).toBe(false);
  });

  it('maps a code point above $FF in generated text through the encoder, never a masked byte', async () => {
    // `String.charCodeAt & 0xff` on U+2603 would emit $03 - a control byte.
    // The encoder degrades an unsupported glyph to '?' ($3F) instead.
    setConferences([{ id: 1, name: 'Snow☃man' }]);
    const session = petsciiSession({ user: { username: 'spot', confAccess: 'XXXXX' } });
    const { out } = await render(seqBytes(GATE, 0x0e, '~CL.'), session);

    expect(out.includes(0x3f)).toBe(true);
    expect(out.includes(0x03)).toBe(false);
  });

  it('~~ immediately before a token escapes it, exactly as the ANSI path does', async () => {
    const session = petsciiSession({ user: { username: 'spot' } });
    const { out } = await render(seqBytes(GATE, '~~~N|'), session);

    // `~~N` falls through the tokenizer verbatim, then the `~~` unescape
    // leaves `~N` - the token is shown, not substituted.
    //
    // Parity here is with parseMciCodes' NON-inline path only: its
    // `replace(/~~/g, '~')` (screen.handler.ts, "must be processed LAST")
    // runs on the string it RETURNS, and inline mode has already put its
    // chunks on the wire by then - so an inline ANSI screen still shows
    // `~~`. The `.seq` renderer collapses the pair inside the chunk walk,
    // which is the only place a PETSCII screen could do it at all.
    expect(Array.from(out)).toEqual([0x20, 0x7e, 0x4e]);
    expect(Buffer.from(out).toString('latin1')).not.toContain('spot');
  });
});
