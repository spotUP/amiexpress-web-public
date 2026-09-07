/**
 * SP2-1 - achievements configuration: three columns, one of them the negative.
 *
 * Driven through the real ConfigRepository against the test database, so
 * what is asserted is the row a sysop's save leaves behind and the settings
 * the reporter reads back - never the helper alone.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ConfigRepository } from '../../src/database/config-repository';
import { achievementsSettings, DEFAULT_ACHIEVEMENTS_SERVER } from '../../src/achievements/config';
import { ACHIEVEMENTS_CONTRACT_VERSION } from '../../src/achievements/contract';
import { isSensitiveField, isDatabaseOnlyField } from '../../src/utils/secrets-encryption.util';

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

let repo: ConfigRepository;
let rawDb: any;

beforeAll(async () => {
  const db = await waitForTestDb();
  rawDb = db.db;
  repo = new ConfigRepository(rawDb);
}, 30000);

beforeEach(() => {
  repo.updateSystemConfig({ achievements_server_url: '', achievements_board_key: '', achievements_disabled: false });
});

describe('achievements configuration', () => {
  it('a board with no server url or key has achievements off, and a set key is stored encrypted', () => {
    expect(achievementsSettings(repo.getSystemConfig())).toEqual({ serverUrl: '', boardKey: '', boardId: '', enabled: false });

    repo.updateSystemConfig({ achievements_server_url: 'https://doors.uprough.net/', achievements_board_key: 'REDACTED' });

    const raw = rawDb.prepare('SELECT achievements_board_key AS k FROM system_config WHERE id = 1').get() as { k: string };
    expect(raw.k).not.toContain('s3cret');
    expect(raw.k.length).toBeGreaterThan(20);
    expect(isSensitiveField('achievements_board_key')).toBe(true);
    expect(isDatabaseOnlyField('achievements_server_url')).toBe(true);
    expect(isDatabaseOnlyField('achievements_disabled')).toBe(true);
    // The read path decrypts, and the trailing slash is gone.
    expect(achievementsSettings(repo.getSystemConfig())).toEqual({
      serverUrl: 'https://doors.uprough.net', boardKey: 'REDACTED', boardId: 'uprough', enabled: true,
    });
  });

  it('achievements_disabled turns a configured board off without touching the key', () => {
    repo.updateSystemConfig({ achievements_server_url: 'https://doors.uprough.net', achievements_board_key: 'uprough.abc' });
    repo.updateSystemConfig({ achievements_disabled: true });
    const s = achievementsSettings(repo.getSystemConfig());
    expect(s.enabled).toBe(false);
    expect(s.boardKey).toBe('uprough.abc');
    repo.updateSystemConfig({ achievements_disabled: false });
    expect(achievementsSettings(repo.getSystemConfig()).enabled).toBe(true);
  });

  it('a key with no address means the public server', () => {
    // The address field's placeholder was the only place that string
    // appeared, and a sysop read it as a value: the key saved, the address
    // did not, and the door said the board was not configured (2026-09-07).
    repo.updateSystemConfig({ achievements_board_key: 'REDACTED' });
    const s = achievementsSettings(repo.getSystemConfig());
    expect(s.serverUrl).toBe(DEFAULT_ACHIEVEMENTS_SERVER);
    expect(s.enabled).toBe(true);
    // A typed address still wins, and no key means no server at all.
    repo.updateSystemConfig({ achievements_server_url: 'https://doors.example.invalid' });
    expect(achievementsSettings(repo.getSystemConfig()).serverUrl).toBe('https://doors.example.invalid');
    expect(achievementsSettings({ achievements_board_key: '' } as any).serverUrl).toBe('');
  });

  it("the board id is the key's prefix and nothing else", () => {
    expect(achievementsSettings({ achievements_server_url: 'x', achievements_board_key: 'uprough.abc' } as any).boardId).toBe('uprough');
    // No dot, or nothing after it: not a key, not enabled.
    expect(achievementsSettings({ achievements_server_url: 'x', achievements_board_key: 'uprough' } as any).enabled).toBe(false);
    expect(achievementsSettings({ achievements_server_url: 'x', achievements_board_key: 'uprough.' } as any).enabled).toBe(false);
    expect(achievementsSettings({ achievements_server_url: 'x', achievements_board_key: '.abc' } as any).enabled).toBe(false);
  });

  it('the vendored contract is version 1 and generated', () => {
    expect(ACHIEVEMENTS_CONTRACT_VERSION).toBe('1');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'achievements', 'contract.ts'), 'utf8');
    expect(src.startsWith('/**\n * GENERATED FILE -- DO NOT EDIT BY HAND.')).toBe(true);
    expect(src).toContain('gen-achievement-types.ts');
  });
});
