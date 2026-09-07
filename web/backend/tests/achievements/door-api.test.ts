/**
 * SP2-11 - a door reports through the same reporter, and only for itself.
 * Driven through the real createBBSApi with the running door's command on
 * the session, the reporter's default deps pointed at the test database.
 */
jest.mock('../../src/services/bbs-event-emitter', () => ({ emitCustomDoorEvent: jest.fn(), emitDoorEvent: jest.fn() }));

import { createBBSApi } from '../../src/doors/BBSApi';
import { defaultDeps } from '../../src/achievements/reporter';
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
const warnings: string[] = [];

function apiFor(session: Record<string, unknown>): any {
  const socket: any = { id: 'sock-1', emit: () => {}, on: () => {} };
  return createBBSApi(socket, { user: { id: 'u-alice', username: 'alice', email: 'alice@example.com' }, nodeId: 1, ...session } as any);
}
const events = (): EventIn[] => due(db, NOW / 1000 + 1, 100).map((r) => JSON.parse(r.payload) as EventIn);

beforeAll(async () => {
  db = (await waitForTestDb()).db;
  defaultDeps.rawDb = () => db;
  defaultDeps.settings = () => ({ serverUrl: 'https://doors.example', boardKey: 'uprough.k', boardId: 'uprough', enabled: true });
  defaultDeps.now = () => NOW;
  defaultDeps.warn = (l) => warnings.push(l);
}, 30000);

beforeEach(() => {
  db.exec('DELETE FROM achievement_outbox');
  warnings.length = 0;
});

describe('a door reporting an achievement', () => {
  it('may report only its own namespace: door.<command>.<slug> is written, anything else is refused with one WARN and no row', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const api = apiFor({ currentDoorName: 'GMASTER', commandText: 'G -X' });

    expect(api.achievement('door.gmaster.win', { key: 'fast', value: 2 })).toBe(true);
    expect(events()).toEqual([expect.objectContaining({ type: 'door.gmaster.win', key: 'fast', value: 2, door: 'GMASTER', email: 'alice@example.com' })]);

    for (const bad of ['door.phreakwars.win', 'msg.post', 'door.gmaster', 'door.gmaster.Win', 'meta.unlock']) {
      expect(api.achievement(bad)).toBe(false);
    }
    expect(events()).toHaveLength(1);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('may not report'))).toHaveLength(5);

    // The command falls back to the input line, without its arguments.
    const fallback = apiFor({ commandText: 'ARKANOID -WINDOW' });
    expect(fallback.achievement('door.arkanoid.clear')).toBe(true);
    expect(events().map((e) => e.type)).toEqual(['door.gmaster.win', 'door.arkanoid.clear']);
    // A caller without an email: not a player, no row, no throw.
    const nobody = createBBSApi({ id: 's', emit: () => {}, on: () => {} } as any, { user: { id: 'u2', username: 'x' }, nodeId: 1, currentDoorName: 'GMASTER' } as any);
    expect(nobody.achievement('door.gmaster.win')).toBe(false);
    warn.mockRestore();
  });
});
