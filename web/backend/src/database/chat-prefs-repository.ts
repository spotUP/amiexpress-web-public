/**
 * LiveChat user prefs: one JSON blob per user (pinned channels, compact mode,
 * timestamps, sounds, event filters). Owners are user ids as strings.
 * The server stores what the door sends; the door merges it over its defaults.
 */

export class ChatPrefsRepository {
  constructor(private db: any) {}

  /** The stored prefs, or null when the user never saved any. */
  get(ownerId: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT prefs_json FROM chat_prefs WHERE owner_id = ?').get(String(ownerId));
    if (!row) return null;
    try {
      const parsed: unknown = JSON.parse(row.prefs_json);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  set(ownerId: string, prefs: Record<string, unknown>): void {
    this.db.prepare(
      `INSERT INTO chat_prefs (owner_id, prefs_json) VALUES (?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = strftime('%s', 'now')`
    ).run(String(ownerId), JSON.stringify(prefs));
  }
}
