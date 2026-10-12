/**
 * Regression: a redirect in an Execute()/batch line was read as "everything
 * after the first >" and used as the file name. `"C:LHA" >NIL: -F t "Work:a
 * b.lha"` redirected into a file called `NIL: -F t "Work:a b.lha"` and ran LhA
 * with no arguments. One parser now serves DosLibrary and the batch scheduler.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';
import { parseAmigaCommandLine } from '../../src/amiga-emulation/api/dos/dos-command-line';

const FIXTURE = path.join(__dirname, '../fixtures/archives/tiny-nested.lha');
const CMD_ADDR = 0x200000;
const DOSTRUE = 0xffffffff;

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


describe('parseAmigaCommandLine', () => {
  it('takes a redirect in the middle of the line and keeps the arguments after it', () => {
    const p = parseAmigaCommandLine('"C:LHA" >NIL: -F t "Work:a b.lha"');
    expect(p.program).toBe('C:LHA');
    expect(p.stdout).toEqual({ path: 'NIL:', append: false });
    expect(p.args).toEqual(['-F', 't', 'Work:a b.lha']);
    expect(p.commandText).toBe('"C:LHA" -F t "Work:a b.lha"');
  });

  it('takes a redirect glued to its target and keeps the argument after it', () => {
    const p = parseAmigaCommandLine('quicknew >bbs:screens/quicknew.txt 1');
    expect(p.program).toBe('quicknew');
    expect(p.stdout).toEqual({ path: 'bbs:screens/quicknew.txt', append: false });
    expect(p.args).toEqual(['1']);
  });

  it('reads >> as append, with or without a space before the target', () => {
    expect(parseAmigaCommandLine('echo hi >>ram:log').stdout).toEqual({ path: 'ram:log', append: true });
    expect(parseAmigaCommandLine('echo hi >> ram:log').stdout).toEqual({ path: 'ram:log', append: true });
  });

  it('reads <file as input and a line with both redirects gives both', () => {
    const p = parseAmigaCommandLine('sort <in.txt >>out.txt');
    expect(p.program).toBe('sort');
    expect(p.stdin).toBe('in.txt');
    expect(p.stdout).toEqual({ path: 'out.txt', append: true });
    expect(p.args).toEqual([]);
  });

  it('takes a quoted redirect target with spaces as one path', () => {
    const p = parseAmigaCommandLine('list >"Work:my dir/out file.txt" all');
    expect(p.stdout).toEqual({ path: 'Work:my dir/out file.txt', append: false });
    expect(p.args).toEqual(['all']);
  });

  it('does not treat > or < inside quotes as a redirect', () => {
    const p = parseAmigaCommandLine('echo "a > b < c"');
    expect(p.stdout).toBeUndefined();
    expect(p.stdin).toBeUndefined();
    expect(p.args).toEqual(['a > b < c']);
  });

  it('gives the value without quotes and the raw word with them', () => {
    const p = parseAmigaCommandLine('door -UC"0" -O"path"15');
    expect(p.args).toEqual(['-UC0', '-Opath15']);
    expect(p.rawArgs).toEqual(['-UC"0"', '-O"path"15']);
  });

  it('puts the redirect first or last without changing the program or arguments', () => {
    expect(parseAmigaCommandLine('>ram:o prog a b').program).toBe('prog');
    expect(parseAmigaCommandLine('>ram:o prog a b').args).toEqual(['a', 'b']);
    expect(parseAmigaCommandLine('prog a b >ram:o').args).toEqual(['a', 'b']);
  });

  it('copes with an empty line and a dangling redirect', () => {
    expect(parseAmigaCommandLine('').program).toBe('');
    const p = parseAmigaCommandLine('prog >');
    expect(p.stdout).toBeUndefined();
    expect(p.args).toEqual([]);
  });
});

describe('Execute() with a redirect ahead of the arguments', () => {
  it('runs the archiver with its arguments instead of treating them as the redirect file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdline-'));
    try {
      fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
      fs.copyFileSync(FIXTURE, path.join(root, 'Doors', 'tiny-nested.lha'));
      const { d0 } = runExecute(root, '"LhA" >NIL: x "doors:tiny-nested.lha" "doors:OUT/"');
      expect(d0).toBe(DOSTRUE);
      expect(fs.existsSync(path.join(root, 'Doors', 'OUT', 'root.txt'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
