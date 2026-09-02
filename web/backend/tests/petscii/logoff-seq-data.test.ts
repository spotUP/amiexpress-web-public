/**
 * Sysop DATA pins for the C64 logoff screen
 * (`thoughts/shared/handoffs/2026-09-02_mci-in-petscii-seq.md`, "Sysop DATA
 * items", 1 and 2).
 *
 * The code was right and the data was wrong: the twelve shipped
 * `Conf*\/Screens/Logoff.seq` said `~SR_` (random 1..99, express.e:5533-5554)
 * while `Screens/logoff/` held three files, so a C64 caller drew a missing
 * include ~97% of the time - and on a hit got 80-column ANSI, which a PETSCII
 * session skips. This suite pins the two data fixes:
 *
 *   1. every shipped `Logoff.seq` says `~3SR_` (random 1..3), never `~SR_`;
 *   2. `Screens/logoff/001..003.logoff.seq` exist, are gated MCI screens
 *      (first byte `~`, express.e:6800-6806), render with no row wider than
 *      40 columns, and carry the caller's name.
 *
 * Plus the end-to-end proof: the REAL `Conf2/Screens/Logoff.seq`, driven
 * through `displayScreen` on a PETSCII session with the die pinned, puts
 * each of the three `.seq` screens on `petscii-bytes`. That is the resolver
 * path (`screen.handler.ts` SR: sentinel -> `formatNumberedFilename` ->
 * `loadScreenFile` extension swap, `.seq` first for a PETSCII session)
 * exercised on the sysop's data, not a regex over the source.
 *
 * Screen files are Amiga byte files: every fixture here is READ as a
 * Buffer, never written through a UTF-8 tool.
 */
import * as fs from 'fs';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

import { displayScreen } from '../../src/handlers/screen.handler';
import {
  renderPetsciiScreen,
  petsciiRenderCtxFor,
  disposePetsciiRenderCtx,
} from '../../src/handlers/petscii-screen.render';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const LOGOFF_DIR = path.join(REPO_ROOT, 'Screens', 'logoff');
const PETSCII_RETURN = 0x0d;
const PETSCII_CLR = 0x93;

/** `find . -name Logoff.seq` minus node_modules - the conference dirs are LOCATION.n, never built as `Conf${n}`. */
function shippedLogoffSeqs(): string[] {
  return fs
    .readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^Conf\d+$/.test(d.name))
    .map((d) => path.join(REPO_ROOT, d.name, 'Screens', 'Logoff.seq'))
    .filter((p) => fs.existsSync(p))
    .sort();
}

const NUMBERED = ['001', '002', '003'] as const;
const numberedSeq = (n: string): string => path.join(LOGOFF_DIR, `${n}.logoff.seq`);

/** Bytes the machine would PRINT (mirrors `petscii-machine.ts`'s control rule). */
const advancesCursor = (b: number): boolean => !(b < 0x20 || (b >= 0x80 && b <= 0x9f));

/** Printable width of every row, splitting on PETSCII RETURN. */
function rowWidths(rendered: Buffer): number[] {
  const widths: number[] = [];
  let w = 0;
  for (const b of rendered) {
    if (b === PETSCII_RETURN) {
      widths.push(w);
      w = 0;
    } else if (advancesCursor(b)) {
      w++;
    }
  }
  widths.push(w);
  return widths;
}

const petsciiSession = (): any => ({
  petsciiMode: true,
  nodeId: 0,
  currentConf: 0,
  currentConfName: 'Amiga',
  user: { username: 'Spot', timesCalled: 42 },
});

describe('shipped Conf*/Screens/Logoff.seq (data pin 1)', () => {
  it('all twelve say ~3SR_ and none a bare ~SR_', () => {
    const files = shippedLogoffSeqs();
    expect(files).toHaveLength(12);
    for (const p of files) {
      const bytes = fs.readFileSync(p);
      expect(bytes[0]).toBe(0x7e); // gated MCI screen
      expect(bytes.includes(Buffer.from('~3SR_', 'latin1'))).toBe(true);
      expect(bytes.includes(Buffer.from('~SR_', 'latin1'))).toBe(false);
    }
  });
});

describe('Screens/logoff/00N.logoff.seq (data pin 2)', () => {
  it.each(NUMBERED)('%s.logoff.seq exists, is gated, and uses PETSCII RETURN not LF', (n) => {
    const p = numberedSeq(n);
    expect(fs.existsSync(p)).toBe(true);
    const bytes = fs.readFileSync(p);
    expect(bytes[0]).toBe(0x7e);
    expect(bytes.includes(0x0a)).toBe(false);
    expect(bytes.includes(0x02)).toBe(false); // never a background/border change
    expect(bytes.filter((b) => b === PETSCII_RETURN).length).toBeGreaterThanOrEqual(6);
  });

  it.each(NUMBERED)('%s.logoff.seq renders 40 columns wide at most and names the caller', async (n) => {
    const session = petsciiSession();
    disposePetsciiRenderCtx(session);
    // Non-inline: `~f` yields the raw `$93` here instead of the walker's
    // sentinel, so the whole file renders as bytes in one piece.
    const ctx = await petsciiRenderCtxFor(session, { inlineMode: false });
    const out = await renderPetsciiScreen(fs.readFileSync(numberedSeq(n)), session, ctx);

    // The gate opened: the tokenizer ran, so the codes are gone.
    const text = out.toString('latin1');
    expect(text).not.toContain('~');
    expect(out[0]).toBe(PETSCII_CLR);

    // Every row fits a C64 screen.
    const widths = rowWidths(out);
    expect(Math.max(...widths)).toBeLessThanOrEqual(40);
    // And nothing wrapped: the oracle's row count is the RETURN count.
    const returns = out.filter((b) => b === PETSCII_RETURN).length;
    expect(ctx.machine.state.cursorY).toBe(returns);
    expect(ctx.machine.state.cursorX).toBe(0);

    // The name is there, folded to the upper-case/graphics bank the art set.
    expect(text).toContain('SPOT');
    expect(text).not.toContain('Spot');
    expect(text).toContain('AMIGA');
    expect(text).toContain('42');
  });
});

describe('the shipped Logoff.seq, end to end on a PETSCII session', () => {
  let randomSpy: jest.SpyInstance;
  afterEach(() => randomSpy?.mockRestore());

  const socketFor = (payloads: Buffer[]) =>
    ({
      id: `logoff-seq-data-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      emit: (event: string, data: any) => {
        if (event === 'petscii-bytes') payloads.push(Buffer.from(data, 'base64'));
      },
      on: () => {},
    }) as any;

  // ~3SR_: floor(random * 3) + 1 (screen.handler.ts SR: sentinel).
  it.each([
    [0, '001', 'THANKS FOR CALLING'],
    [0.5, '002', 'GOODBYE'],
    [0.999, '003', 'SO LONG'],
  ])('random=%s resolves Screens/logoff/%s.logoff.seq and puts it on petscii-bytes', async (die, n, marker) => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(die);
    const shipped = shippedLogoffSeqs()[0];
    const payloads: Buffer[] = [];
    const session = petsciiSession();

    const shown = await displayScreen(socketFor(payloads), session, shipped);
    expect(shown).toBe(true);

    const wire = Buffer.concat(payloads).toString('latin1');
    expect(wire).not.toContain('~3SR_');
    expect(wire).not.toContain('\x00SR:');
    expect(wire).toContain(marker);
    expect(wire).toContain('SPOT');
    // The file the walker resolved is this one and no other.
    for (const other of NUMBERED.filter((o) => o !== n)) {
      const otherMarker = { '001': 'THANKS FOR CALLING', '002': 'GOODBYE', '003': 'SO LONG' }[other];
      expect(wire).not.toContain(otherMarker);
    }
  });
});
