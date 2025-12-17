/** Custom emojis table schema */
export const EMOJIS_TABLE = `
CREATE TABLE IF NOT EXISTS chat_custom_emojis (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ascii_art TEXT NOT NULL,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;

/** Default BBS emojis */
export const DEFAULT_EMOJIS = [
  { code: ':bbs:', name: 'BBS', ascii: '[BBS]' },
  { code: ':amiga:', name: 'Amiga', ascii: '[A]' },
  { code: ':sysop:', name: 'Sysop', ascii: '[*]' },
  { code: ':lol:', name: 'LOL', ascii: ':D' },
  { code: ':cool:', name: 'Cool', ascii: 'B)' },
  { code: ':wink:', name: 'Wink', ascii: ';)' }
];

/** Custom emoji repository */
export class EmojiRepository {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async getAll(): Promise<any[]> {
    return this.db.all('SELECT * FROM chat_custom_emojis');
  }

  async get(code: string): Promise<any> {
    return this.db.get('SELECT * FROM chat_custom_emojis WHERE code = ?', [code]);
  }

  async create(code: string, name: string, ascii: string, createdBy: number): Promise<void> {
    await this.db.run(
      `INSERT INTO chat_custom_emojis (code, name, ascii_art, created_by) VALUES (?, ?, ?, ?)`,
      [code, name, ascii, createdBy]
    );
  }

  async delete(code: string): Promise<void> {
    await this.db.run('DELETE FROM chat_custom_emojis WHERE code = ?', [code]);
  }
}
