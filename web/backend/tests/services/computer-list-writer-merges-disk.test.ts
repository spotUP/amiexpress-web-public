/**
 * ComputerList.info is the source of truth; computer_types is a mirror.
 *
 * The page reads its list from ComputerList.info (ComputerConfigService
 * .getAllComputerTypes) but the writer rebuilt the file from
 * configRepo.getAllComputerTypes() alone. The two disagree - on the live site
 * the table is empty against eight entries on disk - so saving one computer
 * type rewrote the file from the database's idea of the world and deleted
 * every computer that only existed on disk.
 *
 * These tests drive the real create/update/delete entry points against a real
 * temporary BBS root and read the resulting .info file back.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ComputerConfigService } from '../../src/services/config-services/computer-config.service';
import { InfoFileParser } from '../../src/services/info-file-parser';
import { config as appConfig } from '../../src/config';
import type { Database } from '../../src/database';
import type { ComputerType } from '../../src/database/types';

const DISK_COMPUTERS = [
  'AMiGA 500', 'AMiGA 2000', 'AMiGA 3000', 'AMiGA 4000',
  'AMiGA 1200', 'PC', 'mAC', 'OTHER!',
];

/** Minimal stand-in for the computer_types table. */
class FakeComputerTable {
  rows: ComputerType[] = [];
  private nextId = 1;

  // Copies, like the real repository's row mapper - callers must not hold a
  // live reference into the table.
  getAllComputerTypes(): ComputerType[] {
    return this.rows
      .map(r => ({ ...r }))
      .sort((a, b) => a.computer_number - b.computer_number);
  }

  getComputerTypeById(id: number): ComputerType | null {
    const row = this.rows.find(r => r.id === id);
    return row ? { ...row } : null;
  }

  createComputerType(data: Omit<ComputerType, 'id' | 'created_at' | 'updated_at'>): number {
    const id = this.nextId++;
    this.rows.push({ ...data, id, created_at: new Date(), updated_at: new Date() });
    return id;
  }

  updateComputerType(id: number, data: Partial<ComputerType>): boolean {
    const row = this.rows.find(r => r.id === id);
    if (!row) return false;
    Object.assign(row, data);
    return true;
  }

  deleteComputerType(id: number): boolean {
    const before = this.rows.length;
    this.rows = this.rows.filter(r => r.id !== id);
    return this.rows.length !== before;
  }

  logConfigChange(): void {
    // audit log is not under test
  }
}

function writeComputerList(bbsRoot: string, names: string[]): void {
  const toolTypes = new Map<string, string>();
  names.forEach((name, i) => toolTypes.set(`COMPUTER.${i + 1}`, name));
  toolTypes.set('COMPUTER.NUM', String(names.length));
  fs.writeFileSync(
    path.join(bbsRoot, 'ComputerList.info'),
    new InfoFileParser().write(toolTypes),
  );
}

function readComputerList(bbsRoot: string): string[] {
  const parsed = new InfoFileParser().parse(
    fs.readFileSync(path.join(bbsRoot, 'ComputerList.info')),
  );
  const toolTypes = new Map<string, string>();
  for (const [k, v] of parsed.toolTypes.entries()) toolTypes.set(k.toUpperCase(), v);

  const count = parseInt(toolTypes.get('COMPUTER.NUM') ?? '0', 10);
  const names: string[] = [];
  for (let i = 1; i <= count; i++) {
    const name = toolTypes.get(`COMPUTER.${i}`);
    if (name) names.push(name);
  }
  return names;
}

describe('ComputerConfigService writes what is on disk plus the change', () => {
  let bbsRoot: string;
  let previousDataDir: string;
  let table: FakeComputerTable;
  let service: ComputerConfigService;

  const context = { userId: 'u1', username: 'sysop', ipAddress: '127.0.0.1', userAgent: 'jest' };

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'computerlist-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', bbsRoot);
    writeComputerList(bbsRoot, DISK_COMPUTERS);

    table = new FakeComputerTable();
    const database = {
      getConfigRepository: () => table,
    } as unknown as Database;
    service = new ComputerConfigService(database);
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  it('reads the eight computers that exist only on disk', async () => {
    const computers = await service.getAllComputerTypes();
    expect(computers.map(c => c.computer_name)).toEqual(DISK_COMPUTERS);
    expect(table.rows).toHaveLength(0);
  });

  it('adding one computer type does not erase the computer types that exist only on disk', async () => {
    // The live shape exactly: eight on disk, zero rows in computer_types.
    await service.createComputerType(
      { computer_number: 9, computer_name: 'AMiGA 600', enabled: true },
      context,
    );

    expect(readComputerList(bbsRoot)).toEqual([...DISK_COMPUTERS, 'AMiGA 600']);
  });

  it('renaming one computer type does not erase the computer types that exist only on disk', async () => {
    // The id came from the list the page showed, which is the file: COMPUTER.6.
    await service.updateComputerType(6, { computer_name: 'PC/MS-DOS' }, context);

    expect(readComputerList(bbsRoot)).toEqual([
      'AMiGA 500', 'AMiGA 2000', 'AMiGA 3000', 'AMiGA 4000',
      'AMiGA 1200', 'PC/MS-DOS', 'mAC', 'OTHER!',
    ]);
  });

  it('deleting one computer type removes only that one', async () => {
    const deleted = await service.deleteComputerType(7, context);

    expect(deleted).toBe(true);
    expect(readComputerList(bbsRoot)).toEqual([
      'AMiGA 500', 'AMiGA 2000', 'AMiGA 3000', 'AMiGA 4000',
      'AMiGA 1200', 'PC', 'OTHER!',
    ]);
  });

  it('keeps every computer name byte for byte through a save', async () => {
    // COMPUTER.n is the whole record; a save must not case-fold or trim it.
    await service.createComputerType(
      { computer_number: 9, computer_name: 'AMiGA 600', enabled: true },
      context,
    );

    const namesOnDisk = readComputerList(bbsRoot);
    for (const original of DISK_COMPUTERS) {
      expect(namesOnDisk).toContain(original);
    }
  });

  it('editing a computer that exists only on disk is not reported as not found', async () => {
    // The list is numbered by position in ComputerList.info; looking that
    // number up as a computer_types rowid threw "Computer type 4 not found"
    // for every computer on the page, because the table is empty.
    const updated = await service.updateComputerType(4, { computer_name: 'AMiGA 4000T' }, context);

    expect(updated.computer_name).toBe('AMiGA 4000T');
    expect(readComputerList(bbsRoot)[3]).toBe('AMiGA 4000T');
  });

  it('creating a computer type returns the computer that was created', async () => {
    // The new row's id is 1, which on disk is AMiGA 500 - reading the created
    // entry back by id would have returned the wrong computer.
    const created = await service.createComputerType(
      { computer_number: 9, computer_name: 'AMiGA 600', enabled: true },
      context,
    );

    expect(created.computer_name).toBe('AMiGA 600');
  });
});
