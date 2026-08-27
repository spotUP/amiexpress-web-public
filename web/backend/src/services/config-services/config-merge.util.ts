/**
 * What to write to a config file: what is on disk, plus the change.
 *
 * Three services read their list from disk and then rebuilt the file from the
 * DATABASE. The two disagree on the live site - ScreenTypes.info holds two
 * entries against zero rows in `screen_types`, ComputerList.info holds nine
 * against a table that does not exist, Protocols holds nine against seven -
 * so editing one entry rewrote the file from the database's idea of the world
 * and deleted everything the database did not know about.
 *
 * Disk is the source. The database is a mirror, and a mirror that has fallen
 * behind must not be allowed to truncate the thing it mirrors.
 */

/**
 * Merge a caller's changes over what is already on disk.
 *
 * - entries present on disk survive unless explicitly removed
 * - an entry with a matching key is replaced in place, keeping its position,
 *   because these files are ordered (TYPE.1, TYPE.2, ...) and reordering them
 *   renumbers everything
 * - entries the caller adds go on the end
 * - `rename` covers the case where the edit changed the key itself: disk still
 *   holds the entry under its old name, and without this the old name survives
 *   and the new one is appended, leaving the entry in the file twice
 */
export function mergeForWrite<T>(
  onDisk: T[],
  changed: T[],
  keyOf: (entry: T) => string,
  options: { remove?: string[]; rename?: { from: string; to: string } } = {}
): T[] {
  const removed = new Set((options.remove ?? []).map(k => k.toUpperCase()));
  const renameFrom = options.rename?.from.toUpperCase();
  const renameTo = options.rename?.to.toUpperCase();
  const changedByKey = new Map(changed.map(e => [keyOf(e).toUpperCase(), e]));

  const out: T[] = [];

  for (const entry of onDisk) {
    const diskKey = keyOf(entry).toUpperCase();
    // The renamed entry is still on disk under its old key. Look it up by the
    // new one so the replacement lands in the original position.
    const key = renameFrom !== undefined && renameTo !== undefined && diskKey === renameFrom
      ? renameTo
      : diskKey;

    if (removed.has(key) || removed.has(diskKey)) continue;

    const replacement = changedByKey.get(key);
    out.push(replacement ?? entry);
    changedByKey.delete(key);
  }

  // Whatever the caller added that disk did not already have.
  for (const entry of changedByKey.values()) {
    if (removed.has(keyOf(entry).toUpperCase())) continue;
    out.push(entry);
  }

  return out;
}
