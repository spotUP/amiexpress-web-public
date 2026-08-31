/**
 * When the board gains conferences, every account gains access to them.
 *
 * That is this board's policy, and it used to live only in initializeData:
 * at boot, every `users.confaccess` shorter than NCONFS is padded with 'X',
 * and new_user_conf_access with it. So a conference created through the
 * admin was on disk, in the mirror and in every handler's list - and
 * invisible to everyone, the sysop included, until the next restart happened
 * to run this. "i created conf 13 now 'test' but i dont see it in the bbs":
 * sysop's string was XXXXXXXXXXXX, twelve wide, and the board reads position
 * thirteen as no access.
 *
 * Here so the boot path and the refresh path run the same code.
 */

export interface AccessExpansionSqlite {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
  transaction?<T>(fn: () => T): () => T;
}

/** Pad an access string to `count` positions, granting the new ones. */
export function padAccessTo(access: string | null | undefined, count: number): string {
  const current = access ?? '';
  return current.length >= count ? current : current.padEnd(count, 'X');
}

export interface AccessExpansionResult {
  usersExpanded: number;
  newUserDefaultExpanded: boolean;
}

export function expandConferenceAccessTo(
  sqlite: AccessExpansionSqlite,
  conferenceCount: number
): AccessExpansionResult {
  if (!Number.isInteger(conferenceCount) || conferenceCount <= 0) {
    return { usersExpanded: 0, newUserDefaultExpanded: false };
  }

  let newUserDefaultExpanded = false;
  const cfgRow = sqlite.prepare('SELECT new_user_conf_access FROM system_config LIMIT 1').get() as
    | { new_user_conf_access?: string }
    | undefined;
  if (cfgRow && (cfgRow.new_user_conf_access ?? '').length < conferenceCount) {
    sqlite
      .prepare('UPDATE system_config SET new_user_conf_access = ?')
      .run(padAccessTo(cfgRow.new_user_conf_access, conferenceCount));
    newUserDefaultExpanded = true;
  }

  const users = sqlite
    .prepare('SELECT id, confaccess FROM users WHERE LENGTH(COALESCE(confaccess, \'\')) < ?')
    .all(conferenceCount) as Array<{ id: unknown; confaccess?: string | null }>;

  if (users.length > 0) {
    const update = sqlite.prepare('UPDATE users SET confaccess = ? WHERE id = ?');
    const apply = () => {
      for (const u of users) update.run(padAccessTo(u.confaccess, conferenceCount), u.id);
    };
    if (sqlite.transaction) sqlite.transaction(apply)();
    else apply();
  }

  return { usersExpanded: users.length, newUserDefaultExpanded };
}
