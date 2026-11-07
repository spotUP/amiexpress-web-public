/**
 * A door cfg that borrows the board's achievements key must follow the key
 * when a sysop changes it in System Config, not only at the next boot.
 *
 * LIVECHAT68, REQUESTS and ACHIEVEC render `BoardKey=` from
 * achievements_board_key (fromSystemConfig). That render ran only at startup,
 * so a rotated key left all three doors sending the old one until the board
 * restarted, and the door server refused them (found 2026-11-07 on the mirror
 * board). Driven through SystemConfigService.updateSystemConfig, the call the
 * System Config admin page makes.
 */

process.env.SKIP_DB_INIT = 'true';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SystemConfigService } from '../../src/services/config-services/system-config.service';
import { MANIFEST_FILE, renderDoorCfg, systemConfigResolver } from '../../src/doors/door-settings.service';
import type { Database } from '../../src/database';

const REAL_MANIFEST = path.join(__dirname, '..', '..', '..', '..', 'board', 'Doors', 'LIVECHAT68', MANIFEST_FILE);

describe('a board key change reaches the door cfgs that borrow it', () => {
  let root: string;
  let doorDir: string;
  let otherDir: string;
  const store: Record<string, unknown> = {};

  const fakeDatabase = {
    getConfigRepository: () => ({
      getSystemConfig: () => ({ ...store }),
      updateSystemConfig: (updates: Record<string, unknown>) => Object.assign(store, updates),
      logConfigChange: () => undefined,
    }),
  } as unknown as Database;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'boardkey-'));
    doorDir = path.join(root, 'LIVECHAT68');
    otherDir = path.join(root, 'PLAIN');
    fs.mkdirSync(doorDir);
    fs.mkdirSync(otherDir);
    fs.copyFileSync(REAL_MANIFEST, path.join(doorDir, MANIFEST_FILE));
    // A door with a cfg that borrows nothing must be left alone.
    fs.writeFileSync(path.join(otherDir, MANIFEST_FILE), JSON.stringify({
      command: 'PLAIN', cfgFile: 'PLAIN.cfg',
      settings: [{ key: 'host', cfgKey: 'Host', label: 'Host', type: 'string', default: 'x' }],
    }));
    fs.writeFileSync(path.join(otherDir, 'PLAIN.cfg'), 'Host=sysop-edited\n');
    for (const k of Object.keys(store)) delete store[k];
    store.achievements_board_key = 'aewlocal.old';
  });

  afterEach(() => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  function boardKeyLine(): string | undefined {
    const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
    const text = fs.readFileSync(path.join(doorDir, manifest.cfgFile), 'utf8');
    return text.split(/\r?\n/).find((l) => l.startsWith('BoardKey='));
  }

  it('rewrites BoardKey when achievements_board_key is saved', async () => {
    renderDoorCfg(doorDir, systemConfigResolver(() => store));   // what boot did
    expect(boardKeyLine()).toBe('BoardKey=aewlocal.old');

    const service = new SystemConfigService(fakeDatabase, root);
    await service.updateSystemConfig(
      { achievements_board_key: 'aewlocal.new' },
      { userId: 1, username: 'sysop', ipAddress: '127.0.0.1', userAgent: 'jest' } as any,
    );

    expect(boardKeyLine()).toBe('BoardKey=aewlocal.new');
    expect(fs.readFileSync(path.join(otherDir, 'PLAIN.cfg'), 'utf8')).toBe('Host=sysop-edited\n');
  });
});
