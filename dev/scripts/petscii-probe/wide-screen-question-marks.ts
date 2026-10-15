/**
 * What an 80-column PETSCII caller actually SEES, per screen.
 *
 * The byte table maps every character on the board's own files, so a `?` on
 * the glass comes from further down: the transducer, the charset bank, or the
 * machine. This drives the real pipeline - decode the file as the loader does,
 * feed it to AnsiToPetsciiTransducer at 80 columns, let a WideScreenMachine
 * eat the bytes - and reports every cell that ended up as a question mark the
 * source did not ask for.
 *
 * As of 2026-09-07 this reports nothing on the board's own screens: the
 * remaining apparent gaps were an Amiga executable wearing a .txt name and a
 * UTF-8 fixture read as latin-1, neither of which a caller ever sees.
 *
 * Read-only. From web/backend:
 *   npx tsx --tsconfig tsconfig.json ../../dev/scripts/petscii-probe/wide-screen-question-marks.ts [roots...]
 */
import * as fs from 'fs';
import * as path from 'path';

import { readAmigaTextFileWithTransforms } from '../../../web/backend/src/utils/amiga-text-decode.util';
import { AnsiToPetsciiTransducer } from '../../../sdk/petscii/ansi-to-petscii';
import { WideScreenMachine } from '../../../sdk/petscii/wide-screen-machine';

const REPO = path.resolve(__dirname, '../../..');
const ROOTS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['Screens'];
/** Screens carry an extension; a conference's file catalogue (DIR1, DIR2...) does not. */
const SCREEN_EXT = /(\.(txt|ans)|^DIR\d*)$/i;
const QUESTION_MARK_SCREEN_CODE = 0x3f;

/**
 * Amiga HUNK magic. `Doors/AquaScan/AquaScanConfig.txt` is an EXECUTABLE
 * wearing a .txt name, and reading it as art reported 2,700 "unmapped
 * characters" that are machine code - which nearly bought two mappings the
 * board does not need.
 */
function isAmigaExecutable(file: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    return head.readUInt32BE(0) === 0x000003f3;
  } catch {
    return false;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* nothing to close */ } }
  }
}

function screenFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (SCREEN_EXT.test(e.name) && !isAmigaExecutable(full)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

let worst: Array<{ file: string; asked: number; shown: number }> = [];
let scanned = 0;
let painted = 0;

for (const root of ROOTS) {
  for (const file of screenFiles(path.join(REPO, root))) {
    let text: string;
    try {
      text = readAmigaTextFileWithTransforms(file).text;
    } catch (err) {
      // Loudly: a probe that silently skips every file reports a clean board.
      console.error(`could not read ${file}: ${(err as Error).message}`);
      continue;
    }

    const machine = new WideScreenMachine();
    const transducer = new AnsiToPetsciiTransducer({ columns: 80 });
    machine.feed(transducer.transduce(text));

    scanned += 1;
    // A screen that painted nothing proves only that the probe is broken.
    if ([...machine.state.screen].some((c) => (c & 0x7f) !== 0x20)) painted += 1;
    const shown = [...machine.state.screen].filter((c) => (c & 0x7f) === QUESTION_MARK_SCREEN_CODE).length;
    const asked = [...text].filter((c) => c === '?').length;
    if (shown > asked) worst.push({ file: path.relative(REPO, file), asked, shown });
  }
}

worst = worst.sort((a, b) => (b.shown - b.asked) - (a.shown - a.asked));
console.log(`${scanned} screen(s) scanned, ${painted} of them painted something`);
console.log(`${worst.length} screen(s) show question marks the file did not ask for\n`);
for (const row of worst.slice(0, 25)) {
  console.log(`${String(row.shown - row.asked).padStart(5)} substituted  (${row.shown} shown, ${row.asked} in the file)  ${row.file}`);
}
