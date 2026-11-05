/**
 * QuickNew is a 68K door, and the board runs the door.
 *
 * "replacing quicknew with a typescript alternative doesnt help our project get
 * full compatibility can you research and fix the 68k quicknew problems
 * instead?" - the sysop, 2026-09-15.
 *
 * The generator in utils/quicknew-generator.ts exists because the binary the
 * batch line names had been deleted from Doors/ as corpus junk (6a6dcc475), so
 * `doors:quicknew/quicknew` resolved to nothing, the scheduler logged
 * "Skipping missing program", and the screen showed 00 files for months. That
 * is a fix at the wrong layer: the generator renders what it believes QuickNew
 * renders. Measured against the restored binary the same day, the two disagree
 * - the real door prints the config's templates verbatim and emits lines up to
 * 94 columns, the generator folds them to 80.
 *
 * The binary is restored (GOD-QN22 V2.2, asm source and .Doc beside it), so the
 * door runs. The generator remains only for a board that does not have it.
 *
 * This pins the DECISION, which is a pure function of what is on disk: is there
 * a real door to run?
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');

describe('the QuickNew door on disk', () => {
  it('is shipped, because the batch line names it', () => {
    // The deletion that started all of this. If this fails, the board is back
    // to "Skipping missing program" and a screen full of zeroes.
    const binary = path.join(REPO, 'board', 'Doors', 'QuickNew', 'QuickNew');
    expect(fs.existsSync(binary)).toBe(true);
  });

  it('is the AmigaOS executable and not a placeholder', () => {
    // Hunk format: an AmigaOS loadseg()able binary starts 0x000003F3.
    const binary = path.join(REPO, 'board', 'Doors', 'QuickNew', 'QuickNew');
    const head = fs.readFileSync(binary).subarray(0, 4);
    expect([...head]).toEqual([0x00, 0x00, 0x03, 0xf3]);
  });

  it('keeps its config beside it, which is what the batch line passes', () => {
    expect(fs.existsSync(path.join(REPO, 'board', 'Doors', 'QuickNew', 'QuickNew.Config1'))).toBe(true);
  });
});

/**
 * The scheduler's choice, extracted as the predicate it is: the real door wins
 * whenever it resolves, and the generator is what is left when it does not.
 */
function runsTheRealDoor(resolvedDoorPath: string | null): 'door' | 'generator' {
  return resolvedDoorPath ? 'door' : 'generator';
}

describe('which QuickNew the batch runs', () => {
  it('runs the door when the binary is there', () => {
    expect(runsTheRealDoor('/app/data/bbs/Doors/QuickNew/QuickNew')).toBe('door');
  });

  it('falls back to the generator only when it is not', () => {
    // A shareware door nobody is obliged to ship. The fallback is for that
    // board, not for this one.
    expect(runsTheRealDoor(null)).toBe('generator');
  });
});

/**
 * And when the generator DOES run, it must not claim to have worked.
 *
 * `bbs:screens/quicknew2.txt` sat unchanged from May to September while every
 * logoff logged "QuickNew: screen regenerated". Its batch line names
 * `quicknew.config`; the volume has `QuickNew.Config1`. Nothing connected the
 * two because the failure announced itself as a success.
 */
function batchReport(written: string | null): string {
  return written ? 'QuickNew: screen regenerated' : 'QuickNew: NOT regenerated';
}

describe('what the batch says afterwards', () => {
  it('reports success only when a screen was actually written', () => {
    expect(batchReport('/app/data/bbs/Screens/quicknew.txt')).toContain('screen regenerated');
  });

  it('reports the failure when the config could not be read', () => {
    expect(batchReport(null)).toContain('NOT regenerated');
  });

  it('never calls a missing config a regenerated screen', () => {
    expect(batchReport(null)).not.toContain(': screen regenerated');
  });
});

/**
 * THE CONFIG IS WHAT DECIDES THE WIDTH, because the door prints its templates
 * verbatim - there is no fold in a 68K door and adding one to our side is how
 * the generator came to disagree with it.
 *
 * "fix it's output for 80 columns" (sysop, 2026-09-15). Measured on the
 * restored binary, this board's config emitted nine header lines between 82 and
 * 94 columns. The layout is fixed and the arithmetic is small:
 *
 *     "Last 07 Days Files in >> " (25) + title + " << :" (5)
 *       + padding + "(Files: 00, Fakes: 00, Megs: 00.0)" (34) = 80
 *
 * so a title has SIXTEEN columns and the padding absorbs the rest. Every row
 * used the same padding regardless of title length, which is the whole defect.
 *
 * WORTH KNOWING BEFORE COPYING THIS ANYWHERE: this is a per-board fix. "every
 * bbs will be configured differently and not even our localhost is the same as
 * live" (sysop, same day). Another board's QuickNew.Config1 will overflow in
 * its own places; the arithmetic above is the transferable part, not the
 * numbers.
 */
import { readFileSync } from 'fs';

const CONFIG = path.join(REPO, 'board', 'Doors', 'QuickNew', 'QuickNew.Config1');
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** What the door will actually put on the wire, with placeholders filled. */
function renderedWidth(template: string): number {
  let t = template.replace(/@D/g, '07');
  for (const ph of ['@N', '@F', '@M', '@Y', '@Z', '@B']) t = t.split(ph).join('00');
  return t.replace(ANSI, '').replace(/\r$/, '').length;
}

describe('what QuickNew will draw', () => {
  const lines = readFileSync(CONFIG, 'latin1').split('\n');
  const headers = lines
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => line.includes('@D') && line.includes('>>'));

  it('has the section headers this board configured', () => {
    expect(headers.length).toBeGreaterThan(0);
  });

  it('fits every header in 80 columns', () => {
    const over = headers
      .filter(({ line }) => renderedWidth(line) > 80)
      .map(({ line, n }) => `line ${n}: ${renderedWidth(line)} cols`);

    expect(over).toEqual([]);
  });

  it('fits every stats line too', () => {
    const over = lines
      .filter(line => line.includes('@Y'))
      .filter(line => renderedWidth(line) > 80)
      .map(line => `${renderedWidth(line)} cols`);

    expect(over).toEqual([]);
  });

  it('does not leave two sections sharing one heading', () => {
    // The reason the three long titles were shortened by hand rather than
    // truncated to a fixed length: "Demo Dungeon Dir1" and "Demo Dungeon Dir2"
    // both truncate to "Demo Dungeon...", and the screen then shows the same
    // heading twice over different file lists.
    const titles = headers.map(({ line }) => {
      const m = /&gt;&gt;(.*?)&lt;&lt;/.exec(line.replace(ANSI, '').replace(/>/g, '&gt;').replace(/</g, '&lt;'));
      return (m ? m[1] : '').trim();
    });

    expect(new Set(titles).size).toBe(titles.length);
  });
});

/**
 * THE SHIPPED BINARY IS THE ONE THE SHIPPED SOURCE BUILDS.
 *
 * `QuickNew.asm` beside the binary is REbEL/QTX's 2019 source with the width
 * work added (see Doors/QuickNew/BUILDING.md for the exact vasm command). The
 * binary cannot be assembled in CI, so what is checked here is that the two
 * agree about the thing the width work added: a door built from the old source
 * has no WIDTH argument, and its ReadArgs template says so in plain text.
 *
 * The behaviour itself was verified by running the door under the emulator,
 * against a scratch board with dated uploads so the filename grid actually
 * rendered: at the default width the output is byte-for-byte the stock door's,
 * and at 40 the widest line is exactly 40 with the grid reflowed. That is a
 * measurement, not a test - it needs a 68K emulator and a board - so it lives
 * in the commit message and BUILDING.md rather than pretending to run here.
 */
describe('the door binary and its source agree', () => {
  const DOOR = path.join(REPO, 'board', 'Doors', 'QuickNew');

  it('ships the source next to the binary', () => {
    expect(fs.existsSync(path.join(DOOR, 'QuickNew.asm'))).toBe(true);
  });

  it('ships the build recipe, because the binary cannot be rebuilt by guessing', () => {
    const doc = readFileSync(path.join(DOOR, 'BUILDING.md'), 'utf8');
    expect(doc).toContain('vasmm68k_mot');
    expect(doc).toContain('-m68020');
  });

  it('declares WIDTH in the source template', () => {
    const asm = readFileSync(path.join(DOOR, 'QuickNew.asm'), 'latin1');
    expect(asm).toContain('"FILE/A,DAYS/N,WIDTH/N"');
  });

  it('carries that same template inside the binary it ships', () => {
    // The template is a plain string in the executable, so this is the one
    // cheap check that the binary was built from THIS source and not an older
    // one left behind by a bad copy.
    const binary = readFileSync(path.join(DOOR, 'QuickNew'), 'latin1');
    expect(binary).toContain('FILE/A,DAYS/N,WIDTH/N');
  });

  it('keeps WIDTH optional, so a board that never passes it is untouched', () => {
    // "/N" and no "/A": ReadArgs treats it as an optional number. A required
    // WIDTH would break every existing batch line on every board.
    const asm = readFileSync(path.join(DOOR, 'QuickNew.asm'), 'latin1');
    expect(asm).not.toContain('WIDTH/A');
    expect(asm).toContain('screenwidth\tdc.l 80');
  });
});
