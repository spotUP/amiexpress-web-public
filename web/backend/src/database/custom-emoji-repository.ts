/**
 * Custom emoji repository: board-wide emoji the sysop adds to LiveChat.
 * Each has a :code: (stored as the bare name), a display form for web callers
 * and an ASCII fallback for telnet and SSH callers.
 */

export interface CustomEmojiRow {
  name: string;
  display: string;
  ascii: string;
}

interface Statement {
  run(...args: unknown[]): { changes: number | bigint };
  all(...args: unknown[]): unknown[];
}

interface Sqlite {
  prepare(sql: string): Statement;
}

export class CustomEmojiRepository {
  constructor(private db: Sqlite) {}

  /** Add or replace an emoji of this name. */
  async upsert(name: string, display: string, ascii: string, createdBy: string): Promise<void> {
    this.db.prepare(
      `INSERT INTO chat_custom_emojis (name, display, ascii, created_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET display = excluded.display, ascii = excluded.ascii, created_by = excluded.created_by`
    ).run(name, display, ascii, createdBy);
  }

  /** Remove an emoji. Returns false when there was none of that name. */
  async remove(name: string): Promise<boolean> {
    return Number(this.db.prepare('DELETE FROM chat_custom_emojis WHERE name = ?').run(name).changes) > 0;
  }

  async list(): Promise<CustomEmojiRow[]> {
    return this.db.prepare('SELECT name, display, ascii FROM chat_custom_emojis ORDER BY name').all() as CustomEmojiRow[];
  }
}
