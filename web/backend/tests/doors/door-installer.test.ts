import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const AdmZip = require('adm-zip');

jest.mock('../../src/utils/archive-extractor', () => ({
  getExtractorForFile: jest.fn(),
}));
jest.mock('../../src/handlers/door.handler', () => ({
  initializeDoors: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/doors/amigaDoorManager', () => ({
  refreshDoorCache: jest.fn().mockResolvedValue(undefined),
  getAmigaDoorManager: jest.fn(),
}));

import { DoorInstaller } from '../../src/doors/door-installer';
import { getExtractorForFile } from '../../src/utils/archive-extractor';

function makeZipWithPackage(pkg: object, extraFiles: Record<string, string> = {}): Buffer {
  const zip = new AdmZip();
  zip.addFile('package.json', Buffer.from(JSON.stringify(pkg)));
  zip.addFile('dist/index.js', Buffer.from('module.exports = {};'));
  for (const [name, content] of Object.entries(extraFiles)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

function stubExtractor(zipBuf: Buffer) {
  const zip = new AdmZip(zipBuf);
  (getExtractorForFile as jest.Mock).mockResolvedValue({
    getEntries: async () =>
      zip.getEntries().map((e: any) => ({
        name: e.entryName,
        size: e.header.size,
        data: e.getData(),
      })),
  });
}

describe('DoorInstaller — TypeScript door', () => {
  let tmpRoot: string;
  let installer: DoorInstaller;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'door-install-'));
    installer = new DoorInstaller(tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('installs a zip with bbsCommand in package.json', async () => {
    const pkg = { name: 'mygame', bbsCommand: 'MYGAME', description: 'A game', main: 'dist/index.js' };
    stubExtractor(makeZipWithPackage(pkg));

    const result = await installer.install('/fake/mygame.zip');

    expect(result.success).toBe(true);
    expect(result.doorName).toBe('mygame');
    expect(result.command).toBe('MYGAME');
    expect(result.type).toBe('typescript');
    expect(fs.existsSync(path.join(tmpRoot, 'Doors', 'mygame', 'dist', 'index.js'))).toBe(true);
    const infoContent = fs.readFileSync(
      path.join(tmpRoot, 'Commands', 'BBSCmd', 'MYGAME.info'),
      'utf8',
    );
    expect(infoContent).toContain('BBSCMD=MYGAME');
    expect(infoContent).toContain('LOCATION=Doors/mygame');
    expect(infoContent).toContain('TYPE=TS');
  });

  test('installs a zip with amiexpress.command in package.json', async () => {
    const pkg = {
      name: 'coolapp',
      amiexpress: { command: 'COOLAPP' },
      description: 'Cool app',
      main: 'dist/index.js',
    };
    stubExtractor(makeZipWithPackage(pkg));

    const result = await installer.install('/fake/coolapp.zip');

    expect(result.success).toBe(true);
    expect(result.command).toBe('COOLAPP');
  });

  test('strips top-level directory from archive', async () => {
    const zip = new AdmZip();
    zip.addFile('mygame/', Buffer.alloc(0));
    zip.addFile('mygame/package.json', Buffer.from(JSON.stringify({
      name: 'mygame', bbsCommand: 'MYGAME', main: 'dist/index.js',
    })));
    zip.addFile('mygame/dist/index.js', Buffer.from('module.exports = {};'));
    stubExtractor(zip.toBuffer());

    const result = await installer.install('/fake/mygame.zip');

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'Doors', 'mygame', 'package.json'))).toBe(true);
  });

  test('returns error if Doors/<name> already exists', async () => {
    const pkg = { name: 'existing', bbsCommand: 'EXISTING', main: 'dist/index.js' };
    fs.mkdirSync(path.join(tmpRoot, 'Doors', 'existing'), { recursive: true });
    stubExtractor(makeZipWithPackage(pkg));

    const result = await installer.install('/fake/existing.zip');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/already exists/i);
  });

  test('returns error with listing if archive type is undetectable', async () => {
    (getExtractorForFile as jest.Mock).mockResolvedValue({
      getEntries: async () => [
        { name: 'readme.txt', size: 10, data: Buffer.from('hello') },
        { name: 'somefile.bin', size: 5, data: Buffer.from([1, 2, 3]) },
      ],
    });

    const result = await installer.install('/fake/unknown.zip');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/cannot detect/i);
    expect(result.message).toContain('readme.txt');
  });
});
