/**
 * Which characters on this board's own screens have NO PETSCII glyph?
 *
 * An 80-column PETSCII caller is served the ordinary screens now, so every
 * character the transducer cannot place prints as `?`. This walks the board's
 * screens and bulletins, decodes each exactly as the loader does, and counts
 * what would degrade - by character, with the files that carry it.
 *
 * Read-only. Run from web/backend:
 *   npx tsx --tsconfig tsconfig.json ../../dev/scripts/petscii-probe/unmapped-glyphs.ts
 */
import * as fs from 'fs';
import * as path from 'path';

import { readAmigaTextFileWithTransforms } from '../../../web/backend/src/utils/amiga-text-decode.util';
import { asciiToPetsciiByte } from '../../../sdk/petscii/ascii-to-petscii';

const REPO = path.resolve(__dirname, '../../..');
const ROOTS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['Screens', 'Bulletins'];
/** Screens carry an extension; a conference's file catalogue (DIR1, DIR2...) does not. */
const SCREEN_EXT = /(\.(txt|ans)|^DIR\d*)$/i;

/** ANSI is control, not content: the transducer eats the escapes itself. */
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b./g, '');

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

const counts = new Map<string, { count: number; files: Set<string> }>();
let scanned = 0;
let characters = 0;

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
    scanned += 1;
    for (const ch of stripAnsi(text)) {
      characters += 1;
      const code = ch.codePointAt(0) as number;
      if (code < 0x20) continue;                       // control bytes are not glyphs
      if (ch === '?') continue;                        // a real question mark is not a failure
      if (asciiToPetsciiByte(code, 1).byte !== 0x3f) continue;
      const seen = counts.get(ch) ?? { count: 0, files: new Set<string>() };
      seen.count += 1;
      seen.files.add(path.relative(REPO, file));
      counts.set(ch, seen);
    }
  }
}

const rows = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
console.log(`${scanned} file(s) scanned, ${characters} character(s) examined`);
console.log(`${rows.length} distinct characters degrade to '?'\n`);
for (const [ch, { count, files }] of rows) {
  const code = (ch.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, '0');
  const shown = [...files].slice(0, 3).join(', ') + (files.size > 3 ? ` +${files.size - 3} more` : '');
  console.log(`U+${code} ${JSON.stringify(ch).padEnd(8)} x${String(count).padStart(6)}  ${shown}`);
}
