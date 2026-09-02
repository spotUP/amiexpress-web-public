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
 * STAYS RED until Task 7 wires the inline sentinel walker into the
 * PETSCII path. Marked `it.failing` because the whole backend suite gates
 * CI (`.github/workflows/backend-tests.yml` runs `npx jest ... --ci` on
 * every push/PR to main) - jest then reports the suite green while the
 * bug lives, and reports a FAILURE the moment Task 7 makes it pass, which
 * is the signal to flip `it.failing` back to `it`.
 *
 * SKIP_DB_INIT + emit-spy socket + absolute-path idiom are copied from
 * `tests/handlers/petscii-bytes-transport.test.ts`.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

import { displayScreen } from '../../src/handlers/screen.handler';

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

function wireBytes(emits: Emit[]): number {
  return Buffer.from(wireText(emits), 'latin1').length;
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

  it.failing(
    'a C64 logging off never sees the literal ~SR_ token, and does get art bytes (RED until Task 7)',
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
      expect(emits.length).toBeGreaterThan(0);
      expect(wireBytes(emits)).toBeGreaterThan(SHIPPED_LOGOFF_SEQ.length);
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
  it.failing(
    'a ~SR_ include that resolves to a .seq puts that art on petscii-bytes (RED until Task 7)',
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
