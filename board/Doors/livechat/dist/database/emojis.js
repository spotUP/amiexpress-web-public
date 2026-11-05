"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmojiRepository = exports.DEFAULT_EMOJIS = exports.EMOJIS_TABLE = void 0;
/** Custom emojis table schema */
exports.EMOJIS_TABLE = `
CREATE TABLE IF NOT EXISTS chat_custom_emojis (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ascii_art TEXT NOT NULL,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;
/** Default BBS emojis */
exports.DEFAULT_EMOJIS = [
    { code: ':bbs:', name: 'BBS', ascii: '[BBS]' },
    { code: ':amiga:', name: 'Amiga', ascii: '[A]' },
    { code: ':sysop:', name: 'Sysop', ascii: '[*]' },
    { code: ':lol:', name: 'LOL', ascii: ':D' },
    { code: ':cool:', name: 'Cool', ascii: 'B)' },
    { code: ':wink:', name: 'Wink', ascii: ';)' }
];
/** Custom emoji repository */
class EmojiRepository {
    constructor(db) {
        this.db = db;
    }
    async getAll() {
        return this.db.all('SELECT * FROM chat_custom_emojis');
    }
    async get(code) {
        return this.db.get('SELECT * FROM chat_custom_emojis WHERE code = ?', [code]);
    }
    async create(code, name, ascii, createdBy) {
        await this.db.run(`INSERT INTO chat_custom_emojis (code, name, ascii_art, created_by) VALUES (?, ?, ?, ?)`, [code, name, ascii, createdBy]);
    }
    async delete(code) {
        await this.db.run('DELETE FROM chat_custom_emojis WHERE code = ?', [code]);
    }
}
exports.EmojiRepository = EmojiRepository;
