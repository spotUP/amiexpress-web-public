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
  ENOENT,
  EINPROGRESS,
  ETIMEDOUT,
  ECONNREFUSED,
  BSD_FD_SETSIZE,
  FIONBIO,
  SOL_SOCKET,
  SO_ERROR,
} from '../../src/amiga-emulation/api/BsdSocketLibrary';
import { BSDSOCKET_VECTORS } from '../../src/amiga-emulation/api/library-vectors/bsdsocket-vectors';
import * as net from 'net';

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

  /** NUL-terminated 8-bit string, the way the 68K side stores one. */
  readString(address: number): string {
    let out = '';
    for (let a = address; ; a++) {
      const b = this.readMemory(a);
      if (b === 0) break;
      out += String.fromCharCode(b);
    }
    return out;
  }

  writeString(address: number, value: string): void {
    for (let i = 0; i < value.length; i++) {
      this.writeMemory(address + i, value.charCodeAt(i));
    }
    this.writeMemory(address + value.length, 0);
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

describe('bsdsocket.library getdtablesize (regression)', () => {
  /**
   * getdtablesize() used to answer a hardcoded 256 while socket() refuses to
   * allocate at or above BSD_FD_SETSIZE (32). A door that sizes its own
   * descriptor bookkeeping from getdtablesize() - the normal reason to call it
   * - is told it may open 8x more sockets than it can, and hits an unexpected
   * -1/EMFILE at the 33rd.
   */
  function callGetdtablesize(lib: BsdSocketLibrary, fake: FakeEmulator): number {
    const vector = BSDSOCKET_VECTORS.find((v) => v.name === 'getdtablesize');
    expect(vector).toBeDefined();
    return vector!.handler(asEmu(fake), lib) as number;
  }

  test('reports the descriptor ceiling socket() actually honours, not 256', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    expect(callGetdtablesize(lib, fake)).toBe(BSD_FD_SETSIZE);
    expect(callGetdtablesize(lib, fake)).not.toBe(256);
  });

  test('a door opening exactly getdtablesize() sockets never sees EMFILE', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const limit = callGetdtablesize(lib, fake);

    for (let i = 0; i < limit; i++) {
      const fd = callSocket(lib, fake);
      expect(fd).not.toBe(-1);
      expect(fd).toBeLessThan(limit);
    }
    // Only the call PAST the advertised limit may fail.
    expect(callSocket(lib, fake)).toBe(-1);
    expect(lib.getErrno()).toBe(EMFILE);
  });
});

describe('bsdsocket.library non-blocking connect (regression)', () => {
  /**
   * IoctlSocket(FIONBIO) was discarded, on the reasoning that node sockets
   * are already non-blocking. But a door does not see node's sockets - it
   * sees connect(), which blocked regardless, for up to 30 seconds. A door
   * that sets FIONBIO precisely so it can impose its OWN connect timeout
   * (which is what the standard AmigaOS idiom does: non-blocking connect,
   * then WaitSelect with a timeval, then getsockopt(SO_ERROR)) had that
   * timeout silently ignored, and the whole emulator stalled with it.
   *
   * getsockopt() was a stub that returned 0 and wrote nothing, so even a
   * door that got as far as asking could not tell a connected socket from a
   * failed one.
   */
  const SOCKADDR = 0x500000;

  /**
   * These tests do real loopback I/O while waitSelect() busy-waits through
   * deasync, which starves the event loop under a loaded machine. In
   * isolation each finishes in single-digit milliseconds; under a full
   * parallel suite on a slow CI runner they need real headroom, so they get
   * an explicit budget rather than jest's 10s default.
   */
  const IO_TEST_TIMEOUT_MS = 60000;

  /**
   * Every listening socket these tests need is bound ONCE, here, before any
   * test body runs.
   *
   * Binding one inside a test body is what made this suite hang for 60s in a
   * full parallel run while passing in isolation: by then an earlier test in
   * this same file has already driven waitSelect(), which busy-waits via
   * deasync (it runs the libuv loop by hand so 68K code can block). Once that
   * has happened inside a jest worker, a later server.listen() callback in
   * the same worker could stop being delivered, and the test hung on the
   * listen promise - before reaching a single line of the code under test.
   * Doing all the binding up front sidesteps it entirely and is faster too.
   */
  let openPort = 0;
  let closedPort = 0;
  let liveServer: net.Server | null = null;
  /**
   * Every connection the server accepts, so afterAll can destroy them.
   * net.Server.close() only stops new connections and then waits for the
   * live ones to end - and the successful-connect test deliberately leaves
   * its socket open (a door under test does not close it), so without this
   * the teardown never resolves and the whole run hangs.
   */
  const accepted: net.Socket[] = [];

  beforeAll(async () => {
    liveServer = net.createServer((sock) => { accepted.push(sock); });
    openPort = await new Promise<number>((resolve) => {
      liveServer!.listen(0, '127.0.0.1', () =>
        resolve((liveServer!.address() as net.AddressInfo).port));
    });

    // Bind a second port, learn its number, then give it back - so it is
    // known to be closed and a connect to it is deterministically refused.
    const probe = net.createServer();
    closedPort = await new Promise<number>((resolve) => {
      probe.listen(0, '127.0.0.1', () =>
        resolve((probe.address() as net.AddressInfo).port));
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  }, IO_TEST_TIMEOUT_MS);

  afterAll(async () => {
    for (const sock of accepted) sock.destroy();
    accepted.length = 0;
    if (liveServer) {
      await new Promise<void>((resolve) => liveServer!.close(() => resolve()));
      liveServer = null;
    }
  }, IO_TEST_TIMEOUT_MS);

  /** Set FIONBIO on a socket, the way a door does. */
  function setNonBlocking(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number, on: number): number {
    const argPtr = 0x510000;
    fake.writeMemory32(argPtr, on);
    fake.setRegister(0, fd);
    fake.setRegister(1, FIONBIO);
    fake.setRegister(8, argPtr);
    return lib.ioctlSocket();
  }

  /** Build sockaddr_in and call connect(). */
  function callConnect(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number, port: number): number {
    fake.writeMemory(SOCKADDR + 1, AF_INET);
    fake.writeMemory(SOCKADDR + 2, (port >> 8) & 0xff);
    fake.writeMemory(SOCKADDR + 3, port & 0xff);
    fake.writeMemory32(SOCKADDR + 4, 0x7f000001); // 127.0.0.1
    fake.setRegister(0, fd);
    fake.setRegister(8, SOCKADDR);
    fake.setRegister(1, 16);
    return lib.connect();
  }

  /** getsockopt(fd, SOL_SOCKET, SO_ERROR) -> the value written to optval. */
  function readSoError(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number): number {
    const optPtr = 0x520000;
    fake.writeMemory32(optPtr, 0xdeadbeef);
    fake.setRegister(0, fd);
    fake.setRegister(1, SOL_SOCKET);
    fake.setRegister(2, SO_ERROR);
    fake.setRegister(8, optPtr);
    expect(lib.getsockopt()).toBe(0);
    return fake.readMemory32(optPtr);
  }

  /** WaitSelect(fd+1, null, &writemask, null, timeout) -> ready count. */
  function waitWritable(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number, ms: number): number {
    const writeFdsPtr = 0x530000;
    const tvPtr = 0x540000;
    fake.writeMemory32(writeFdsPtr, (1 << fd) >>> 0);
    fake.writeMemory32(tvPtr, Math.floor(ms / 1000));
    fake.writeMemory32(tvPtr + 4, (ms % 1000) * 1000);
    fake.setRegister(0, fd + 1);
    fake.setRegister(8, 0);
    fake.setRegister(9, writeFdsPtr);
    fake.setRegister(10, 0);
    fake.setRegister(11, tvPtr);
    return lib.waitSelect();
  }

  test('a socket set non-blocking returns -1/EINPROGRESS instead of blocking', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));
    const fd = callSocket(lib, fake);

    expect(setNonBlocking(lib, fake, fd, 1)).toBe(0);

    const started = Date.now();
    const rc = callConnect(lib, fake, fd, closedPort);
    const elapsed = Date.now() - started;

    expect(rc).toBe(-1);
    expect(lib.getErrno()).toBe(EINPROGRESS);
    // The point of the whole exercise: it returned promptly rather than
    // stalling the emulator on a blocking connect, which takes until the
    // peer answers or connectSync's 30s ceiling. A generous bound still
    // separates those two outcomes unambiguously on a loaded machine.
    expect(elapsed).toBeLessThan(5000);
  }, IO_TEST_TIMEOUT_MS);

  test('a refused non-blocking connect wakes WaitSelect and reports SO_ERROR', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));
    const fd = callSocket(lib, fake);
    setNonBlocking(lib, fake, fd, 1);
    callConnect(lib, fake, fd, closedPort);

    // A failed connect must make the socket writable, not leave the door
    // waiting out its whole timeout.
    expect(waitWritable(lib, fake, fd, 5000)).toBe(1);
    expect(readSoError(lib, fake, fd)).toBe(ECONNREFUSED);
  }, IO_TEST_TIMEOUT_MS);

  test('a successful non-blocking connect wakes WaitSelect with SO_ERROR clear', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));
    const fd = callSocket(lib, fake);
    setNonBlocking(lib, fake, fd, 1);

    expect(callConnect(lib, fake, fd, openPort)).toBe(-1); // EINPROGRESS
    expect(waitWritable(lib, fake, fd, 5000)).toBe(1);
    expect(readSoError(lib, fake, fd)).toBe(0);

    callClose(lib, fake, fd); // leave no live socket behind for teardown
  }, IO_TEST_TIMEOUT_MS);

  test('SO_ERROR is cleared once read, as BSD specifies', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));
    const fd = callSocket(lib, fake);
    setNonBlocking(lib, fake, fd, 1);
    callConnect(lib, fake, fd, closedPort);
    waitWritable(lib, fake, fd, 5000);

    expect(readSoError(lib, fake, fd)).toBe(ECONNREFUSED);
    expect(readSoError(lib, fake, fd)).toBe(0);
  }, IO_TEST_TIMEOUT_MS);

  test('without FIONBIO, connect still blocks and reports errno directly', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));
    const fd = callSocket(lib, fake);

    // No IoctlSocket call at all - the pre-existing behaviour every other
    // door depends on must be untouched.
    expect(callConnect(lib, fake, fd, closedPort)).toBe(-1);
    expect(lib.getErrno()).toBe(ECONNREFUSED);
  }, IO_TEST_TIMEOUT_MS);
});

describe('bsdsocket.library gethostbyname (regression)', () => {
  /**
   * gethostbyname() used dns.resolve4(), which only ever queries a DNS
   * server. Real AmiTCP/Roadshow resolves a dotted-quad literal through
   * inet_addr() and checks the hosts file before any DNS traffic, so the two
   * inputs a sysop is most likely to type into a door's config file -
   * "192.168.0.10" and "localhost" - both failed here with
   * "gethostbyname() failed" while working on a real Amiga.
   *
   * Found by running the real m68k DoorRepo binary in this emulator with
   * RepoHost pointed at a local address.
   */
  const HOSTENT_H_ADDR_LIST = 16;

  /** Call gethostbyname(A0=name) and return the resolved dotted-quad, or null. */
  function resolveHost(lib: BsdSocketLibrary, fake: FakeEmulator, name: string): string | null {
    const namePtr = 0x400000;
    for (let i = 0; i < name.length; i++) {
      fake.writeMemory(namePtr + i, name.charCodeAt(i));
    }
    fake.writeMemory(namePtr + name.length, 0);

    fake.setRegister(8, namePtr); // A0 = hostname
    const hostent = lib.gethostbyname();
    if (hostent === 0) {
      return null;
    }
    // hostent.h_addr_list -> char** -> first char* -> 4 network-order bytes
    const addrListPtr = fake.readMemory32(hostent + HOSTENT_H_ADDR_LIST);
    const addrPtr = fake.readMemory32(addrListPtr);
    return [
      fake.readMemory(addrPtr),
      fake.readMemory(addrPtr + 1),
      fake.readMemory(addrPtr + 2),
      fake.readMemory(addrPtr + 3),
    ].join('.');
  }

  test('resolves a dotted-quad literal without any DNS lookup', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    expect(resolveHost(lib, fake, '127.0.0.1')).toBe('127.0.0.1');
  });

  test('resolves a hosts-file name such as localhost', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    expect(resolveHost(lib, fake, 'localhost')).toBe('127.0.0.1');
  });

  test('still returns NULL for a name that does not resolve', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    expect(resolveHost(lib, fake, 'no-such-host.invalid')).toBeNull();
  });
});

describe('bsdsocket.library errno values (regression)', () => {
  /**
   * ECONNREFUSED/ETIMEDOUT carried the Linux errno numbers (111/110). A 68K
   * door compares the value it gets back against the classic BSD/AmigaOS
   * constants from its own headers, so `if (errno == ECONNREFUSED)` was never
   * true and the door reported the wrong failure (or none at all).
   *
   * Ground truth: the vendored Roadshow NDK header
   * Documentation/7-Reference Sources/NDK3.2R4/SANA+RoadshowTCP-IP/netinclude/sys/errno.h
   *   line  74: #define ENOENT        2
   *   line  99: #define EMFILE       24
   *   line 147: #define ETIMEDOUT    60
   *   line 148: #define ECONNREFUSED 61
   */
  test('match the classic BSD/AmigaOS numbering a 68K door compiles against', () => {
    expect(ENOENT).toBe(2);
    expect(EMFILE).toBe(24);
    expect(ETIMEDOUT).toBe(60);
    expect(ECONNREFUSED).toBe(61);
  });

  test('do not use the Linux errno numbering', () => {
    expect(ETIMEDOUT).not.toBe(110);
    expect(ECONNREFUSED).not.toBe(111);
  });

  test('connect() to a port nothing is listening on leaves errno at 61', async () => {
    // Bind a port, learn its number, then release it - so the port is known
    // closed and the connect below is deterministically refused.
    const probe = net.createServer();
    const closedPort: number = await new Promise((resolve) => {
      probe.listen(0, '127.0.0.1', () => {
        resolve((probe.address() as net.AddressInfo).port);
      });
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fd = callSocket(lib, fake);
    expect(fd).toBeGreaterThanOrEqual(0);

    // Build sockaddr_in the way a door does: family, port, 127.0.0.1.
    const addrPtr = 0x300000;
    fake.writeMemory(addrPtr + 1, AF_INET); // sin_family (byte 1, BSD style)
    fake.writeMemory(addrPtr + 2, (closedPort >> 8) & 0xff); // sin_port hi
    fake.writeMemory(addrPtr + 3, closedPort & 0xff); // sin_port lo
    fake.writeMemory32(addrPtr + 4, 0x7f000001); // sin_addr = 127.0.0.1

    fake.setRegister(0, fd); // D0 = fd
    fake.setRegister(8, addrPtr); // A0 = sockaddr
    fake.setRegister(1, 16); // D1 = addrlen

    expect(lib.connect()).toBe(-1);
    expect(lib.getErrno()).toBe(61); // ECONNREFUSED, classic BSD - not 111
  });
});
