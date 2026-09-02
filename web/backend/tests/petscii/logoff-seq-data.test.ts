/**
 * Sysop DATA pins for the C64 logoff screen
 * (`thoughts/shared/handoffs/2026-09-02_mci-in-petscii-seq.md`, "Sysop DATA
 * items", 1 and 2).
 *
 * The premise of the first pass at this was wrong. LOGOFF is a NODE screen
 * (`screen.handler.ts` SCREEN_DIR_MAP, express.e:6546-6634): the search
 * order is `Node<N>`, `Node<N>/Screens`, `Screens`, and a conference
 * directory is never consulted. So `Conf*\/Screens/Logoff.seq` is
 * unreachable at logoff - the file that actually drives the C64 logoff is
 * `Node<N>/Logoff.txt`, which already said `~3SR_` and already pointed at an
 * EXTENSIONLESS target (`WORK:bbs/Screens/logoff/logoff`). The reachable fix
 * was the new 40-column `.seq` art the include resolves to.
 *
 * What this suite pins:
 *
 *   1. every `Node*\/Logoff.txt` - the file the LOGOFF command reaches - is a
 *      gated MCI screen saying `~3SR_` with an EXTENSIONLESS include target,
 *      so the session's own extension order decides `.seq` vs `.txt`;
 *   2. the shipped `Conf*\/Screens/Logoff.seq` copies say the same thing
 *      (unreachable at logoff, but a sysop may `~SS_` them by hand, and a
 *      hardcoded `.seq` there would hand an ANSI session PETSCII bytes);
 *   3. `Screens/logoff/001..003.logoff.seq` exist, are gated MCI screens
 *      (first byte `~`, express.e:6800-6806), draw their rules with the
 *      PETSCII horizontal-line glyph `$C0` rather than ASCII `=`/`-`/`*`,
 *      render with no `?` and no row wider than 40 columns, and carry the
 *      caller's name;
 *   4. the END-TO-END proof at the REAL entry point: `displayScreen(socket,
 *      session, 'Logoff')` - the call `system-commands.handler.ts`'s logoff
 *      makes - with the die pinned, resolving through `Node1/Logoff.txt` to
 *      each of the three screens. A PETSCII session lands on
 *      `Screens/logoff/00N.logoff.seq` and its art reaches `petscii-bytes`;
 *      an ANSI session lands on `001.logoff.txt` and never sees a PETSCII
 *      event.
 *
 * Screen files are Amiga byte files: every fixture here is READ as a
 * Buffer, never written through a UTF-8 tool.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

process.env.SKIP_DB_INIT = '1';

import { displayScreen } from '../../src/handlers/screen.handler';
import { loadConfConfig } from '../../src/services/conf-config.service';
import {
  renderPetsciiScreen,
  petsciiRenderCtxFor,
} from '../../src/handlers/petscii-screen.render';
import { disposePetsciiSessionModel } from '../../src/utils/petscii-session-model';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const LOGOFF_DIR = path.join(REPO_ROOT, 'Screens', 'logoff');
const PETSCII_RETURN = 0x0d;
const PETSCII_CLR = 0x93;
const PETSCII_HORIZONTAL_LINE = 0xc0;
const MCI_GATE = 0x7e;

/** The include target every shipped Logoff screen names - no extension. */
const INCLUDE_TARGET = 'Screens/logoff/logoff';

const md5 = (b: Buffer): string => crypto.createHash('md5').update(b).digest('hex');

/**
 * A conference's DIRECTORY is `LOCATION.n` in `ConfConfig.info`, never
 * `Conf${n}` derived from its number (express.e:31849 walks NAME.i/LOCATION.i,
 * and deleting a conference renumbers without renaming directories).
 */
function conferenceScreensDirs(): string[] {
  const conf = loadConfConfig(REPO_ROOT);
  if (!conf) return [];
  const dirs = new Set<string>();
  for (const entry of conf.entries) {
    const loc = entry.location.trim();
    if (!loc) continue;
    const colon = loc.indexOf(':');
    const rel = colon >= 0 ? loc.substring(colon + 1) : loc;
    dirs.add(path.join(REPO_ROOT, rel, 'Screens'));
  }
  return [...dirs].sort();
}

/** Every conference `Screens/Logoff.seq` the board actually ships. */
function shippedLogoffSeqs(): string[] {
  return conferenceScreensDirs()
    .map((dir) => path.join(dir, 'Logoff.seq'))
    .filter((p) => fs.existsSync(p));
}

/**
 * Every `Node*\/Logoff.txt`. Found by SCANNING the tree - a node directory is
 * `Node<N>` by AmiExpress convention, but which ones exist is data.
 */
function shippedNodeLogoffTxts(): string[] {
  return fs
    .readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^Node\d+$/.test(d.name))
    .map((d) => path.join(REPO_ROOT, d.name, 'Logoff.txt'))
    .filter((p) => fs.existsSync(p))
    .sort();
}

const NUMBERED = ['001', '002', '003'] as const;
const MARKERS: Record<string, string> = {
  '001': 'THANKS FOR CALLING',
  '002': 'GOODBYE',
  '003': 'SO LONG',
};
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

const bbsSession = (petsciiMode: boolean): any => ({
  petsciiMode,
  nodeId: 1,
  currentConf: 0,
  currentConfName: 'Amiga',
  user: { username: 'Spot', timesCalled: 42 },
});

const petsciiSession = (): any => bbsSession(true);

describe('Node*/Logoff.txt - the file the LOGOFF command reaches (data pin 1)', () => {
  const files = shippedNodeLogoffTxts();

  it('the board ships node logoff screens at all', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((p) => [path.relative(REPO_ROOT, p), p]))(
    '%s is a gated ~3SR_ screen with an extensionless include target',
    (_rel, p) => {
      const bytes = fs.readFileSync(p as string);
      expect(bytes[0]).toBe(MCI_GATE); // express.e:6800-6806 - MCI screen
      const text = bytes.toString('latin1');
      expect(text).toContain('~3SR_'); // random 1..3, express.e:5533-5554
      expect(text).not.toMatch(/~SR_/); // never the bare 1..99 form
      expect(text).toContain(INCLUDE_TARGET);
      // Extensionless: `loadScreenFile` tries the candidate as-is and then
      // the SESSION's extension order (`.seq` first for PETSCII, `.txt`
      // first for ANSI). A hardcoded extension here would decide for it.
      expect(text).not.toContain(`${INCLUDE_TARGET}.seq`);
      expect(text).not.toContain(`${INCLUDE_TARGET}.txt`);
    },
  );

  it('every node ships the same screen', () => {
    const digests = new Set(files.map((p) => md5(fs.readFileSync(p))));
    expect(digests.size).toBe(1);
  });
});

describe('Conf*/Screens/Logoff.seq - unreachable at logoff, still correct (data pin 2)', () => {
  it('the count follows ConfConfig.info, not a hardcoded twelve', () => {
    const dirs = conferenceScreensDirs();
    const files = shippedLogoffSeqs();
    expect(dirs.length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(0);
    expect(files.length).toBeLessThanOrEqual(dirs.length);
  });

  it('each says ~3SR_ with an extensionless target, and they are identical', () => {
    const files = shippedLogoffSeqs();
    for (const p of files) {
      const bytes = fs.readFileSync(p);
      expect(bytes[0]).toBe(MCI_GATE);
      const text = bytes.toString('latin1');
      expect(text).toContain('~3SR_');
      expect(text).not.toMatch(/~SR_/);
      expect(text).toContain(INCLUDE_TARGET);
      expect(text).not.toContain(`${INCLUDE_TARGET}.seq`);
      expect(text).not.toContain(`${INCLUDE_TARGET}.txt`);
    }
    const digests = new Set(files.map((p) => md5(fs.readFileSync(p))));
    expect(digests.size).toBe(1);
  });
});

describe('Screens/logoff/00N.logoff.seq (data pin 3)', () => {
  it.each(NUMBERED)('%s.logoff.seq exists, is gated, and uses PETSCII RETURN not LF', (n) => {
    const p = numberedSeq(n);
    expect(fs.existsSync(p)).toBe(true);
    const bytes = fs.readFileSync(p);
    expect(bytes[0]).toBe(MCI_GATE);
    expect(bytes.includes(0x0a)).toBe(false);
    expect(bytes.includes(0x02)).toBe(false); // never a background/border change
    expect(bytes.filter((b) => b === PETSCII_RETURN).length).toBeGreaterThanOrEqual(6);
  });

  it.each(NUMBERED)('%s.logoff.seq rules are PETSCII $C0, not ASCII, and row 0 is art', (n) => {
    const bytes = fs.readFileSync(numberedSeq(n));
    // The rules are the horizontal-line glyph (screen code $40 - the same
    // glyph in BOTH charset banks, see sdk/petscii/unicode-to-petscii.ts).
    expect(bytes.includes(PETSCII_HORIZONTAL_LINE)).toBe(true);
    const text = bytes.toString('latin1');
    // No ASCII rule survives anywhere: a run of `=`/`-`/`*` used as a rule.
    expect(text).not.toMatch(/([=\-*])\1{4,}/);
    // No wasted blank first row: the gate and the bank switch are followed
    // straight by the pen for the top rule, not by a RETURN.
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('~f|\x8e');
    expect(bytes[4]).not.toBe(PETSCII_RETURN);
  });

  it.each(NUMBERED)('%s.logoff.seq renders 40 columns wide at most and names the caller', async (n) => {
    const session = petsciiSession();
    disposePetsciiSessionModel(session);
    // Non-inline: `~f` yields the raw `$93` here instead of the walker's
    // sentinel, so the whole file renders as bytes in one piece.
    const ctx = await petsciiRenderCtxFor(session, { inlineMode: false });
    const out = await renderPetsciiScreen(fs.readFileSync(numberedSeq(n)), session, ctx);

    // The gate opened: the tokenizer ran, so the codes are gone.
    const text = out.toString('latin1');
    expect(text).not.toContain('~');
    // Nothing degraded to the encoder's unmappable-glyph substitute.
    expect(text).not.toContain('?');
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

/**
 * The end-to-end proof, at the entry point the board uses.
 *
 * `system-commands.handler.ts:117` calls `_displayScreen(socket, session,
 * 'Logoff')`; LOGOFF is a NODE screen, so this drives
 * `Node1/Logoff.txt` -> `~3SR_` -> `Screens/logoff/00N.logoff` -> the
 * session's extension order. Nothing here names a file directly.
 */
describe("displayScreen(socket, session, 'Logoff') - the real LOGOFF entry point", () => {
  let randomSpy: jest.SpyInstance;
  afterEach(() => randomSpy?.mockRestore());

  interface Captured {
    petsciiBytes: Buffer[];
    petsciiOutput: string[];
    ansi: string[];
  }

  const socketFor = (cap: Captured) =>
    ({
      id: `logoff-seq-data-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      emit: (event: string, data: any) => {
        if (event === 'petscii-bytes') cap.petsciiBytes.push(Buffer.from(data, 'base64'));
        else if (event === 'petscii-output') cap.petsciiOutput.push(String(data));
        else if (event === 'ansi-output') cap.ansi.push(String(data));
      },
      on: () => {},
    }) as any;

  const captured = (): Captured => ({ petsciiBytes: [], petsciiOutput: [], ansi: [] });

  // ~3SR_: floor(random * 3) + 1 (screen.handler.ts SR: sentinel).
  it.each([
    [0, '001'],
    [0.5, '002'],
    [0.999, '003'],
  ])('PETSCII, random=%s: lands on %s.logoff.seq and puts its art on petscii-bytes', async (die, n) => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(die as number);
    const cap = captured();
    const session = bbsSession(true);

    const shown = await displayScreen(socketFor(cap), session, 'Logoff');
    expect(shown).toBe(true);

    // The FILE the resolver settled on, not a path this test handed it.
    expect(session.lastScreenFilePath).toMatch(
      new RegExp(`${path.sep}Screens${path.sep}logoff${path.sep}${n}\\.logoff\\.seq$`),
    );

    const wire = Buffer.concat(cap.petsciiBytes).toString('latin1');
    expect(wire).not.toContain('~3SR_');
    expect(wire).not.toContain('\x00SR:');
    expect(wire).toContain(MARKERS[n as string]);
    expect(wire).toContain('SPOT');
    // The art bytes reached the wire: the rule glyph, not an ASCII rule.
    expect(wire).toContain(String.fromCharCode(PETSCII_HORIZONTAL_LINE));
    // The file the walker resolved is this one and no other.
    for (const other of NUMBERED.filter((o) => o !== n)) {
      expect(wire).not.toContain(MARKERS[other]);
    }
  });

  it('ANSI, random=0: lands on 001.logoff.txt and emits no PETSCII event', async () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const cap = captured();
    const session = bbsSession(false);

    const shown = await displayScreen(socketFor(cap), session, 'Logoff');
    expect(shown).toBe(true);

    expect(session.lastScreenFilePath).toMatch(
      new RegExp(`${path.sep}Screens${path.sep}logoff${path.sep}001\\.logoff\\.txt$`),
    );
    expect(cap.petsciiBytes).toHaveLength(0);
    expect(cap.petsciiOutput).toHaveLength(0);
    expect(cap.ansi.join('').length).toBeGreaterThan(0);
  });
});
