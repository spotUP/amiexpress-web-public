/**
 * A user edit made on the database side, carried to the disk record.
 *
 * The admin lists users from BOTH stores: an account with a user.data slot
 * comes back as `user-<slot>` and an imported one as a database UUID. The
 * `user-<slot>` branch of PUT /users/:id wrote the disk record; the UUID
 * branch wrote the database row and stopped. user.data is what express.e and
 * every runtime consumer read, so a sysop editing a database-side user was
 * told "User updated successfully" while the board went on using the old
 * location, security level and time limit.
 *
 * The record is read FROM DISK and only the edited fields are applied to it.
 * Mirroring a whole `User` from the database back through the fixed-width
 * record is what destroyed -TCB!-: the database does not faithfully hold
 * every field the record has, so the fields it does not hold get written over
 * good values on the way back.
 */

import { userFileManager } from '../services/UserFileManager';

/** The fields the admin's user form can change. */
export interface UserEdits {
  username?: string;
  realname?: string;
  location?: string;
  phone?: string;
  email?: string;
  secLevel?: number;
  timeLimit?: number;
  expert?: boolean;
  ansi?: boolean;
  passwordHash?: string;
}

export interface DiskEditOutcome {
  /** The slot written, or null when this account has no disk record. */
  slotNumber: number | null;
  /** Which fields were carried across. */
  applied: string[];
}

/**
 * Apply `edits` to the disk record of the account currently called
 * `usernameBeforeEdit`.
 *
 * The name is taken BEFORE the update because it is the key the slot is found
 * by - a rename would otherwise look for the new name and find nothing, and
 * the account's disk record would silently stop being maintained.
 */
export function applyUserEditsToDisk(
  usernameBeforeEdit: string,
  edits: UserEdits,
): DiskEditOutcome {
  const wanted = String(usernameBeforeEdit ?? '').toUpperCase();
  if (!wanted) return { slotNumber: null, applied: [] };

  const onDisk = (userFileManager.readAllUsers() ?? []).find(
    (u: { username?: string }) => (u.username ?? '').toUpperCase() === wanted,
  ) as { slotNumber?: number } | undefined;

  const slotNumber = onDisk?.slotNumber;
  if (slotNumber === undefined) {
    // An account that lives only in the database. Not an error: an imported
    // user need not have a slot, and inventing one would put a stranger into
    // a numbered position express.e reads by index.
console.warn(
      `[Users] ${usernameBeforeEdit} has no user.data record; the change is in ` +
      `the database only`,
    );
    return { slotNumber: null, applied: [] };
  }

  // Read the CURRENT record. Everything not named in `edits` keeps the value
  // the disk already holds.
  const current = userFileManager.readUserBySlot(slotNumber);
  if (!current) return { slotNumber: null, applied: [] };

  const updated = { ...current } as Record<string, unknown>;
  const applied: string[] = [];

  const carry = <K extends keyof UserEdits>(field: K, target = field as string) => {
    const value = edits[field];
    if (value === undefined) return;
    updated[target] = value;
    applied.push(target);
  };

  carry('username');
  carry('realname');
  carry('location');
  carry('phone');
  carry('email');
  carry('secLevel');
  carry('timeLimit');
  carry('expert');
  carry('ansi');
  // The disk copy of a password cannot verify a login - the field holds 32 of
  // a bcrypt hash's 60 characters - but leaving it stale keeps a fragment of
  // the OLD password on disk, which is worse than keeping it in step.
  carry('passwordHash');

  if (applied.length === 0) return { slotNumber, applied };

  userFileManager.updateUserDataFile(updated as never, slotNumber);
  return { slotNumber, applied };
}
