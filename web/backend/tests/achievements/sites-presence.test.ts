/**
 * SP2-7 - sites: presence at login, the session end, and every door.
 *
 * reportPresence/reportLogout are driven with the user record a login
 * holds and the real outbox; the door site is driven through
 * withDoorReporting with a run that throws. executeDoor itself is a
 * three-line wrapper around it (door.handler.ts) - importing that module
 * under jest boots the server, which is why no door test does.
 */
import { defaultSiteDeps, reportPresence, reportLogout, callerOrdinal } from '../../src/achievements/sites';
import type { ReporterDeps } from '../../src/achievements/reporter';
import { due } from '../../src/achievements/outbox.repository';
import type { EventIn } from '../../src/achievements/contract';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

let db: any;
let NOW = new Date(2026, 8, 7, 14, 30).getTime(); // 14:30 local
const DAY = 24 * 3600 * 1000;
const reporterDeps = (): ReporterDeps => ({
  rawDb: () => db,
  settings: () => ({ serverUrl: 'https://doors.example', boardKey: 'uprough.k', boardId: 'uprough', enabled: true }),
  now: () => NOW,
  warn: (l) => { throw new Error(l); },
});

const events = (): EventIn[] => due(db, NOW / 1000 + 1, 1000).map((r) => JSON.parse(r.payload) as EventIn);
const kinds = (): string[] => events().map((e) => `${e.type}${e.key ? ':' + e.key : ''}${e.type === 'stat.snapshot' ? '=' + e.value : ''}`).sort();

const alice = { id: 'u-alice', email: 'alice@example.com', calls: 41, messagesPosted: 99, uploads: 7, downloads: 120, timeTotal: 610, lastLogin: new Date(NOW - 2 * DAY), firstLogin: new Date(NOW - 400 * DAY) };

beforeAll(async () => {
  db = (await waitForTestDb()).db;
  defaultSiteDeps.reporter = reporterDeps();
  defaultSiteDeps.rawDb = () => db;
  defaultSiteDeps.now = () => NOW;
}, 30000);

beforeEach(() => {
  db.exec("DELETE FROM achievement_outbox; DELETE FROM users WHERE id LIKE 'u-ord-%'");
  NOW = new Date(2026, 8, 7, 14, 30).getTime();
});

describe('presence and doors', () => {
  it('a login writes presence.call keyed by the hour and four snapshots', () => {
    expect(reportPresence({ connectionType: 'telnet' }, alice)).toBe(5);
    expect(kinds()).toEqual([
      'presence.call:hour:14',
      'stat.snapshot:file.download=120',
      'stat.snapshot:file.upload=7',
      'stat.snapshot:msg.post=99',
      'stat.snapshot:presence.call=42',
    ]);
    expect(events().every((e) => e.email === 'alice@example.com' && e.client === 'telnet')).toBe(true);
  });

  it('a caller back after thirty days also writes return:30, and the pre-update last login is what counts', () => {
    reportPresence({}, { ...alice, lastLogin: new Date(NOW), lastLoginBeforeUpdate: new Date(NOW - 31 * DAY) });
    expect(kinds()).toContain('presence.call:return:30');
    db.exec('DELETE FROM achievement_outbox');
    reportPresence({}, { ...alice, lastLogin: new Date(NOW - 29 * DAY) });
    expect(kinds()).not.toContain('presence.call:return:30');
  });

  /**
   * ORDINALS ARE COMPUTED, NOT ASSUMED.
   *
   * `callerOrdinal` counts every user whose `firstlogin` is at or before the
   * candidate's, and this suite shares one database with every other backend
   * suite - so "insert until there are 1000 rows" was only right when nothing
   * else had inserted a user with a NULL or later `firstlogin`. It drifted to
   * 998 the moment two such rows existed, which is a red test that says
   * nothing about the code under it.
   *
   * So the test places its own candidates at ordinals 999 and 1000 by
   * MEASURING what is already counted and topping up from there, above every
   * existing row.
   */
  it("the thousandth account's first call writes caller:1000; the 999th does not", () => {
    const insert = db.prepare(`INSERT INTO users (id, username, passwordhash, realname, email, firstlogin) VALUES (?, ?, 'x', 'r', ?, ?)`);
    const maxExisting = (db.prepare('SELECT MAX(firstlogin) AS m FROM users').get() as { m: number | null }).m ?? 0;
    const base = Math.max(maxExisting, Math.floor(NOW / 1000) - 1000) + 1;
    // Everything already in the table sorts at or below `base`, so this is
    // exactly the ordinal the next row above it would take minus one.
    const counted = (db.prepare('SELECT COUNT(*) AS n FROM users WHERE firstlogin <= ?').get(base) as { n: number }).n;
    expect(counted).toBeLessThan(998);
    for (let i = 0; i < 998 - counted; i += 1) insert.run(`u-ord-${i}`, `ord${i}`, `ord${i}@example.com`, base + 1 + i);

    const ninehundredninetynine = { id: 'u-ord-x', email: 'x@example.com', calls: 0, firstLogin: new Date((base + 999) * 1000) };
    insert.run('u-ord-x', 'ordx', 'x@example.com', base + 999);
    expect(callerOrdinal(db, ninehundredninetynine)).toBe(999);
    reportPresence({}, ninehundredninetynine);
    expect(kinds()).not.toContain('presence.call:caller:1000');

    db.exec('DELETE FROM achievement_outbox');
    const thousandth = { id: 'u-ord-y', email: 'y@example.com', calls: 0, firstLogin: new Date((base + 1000) * 1000) };
    insert.run('u-ord-y', 'ordy', 'y@example.com', base + 1000);
    expect(callerOrdinal(db, thousandth)).toBe(1000);
    reportPresence({}, thousandth);
    expect(kinds()).toContain('presence.call:caller:1000');
    // On a later call the ordinal is not asked again.
    db.exec('DELETE FROM achievement_outbox');
    reportPresence({}, { ...thousandth, calls: 1 });
    expect(kinds()).not.toContain('presence.call:caller:1000');
  });

  it('a C64 caller writes presence.client c64, an Amiga TTYPE writes amiga, a web browser neither', () => {
    reportPresence({ terminalType: 'c64', petsciiMode: true }, alice);
    expect(kinds()).toContain('presence.client:c64');
    db.exec('DELETE FROM achievement_outbox');
    reportPresence({ connectionType: 'telnet', isAmigaTerminal: true }, alice);
    expect(kinds()).toContain('presence.client:amiga');
    db.exec('DELETE FROM achievement_outbox');
    reportPresence({ connectionType: 'web' }, alice);
    expect(kinds().filter((k) => k.startsWith('presence.client'))).toEqual([]);
  });

  it('logout writes the minutes snapshot and, in PETSCII, presence.petscii', () => {
    expect(reportLogout({ connectionType: 'telnet' }, alice, 125)).toBe(1);
    expect(kinds()).toEqual(['stat.snapshot:presence.minutes=612']);
    db.exec('DELETE FROM achievement_outbox');
    expect(reportLogout({ petsciiMode: true }, alice, undefined)).toBe(2);
    expect(kinds()).toEqual(['presence.petscii', 'stat.snapshot:presence.minutes=610']);
    // No email: nothing, no error.
    expect(reportLogout({}, { id: 'x' }, 60)).toBe(0);
  });

  it('a door writes door.play at launch and door.minutes when it exits, even when it throws', async () => {
    const { withDoorReporting } = require('../../src/achievements/sites');
    const session = { user: { id: 'u-alice', email: 'alice@example.com' }, connectionType: 'telnet' };
    await expect(withDoorReporting(session, 'gmaster', async () => { NOW += 3 * 60000 + 5000; throw new Error('door crashed'); })).rejects.toThrow('door crashed');
    const got = events();
    expect(got.map((e) => [e.type, e.key ?? null, e.value ?? null, e.door ?? null])).toEqual([
      ['door.play', 'GMASTER', null, 'GMASTER'],
      ['door.minutes', null, 3, 'GMASTER'],
    ]);
  });
});
