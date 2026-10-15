/**
 * A 68K door can open a file whose area lives in a cloud bucket.
 *
 * An upload into a pooled area is an object in the pool, not a file in the
 * area's directory. A door that Open()s `BBS:Conf1/Files/DEMO.LHA` found only
 * local files: the door bridge (`storage/remote-areas.ts` locateByRealPath)
 * had no callers. Now the -30 trap fetches the object into the board's file
 * cache and hands the door a READ-ONLY handle on it - pausing the emulator
 * while it fetches, because a trap cannot drain a promise
 * (tests/storage/door-trap-loop-continuation-hazard.test.ts).
 *
 * Driven through dos.library's trap dispatch (handleCall(-30)) with the
 * FileManager a live door session uses, over a fake pool.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';
import { setStorageContext } from '../../src/storage/storage-context';
import { StorageUnavailableError } from '../../src/storage/storage-backend';

const MODE_OLDFILE = 1005;
const NAME_ADDR = 0x1000;
const BUFFER_ADDR = 0x4000;
const BODY = 'pooled archive bytes';

/** Byte-addressable stand-in for the emulator, with the pause a trap can take. */
class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();
  paused = false;
  getRegister(reg: number): number { return this.regs.get(reg) ?? 0; }
  setRegister(reg: number, value: number): void { this.regs.set(reg, value | 0); }
  readMemory(addr: number): number { return this.mem.get(addr) ?? 0; }
  writeMemory(addr: number, value: number): void { this.mem.set(addr, value & 0xff); }
  readMemory16(addr: number): number { return (this.readMemory(addr) << 8) | this.readMemory(addr + 1); }
  readMemory32(addr: number): number {
    return (this.readMemory(addr) << 24) | (this.readMemory(addr + 1) << 16)
      | (this.readMemory(addr + 2) << 8) | this.readMemory(addr + 3);
  }
  writeMemory32(addr: number, value: number): void {
    for (let i = 0; i < 4; i++) this.writeMemory(addr + i, (value >>> (24 - 8 * i)) & 0xff);
  }
  writeMemoryBuffer(addr: number, data: Buffer): void {
    for (let i = 0; i < data.length; i += 1) this.writeMemory(addr + i, data[i]);
  }
  readLong(): number { return 0; }
  readString(addr: number, maxLen = 512): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i += 1) {
      const byte = this.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }
  writeString(addr: number, text: string): void {
    for (let i = 0; i < text.length; i += 1) this.writeMemory(addr + i, text.charCodeAt(i) & 0xff);
    this.writeMemory(addr + text.length, 0);
  }
  isPaused(): boolean { return this.paused; }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('a door opening a file held in the pool', () => {
  let root: string;
  let cacheDir: string;
  let emulator: StubEmulator;
  let dos: DosLibrary;
  let fetched: string[];
  let volumeDown: boolean;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-pool-open-'));
    cacheDir = path.join(root, 'cache');
    fs.mkdirSync(path.join(root, 'Conf1', 'Files'), { recursive: true });
    fetched = [];
    volumeDown = false;
    // Conference 1's Files area lives on DRIVE.1; the bucket holds DEMO.LHA.
    setStorageContext({
      areas: [{ id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 1 }],
      volumes: { byNumber: (n: number) => (n === 1 ? {} : undefined) },
      names: {
        forArea: (_drive: number, prefix: string) => ({
          resolve: async (name: string) => {
            if (volumeDown) throw new StorageUnavailableError(1, 'down');
            return name.toUpperCase() === 'DEMO.LHA' ? `${prefix}DEMO.LHA` : null;
          },
        }),
      },
      cache: {
        ensureLocal: async (_drive: number, key: string) => {
          fetched.push(key);
          const local = path.join(cacheDir, key);
          fs.mkdirSync(path.dirname(local), { recursive: true });
          fs.writeFileSync(local, BODY, 'latin1');
          return local;
        },
      },
    } as any);
    emulator = new StubEmulator();
    dos = new DosLibrary(emulator as never, root);
    dos.enableNewFileSystem(root);
  });

  afterEach(() => {
    setStorageContext(null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  function openTrap(name: string): void {
    emulator.writeString(NAME_ADDR, name);
    emulator.setRegister(CPURegister.D1, NAME_ADDR);
    emulator.setRegister(CPURegister.D2, MODE_OLDFILE);
    expect(dos.handleCall(-30)).toBe(true);
  }

  it('waits for the object, then reads its bytes', async () => {
    openTrap('BBS:Conf1/Files/demo.lha');
    expect(emulator.isPaused()).toBe(true);
    await settle();

    expect(emulator.isPaused()).toBe(false);
    expect(fetched).toEqual(['Conf1/Files/DEMO.LHA']);
    const handle = emulator.getRegister(CPURegister.D0);
    expect(handle).toBeGreaterThan(0);

    emulator.setRegister(CPURegister.D1, handle);
    emulator.setRegister(CPURegister.D2, BUFFER_ADDR);
    emulator.setRegister(CPURegister.D3, 256);
    expect(dos.Read()).toBe(BODY.length);
    expect(emulator.readString(BUFFER_ADDR)).toBe(BODY);
  });

  it('gives the door a read-only handle: a write does not reach the cached copy', async () => {
    openTrap('BBS:Conf1/Files/DEMO.LHA');
    await settle();
    const handle = emulator.getRegister(CPURegister.D0);
    expect(handle).toBeGreaterThan(0);

    emulator.writeString(BUFFER_ADDR, 'XXXX');
    emulator.setRegister(CPURegister.D1, handle);
    emulator.setRegister(CPURegister.D2, BUFFER_ADDR);
    emulator.setRegister(CPURegister.D3, 4);
    dos.Write();
    expect(fs.readFileSync(path.join(cacheDir, 'Conf1', 'Files', 'DEMO.LHA'), 'latin1')).toBe(BODY);
  });

  it('a name the pool does not hold is object-not-found', async () => {
    openTrap('BBS:Conf1/Files/NOPE.LHA');
    await settle();
    expect(emulator.getRegister(CPURegister.D0)).toBe(0);
    expect(emulator.isPaused()).toBe(false);
    emulator.setRegister(CPURegister.D0, -1);
    dos.handleCall(-132); // IoErr
    expect(emulator.getRegister(CPURegister.D0)).toBe(205);
  });

  it('a volume that cannot answer is device-not-mounted, not a missing file', async () => {
    volumeDown = true;
    openTrap('BBS:Conf1/Files/DEMO.LHA');
    await settle();
    expect(emulator.getRegister(CPURegister.D0)).toBe(0);
    dos.handleCall(-132); // IoErr
    expect(emulator.getRegister(CPURegister.D0)).toBe(218);
  });

  it('a file on local disk is opened as before, without the pool', () => {
    fs.writeFileSync(path.join(root, 'Conf1', 'Files', 'LOCAL.TXT'), 'here', 'latin1');
    openTrap('BBS:Conf1/Files/LOCAL.TXT');
    expect(emulator.isPaused()).toBe(false);
    expect(emulator.getRegister(CPURegister.D0)).toBeGreaterThan(0);
    expect(fetched).toEqual([]);
  });

  it('a door can Lock and Examine a pooled file: its own name, the object\'s size', async () => {
    const ACCESS_READ = -2;
    const FIB = 0x6000;
    emulator.writeString(NAME_ADDR, 'BBS:Conf1/Files/demo.lha');
    emulator.setRegister(CPURegister.D1, NAME_ADDR);
    emulator.setRegister(CPURegister.D2, ACCESS_READ);
    expect(dos.handleCall(-84)).toBe(true); // Lock
    expect(emulator.isPaused()).toBe(true);
    await settle();
    const lock = emulator.getRegister(CPURegister.D0);
    expect(emulator.isPaused()).toBe(false);
    expect(lock).toBeGreaterThan(0);

    emulator.setRegister(CPURegister.D1, lock);
    emulator.setRegister(CPURegister.D2, FIB);
    dos.handleCall(-102); // Examine
    expect(emulator.readString(FIB + 8)).toBe('demo.lha');
    expect(emulator.readMemory32(FIB + 124)).toBe(BODY.length);
  });

  it('an exclusive Lock on a pooled file is not found: the cached copy is read-only', () => {
    emulator.writeString(NAME_ADDR, 'BBS:Conf1/Files/DEMO.LHA');
    emulator.setRegister(CPURegister.D1, NAME_ADDR);
    emulator.setRegister(CPURegister.D2, -1); // ACCESS_WRITE
    dos.handleCall(-84);
    expect(emulator.isPaused()).toBe(false);
    expect(emulator.getRegister(CPURegister.D0)).toBe(0);
    expect(fetched).toEqual([]);
  });
});
