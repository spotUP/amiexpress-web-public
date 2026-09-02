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
