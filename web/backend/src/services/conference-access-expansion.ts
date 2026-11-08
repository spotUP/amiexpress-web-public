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
  /** user.data secStatus, as UserFileManager surfaces it. */
  secLevel?: number;
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

/**
 * Rewrite every flag-string account's access through `nextFor`, on disk, in
 * the online caller's memory, and in the SQL mirror. The one writer both
 * the expansion and the create-time grant use.
 */
function rewriteFlagAccess(
  deps: AccessExpansionDeps,
  nextFor: (user: AccessCarrier, current: string) => string
): number {
  const mirror = deps.sqlite?.prepare('UPDATE users SET confaccess = ? WHERE slotnumber = ?');

  let usersChanged = 0;
  for (const user of deps.users.readAllUsers()) {
    // A deleted account (express.e:21365) has no access to change.
    const slot = user.slotNumber ?? 0;
    if (slot < 1 || user.accountDeleted) continue;
    const current = user.confAccess ?? '';
    if (isConfAccessAreaName(current)) continue;
    const next = nextFor(user, current);
    if (next === current) continue;
    try {
      deps.users.writeConferenceAccessAt(slot, next);
      usersChanged += 1;
      // A caller who is on holds his account in memory until logoff
      // (express.e:8207); without this his logoff writes the old string back.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      (require('./account.service') as typeof import('./account.service')).applyToOnlineSlot(slot, { confAccess: next });
    } catch (error) {
      console.error(`[ConferenceAccess] slot ${slot} not rewritten on disk:`, error);
      continue;
    }
    try {
      mirror?.run(next, slot);
    } catch (error) {
      console.error(`[ConferenceAccess] slot ${slot} rewritten on disk, SQL mirror not updated:`, error);
    }
  }
  return usersChanged;
}

export function expandConferenceAccessTo(
  deps: AccessExpansionDeps,
  conferenceCount: number
): AccessExpansionResult {
  if (!Number.isInteger(conferenceCount) || conferenceCount <= 0) {
    return { usersExpanded: 0 };
  }
  const width = Math.min(conferenceCount, DISK_FLAG_WIDTH);
  return { usersExpanded: rewriteFlagAccess(deps, (_user, current) => padAccessTo(current, width)) };
}

/**
 * Who a newly created conference is granted to. Chosen by the sysop in the
 * admin's create form.
 */
export type ConferenceGrant =
  | { kind: 'everyone' }
  | { kind: 'sysop' }
  | { kind: 'level'; minLevel: number };

/** The full sysop's level: requireSysop and the socket guard ask the same. */
export const CONFERENCE_GRANT_SYSOP_LEVEL = 255;

export function isGrantedTo(grant: ConferenceGrant, secLevel: number): boolean {
  switch (grant.kind) {
    case 'everyone': return true;
    case 'sysop': return secLevel >= CONFERENCE_GRANT_SYSOP_LEVEL;
    case 'level': return secLevel >= grant.minLevel;
  }
}

export interface ConferenceGrantResult {
  usersGranted: number;
  usersChanged: number;
  /** Past the ninth flag user.data cannot hold it; an access area must grant it. */
  beyondDiskWidth: boolean;
}

/**
 * Decide conference `conferenceNumber` for every flag-string account: 'X'
 * where `grant` entitles the account, '_' where it does not.
 *
 * WEB_: express.e has no create step (see the header). This is the explicit
 * decision the expansion cannot make: padAccessTo only grows SHORT strings,
 * and a string left nine wide by an earlier, larger board kept a stale '_' at
 * the new position - the sysop among them, so conference 6 never showed on J.
 * String length is not a record of what a user was granted; this is.
 *
 * Positions before the new one that a short string never had are granted, as
 * the expansion would have.
 */
export function grantConferenceAccess(
  deps: AccessExpansionDeps,
  conferenceNumber: number,
  grant: ConferenceGrant
): ConferenceGrantResult {
  if (!Number.isInteger(conferenceNumber) || conferenceNumber < 1) {
    return { usersGranted: 0, usersChanged: 0, beyondDiskWidth: false };
  }
  if (conferenceNumber > DISK_FLAG_WIDTH) {
    return { usersGranted: 0, usersChanged: 0, beyondDiskWidth: true };
  }
  const index = conferenceNumber - 1;
  let usersGranted = 0;
  const usersChanged = rewriteFlagAccess(deps, (user, current) => {
    const entitled = isGrantedTo(grant, user.secLevel ?? 0);
    if (entitled) usersGranted += 1;
    const padded = padAccessTo(current, index);
    const flag = entitled ? 'X' : '_';
    return padded.slice(0, index) + flag + padded.slice(index + 1);
  });
  return { usersGranted, usersChanged, beyondDiskWidth: false };
}
