/**
 * SP2-9 - sites: social acts and bulletins. Each act is a one-line call
 * beside the handler's own success path (chat.handler.ts sendPagerWebhook,
 * olm.handler.ts OLM SENT, internode-chat.handler.ts handleChatAccept,
 * operator-chat.handler.ts acceptPage, transfer-misc-commands.handler.ts
 * submitAllVotes, display-file-commands.handler.ts _displayBulletin); the
 * bulletin site carries the only logic and is driven here with a real
 * directory.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { defaultSiteDeps, reportBulletinRead, bulletinNumbersIn } from '../../src/achievements/sites';
import { report } from '../../src/achievements/reporter';
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
const NOW = 1800000000000;
const deps = (): ReporterDeps => ({
  rawDb: () => db,
  settings: () => ({ serverUrl: 'https://doors.example', boardKey: 'uprough.k', boardId: 'uprough', enabled: true }),
  now: () => NOW,
  warn: (l) => { throw new Error(l); },
});
const kinds = (): string[] => due(db, NOW / 1000 + 1, 1000).map((r) => (JSON.parse(r.payload) as EventIn).type).sort();
const alice = () => ({ user: { id: 'u-alice', email: 'alice@example.com' } });

beforeAll(async () => {
  db = (await waitForTestDb()).db;
  defaultSiteDeps.reporter = deps();
  defaultSiteDeps.rawDb = () => db;
  defaultSiteDeps.now = () => NOW;
}, 30000);

beforeEach(() => db.exec('DELETE FROM achievement_outbox'));

describe('social acts', () => {
  it.each(['social.page', 'social.olm', 'social.nodechat', 'social.chat', 'social.vote'])('%s is one event for the caller', (type) => {
    expect(report(alice(), type, {}, deps())).toMatch(/^uprough:/);
    expect(kinds()).toEqual([type]);
  });
});

describe('bulletins', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ach-bull-'));
    for (const f of ['Bull1', 'Bull2.ans', 'Bull3.txt', 'Bull4', 'Bull4.ans', 'README', 'Bullx']) fs.writeFileSync(path.join(dir, f), 'x');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reading every bulletin writes bull.read.all once, reading three of four writes nothing', () => {
    expect(bulletinNumbersIn(dir)).toEqual([1, 2, 3, 4]);
    const session = alice();
    expect(reportBulletinRead(session, 1, dir)).toBe(false);
    expect(reportBulletinRead(session, 2, dir)).toBe(false);
    expect(reportBulletinRead(session, 1, dir)).toBe(false); // again: no progress
    expect(reportBulletinRead(session, 3, dir)).toBe(false);
    expect(kinds()).toEqual([]);
    expect(reportBulletinRead(session, 4, dir)).toBe(true);
    expect(kinds()).toEqual(['bull.read.all']);
    // Re-reading after the set is complete reports nothing more this session.
    expect(reportBulletinRead(session, 2, dir)).toBe(false);
    expect(kinds()).toEqual(['bull.read.all']);
    // A board with no bulletins never fires it.
    expect(reportBulletinRead(alice(), 1, path.join(dir, 'nowhere'))).toBe(false);
  });
});
