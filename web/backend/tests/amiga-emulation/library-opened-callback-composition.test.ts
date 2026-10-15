/**
 * Regression: ExecLibrary must COMPOSE library-opened callbacks, not
 * overwrite them.
 *
 * Root cause (fame-fim-compat task 9): ExecLibrary.setLibraryOpenedCallback
 * used to assign a single `onLibraryOpened` field. LibraryManager registers
 * a callback during initializeLibraries() (installs library-specific trap
 * vectors, including fame.library's — see LibraryManager.ts's
 * "fame.library" branch). AmigaDoorSession.setupComponentCallbacks() then
 * registered its OWN callback afterward, silently discarding
 * LibraryManager's entirely (last-writer-wins single slot). Because
 * AmigaDoorSession's callback has no fame.library branch,
 * installFameVectors() was never called, FAME.library's LVO jump table
 * stayed unpopulated RTS stubs, and every FIM (FAME-doorport) door crashed
 * on its first FAME.library call.
 *
 * Fix: ExecLibrary now holds a list of callbacks
 * (addLibraryOpenedCallback), all fired in registration order on every
 * OpenLibrary(). setLibraryOpenedCallback is kept as a deprecated alias
 * that also appends, so pre-existing call sites keep working unchanged.
 */

import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';

// Same minimal mock emulator pattern as signals.test.ts.
class MockEmulator {
  private memory: Map<number, number> = new Map();
  private registers: number[] = new Array(16).fill(0);

  readMemory32(addr: number): number {
    return (
      ((this.memory.get(addr) || 0) << 24) |
      ((this.memory.get(addr + 1) || 0) << 16) |
      ((this.memory.get(addr + 2) || 0) << 8) |
      (this.memory.get(addr + 3) || 0)
    );
  }
  writeMemory32(addr: number, value: number): void {
    this.memory.set(addr, (value >> 24) & 0xff);
    this.memory.set(addr + 1, (value >> 16) & 0xff);
    this.memory.set(addr + 2, (value >> 8) & 0xff);
    this.memory.set(addr + 3, value & 0xff);
  }
  writeMemory16(addr: number, value: number): void {
    this.memory.set(addr, (value >> 8) & 0xff);
    this.memory.set(addr + 1, value & 0xff);
  }
  readMemory16(addr: number): number {
    return ((this.memory.get(addr) || 0) << 8) | (this.memory.get(addr + 1) || 0);
  }
  writeMemory(addr: number, value: number): void {
    this.memory.set(addr, value & 0xff);
  }
  readMemory(addr: number): number {
    return this.memory.get(addr) || 0;
  }
  writeString(addr: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.memory.set(addr + i, str.charCodeAt(i));
    }
    this.memory.set(addr + str.length, 0);
  }
  readString(addr: number): string {
    let result = '';
    let offset = 0;
    while (true) {
      const byte = this.memory.get(addr + offset) || 0;
      if (byte === 0) break;
      result += String.fromCharCode(byte);
      offset++;
    }
    return result;
  }
  getRegister(reg: number): number {
    return this.registers[reg] || 0;
  }
  setRegister(reg: number, value: number): void {
    this.registers[reg] = value;
  }
  getPC(): number { return 0x1000; }
  setPC(_addr: number): void {}
  setSP(_addr: number): void {}
  getSP(): number { return 0x80000; }
  pause(callback?: () => void): void { if (callback) callback(); }
  resume(): void {}
}

describe('ExecLibrary library-opened callback composition', () => {
  let emulator: MockEmulator;
  let execLibrary: ExecLibrary;

  beforeEach(() => {
    emulator = new MockEmulator();
    execLibrary = new ExecLibrary(emulator as any);
    execLibrary.initialize();
  });

  it('addLibraryOpenedCallback: two independently registered callbacks both fire, in order, on the same library open', () => {
    const calls: string[] = [];
    execLibrary.addLibraryOpenedCallback((name) => calls.push(`first:${name}`));
    execLibrary.addLibraryOpenedCallback((name) => calls.push(`second:${name}`));

    execLibrary.openLibraryHybrid('fame.library', 0, false);

    expect(calls).toEqual(['first:fame.library', 'second:fame.library']);
  });

  it('setLibraryOpenedCallback (deprecated alias) APPENDS rather than replacing a prior registration', () => {
    // This is the exact regression shape: one consumer (LibraryManager)
    // registers first, a second consumer (AmigaDoorSession) registers
    // later via the legacy method name. Both must still fire.
    const calls: string[] = [];
    execLibrary.addLibraryOpenedCallback((name) => calls.push(`libraryManager:${name}`));
    execLibrary.setLibraryOpenedCallback((name) => calls.push(`doorSession:${name}`));

    execLibrary.openLibraryHybrid('fame.library', 0, false);

    expect(calls).toEqual(['libraryManager:fame.library', 'doorSession:fame.library']);
  });

  it('three callbacks (mixed registration methods) all fire on every subsequent open, not just the first', () => {
    const calls: string[] = [];
    execLibrary.setLibraryOpenedCallback((name) => calls.push(`a:${name}`));
    execLibrary.addLibraryOpenedCallback((name) => calls.push(`b:${name}`));
    execLibrary.addLibraryOpenedCallback((name) => calls.push(`c:${name}`));

    execLibrary.openLibraryHybrid('icon.library', 37, false);
    execLibrary.openLibraryHybrid('dos.library', 0, false);

    expect(calls).toEqual([
      'a:icon.library', 'b:icon.library', 'c:icon.library',
      'a:dos.library', 'b:dos.library', 'c:dos.library',
    ]);
  });
});
