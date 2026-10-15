/**
 * Who has shown they own the ROMs.
 *
 * One small file, because that is all this is: a set of user ids and the day
 * each of them proved it. The ROMs themselves are never here - the upload
 * that proved it was read and deleted.
 *
 * It lives in the door's own `data/` directory, which is the one place the
 * board's entrypoint excludes from the image-to-volume sync. Anywhere else
 * and a deploy would quietly restore an older copy, un-proving everybody.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveBbsRoot } from '../core/settings';

/**
 * THE one place the record lives, for every door that asks.
 *
 * Resolved from the board root rather than counted out in `..` from
 * whichever door is asking - which is how it broke: BEEB wrote to
 * `Doors/beeb/data/proven.json` while TELETEXT, one `..` short, read
 * `Doors/teletext/beeb/data/proven.json`. That directory does not exist, so
 * a caller who had just proved their ROMs in one door was asked for them
 * again in the other, and nothing anywhere said why.
 *
 * It is the BEEB door's data directory because that door owns the machine;
 * TELETEXT is a second way in to the same one.
 */
export function beebProofFile(startDir: string): string {
  return path.join(resolveBbsRoot(startDir), 'Doors', 'beeb', 'data', 'proven.json');
}

export interface RomProof {
  /** When they proved it, ISO 8601. */
  at: string;
  /** Their proof is also where the board's copy came from. */
  seeded?: boolean;
}

export interface RomProofs {
  users: Record<string, RomProof>;
}

const EMPTY: RomProofs = { users: {} };

/** Read the record, tolerating a file that is missing or damaged. */
export function readProofs(file: string): RomProofs {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as RomProofs;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.users !== 'object') return { users: {} };
    return { users: parsed.users ?? {} };
  } catch {
    // A board that cannot read the record has simply proved nobody yet;
    // refusing to start would be a worse answer than asking again.
    return { users: {} };
  }
}

export function hasProved(file: string, userId: string | number | undefined): boolean {
  if (userId === undefined || userId === null || userId === '') return false;
  return Boolean(readProofs(file).users[String(userId)]);
}

/**
 * Record a proof.
 *
 * Written whole and then renamed, so an interrupted write cannot leave the
 * board with a half-file that un-proves everyone who came before.
 */
export function recordProof(
  file: string,
  userId: string | number,
  proof: RomProof = { at: new Date().toISOString() },
): RomProofs {
  const proofs = readProofs(file);
  proofs.users[String(userId)] = proof;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(proofs, null, 2)}\n`);
  fs.renameSync(temporary, file);
  return proofs;
}

/** How many people have proved it. For a sysop who wants to know. */
export function proofCount(file: string): number {
  return Object.keys(readProofs(file).users).length;
}

export const EMPTY_PROOFS = EMPTY;
