import type { Channel, ChannelMember } from '../types';

/** Channel repository */
export class ChannelRepository {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async create(channel: Partial<Channel>): Promise<Channel> {
    const sql = `INSERT INTO chat_channels
      (id, name, display_name, topic, type, created_by, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await this.db.run(sql, [
      channel.id, channel.name, channel.displayName,
      channel.topic, channel.type, channel.createdBy, channel.category
    ]);
    const created = await this.getById(channel.id!);
    if (!created) throw new Error('Failed to create channel');
    return created;
  }

  async getById(id: string): Promise<Channel | null> {
    return this.db.get('SELECT * FROM chat_channels WHERE id = ?', [id]);
  }

  async getByName(name: string): Promise<Channel | null> {
    return this.db.get('SELECT * FROM chat_channels WHERE name = ?', [name]);
  }

  async getAll(): Promise<Channel[]> {
    return this.db.all('SELECT * FROM chat_channels WHERE archived = 0');
  }

  async getPublic(): Promise<Channel[]> {
    return this.db.all(
      `SELECT * FROM chat_channels WHERE type = 'public' AND archived = 0`
    );
  }

  async update(id: string, data: Partial<Channel>): Promise<void> {
    const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
    await this.db.run(
      `UPDATE chat_channels SET ${sets} WHERE id = ?`,
      [...Object.values(data), id]
    );
  }

  async archive(id: string): Promise<void> {
    await this.db.run('UPDATE chat_channels SET archived = 1 WHERE id = ?', [id]);
  }
}
