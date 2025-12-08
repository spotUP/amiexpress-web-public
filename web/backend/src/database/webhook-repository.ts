/**
 * Webhook Repository
 * Handles all webhook-related database operations
 */

import type { Webhook } from './types';
import { BaseRepository } from './BaseRepository';

export class WebhookRepository extends BaseRepository<any> {
  constructor(db: any) { super(db); }

  async getWebhooks(): Promise<Webhook[]> {

    const stmt = this.prepare('SELECT * FROM webhooks ORDER BY id ASC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      url: row.url,
      type: row.type as 'discord' | 'slack',
      enabled: Boolean(row.enabled),
      triggers: JSON.parse(row.triggers || '[]'),
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getWebhook(id: number): Promise<Webhook | null> {

    const stmt = this.prepare('SELECT * FROM webhooks WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      url: row.url,
      type: row.type as 'discord' | 'slack',
      enabled: Boolean(row.enabled),
      triggers: JSON.parse(row.triggers || '[]'),
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  async createWebhook(data: { name: string; url: string; type: 'discord' | 'slack'; triggers: string[] }): Promise<number> {

    const stmt = this.prepare(`
      INSERT INTO webhooks (name, url, type, enabled, triggers)
      VALUES (?, ?, ?, 1, ?)
    `);
    const result = stmt.run(data.name, data.url, data.type, JSON.stringify(data.triggers));
    return result.lastInsertRowid as number;
  }

  async updateWebhook(id: number, data: any): Promise<void> {

    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.url !== undefined) {
      fields.push('url = ?');
      values.push(data.url);
    }
    if (data.type !== undefined) {
      fields.push('type = ?');
      values.push(data.type);
    }
    if (data.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(data.enabled ? 1 : 0);
    }
    if (data.triggers !== undefined) {
      fields.push('triggers = ?');
      values.push(JSON.stringify(data.triggers));
    }

    if (fields.length === 0) return;

    fields.push('updated = strftime(\'%s\', \'now\')');
    values.push(id);

    const sql = `UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.prepare(sql);
    stmt.run(...values);
  }

  async deleteWebhook(id: number): Promise<void> {

    const stmt = this.prepare('DELETE FROM webhooks WHERE id = ?');
    stmt.run(id);
  }

  async getWebhooksByTrigger(trigger: string): Promise<Webhook[]> {

    const stmt = this.prepare('SELECT * FROM webhooks WHERE enabled = 1');
    const rows = stmt.all() as any[];

    return rows
      .map(row => ({
        id: row.id,
        name: row.name,
        url: row.url,
        type: row.type as 'discord' | 'slack',
        enabled: Boolean(row.enabled),
        triggers: JSON.parse(row.triggers || '[]'),
        created: new Date(row.created * 1000),
        updated: new Date(row.updated * 1000)
      }))
      .filter(webhook => webhook.triggers.includes(trigger));
  }
}
