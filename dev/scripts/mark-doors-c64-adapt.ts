/**
 * Every 68K door on this board opens for a 40-column caller, through the
 * adapter.
 *
 * The sysop, 2026-09-16, after the first C64 walk of the board: door after
 * door answering `THIS DOOR NEEDS AN 80 COLUMN SCREEN`. 55 of his 149 command
 * icons were adapted-type doors (XIM/DD/SIM/FIM) that declared nothing about
 * width, and the width gate is DEFAULT-CLOSED - a door that says nothing is
 * refused (`utils/door-min-columns.util.ts`). Asked whether to mark them, he
 * said mark all 55.
 *
 * `C64_ADAPT=40` says "usable at forty columns THROUGH the adapter": the
 * board replays the door's ANSI onto an 80-column grid and reduces every
 * finished frame with the rule ladder. It is NOT `MIN_COLUMNS=40`, which
 * asserts the binary already lays itself out that narrow - false of an
 * unmodified 68K door, and it would leave the adapter uninstalled.
 *
 * What this never touches:
 *  - a door that already declares a width (MIN_COLUMNS, C64_ADAPT or
 *    C64_VIEWPORT): somebody decided that one, and a sweep does not overrule
 *    a decision;
 *  - a type the adapter seam cannot see (TS, AREXX/AIM, ...): marking one
 *    would let a caller in and then serve them 80-column bytes.
 *
 * Reversible per door: a door that comes out unreadable at forty has its
 * tooltype removed again, and nothing else about it changed.
 */
import * as fs from 'fs';
import * as path from 'path';

import { applyTooltypes, readTooltypeMap } from '../../web/backend/src/utils/info-file.util';
import { ADAPTED_DOOR_TYPES } from '../../web/backend/src/utils/door-min-columns.util';

/** The tooltypes that already say something about width. */
const WIDTH_KEYS = ['MIN_COLUMNS', 'C64_ADAPT', 'C64_VIEWPORT'];

export type MarkVerdict = 'mark' | 'already-declared' | 'not-adapted-type' | 'unreadable';

export function verdictFor(tooltypes: Map<string, string> | Record<string, string>): MarkVerdict {
  const map = tooltypes instanceof Map ? Object.fromEntries(tooltypes) : tooltypes;
  const upper = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toUpperCase(), v]));
  const type = String(upper['TYPE'] ?? '').toUpperCase();
  if (!ADAPTED_DOOR_TYPES.has(type)) return 'not-adapted-type';
  if (WIDTH_KEYS.some((k) => upper[k] !== undefined && String(upper[k]).trim() !== '')) return 'already-declared';
  return 'mark';
}

export interface MarkResult { file: string; verdict: MarkVerdict }

export function markDirectory(dir: string, options: { dryRun?: boolean } = {}): MarkResult[] {
  const results: MarkResult[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.toLowerCase().endsWith('.info')) continue;
    const file = path.join(dir, name);
    let verdict: MarkVerdict;
    try {
      verdict = verdictFor(readTooltypeMap(file));
    } catch {
      results.push({ file: name, verdict: 'unreadable' });
      continue;
    }
    if (verdict === 'mark' && !options.dryRun) {
      try {
        applyTooltypes(file, [['C64_ADAPT', '40']]);
      } catch {
        verdict = 'unreadable';
      }
    }
    results.push({ file: name, verdict });
  }
  return results;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const dir = argv.find((a) => !a.startsWith('--')) ?? path.resolve(__dirname, '..', '..', 'Commands', 'BBSCmd');
  const results = markDirectory(dir, { dryRun });
  const count = (v: MarkVerdict) => results.filter((r) => r.verdict === v).length;
  for (const r of results.filter((r) => r.verdict === 'mark' || r.verdict === 'unreadable')) {
    console.log(`${r.verdict.padEnd(16)} ${r.file}`);
  }
  console.log(
    `\n${dryRun ? 'would mark' : 'marked'}=${count('mark')} already-declared=${count('already-declared')} `
    + `not-adapted-type=${count('not-adapted-type')} unreadable=${count('unreadable')}`
  );
}
