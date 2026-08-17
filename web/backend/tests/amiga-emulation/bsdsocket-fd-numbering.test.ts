/**
 * Regression: bsdsocket.library must hand out descriptors that fit the
 * classic AmiTCP fd_set idiom.
 *
 * Background:
 *   web/backend/src/amiga-emulation/api/BsdSocketLibrary.ts used to start
 *   descriptor numbering at 100 ("to avoid conflicts with file handles" -
 *   a conflict that doesn't exist; bsdsocket fds are a separate namespace
 *   from AmigaDOS file handles). Real vbcc-built AmigaOS doors build the
 *   fd_set passed to WaitSelect() with the universal idiom `1L << s`
 *   against a single 32-bit long. With fd=100, `1L << 100` is undefined
 *   behaviour on 68K (shift count >= word size), so the bit never lands
 *   where WaitSelect looks and the door hangs forever waiting on a socket
 *   that is actually ready.
 *
 * Symptom (reproduced with a real door):
 *   DNS, socket(), and connect() all succeed; the door then stalls forever
 *   in WaitSelect().
 *
 * Fix:
 *   web/backend/src/amiga-emulation/api/BsdSocketLibrary.ts - descriptors
 *   are now allocated from a low base (0), stay strictly below
 *   BSD_FD_SETSIZE (32), are reused after CloseSocket() via a free list,
 *   and socket() returns -1/EMFILE when the table is exhausted rather than
 *   handing back an unusable descriptor.
 */

import {
  BsdSocketLibrary,
  AF_INET,
  SOCK_STREAM,
  EMFILE,
  BSD_FD_SETSIZE,
} from '../../src/amiga-emulation/api/BsdSocketLibrary';

// Minimal byte-addressable fake emulator, following the pattern established
// in tests/amiga-emulation/exec-allocate.test.ts.
class FakeEmulator {
  bytes = new Map<number, number>();
  registers = new Array(18).fill(0);

  getRegister(reg: number): number {
    return this.registers[reg];
  }

  setRegister(reg: number, value: number): void {
    this.registers[reg] = value >>> 0;
  }

  readMemory(address: number): number {
    return this.bytes.get(address) || 0;
  }

  writeMemory(address: number, value: number): void {
    this.bytes.set(address, value & 0xff);
  }

  readMemory16(address: number): number {
    return (this.readMemory(address) << 8) | this.readMemory(address + 1);
  }

  readMemory32(address: number): number {
    return (
      ((this.readMemory16(address) << 16) | this.readMemory16(address + 2)) >>>
      0
    );
  }

  writeMemory32(address: number, value: number): void {
    this.writeMemory(address, (value >>> 24) & 0xff);
    this.writeMemory(address + 1, (value >>> 16) & 0xff);
    this.writeMemory(address + 2, (value >>> 8) & 0xff);
    this.writeMemory(address + 3, value & 0xff);
  }

  readString(): string {
    return '';
  }

  writeString(): void {
    // not exercised by these tests
  }
}

function asEmu(fake: FakeEmulator): any {
  return fake;
}

/** Call socket(D0=AF_INET, D1=SOCK_STREAM, D2=0) and return the fd (or -1). */
function callSocket(lib: BsdSocketLibrary, fake: FakeEmulator): number {
  fake.setRegister(0, AF_INET);
  fake.setRegister(1, SOCK_STREAM);
  fake.setRegister(2, 0);
  return lib.socket();
}

/** Call CloseSocket(D0=fd). */
function callClose(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number): number {
  fake.setRegister(0, fd);
  return lib.closeSocket();
}

describe('bsdsocket.library descriptor numbering (regression)', () => {
  test('first descriptor is allocated from a low base (0), not 100', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fd = callSocket(lib, fake);

    expect(fd).toBe(0);
  });

  test('descriptors stay strictly below BSD_FD_SETSIZE (32)', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fds: number[] = [];
    for (let i = 0; i < BSD_FD_SETSIZE; i++) {
      fds.push(callSocket(lib, fake));
    }

    for (const fd of fds) {
      expect(fd).toBeGreaterThanOrEqual(0);
      expect(fd).toBeLessThan(BSD_FD_SETSIZE);
    }
    // All distinct
    expect(new Set(fds).size).toBe(BSD_FD_SETSIZE);
  });

  test('a descriptor is reusable after CloseSocket, not abandoned', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const first = callSocket(lib, fake);
    expect(first).toBe(0);

    const closeResult = callClose(lib, fake, first);
    expect(closeResult).toBe(0);

    const second = callSocket(lib, fake);
    expect(second).toBe(0); // slot 0 reused, not fd 1
  });

  test('a long-running door cycling sockets never climbs past the limit', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    // Open and close 500 sockets one at a time - simulates a door that
    // repeatedly opens a connection, uses it, and closes it.
    for (let i = 0; i < 500; i++) {
      const fd = callSocket(lib, fake);
      expect(fd).toBeGreaterThanOrEqual(0);
      expect(fd).toBeLessThan(BSD_FD_SETSIZE);
      const closeResult = callClose(lib, fake, fd);
      expect(closeResult).toBe(0);
    }
  });

  test('exhausting the descriptor table returns -1/EMFILE, not an unusable fd', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    for (let i = 0; i < BSD_FD_SETSIZE; i++) {
      const fd = callSocket(lib, fake);
      expect(fd).not.toBe(-1);
    }

    // Table is now full - one more socket() must fail cleanly.
    const overflow = callSocket(lib, fake);
    expect(overflow).toBe(-1);
    expect(lib.getErrno()).toBe(EMFILE);
  });

  test('freeing one descriptor after exhaustion allows exactly one more socket()', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fds: number[] = [];
    for (let i = 0; i < BSD_FD_SETSIZE; i++) {
      fds.push(callSocket(lib, fake));
    }
    expect(callSocket(lib, fake)).toBe(-1);

    callClose(lib, fake, fds[5]);

    const reused = callSocket(lib, fake);
    expect(reused).toBe(fds[5]);
    expect(reused).toBeLessThan(BSD_FD_SETSIZE);

    // Table is full again.
    expect(callSocket(lib, fake)).toBe(-1);
  });

  test('WaitSelect round trip works with a mask built as 1 << fd for a freshly allocated descriptor', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fd = callSocket(lib, fake);
    expect(fd).toBeLessThan(32); // precondition: idiom `1 << fd` is well-defined

    // Freshly allocated socket state has connected=false, which WaitSelect
    // treats as "ready to read" (EOF-ready), so the wait resolves
    // immediately without needing a real network connection.
    const state = lib.getSocketState(fd);
    expect(state).toBeDefined();
    expect(state!.connected).toBe(false);

    const readFdsPtr = 0x200000;
    // Build the fd_set exactly the way real 68K door code does:
    // readfds |= (1L << fd);
    fake.writeMemory32(readFdsPtr, (1 << fd) >>> 0);

    fake.setRegister(0, fd + 1); // D0 = nfds
    fake.setRegister(8, readFdsPtr); // A0 = readfds
    fake.setRegister(9, 0); // A1 = writefds (none)
    fake.setRegister(10, 0); // A2 = exceptfds (none)
    fake.setRegister(11, 0); // A3 = timeout (default)

    const ready = lib.waitSelect();

    expect(ready).toBe(1);
    // The returned fd_set must still have bit `fd` set within word 0 - the
    // exact bit position the door's `1L << fd`-built mask expects to find.
    const resultWord = fake.readMemory32(readFdsPtr);
    expect(resultWord & (1 << fd)).not.toBe(0);
  });
});
