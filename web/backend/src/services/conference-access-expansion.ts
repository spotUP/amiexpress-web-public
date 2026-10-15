/**
 * When the board gains conferences, every flag-string account gains access
 * to them.
 *
 * WEB_: express.e has no such step. Nothing in it pads a user's
 * conferenceAccess to the conference count - not the new-user path
 * (initNewUser 30432 copies Preset.1's PRESET.AREA, 29369), not the join, not
 * checkConfAccess (8499-8512), which simply reads a missing position as no
 * access. This board's sysop asked for it: "i created conf 13 now 'test' but
 * i dont see it in the bbs" - their access string was twelve flags wide.
 *
 * What it may and may not touch follows from the record express.e reads:
 *
 *   - user.data is the truth, and `conferenceAccess` there is CHAR[10]: nine
 *     flags and a NUL. A flag past the ninth cannot be stored, so padding
 *     stops at nine; a board with more conferences grants the rest through an
 *     access area (`Access/AREA.<name>.info`), which is express.e's own answer.
 *   - an AREA NAME is not flags (isConfAccessAreaName, express.e:458-465).
 *     Padding "Elite" with X made it "EliteX", an area that does not exist -
 *     no access at all. Names are left alone; the area grants new conferences.
 *   - the SQL row follows the disk record it mirrors. This used to pad ONLY
 *     the SQL rows (and a database copy of the new-user default that nothing
 *     reads), so the record the board and every door read never changed.
 *
 * Here so the boot path and the refresh path run the same code.
 */
import { isConfAccessAreaName } from '../conferences/access-areas';

/** user.conferenceAccess is CHAR[10]: AstrCopy keeps nine and the NUL. */
const DISK_FLAG_WIDTH = 9;

/** A user record as far as this step is concerned. */
interface AccessCarrier {
  slotNumber?: number;
  confAccess?: string;
  /** The record's own slotNumber is 0: a deleted account (express.e:21365). */
  accountDeleted?: boolean;
}

export interface AccessExpansionDeps {
  /** user.data - read whole, patched ten bytes at a time. */
  users: {
    readAllUsers(): AccessCarrier[];
    writeConferenceAccessAt(slotNumber: number, access: string): void;
  };
  /** The SQL mirror, which follows each record written. */
  sqlite?: {
    prepare(sql: string): { run(...params: unknown[]): unknown };
  };
}

/** Pad an access string to `count` positions, granting the new ones. */
export function padAccessTo(access: string | null | undefined, count: number): string {
  const current = access ?? '';
  return current.length >= count ? current : current.padEnd(count, 'X');
}

export interface AccessExpansionResult {
  usersExpanded: number;
}

export function expandConferenceAccessTo(
  deps: AccessExpansionDeps,
  conferenceCount: number
): AccessExpansionResult {
  if (!Number.isInteger(conferenceCount) || conferenceCount <= 0) {
    return { usersExpanded: 0 };
  }
  const width = Math.min(conferenceCount, DISK_FLAG_WIDTH);
  const mirror = deps.sqlite?.prepare('UPDATE users SET confaccess = ? WHERE slotnumber = ?');

  let usersExpanded = 0;
  for (const user of deps.users.readAllUsers()) {
    // A deleted account (express.e:21365) has no access to grow.
    const slot = user.slotNumber ?? 0;
    if (slot < 1 || user.accountDeleted) continue;
    const current = user.confAccess ?? '';
    if (isConfAccessAreaName(current)) continue;
    const next = padAccessTo(current, width);
    if (next === current) continue;
    try {
      deps.users.writeConferenceAccessAt(slot, next);
      usersExpanded += 1;
      // A caller who is on holds his account in memory until logoff
      // (express.e:8207); without this his logoff writes the old string back.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      (require('./account.service') as typeof import('./account.service')).applyToOnlineSlot(slot, { confAccess: next });
    } catch (error) {
      console.error(`[ConferenceAccess] slot ${slot} not expanded on disk:`, error);
      continue;
    }
    try {
      mirror?.run(next, slot);
    } catch (error) {
      console.error(`[ConferenceAccess] slot ${slot} expanded on disk, SQL mirror not updated:`, error);
    }
  }

  return { usersExpanded };
}
