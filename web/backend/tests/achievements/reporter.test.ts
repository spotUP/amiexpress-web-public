/**
 * SP2-3 - the reporter.
 *
 * Driven with the test database's handle and injected settings, so what
 * is asserted is the outbox row a site leaves behind.
 */
import { report, reportSnapshot, hourKey, isMidnightWindow, isReturnAfter30, newRef, clientOf } from '../../src/achievements/reporter';
import type { ReporterDeps } from '../../src/achievements/reporter';
import { due } from '../../src/achievements/outbox.repository';

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
let warnings: string[] = [];
const NOW = 1800000000000;
const deps = (over: Partial<ReporterDeps> = {}): ReporterDeps => ({
  rawDb: () => db,
  settings: () => ({ serverUrl: 'https://doors.example', boardKey: 'uprough.k', boardId: 'uprough', enabled: true }),
  now: () => NOW,
  warn: (l) => warnings.push(l),
  ...over,
});
const caller = { user: { id: 'u1', email: 'Caller@Example.com' }, connectionType: 'telnet' as const };

beforeAll(async () => {
  db = (await waitForTestDb()).db;
}, 30000);

beforeEach(() => {
  db.exec('DELETE FROM achievement_outbox');
  warnings = [];
});

describe('the reporter', () => {
  it('a caller without an email produces no row and no error', () => {
    expect(report({ user: { id: 'u1' } }, 'msg.post', {}, deps())).toBeNull();
    expect(report({ user: { id: 'u1', email: '  ' } }, 'msg.post', {}, deps())).toBeNull();
    expect(report({}, 'msg.post', {}, deps())).toBeNull();
    expect(due(db, NOW / 1000 + 1, 10)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('an event written by the reporter is the contract shape, ref-prefixed by the board id', () => {
    const ref = report(caller, 'msg.post', { key: 'conf:2', value: 3, door: null, at: NOW - 1000 }, deps());
    expect(ref).toMatch(/^uprough:[0-9A-HJKMNP-TV-Z]{26}$/);
    const rows = due(db, NOW / 1000, 10);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].payload)).toEqual({
      ref, email: 'Caller@Example.com', type: 'msg.post', at: new Date(NOW - 1000).toISOString(), value: 3, key: 'conf:2', client: 'telnet',
    });
    expect(rows[0].email).toBe('Caller@Example.com');
    // Achievements off: nothing is written.
    expect(report(caller, 'msg.post', {}, deps({ settings: () => ({ serverUrl: '', boardKey: '', boardId: '', enabled: false }) }))).toBeNull();
    expect(due(db, NOW / 1000, 10)).toHaveLength(1);
  });

  it("a snapshot's ref is the contract's stat form, so an unchanged counter is a duplicate", () => {
    expect(reportSnapshot(caller, 'file.upload', 137.9, deps())).toBe('uprough:caller@example.com:stat:file.upload:137');
    expect(reportSnapshot(caller, 'file.upload', 137, deps())).toBe('uprough:caller@example.com:stat:file.upload:137');
    const rows = due(db, NOW / 1000, 10);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].payload)).toMatchObject({ type: 'stat.snapshot', key: 'file.upload', value: 137 });
    expect(reportSnapshot(caller, 'file.upload', Number.NaN, deps())).toBeNull();
  });

  it('the reporter never throws: a closed database is one WARN line', () => {
    const broken = deps({ rawDb: () => ({ prepare: () => { throw new Error('SQLITE_BUSY: database is locked'); } }) as any });
    expect(report(caller, 'msg.post', {}, broken)).toBeNull();
    expect(reportSnapshot(caller, 'msg.post', 1, broken)).toBeNull();
    expect(warnings).toEqual([
      '[WARN] achievements: report(msg.post) failed: SQLITE_BUSY: database is locked',
      '[WARN] achievements: snapshot(msg.post) failed: SQLITE_BUSY: database is locked',
    ]);
    expect(report(caller, 'msg.post', {}, deps({ rawDb: () => undefined }))).toBeNull();
    expect(warnings[2]).toContain('no database handle');
  });

  it('the facts a site computes', () => {
    expect(hourKey(new Date(2026, 8, 7, 3, 59))).toBe('hour:03');
    expect(hourKey(new Date(2026, 8, 7, 23, 0))).toBe('hour:23');
    expect(isMidnightWindow(new Date(2026, 8, 7, 0, 4, 59))).toBe(true);
    expect(isMidnightWindow(new Date(2026, 8, 7, 0, 5, 0))).toBe(false);
    expect(isMidnightWindow(new Date(2026, 8, 7, 1, 0))).toBe(false);
    const day = 24 * 3600 * 1000;
    expect(isReturnAfter30(new Date(NOW - 31 * day), NOW)).toBe(true);
    expect(isReturnAfter30(new Date(NOW - 29 * day), NOW)).toBe(false);
    expect(isReturnAfter30(null, NOW)).toBe(false);
    expect(isReturnAfter30(0, NOW)).toBe(false);
    expect(clientOf({ terminalType: 'c64' })).toBe('c64');
    expect(clientOf({ isAmigaTerminal: true, connectionType: 'telnet' })).toBe('amiga');
    expect(clientOf({ connectionType: 'ssh' })).toBe('ssh');
    expect(clientOf({})).toBe('web');
    expect(new Set(Array.from({ length: 50 }, () => newRef('b'))).size).toBe(50);
  });
});
