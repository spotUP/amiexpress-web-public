/**
 * GDPR erasure removes the caller from EVERY notify_* table.
 *
 * The table list is read from notify.schema.sql, and the fixture below must
 * have an entry for each: a table added to the schema without a fixture (and so
 * without being proven erased) fails the first test; a table the erasure misses
 * fails the second.
 */
import * as fs from 'fs';
import * as path from 'path';
import { eraseUserData } from '../../src/services/gdpr-erasure.service';
import { erasePushSubscriptions } from '../../src/notify/repository';
import { waitForTestDb } from './helpers';

const SCHEMA = fs.readFileSync(path.join(__dirname, '../../src/notify/notify.schema.sql'), 'utf8');
const SCHEMA_TABLES = [...SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (notify_\w+)/g)].map((m) => m[1]).sort();

/** One row for `uid` in each table. */
const FIXTURE: Record<string, (db: any, uid: string) => void> = {
  notify_prefs: (db, u) => db.prepare("INSERT INTO notify_prefs (user_id, event, channel, mode) VALUES (?, 'msg.reply', 'email', 'instant')").run(u),
  notify_follow: (db, u) => db.prepare('INSERT INTO notify_follow (user_id, conference_id) VALUES (?, 1)').run(u),
  notify_settings: (db, u) => db.prepare('INSERT INTO notify_settings (user_id, paused) VALUES (?, 1)').run(u),
  notify_email_codes: (db, u) => db.prepare("INSERT INTO notify_email_codes (user_id, email, code_hash, expires_at) VALUES (?, 'a@b.c', 'h', 1)").run(u),
  notify_outbox: (db, u) => db.prepare("INSERT INTO notify_outbox (ref, user_id, channel, event, payload, created_at, deliver_after, next_attempt_at) VALUES (?, ?, 'email', 'msg.reply', '{}', 1, 1, 1)").run(`ref-${u}`, u),
  notify_inbox: (db, u) => db.prepare("INSERT INTO notify_inbox (user_id, payload, created_at) VALUES (?, '{}', 1)").run(u),
  notify_sent_log: (db, u) => db.prepare("INSERT INTO notify_sent_log (user_id, channel, sent_at) VALUES (?, 'email', 1)").run(u),
};

const count = (db: any, table: string, uid: string): number =>
  db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(uid).n;

describe('GDPR erasure and the notification tables', () => {
  it('every table in notify.schema.sql has a fixture here (a new table must be proven erased)', () => {
    expect(SCHEMA_TABLES.length).toBeGreaterThanOrEqual(7);
    expect(Object.keys(FIXTURE).sort()).toEqual(SCHEMA_TABLES);
  });

  it('erasing a caller removes their rows from every notify_* table and leaves other callers alone', async () => {
    const testDb = await waitForTestDb();
    const raw = testDb.db;
    const id = await testDb.createUser({
      username: `notify_erase_${Date.now()}`, passwordHash: 'h', realname: 'Real', location: '', phone: '', email: 'n@e.test',
      secLevel: 10, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0, ratioType: 0, timeTotal: 0,
      timeLimit: 60, timeUsed: 0, chatLimit: 30, chatUsed: 0, firstLogin: new Date(), lastLogin: new Date(), calls: 1,
      callsToday: 1, newUser: false, expert: 'N', ansi: true, linesPerScreen: 23, computer: 'AMiGA 500', screenType: 'ANSI',
      protocol: 'ZMODEM', editor: 'FULL', zoomType: 'NONE', availableForChat: true, quietNode: false, autoRejoin: 1,
      confAccess: 'XXX', areaName: '', uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0,
    } as any);
    const bystander = `bystander-${id}`;
    for (const t of SCHEMA_TABLES) { FIXTURE[t](raw, id); FIXTURE[t](raw, bystander); }
    for (const t of SCHEMA_TABLES) expect(count(raw, t, id)).toBe(1);

    const result = await eraseUserData(testDb, id);

    for (const t of SCHEMA_TABLES) {
      expect([t, count(raw, t, id)]).toEqual([t, 0]);
      expect([t, count(raw, t, bystander)]).toEqual([t, 1]);
    }
    expect(result.notifyRowsErased).toBe(SCHEMA_TABLES.length);
  });

  it('N5 seam: the push-subscription erase exists and is a no-op until the purpose column lands', () => {
    expect(erasePushSubscriptions(undefined as any, 'x')).toBe(0);
  });
});
