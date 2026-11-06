/**
 * Chat ignore list: who a user refuses to hear from.
 * One row per (owner, ignored username). Usernames are stored lower-cased so
 * "Bob" and "bob" are one person; owners are user ids as strings.
 * Synchronous on purpose: the room broadcast checks it per member, inside a
 * synchronous emit loop.
 */

export function normalizeIgnoreName(username: unknown): string {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

export class ChatIgnoreRepository {
  constructor(private db: any) {}

  /** Returns false when already ignored or the name is empty. */
  add(ownerId: string, username: string): boolean {
    const name = normalizeIgnoreName(username);
    if (!name) return false;
    const result = this.db.prepare(
      'INSERT OR IGNORE INTO chat_ignores (owner_id, ignored_username) VALUES (?, ?)'
    ).run(String(ownerId), name);
    return Number(result.changes) > 0;
  }

  /** Returns false when the user was not ignored. */
  remove(ownerId: string, username: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM chat_ignores WHERE owner_id = ? AND ignored_username = ?'
    ).run(String(ownerId), normalizeIgnoreName(username));
    return Number(result.changes) > 0;
  }

  list(ownerId: string): string[] {
    const rows = this.db.prepare(
      'SELECT ignored_username FROM chat_ignores WHERE owner_id = ? ORDER BY id'
    ).all(String(ownerId)) as Array<{ ignored_username: string }>;
    return rows.map(r => r.ignored_username);
  }

  isIgnoring(ownerId: string, username: string): boolean {
    const name = normalizeIgnoreName(username);
    if (!name) return false;
    return !!this.db.prepare(
      'SELECT 1 FROM chat_ignores WHERE owner_id = ? AND ignored_username = ?'
    ).get(String(ownerId), name);
  }
}
