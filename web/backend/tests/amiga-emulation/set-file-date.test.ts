/**
 * dos.library SetFileDate (LVO -396) sets the file's modification date.
 *
 * LhA calls it after extracting each member to give the file the date stored
 * in the archive; it was unimplemented, so every extracted file carried the
 * moment of extraction. The date is an Amiga DateStamp, the local wall clock
 * (dateStampToDateTime / dateTimeToDateStamp, utils/date-time.util.ts).
 *
 * Two layers, one wiring proof each:
 *   - the call itself, through DosLibrary.handleCall(-396), on a host file;
 *   - the product path: the real 68K C/LhA run through the door runner
 *     (`e` of a fixture archive) leaves file_id.diz dated as the archive
 *     lists it, 24-Oct-94 11:40:02.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';
import { dateTimeToDateStamp } from '../../src/utils/date-time.util';

class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();
  getRegister(reg: number): number { return this.regs.get(reg) ?? 0; }
  setRegister(reg: number, value: number): void { this.regs.set(reg, value | 0); }
  readMemory(addr: number): number { return this.mem.get(addr) ?? 0; }
  writeMemory(addr: number, value: number): void { this.mem.set(addr, value & 0xff); }
  readMemory32(addr: number): number {
    return ((this.readMemory(addr) << 24) | (this.readMemory(addr + 1) << 16) |
      (this.readMemory(addr + 2) << 8) | this.readMemory(addr + 3)) >>> 0;
  }
  writeMemory32(addr: number, value: number): void {
    for (let i = 0; i < 4; i += 1) this.writeMemory(addr + i, (value >>> (24 - 8 * i)) & 0xff);
  }
  readString(addr: number, maxLen = 200): string {
    let out = '';
    for (let i = 0; i < maxLen; i += 1) {
      const byte = this.readMemory(addr + i);
      if (byte === 0) break;
      out += String.fromCharCode(byte);
    }
    return out;
  }
  writeString(addr: number, text: string): void {
    for (let i = 0; i < text.length; i += 1) this.writeMemory(addr + i, text.charCodeAt(i));
    this.writeMemory(addr + text.length, 0);
  }
}

describe('SetFileDate (dos.library -396)', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'setfiledate-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function call(name: string, when: Date): { rc: number; emulator: StubEmulator } {
    const emulator = new StubEmulator();
    const dos = new DosLibrary(emulator as never, root);
    const ds = dateTimeToDateStamp(when);
    emulator.writeString(0x3000, name);
    emulator.writeMemory32(0x3100, ds.days);
    emulator.writeMemory32(0x3104, ds.minutes);
    emulator.writeMemory32(0x3108, ds.ticks);
    emulator.setRegister(CPURegister.D1, 0x3000);
    emulator.setRegister(CPURegister.D2, 0x3100);
    expect(dos.handleCall(-396)).toBe(true);
    return { rc: emulator.getRegister(CPURegister.D0), emulator };
  }

  test('sets the host file mtime to the DateStamp and answers DOSTRUE', () => {
    const file = path.join(root, 'a.txt');
    fs.writeFileSync(file, 'x');
    const when = new Date(1994, 9, 24, 11, 40, 2);
    expect(call(file, when).rc).toBe(-1);
    expect(fs.statSync(file).mtime.getTime()).toBe(when.getTime());
  });

  test('answers DOSFALSE for a file that does not exist and creates nothing', () => {
    const file = path.join(root, 'missing.txt');
    expect(call(file, new Date(1994, 9, 24, 11, 40, 2)).rc).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
  });
});

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND = path.resolve(__dirname, '..', '..');
const HARNESS = path.join(BACKEND, 'src', 'scripts', 'run-amiga-door.ts');
const TSX = path.join(BACKEND, 'node_modules', '.bin', 'tsx');
const LHA = path.join(REPO_ROOT, 'board', 'C', 'LhA');
const ARCHIVE = path.join(__dirname, '..', 'fixtures', 'archives', '187-KB1.lzh');
const runnable = [HARNESS, TSX, LHA, ARCHIVE].every((p) => fs.existsSync(p));

(runnable ? describe : describe.skip)('LhA e restores the archived date of a member', () => {
  test('file_id.diz is dated 24-Oct-94 11:40:02 as the archive lists it', () => {
    const board = process.env.BBS_DATA_DIR || process.env.BBS_ROOT;
    if (!board || path.resolve(board) === REPO_ROOT) throw new Error('run under dev-scripts/jest.config.ts (temp board)');
    const playpen = path.join(board, 'Node1', 'Playpen');
    const out = path.join(playpen, 'sfd-out');
    fs.mkdirSync(out, { recursive: true });
    fs.copyFileSync(ARCHIVE, path.join(playpen, 'sfd.lzh'));
    const result = spawnSync(
      TSX,
      [HARNESS, LHA, '1', 'e', 'BBS:Node1/Playpen/sfd.lzh', 'BBS:Node1/Playpen/sfd-out/', 'file_id.diz',
        '--doortype', 'SIM', '--timeout', '120'],
      {
        cwd: BACKEND, input: '', encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0', BBS_DATA_DIR: board, RAM_DIR: path.join(board, 'ram') },
      },
    );
    expect(result.status).toBe(0);
    const extracted = path.join(out, 'file_id.diz');
    expect(fs.existsSync(extracted)).toBe(true);
    expect(fs.statSync(extracted).mtime.getTime()).toBe(new Date(1994, 9, 24, 11, 40, 2).getTime());
  }, 200_000);
});
