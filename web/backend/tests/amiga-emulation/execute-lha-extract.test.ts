/**
 * Regression: dos.library/Execute() must unpack an LHA archive.
 *
 * DoorRepo installs a door by downloading its archive and asking the
 * archiver to unpack it. There is no archiver inside the emulator and no
 * shell to reach one, so before this every install produced a command
 * config pointing at files that were never created - reported from the
 * live BBS as "installed the door, the BBS says No such command".
 *
 * The evidence, from a real session log: the door printed "Extracting
 * 5D!DP002.LHA into Doors:5DD/ ...", NO dos.library call followed at all,
 * and Open("Doors:5DD/HiScore") then failed with 205.
 *
 * Execute() refuses shell commands by design. These tests pin the one
 * exception: an archiver invocation is carried out by the host's own LHA
 * reader, which the backend already ships for FILE_ID.DIZ.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';

const FIXTURE = path.join(__dirname, '../fixtures/archives/tiny-nested.lha');
const CMD_ADDR = 0x200000;
const DOSTRUE = 0xffffffff; // setRegister stores unsigned
const DOSFALSE = 0;

class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();

  getRegister(reg: number): number {
    return this.regs.get(reg) ?? 0;
  }
  setRegister(reg: number, value: number): void {
    this.regs.set(reg, value >>> 0);
  }
  writeMemory(address: number, byte: number): void {
    this.mem.set(address >>> 0, byte & 0xff);
  }
  readMemory(address: number): number {
    return this.mem.get(address >>> 0) ?? 0;
  }
  getMemoryByte(address: number): number {
    return this.readMemory(address);
  }
}

function runExecute(root: string, command: string): { d0: number } {
  const stub = new StubEmulator();
  const dos = new DosLibrary(stub as any, root);

  for (let i = 0; i < command.length; i++) {
    stub.writeMemory(CMD_ADDR + i, command.charCodeAt(i));
  }
  stub.writeMemory(CMD_ADDR + command.length, 0);

  stub.setRegister(CPURegister.D1, CMD_ADDR);
  stub.setRegister(CPURegister.D2, 0);
  stub.setRegister(CPURegister.D3, 0);

  const handled = dos.handleCall(-222); // _LVOExecute
  expect(handled).toBe(true);

  return { d0: stub.getRegister(CPURegister.D0) };
}

describe('dos.library Execute() runs the archiver', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-lha-'));
    fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
    fs.copyFileSync(FIXTURE, path.join(root, 'Doors', 'tiny-nested.lha'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('LhA x <archive> <dest> extracts every member, creating directories', () => {
    const { d0 } = runExecute(
      root,
      '"LhA" x "Doors:tiny-nested.lha" "Doors:OUT/"'
    );

    expect(d0).toBe(DOSTRUE);
    expect(fs.existsSync(path.join(root, 'Doors', 'OUT', 'root.txt'))).toBe(true);
    // Members carry AmigaDOS backslash separators; they become directories.
    expect(
      fs.existsSync(path.join(root, 'Doors', 'OUT', 'nested', 'dir', 'mydoor.fim'))
    ).toBe(true);
  });

  test('extracted bytes match the archive, not an empty placeholder', () => {
    runExecute(root, '"LhA" x "Doors:tiny-nested.lha" "Doors:OUT/"');

    const extracted = fs.readFileSync(path.join(root, 'Doors', 'OUT', 'root.txt'));
    expect(extracted.length).toBe(15);
  });

  test('an unquoted command line works too (LhA x archive dest)', () => {
    const { d0 } = runExecute(root, 'LhA x Doors:tiny-nested.lha Doors:OUT2/');

    expect(d0).toBe(DOSTRUE);
    expect(fs.existsSync(path.join(root, 'Doors', 'OUT2', 'root.txt'))).toBe(true);
  });

  test('a missing archive fails instead of reporting success', () => {
    const { d0 } = runExecute(root, '"LhA" x "Doors:absent.lha" "Doors:OUT/"');

    expect(d0).toBe(DOSFALSE);
    expect(fs.existsSync(path.join(root, 'Doors', 'OUT'))).toBe(false);
  });

  test('a member cannot escape the destination directory', () => {
    // The archive is trusted only as far as its own directory: a member
    // named ../../etc/passwd must not be written outside dest.
    const { d0 } = runExecute(
      root,
      '"LhA" x "Doors:tiny-nested.lha" "Doors:OUT/"'
    );
    expect(d0).toBe(DOSTRUE);

    const escaped = path.join(root, 'root.txt');
    expect(fs.existsSync(escaped)).toBe(false);
  });

  test('a non-archiver shell command is still refused', () => {
    const { d0 } = runExecute(root, 'rm -rf Doors:');
    expect(d0).toBe(DOSFALSE);
  });
});

/**
 * The traversal guard needs a hostile archive, and no honest archiver
 * writes one - so the reader is stubbed instead. This is the guard's only
 * real coverage: the fixture above proves extraction works, not that a
 * malicious member is stopped.
 */
describe('extractLhaArchiveSync path containment', () => {
  const badNames = ['../escaped.txt', '..\\escaped.txt', '/etc/passwd', 'Work:absolute.txt'];

  test.each(badNames)('refuses a member named %s', (badName) => {
    jest.isolateModules(() => {
      jest.doMock('../../src/utils/lha.js', () => ({
        read: () => [{ name: badName, length: 4, packedLength: 4, packMethod: '-lh0-', data: new Uint8Array() }],
        unpack: () => new Uint8Array([1, 2, 3, 4]),
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { extractLhaArchiveSync } = require('../../src/utils/extractors/lha-extractor');

      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lha-guard-'));
      const archive = path.join(root, 'fake.lha');
      fs.writeFileSync(archive, Buffer.from('not really an archive'));
      const dest = path.join(root, 'dest');

      const result = extractLhaArchiveSync(archive, dest);

      if (badName.startsWith('..')) {
        // Escapes the destination: refused outright.
        expect(result.extracted).toEqual([]);
        expect(result.failed).toEqual([badName]);
        expect(fs.existsSync(path.join(root, 'escaped.txt'))).toBe(false);
      } else {
        // Absolute paths and assign prefixes are stripped to a relative
        // name and land INSIDE the destination, never at the real path.
        expect(result.failed).toEqual([]);
        expect(fs.existsSync('/etc/passwd.lha-test')).toBe(false);
        expect(result.extracted.length).toBe(1);
        expect(path.resolve(dest, result.extracted[0]).startsWith(path.resolve(dest))).toBe(true);
      }

      fs.rmSync(root, { recursive: true, force: true });
    });
  });
});
