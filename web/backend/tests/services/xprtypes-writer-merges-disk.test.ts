/**
 * Protocols/XprTypes.info is the source of truth; the protocols table is a mirror.
 *
 * The page reads its list from XprTypes.info (ProtocolConfigService
 * .getProtocols) but the writer rebuilt the file from configRepo.getProtocols()
 * alone. The two disagree - on the live site the table holds fewer rows than
 * the file - so saving one protocol rewrote the file from the database's idea
 * of the world and deleted every protocol that only existed on disk.
 *
 * These tests drive the real create/update/delete entry points against a real
 * temporary BBS root and read the resulting .info file back.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProtocolConfigService } from '../../src/services/config-services/protocol-config.service';
import { InfoFileParser } from '../../src/services/info-file-parser';
import { config as appConfig } from '../../src/config';
import type { Database } from '../../src/database';
import type { Protocol } from '../../src/database/types';

/** library code -> title, in file order. */
const DISK_PROTOCOLS: Array<[string, string]> = [
  ['INTERNAL', '/X Zmodem'],
  ['xprzmodem.library', 'XPR Zmodem'],
  ['xprxmodem.library', 'XPR Xmodem'],
  ['xprymodem.library', 'XPR Ymodem'],
  ['xprkermit.library', 'XprKermit'],
  ['xprquickb.library', 'XprQuickB'],
  ['Hydra', '/X Hydra'],
];

/** Minimal stand-in for the protocols table. */
class FakeProtocolTable {
  rows: Protocol[] = [];
  private nextId = 1;

  getProtocols(): Protocol[] {
    return this.rows.map(r => ({ ...r }));
  }

  getProtocol(id: number): Protocol | null {
    const row = this.rows.find(r => r.id === id);
    return row ? { ...row } : null;
  }

  createProtocol(data: Omit<Protocol, 'id' | 'created_at' | 'updated_at'>): Protocol | null {
    const row: Protocol = { ...data, id: this.nextId++, created_at: new Date(), updated_at: new Date() };
    this.rows.push(row);
    return { ...row };
  }

  updateProtocol(id: number, updates: Partial<Protocol>): Protocol | null {
    const row = this.rows.find(r => r.id === id);
    if (!row) return null;
    Object.assign(row, updates);
    return { ...row };
  }

  deleteProtocol(id: number): boolean {
    const before = this.rows.length;
    this.rows = this.rows.filter(r => r.id !== id);
    return this.rows.length !== before;
  }

  logConfigChange(): void {
    // audit log is not under test
  }
}

function writeXprTypes(bbsRoot: string, entries: Array<[string, string]>): void {
  const toolTypes = new Map<string, string>();
  entries.forEach(([library, title], i) => {
    toolTypes.set(`LIBRARY.${i + 1}`, library);
    toolTypes.set(`TITLE.${i + 1}`, title);
  });
  fs.mkdirSync(path.join(bbsRoot, 'Protocols'), { recursive: true });
  fs.writeFileSync(
    path.join(bbsRoot, 'Protocols', 'XprTypes.info'),
    new InfoFileParser().write(toolTypes),
  );
}

function readXprTypes(bbsRoot: string): Array<[string, string]> {
  const parsed = new InfoFileParser().parse(
    fs.readFileSync(path.join(bbsRoot, 'Protocols', 'XprTypes.info')),
  );
  const toolTypes = new Map<string, string>();
  for (const [k, v] of parsed.toolTypes.entries()) toolTypes.set(k.toUpperCase(), v);

  const out: Array<[string, string]> = [];
  for (let i = 1; i <= 50; i++) {
    const library = toolTypes.get(`LIBRARY.${i}`);
    const title = toolTypes.get(`TITLE.${i}`);
    if (!library && !title) break;
    if (library && title) out.push([library, title]);
  }
  return out;
}

describe('ProtocolConfigService writes what is on disk plus the change', () => {
  let bbsRoot: string;
  let previousDataDir: string;
  let table: FakeProtocolTable;
  let service: ProtocolConfigService;

  const context = { userId: 'u1', username: 'sysop', ipAddress: '127.0.0.1', userAgent: 'jest' };

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xprtypes-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', bbsRoot);
    writeXprTypes(bbsRoot, DISK_PROTOCOLS);

    table = new FakeProtocolTable();
    const database = {
      getConfigRepository: () => table,
    } as unknown as Database;
    service = new ProtocolConfigService(database);
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  it('reads the seven protocols that exist only on disk', async () => {
    const protocols = await service.getProtocols();
    expect(protocols.map(p => p.protocol_code)).toEqual(DISK_PROTOCOLS.map(([code]) => code));
    expect(table.rows).toHaveLength(0);
  });

  it('adding one protocol does not erase the protocols that exist only on disk', async () => {
    // The live shape: the file holds more protocols than the table does.
    await service.createProtocol(
      {
        protocol_name: 'XPR Zmodem 32k',
        protocol_code: 'xprzmodem32k.libr',
        command: 'xprzmodem32k.libr',
        upload_command: '',
        download_command: '',
        batch_upload: true,
        batch_download: true,
        bidirectional: false,
        enabled: true,
        is_default: false,
      },
      context,
    );

    expect(readXprTypes(bbsRoot)).toEqual([
      ...DISK_PROTOCOLS,
      ['xprzmodem32k.libr', 'XPR Zmodem 32k'],
    ]);
  });

  it('renaming one protocol does not erase the protocols that exist only on disk', async () => {
    // getProtocol resolves ids from the file, so id 5 is XprKermit on disk.
    await service.updateProtocol(5, { protocol_name: 'Kermit (XPR)' }, context);

    expect(readXprTypes(bbsRoot)).toEqual([
      ['INTERNAL', '/X Zmodem'],
      ['xprzmodem.library', 'XPR Zmodem'],
      ['xprxmodem.library', 'XPR Xmodem'],
      ['xprymodem.library', 'XPR Ymodem'],
      ['xprkermit.library', 'Kermit (XPR)'],
      ['xprquickb.library', 'XprQuickB'],
      ['Hydra', '/X Hydra'],
    ]);
  });

  it('changing a protocol code leaves the protocol in the file exactly once', async () => {
    await service.updateProtocol(7, { protocol_code: 'hydra.library' }, context);

    const onDisk = readXprTypes(bbsRoot);
    expect(onDisk).toHaveLength(DISK_PROTOCOLS.length);
    expect(onDisk[6]).toEqual(['hydra.library', '/X Hydra']);
    expect(onDisk.filter(([, title]) => title === '/X Hydra')).toHaveLength(1);
  });

  it('deleting one protocol removes only that one', async () => {
    const deleted = await service.deleteProtocol(3, context);

    expect(deleted).toBe(false); // nothing in the mirror to delete
    expect(readXprTypes(bbsRoot)).toEqual([
      ['INTERNAL', '/X Zmodem'],
      ['xprzmodem.library', 'XPR Zmodem'],
      ['xprymodem.library', 'XPR Ymodem'],
      ['xprkermit.library', 'XprKermit'],
      ['xprquickb.library', 'XprQuickB'],
      ['Hydra', '/X Hydra'],
    ]);
  });
});
