/**
 * A door declares its NOTIFY events in door.settings.json (`notifications`).
 * The catalogue lists exactly the declared ones of installed, enabled doors,
 * a caller can choose them, and bbs.notify queues only a declared slug.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { doorNotificationsApi } from '../../src/notify/door-api';
import type { NotificationsDeps } from '../../src/notify/door-api';
import { notifyFromDoor } from '../../src/notify/sites';
import type { SiteDeps } from '../../src/notify/sites';
import { productionDoorEvents } from '../../src/notify/door-events';
import { hasAdminContent, readManifestFromDir } from '../../src/doors/door-settings.service';
import { DEFAULT_SETTINGS, doorEventDef } from '@amiexpress/bbs-door-sdk/formats/notify';
import { getPrefs } from '../../src/notify/repository';
import { waitForTestDb, putUser } from './helpers';

const DOORS_DIR = path.resolve(__dirname, '../../../../Doors');

let handle: any;
beforeAll(async () => { handle = (await waitForTestDb()).db; }, 30000);
beforeEach(() => {
  for (const t of ['notify_prefs', 'notify_settings', 'notify_inbox', 'notify_outbox']) handle.prepare(`DELETE FROM ${t}`).run();
  putUser(handle, 'dn1', 'one@example.com');
});

const declared = [doorEventDef('door.bugs.update', 'A bug I reported was updated', 'Someone changed or commented on your bug.')!];
const apiDeps = (over: Partial<NotificationsDeps> = {}): NotificationsDeps => ({
  rawDb: () => handle, now: () => 1_000_000, smtpConfigured: async () => true, pushAvailable: () => true,
  conferences: async () => [], hasConfAccess: () => true, isSysop: () => false,
  verify: { send: async () => ({ ok: true }), now: () => 1_000_000, makeCode: () => '123456', bbsName: async () => 'Test' },
  emailSender: async () => ({ ok: true }), boardZone: () => 'UTC', doorEvents: () => declared, ...over,
});
const siteDeps = (doorEvents: SiteDeps['doorEvents']): SiteDeps => ({
  rawDb: () => handle, now: () => 1_800_000_000_000, hasConfAccess: () => true, isSysop: () => false, doorEvents,
});
const outbox = (): any[] => handle.prepare("SELECT * FROM notify_outbox WHERE event LIKE 'door.%'").all();

describe('door-declared notification events', () => {
  it('a declared event appears in the catalogue with the door\'s own label, on every channel', async () => {
    const { events } = await doorNotificationsApi({ user: { id: 'dn1' } }, apiDeps()).catalogue();
    const hit = events.find((e) => e.id === 'door.bugs.update');
    expect(hit).toMatchObject({ label: 'A bug I reported was updated', description: 'Someone changed or commented on your bug.', channels: ['email', 'push', 'board'] });
    const none = await doorNotificationsApi({ user: { id: 'dn1' } }, apiDeps({ doorEvents: () => [] })).catalogue();
    expect(none.events.some((e) => e.id.startsWith('door.'))).toBe(false);
  });

  it('a caller can opt in to a declared event, and cannot to one nobody declared', async () => {
    const api = doorNotificationsApi({ user: { id: 'dn1' } }, apiDeps());
    expect((await api.set({ 'door.bugs.update': { board: 'instant' } }, DEFAULT_SETTINGS)).ok).toBe(true);
    expect(getPrefs(handle, 'dn1')['door.bugs.update']).toEqual({ board: 'instant' });
    expect(await api.set({ 'door.bugs.invented': { board: 'instant' } }, DEFAULT_SETTINGS)).toEqual({ ok: false, error: 'unknown event door.bugs.invented' });
  });

  it('bbs.notify refuses an undeclared slug', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const item = { title: 't', body: 'b', objectId: 'k1' };
      expect(notifyFromDoor('bugs', 'door.bugs.invented', 'dn1', item, siteDeps(() => declared))).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally { warn.mockRestore(); }
    expect(outbox()).toHaveLength(0);
  });

  it('a declared event queued through bbs.notify reaches the outbox of a subscribed user, and only of one', async () => {
    putUser(handle, 'dn2', 'two@example.com');
    await doorNotificationsApi({ user: { id: 'dn1' } }, apiDeps()).set({ 'door.bugs.update': { board: 'instant' } }, DEFAULT_SETTINGS);
    const item = { title: 'Bug #7 Fixed', body: 'sysop set it to Fixed.', objectId: '7:status:fixed:1' };
    expect(notifyFromDoor('bugs', 'door.bugs.update', 'dn1', item, siteDeps(() => declared))).toBe(true);
    expect(notifyFromDoor('bugs', 'door.bugs.update', 'dn2', { ...item, objectId: '8:status:fixed:1' }, siteDeps(() => declared))).toBe(false);
    const rows = outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: 'dn1', event: 'door.bugs.update', channel: 'board' });
  });
});

describe('the shipped declaration', () => {
  it('Doors/bug-tracker declares door.bugs.update and the manifest is valid', () => {
    const manifest = readManifestFromDir(path.join(DOORS_DIR, 'bug-tracker'));
    expect(manifest?.command).toBe('BUGS');
    expect(manifest?.notifications?.map((n) => n.slug)).toEqual(['update']);
  });
});

describe('the admin list', () => {
  it('a manifest that only declares notifications puts no settings badge on the door', () => {
    const bugs = readManifestFromDir(path.join(DOORS_DIR, 'bug-tracker'))!;
    expect(hasAdminContent(bugs)).toBe(false);
    expect(hasAdminContent(readManifestFromDir(path.join(DOORS_DIR, 'tip-of-day'))!)).toBe(true);
  });
});

describe('productionDoorEvents', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-events-'));
    jest.resetModules();
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); jest.dontMock('../../src/handlers/door.handler'); jest.dontMock('../../src/utils/board-root.util'); });

  const door = (dir: string, command: string, notifications: unknown, manifestCommand = command): void => {
    fs.mkdirSync(path.join(root, 'Doors', dir), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', dir, 'door.settings.json'), JSON.stringify({ command: manifestCommand, settings: [], notifications }));
  };
  const load = (doors: unknown[]): typeof productionDoorEvents => {
    jest.doMock('../../src/handlers/door.handler', () => ({ getDoors: () => doors }));
    jest.doMock('../../src/utils/board-root.util', () => ({ boardRoot: () => root }));
    return require('../../src/notify/door-events').productionDoorEvents;
  };

  it('lists the declared events of registered, enabled doors only', () => {
    door('alpha', 'ALPHA', [{ slug: 'turn', label: 'Your turn' }]);
    door('beta', 'BETA', [{ slug: 'x', label: 'Disabled door event' }]);
    door('gamma', 'GAMMA', [{ slug: 'x', label: 'Not registered' }]);
    door('delta', 'DELTA', [{ slug: 'x', label: 'Other door\'s manifest' }], 'SOMEONE');
    const events = load([
      { command: 'ALPHA', path: 'Doors/alpha', enabled: true },
      { command: 'BETA', path: 'Doors/beta', enabled: true, toolTypes: { DRACCESS: '1' } },
      { command: 'DELTA', path: 'Doors/delta', enabled: true },
    ])();
    expect(events.map((e) => e.id)).toEqual(['door.alpha.turn']);
  });
});
