"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelRepository = void 0;
/** Channel repository */
class ChannelRepository {
    constructor(db) {
        this.db = db;
    }
    async create(channel) {
        const sql = `INSERT INTO chat_channels
      (id, name, display_name, topic, type, created_by, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;
        await this.db.run(sql, [
            channel.id, channel.name, channel.displayName,
            channel.topic, channel.type, channel.createdBy, channel.category
        ]);
        const created = await this.getById(channel.id);
        if (!created)
            throw new Error('Failed to create channel');
        return created;
    }
    async getById(id) {
        return this.db.get('SELECT * FROM chat_channels WHERE id = ?', [id]);
    }
    async getByName(name) {
        return this.db.get('SELECT * FROM chat_channels WHERE name = ?', [name]);
    }
    async getAll() {
        return this.db.all('SELECT * FROM chat_channels WHERE archived = 0');
    }
    async getPublic() {
        return this.db.all(`SELECT * FROM chat_channels WHERE type = 'public' AND archived = 0`);
    }
    async update(id, data) {
        const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
        await this.db.run(`UPDATE chat_channels SET ${sets} WHERE id = ?`, [...Object.values(data), id]);
    }
    async archive(id) {
        await this.db.run('UPDATE chat_channels SET archived = 1 WHERE id = ?', [id]);
    }
}
exports.ChannelRepository = ChannelRepository;
