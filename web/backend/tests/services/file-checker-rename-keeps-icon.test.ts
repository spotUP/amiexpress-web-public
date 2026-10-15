/**
 * Renaming a file checker must not destroy its icon, and the directory it
 * writes to is the one the board actually has.
 *
 * Two defects, both found by driving the admin API against a real BBS tree:
 *
 * 1. A rename DELETED the old .info and wrote tooltypes to the new name.
 *    applyTooltypes creates a file when it finds none, so what landed was a
 *    text stub: FCheck/ARC.info went from a 529-byte Amiga icon to 54 bytes
 *    with no DiskObject. GetDiskObject reads that as NIL, so on the Amiga
 *    side the checker stopped existing.
 *
 * 2. The service hardcoded `Fcheck`; this board's volume holds `FCheck`.
 *    express.e writes `Fcheck` and on the Amiga's case-insensitive filesystem
 *    both are one directory - on the Linux container they are two. The live
 *    board answered ENOENT for the read, and a save would have created a
 *    second directory the BBS never looks in. Invisible on a Mac, which is
 *    case-insensitive too, which is how it survived.
 *
 * The fixture is the real FCheck/ARC.info off this board.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCheckerConfigService } from '../../src/services/config-services/file-checker-config.service';
import { config as appConfig } from '../../src/config';
import type { Database } from '../../src/database';
import type { FileChecker } from '../../src/database/types';

/** The real FCheck/ARC.info: 529 bytes, a Workbench icon with an image. */
const ARC_INFO_B64 =
  '4xAAAQAAAAAABwA2ADQAFgAEAAEAAQBM7vAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBGoAAAAAAEzxAAAAAAMAAAArAAAAAAAA' +
  'AAAAABAAAAAAAAA0ABUAAgACSdgDAAAAAAAAAAAAAAAQAAAAAAADgBAAD//////AEAAIAAAAD2AQAAn8AAA+cBAACAAAAHxI' +
  'EAB5/AAA+EfgAAgAAAHwfhAACAAAA+ABEAAIBd+33wEQAAgB4A+AARAACf37v38BEAAIAfx+AAEQAHn//v//AeAACAB/+AAB' +
  'EAAIAD/w/wEQAAgAD+AAARAAD///////EAAAAAOAAAAQAAAAAQAAABAA////////8AD////////gAIAAAAAAAAAAgAAAAAMA' +
  'AACH////9oAAAIYD///NgAAAh////7uwAAAGA///d7gAAPf///7vgeAAh////d/+AACH+iBLoP4AAIf+3/d//gAAhgLkToD+' +
  'AACH/vu9//4AAAYAfXgA/gAA9/++9//+4ACH/8/vAP4AAIf/99///gAAgAADgAAAAACAAAEAAAAAAIAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAYAAAAFENIRUNLRVI9U1lTOmMxL1BLQVgAAAAAC09QVElPTlM9LXQAAAAADFNUQUNLPTEwMDAwAAAAAAtQUklPUklU' +
  'WT0xAAAAABFFUlJPUi4xPVdhcm5pbmchAA==';

class FakeCheckerTable {
  rows: FileChecker[] = [];
  getAllFileCheckers(): FileChecker[] { return this.rows.map(r => ({ ...r })); }
  getFileChecker(id: number): FileChecker | undefined { const r = this.rows.find(x => x.id === id); return r ? { ...r } : undefined; }
  updateFileChecker(id: number, updates: Partial<FileChecker>): boolean {
    const i = this.rows.findIndex(x => x.id === id);
    if (i === -1) return false;
    this.rows[i] = { ...this.rows[i], ...updates };
    return true;
  }
  logConfigChange(): void {}
}

const context = { userId: 'u1', username: 'sysop', ipAddress: '127.0.0.1', userAgent: 'jest' };
const isIcon = (buf: Buffer) => buf.length > 2 && buf[0] === 0xe3 && buf[1] === 0x10;

describe('renaming a file checker', () => {
  let bbsRoot: string;
  let previousDataDir: string;
  let service: FileCheckerConfigService;
  let table: FakeCheckerTable;

  const setup = (dirName: string) => {
    fs.mkdirSync(path.join(bbsRoot, dirName), { recursive: true });
    fs.writeFileSync(path.join(bbsRoot, dirName, 'ARC.info'), Buffer.from(ARC_INFO_B64, 'base64'));
    table = new FakeCheckerTable();
    table.rows.push({
      id: 1, checker_name: 'ARC', checker_path: 'C:LHA', options: '', stack_size: 4096,
      priority: 0, script_path: '', enabled: true,
    } as FileChecker);
    service = new FileCheckerConfigService({ getConfigRepository: () => table } as unknown as Database);
  };

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fcheck-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', bbsRoot);
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  it('keeps the icon, rather than leaving a text stub where one was', async () => {
    setup('FCheck');
    const before = fs.readFileSync(path.join(bbsRoot, 'FCheck', 'ARC.info'));
    expect(isIcon(before)).toBe(true);

    await service.updateFileChecker(1, { checker_name: 'ARCHIVE' }, context);

    const renamed = path.join(bbsRoot, 'FCheck', 'ARCHIVE.info');
    expect(fs.existsSync(renamed)).toBe(true);
    expect(isIcon(fs.readFileSync(renamed))).toBe(true);
    expect(fs.existsSync(path.join(bbsRoot, 'FCheck', 'ARC.info'))).toBe(false);
  });

  it('writes into the directory the board has, whatever its case', async () => {
    setup('FCheck');

    await service.updateFileChecker(1, { stack_size: 8192 }, context);

    // No second directory, and the change landed in the real one.
    //
    // Counted by name rather than probed for both spellings: comparing
    // existsSync('Fcheck') against existsSync('FCheck') says "same answer
    // either way", which is only true on a case-INSENSITIVE filesystem. It
    // passed on the sysop's Mac and failed on CI's Linux, where the two are
    // genuinely different directories - which is exactly the situation this
    // test exists to catch, so the assertion has to be the one that can see
    // it.
    expect(fs.readdirSync(bbsRoot).filter(d => d.toLowerCase() === 'fcheck')).toHaveLength(1);
    const written = fs.readFileSync(path.join(bbsRoot, 'FCheck', 'ARC.info'));
    expect(isIcon(written)).toBe(true);
    expect(written.toString('latin1')).toContain('STACK=8192');
  });
});
