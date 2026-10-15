/**
 * The board's caller number: `<bbs>/SystemStats`, one integer and a newline.
 *
 * express.e keeps it there (2855-2866): getCallerCount() reads it for ~SC and
 * updateCallerNum() bumps it on every connect (29565) and gives the session
 * its number for S "Caller Num.". The port never touched the file - the live
 * board's still said 20265 from its Amiga days - so ~SC showed today's calls
 * and S showed caller 0 (express.e parity survey, 2026-09-29).
 */
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

function statsFile(root: string = config.get('dataDir')): string {
  return path.join(root, 'SystemStats');
}

/** express.e getCallerCount(): the number on file, 0 when there is none. */
export function getCallerCount(root?: string): number {
  try {
    const n = Number.parseInt(fs.readFileSync(statsFile(root), 'latin1').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** express.e updateCallerNum(): the next number, written back, and returned. */
export function updateCallerNum(root?: string): number {
  const next = getCallerCount(root) + 1;
  try {
    fs.writeFileSync(statsFile(root), `${next}\n`, 'latin1');
  } catch (err) {
    console.error('[CallerNum] could not write SystemStats:', err);
  }
  return next;
}
