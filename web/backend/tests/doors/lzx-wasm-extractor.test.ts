import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { LzxWasmExtractor } from '../../src/utils/extractors/lzx-wasm-extractor';

const extractor = new LzxWasmExtractor();

describe('LzxWasmExtractor', () => {
  let tmpDir: string;
  let archivePath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lzx-test-'));
    archivePath = path.join(tmpDir, 'test.lzx');
    await extractor.packFiles(
      [
        { name: 'hello.txt', data: Buffer.from('hello world') },
        { name: 'sub/dir/data.bin', data: Buffer.from([1, 2, 3, 4, 5]) },
      ],
      archivePath,
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('packFiles creates a readable archive', () => {
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(fs.statSync(archivePath).size).toBeGreaterThan(0);
  });

  test('listFiles returns entry names', async () => {
    const names = await extractor.listFiles(archivePath);
    expect(names).toContain('hello.txt');
    expect(names).toContain('sub/dir/data.bin');
  });

  test('getEntries returns entries with correct sizes', async () => {
    const entries = await extractor.getEntries(archivePath);
    const hello = entries.find(e => e.name === 'hello.txt')!;
    expect(hello).toBeDefined();
    expect(hello.size).toBe(11);
  });

  test('extractFile returns correct content', async () => {
    const buf = await extractor.extractFile(archivePath, 'hello.txt');
    expect(buf).not.toBeNull();
    expect(buf!.toString()).toBe('hello world');
  });

  test('extractFile is case-insensitive', async () => {
    const buf = await extractor.extractFile(archivePath, 'HELLO.TXT');
    expect(buf).not.toBeNull();
  });

  test('round-trip preserves binary data', async () => {
    const original = Buffer.from([0, 1, 127, 128, 255]);
    const rtPath = path.join(tmpDir, 'rt.lzx');
    await extractor.packFiles([{ name: 'binary.bin', data: original }], rtPath);
    const extracted = await extractor.extractFile(rtPath, 'binary.bin');
    expect(extracted).toEqual(original);
  });
});
