/**
 * A caller's CF choices survive the board restarting.
 *
 * runMigrations ran `UPDATE conf_base SET scan_flags = 0` on EVERY boot. It
 * came in (0de5840ad, 2026-04-28) to stop AquaScan auto-launching from the
 * file-scan bit, but it cleared the mail-scan and zoom bits too, so every
 * deploy forgot every CF setting on the board (express.e parity survey,
 * 2026-09-29). Two real boots of the Database class on one file.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/database';

const MAIL_SCAN = 4;
const ZOOM_SCAN = 16;

it('keeps mail-scan and zoom flags across two boots', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-restart-'));
  const saved = { dir: process.env.DATABASE_DIR, file: process.env.DATABASE_FILE };
  const quiet = [jest.spyOn(console, 'log').mockImplementation(() => {}), jest.spyOn(console, 'warn').mockImplementation(() => {})];
  process.env.DATABASE_DIR = dir;
  process.env.DATABASE_FILE = 'cf.db';
  try {
    const first = new Database();
    await first.init();
    const raw = (first as any).db;
    raw.pragma('foreign_keys = OFF');
    raw.prepare('INSERT INTO conf_base (user_id, conference_id, message_base_id, scan_flags) VALUES (?, ?, ?, ?)')
      .run('u-cf', 1, 1, MAIL_SCAN | ZOOM_SCAN);
    raw.close();

    const second = new Database();
    await second.init();
    const row = (second as any).db.prepare('SELECT scan_flags FROM conf_base WHERE user_id = ?').get('u-cf');
    (second as any).db.close();

    expect(row.scan_flags).toBe(MAIL_SCAN | ZOOM_SCAN);
  } finally {
    for (const q of quiet) q.mockRestore();
    if (saved.dir === undefined) delete process.env.DATABASE_DIR; else process.env.DATABASE_DIR = saved.dir;
    if (saved.file === undefined) delete process.env.DATABASE_FILE; else process.env.DATABASE_FILE = saved.file;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
