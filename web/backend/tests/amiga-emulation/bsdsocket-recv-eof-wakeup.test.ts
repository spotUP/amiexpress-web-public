/**
 * Regression: a peer that closes the connection must not hold a blocked
 * recv() for 30 seconds.
 *
 * Symptom (measured on the live board, 2026-09-02):
 *   The sysop's ANSI login paused ~33s on a blank screen. Screens/logon20.txt
 *   chains `~CC_gwall`, which runs the 68K door Doors/GWall/GWall. Harness
 *   capture (XIM_DEBUG=1 XIM_DEBUG_JSON=1 XIM_DEBUG_AMIGA=1) showed the door
 *   doing everything right and then stopping dead:
 *
 *     gethostbyname("scenewall.bbs.io") -> 20.51.165.108
 *     socket / IoctlSocket(FIONBIO,1) / connect -> EINPROGRESS
 *     WaitSelect(writable) -> connected
 *     send  "GET /GlobalWall/api/WallItems?... HTTP/1.0"
 *     recv  -> 2338 bytes
 *     recv  -> [BsdSocketLibrary] Socket closed
 *     ...nothing for 30 seconds...
 *
 *   Time to the door's first output byte: 36.0s.
 *
 * Root cause:
 *   web/backend/src/amiga-emulation/api/BsdSocketLibrary.ts - recv() parks in
 *   `deasync.loopWhile(() => !done)` and is woken only by the socket's 'data'
 *   handler or by its own 30s setTimeout. attachStreamHandlers()'s 'close'
 *   handler set `state.connected = false` and woke nobody, so a recv() that
 *   was already parked when the FIN arrived spun for the full 30s before
 *   returning 0. HTTP/1.0 (which is what every 68K wall/announce door speaks)
 *   makes the server close after every response, so this is the NORMAL end of
 *   every request, not an edge case.
 *
 * Fix:
 *   'end', 'close' and 'error' all wake a parked reader via
 *   wakeBlockedReader(), so recv() returns 0/EOF as soon as the stream ends.
 *
 * Second regression (same file, same wake-up path):
 *   Waking a parked reader from 'error' made recv() return 0 there too, so a
 *   peer RST was indistinguishable from a clean end of body. A 68K door that
 *   branches on errno saw "the body ended" for a connection that had in fact
 *   been torn down mid-transfer, and reported a truncated response as a
 *   complete one. BSD recv() answers -1 with errno ECONNRESET (54, the
 *   Roadshow value already exported by BsdSocketLibrary.ts); recv() now does
 *   the same, while a clean 'end' still returns 0.
 */

import {
  BsdSocketLibrary,
  AF_INET,
  SOCK_STREAM,
  FIONBIO,
  ECONNRESET,
} from '../../src/amiga-emulation/api/BsdSocketLibrary';
import { BSDSOCKET_VECTORS } from '../../src/amiga-emulation/api/library-vectors/bsdsocket-vectors';
import * as net from 'net';

/** Minimal byte-addressable fake emulator (same shape as bsdsocket-fd-numbering.test.ts). */
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
    return (((this.readMemory16(address) << 16) | this.readMemory16(address + 2)) >>> 0);
  }

  writeMemory32(address: number, value: number): void {
    this.writeMemory(address, (value >>> 24) & 0xff);
    this.writeMemory(address + 1, (value >>> 16) & 0xff);
    this.writeMemory(address + 2, (value >>> 8) & 0xff);
    this.writeMemory(address + 3, value & 0xff);
  }

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

/**
 * Calls a bsdsocket function the way the emulator does: through the vector
 * table, not by reaching for the method. A trap that is fixed but unreachable
 * from BSDSOCKET_VECTORS would still fail this suite.
 */
function callVector(name: string, lib: BsdSocketLibrary, fake: FakeEmulator): number {
  const vector = BSDSOCKET_VECTORS.find((v) => v.name === name);
  expect(vector).toBeDefined();
  return vector!.handler(asEmu(fake), lib) as number;
}

const SOCKADDR = 0x500000;
const FIONBIO_ARG = 0x510000;
const SEND_BUF = 0x560000;
const RECV_BUF = 0x570000;

/**
 * The recv() fallback timeout being pinned here is 30s, so a run against
 * BROKEN code needs room to reach the elapsed-time assertion and fail on it
 * rather than on jest's default 10s budget - a timeout would not say which
 * of the two went wrong.
 */
const IO_TEST_TIMEOUT_MS = 60000;

/**
 * A recv() that has to wait for the stream to end must come back in well
 * under recv()'s own 30s fallback timeout. Generous enough that a loaded
 * machine cannot trip it, an order of magnitude short of the bug.
 */
const PROMPT_MS = 5000;

describe('bsdsocket.library recv() at end of stream (regression)', () => {
  /**
   * Every listening socket is bound ONCE, before any test body runs - the
   * same constraint bsdsocket-fd-numbering.test.ts documents: once
   * waitSelect() has busy-waited through deasync inside a jest worker, a
   * later server.listen() callback in that worker can stop being delivered.
   */
  let httpishPort = 0;   // answers, then FINs (HTTP/1.0, the GWall shape)
  let resetPort = 0;     // answers, then RSTs
  let keepAlivePort = 0; // answers and stays open (HTTP/1.1 keep-alive)
  let silentResetPort = 0; // answers NOTHING, then RSTs
  let silentEndPort = 0;   // answers NOTHING, then FINs
  let httpishServer: net.Server | null = null;
  let resetServer: net.Server | null = null;
  let keepAliveServer: net.Server | null = null;
  let silentResetServer: net.Server | null = null;
  let silentEndServer: net.Server | null = null;
  const accepted: net.Socket[] = [];

  const RESPONSE =
    'HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n{"items":[]}';

  beforeAll(async () => {
    httpishServer = net.createServer((sock) => {
      accepted.push(sock);
      sock.once('data', () => {
        sock.write(RESPONSE);
        // HTTP/1.0: the server closes to signal the end of the body. This is
        // the FIN the door's next recv() must see immediately.
        sock.end();
      });
    });
    httpishPort = await new Promise<number>((resolve) => {
      httpishServer!.listen(0, '127.0.0.1', () =>
        resolve((httpishServer!.address() as net.AddressInfo).port));
    });

    // Answers, then RSTs - but the RST has to be provoked by the door's NEXT
    // request, not by this write, and that is a portability fact rather than
    // a style choice. Measured with a plain node client (node:22-alpine in
    // docker, 10-20 runs per shape): on Linux a `sock.write(body)` followed
    // by `sock.resetAndDestroy()` puts NO reset on the wire at all - the
    // client sees a clean FIN, 20/20 in the same tick, 20/20 from the write
    // callback, 20/20 from setImmediate, and 10/10 even with 64 KB, 1 MB or
    // 4 MB of body still in flight. macOS answers ECONNRESET in every one of
    // those, which is why this suite passed locally and failed in CI. A
    // reset provoked by a later client write is the one shape both kernels
    // deliver as ECONNRESET, 20/20 each.
    resetServer = net.createServer((sock) => {
      accepted.push(sock);
      sock.once('data', () => {
        sock.write(RESPONSE);
        sock.once('data', () => { sock.resetAndDestroy(); });
      });
    });
    resetPort = await new Promise<number>((resolve) => {
      resetServer!.listen(0, '127.0.0.1', () =>
        resolve((resetServer!.address() as net.AddressInfo).port));
    });

    // Answers and then says nothing and closes nothing - the keep-alive case.
    keepAliveServer = net.createServer((sock) => {
      accepted.push(sock);
      sock.once('data', () => { sock.write(RESPONSE); });
    });
    keepAlivePort = await new Promise<number>((resolve) => {
      keepAliveServer!.listen(0, '127.0.0.1', () =>
        resolve((keepAliveServer!.address() as net.AddressInfo).port));
    });

    // Writes nothing at all, so the door's recv() is definitely PARKED (no
    // buffered bytes, connected still true) when the RST lands. That is the
    // exact state the wake-up path has to classify; writing a body first
    // would leave it up to the kernel whether the data or the reset wins.
    silentResetServer = net.createServer((sock) => {
      accepted.push(sock);
      sock.once('data', () => { sock.resetAndDestroy(); });
    });
    silentResetPort = await new Promise<number>((resolve) => {
      silentResetServer!.listen(0, '127.0.0.1', () =>
        resolve((silentResetServer!.address() as net.AddressInfo).port));
    });

    // The control: same parked recv(), clean FIN instead of a RST.
    silentEndServer = net.createServer((sock) => {
      accepted.push(sock);
      sock.once('data', () => { sock.end(); });
    });
    silentEndPort = await new Promise<number>((resolve) => {
      silentEndServer!.listen(0, '127.0.0.1', () =>
        resolve((silentEndServer!.address() as net.AddressInfo).port));
    });
  }, IO_TEST_TIMEOUT_MS);

  afterAll(async () => {
    for (const sock of accepted) sock.destroy();
    accepted.length = 0;
    for (const server of [
      httpishServer, resetServer, keepAliveServer, silentResetServer, silentEndServer,
    ]) {
      if (!server) continue;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    httpishServer = null;
    resetServer = null;
    keepAliveServer = null;
    silentResetServer = null;
    silentEndServer = null;
  }, IO_TEST_TIMEOUT_MS);

  function callSocket(lib: BsdSocketLibrary, fake: FakeEmulator): number {
    fake.setRegister(0, AF_INET);
    fake.setRegister(1, SOCK_STREAM);
    fake.setRegister(2, 0);
    return callVector('socket', lib, fake);
  }

  function setNonBlocking(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number, on: number): number {
    fake.writeMemory32(FIONBIO_ARG, on);
    fake.setRegister(0, fd);
    fake.setRegister(1, FIONBIO);
    fake.setRegister(8, FIONBIO_ARG);
    return callVector('IoctlSocket', lib, fake);
  }

  function callConnect(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number, port: number): number {
    fake.writeMemory(SOCKADDR + 1, AF_INET);
    fake.writeMemory(SOCKADDR + 2, (port >> 8) & 0xff);
    fake.writeMemory(SOCKADDR + 3, port & 0xff);
    fake.writeMemory32(SOCKADDR + 4, 0x7f000001); // 127.0.0.1
    fake.setRegister(0, fd);
    fake.setRegister(8, SOCKADDR);
    fake.setRegister(1, 16);
    return callVector('connect', lib, fake);
  }

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
    return callVector('WaitSelect', lib, fake);
  }

  function callSend(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number, text: string): number {
    fake.writeString(SEND_BUF, text);
    fake.setRegister(0, fd);
    fake.setRegister(8, SEND_BUF);
    fake.setRegister(1, text.length);
    fake.setRegister(2, 0);
    return callVector('send', lib, fake);
  }

  function callRecv(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number, len: number): number {
    fake.setRegister(0, fd);
    fake.setRegister(8, RECV_BUF);
    fake.setRegister(1, len);
    fake.setRegister(2, 0);
    return callVector('recv', lib, fake);
  }

  /**
   * Drives the exact call sequence the harness captured from GWall, up to the
   * recv() that used to hang, and returns how long that final recv() took.
   */
  function driveDoorRequest(
    port: number,
    pokeBeforeFinalRecv = false,
  ): { finalRecv: number; elapsedMs: number; body: string; errno: number } {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fd = callSocket(lib, fake);
    expect(fd).toBeGreaterThanOrEqual(0);

    expect(setNonBlocking(lib, fake, fd, 1)).toBe(0);
    expect(callConnect(lib, fake, fd, port)).toBe(-1); // EINPROGRESS
    expect(waitWritable(lib, fake, fd, 10000)).toBeGreaterThan(0);
    expect(setNonBlocking(lib, fake, fd, 0)).toBe(0);

    const request = 'GET /GlobalWall/api/WallItems?itemCount=11&pagenum=1 HTTP/1.0\r\nHost:localhost\r\n\r\n';
    expect(callSend(lib, fake, fd, request)).toBe(request.length);

    // First recv: the response body. It arrives, so this one was never the
    // problem - but it must be drained before the reader can be parked on an
    // empty buffer, which is the state the bug needs.
    const firstLen = callRecv(lib, fake, fd, 8191);
    expect(firstLen).toBeGreaterThan(0);
    let body = '';
    for (let i = 0; i < firstLen; i++) body += String.fromCharCode(fake.readMemory(RECV_BUF + i));

    // A door that keeps talking to a peer which has torn the connection down.
    // Only used by the reset case: it is what makes the peer's RST reach this
    // client on Linux at all (see resetServer). The send itself is expected
    // to succeed - the socket is still open from this side.
    if (pokeBeforeFinalRecv) {
      const poke = 'GET /GlobalWall/api/WallItems?itemCount=11&pagenum=2 HTTP/1.0\r\n\r\n';
      expect(callSend(lib, fake, fd, poke)).toBe(poke.length);
    }

    // Second recv: the door asks for more, the peer has closed. THIS is the
    // call that used to spin for 30 seconds.
    const started = Date.now();
    const finalRecv = callRecv(lib, fake, fd, 8191);
    const elapsedMs = Date.now() - started;
    // Read straight after the failing call: errno belongs to the call that
    // set it, and CloseSocket below could move it.
    const errno = lib.getErrno();

    // The door closes its socket; without this the 'close' handler's log
    // lands after jest has torn the suite down.
    fake.setRegister(0, fd);
    callVector('CloseSocket', lib, fake);

    return { finalRecv, elapsedMs, body, errno };
  }

  /**
   * Connects, sends a request and parks in recv() with NOTHING buffered -
   * the state a peer's RST or FIN has to be classified in. Returns what that
   * single parked recv() came back with.
   */
  function driveParkedRecv(port: number): { recvResult: number; elapsedMs: number; errno: number } {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fd = callSocket(lib, fake);
    expect(fd).toBeGreaterThanOrEqual(0);
    expect(setNonBlocking(lib, fake, fd, 1)).toBe(0);
    expect(callConnect(lib, fake, fd, port)).toBe(-1); // EINPROGRESS
    expect(waitWritable(lib, fake, fd, 10000)).toBeGreaterThan(0);
    expect(setNonBlocking(lib, fake, fd, 0)).toBe(0);

    const request = 'GET / HTTP/1.0\r\nHost:localhost\r\n\r\n';
    expect(callSend(lib, fake, fd, request)).toBe(request.length);

    const started = Date.now();
    const recvResult = callRecv(lib, fake, fd, 8191);
    const elapsedMs = Date.now() - started;
    const errno = lib.getErrno();

    fake.setRegister(0, fd);
    callVector('CloseSocket', lib, fake);

    return { recvResult, elapsedMs, errno };
  }

  /**
   * Lets node deliver the 'close' events that destroy() queues. Purely
   * hygiene: without it jest reports "Cannot log after tests are done".
   */
  function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  test('a peer that closes the connection does not hold recv() for 30 seconds', async () => {
    const { finalRecv, elapsedMs, body } = driveDoorRequest(httpishPort);

    expect(body).toContain('HTTP/1.0 200 OK');
    expect(finalRecv).toBe(0); // EOF, the way BSD reports a closed stream
    expect(elapsedMs).toBeLessThan(PROMPT_MS);
    await settle();
  }, IO_TEST_TIMEOUT_MS);

  test('a peer that resets the connection does not hold recv() for 30 seconds', async () => {
    const { finalRecv, elapsedMs, errno } = driveDoorRequest(resetPort, true);

    // -1/ECONNRESET, not 0: the body this door got was truncated by a RST
    // and it must not be able to mistake that for a complete response.
    expect(finalRecv).toBe(-1);
    expect(errno).toBe(ECONNRESET);
    expect(elapsedMs).toBeLessThan(PROMPT_MS);
    await settle();
  }, IO_TEST_TIMEOUT_MS);

  test('a RST while recv() is blocked returns -1 with errno ECONNRESET', async () => {
    const { recvResult, elapsedMs, errno } = driveParkedRecv(silentResetPort);

    expect(recvResult).toBe(-1);
    expect(errno).toBe(ECONNRESET);
    expect(errno).toBe(54); // the Roadshow value, spelled out
    expect(elapsedMs).toBeLessThan(PROMPT_MS);
    await settle();
  }, IO_TEST_TIMEOUT_MS);

  test('a clean FIN while recv() is blocked still returns 0, not an error', async () => {
    const { recvResult, elapsedMs, errno } = driveParkedRecv(silentEndPort);

    expect(recvResult).toBe(0);
    expect(errno).not.toBe(ECONNRESET);
    expect(elapsedMs).toBeLessThan(PROMPT_MS);
    await settle();
  }, IO_TEST_TIMEOUT_MS);

  test('a recv() issued after the close is already known still returns 0 at once', async () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fd = callSocket(lib, fake);
    expect(setNonBlocking(lib, fake, fd, 1)).toBe(0);
    expect(callConnect(lib, fake, fd, httpishPort)).toBe(-1);
    expect(waitWritable(lib, fake, fd, 10000)).toBeGreaterThan(0);
    expect(setNonBlocking(lib, fake, fd, 0)).toBe(0);

    const request = 'GET / HTTP/1.0\r\n\r\n';
    callSend(lib, fake, fd, request);
    expect(callRecv(lib, fake, fd, 8191)).toBeGreaterThan(0);
    expect(callRecv(lib, fake, fd, 8191)).toBe(0);

    // A third recv() goes down the already-disconnected path, which was
    // always correct - pinned so a future "fix" cannot regress it into the
    // blocking branch.
    const started = Date.now();
    expect(callRecv(lib, fake, fd, 8191)).toBe(0);
    expect(Date.now() - started).toBeLessThan(PROMPT_MS);

    fake.setRegister(0, fd);
    callVector('CloseSocket', lib, fake);
    await settle();
  }, IO_TEST_TIMEOUT_MS);
  /**
   * The other half of the same invariant, pinned so a future change to the
   * wake-up path cannot break it: recv() must hand back what the stream has
   * ALREADY given it and must never wait for more once any bytes are
   * buffered. A peer that replies and keeps the connection open (HTTP/1.1
   * keep-alive) never sends a FIN, so nothing but the arriving data can end
   * the wait.
   *
   * These two pass against the unfixed handler as well - the 'data' path was
   * always correct. They are here as invariants, not as the RED case.
   */
  test('a peer that replies and stays open still delivers the reply at once', async () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fd = callSocket(lib, fake);
    expect(setNonBlocking(lib, fake, fd, 1)).toBe(0);
    expect(callConnect(lib, fake, fd, keepAlivePort)).toBe(-1);
    expect(waitWritable(lib, fake, fd, 10000)).toBeGreaterThan(0);
    expect(setNonBlocking(lib, fake, fd, 0)).toBe(0);

    const request = 'GET / HTTP/1.1\r\nHost:localhost\r\n\r\n';
    callSend(lib, fake, fd, request);

    const started = Date.now();
    const got = callRecv(lib, fake, fd, 8191);
    const elapsedMs = Date.now() - started;

    expect(got).toBe(RESPONSE.length);
    expect(elapsedMs).toBeLessThan(PROMPT_MS);

    fake.setRegister(0, fd);
    callVector('CloseSocket', lib, fake);
    await settle();
  }, IO_TEST_TIMEOUT_MS);

  test('recv() hands back the buffered remainder without waiting for more data', async () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));

    const fd = callSocket(lib, fake);
    expect(setNonBlocking(lib, fake, fd, 1)).toBe(0);
    expect(callConnect(lib, fake, fd, keepAlivePort)).toBe(-1);
    expect(waitWritable(lib, fake, fd, 10000)).toBeGreaterThan(0);
    expect(setNonBlocking(lib, fake, fd, 0)).toBe(0);

    callSend(lib, fake, fd, 'GET / HTTP/1.1\r\nHost:localhost\r\n\r\n');

    // A door with a small buffer: the first recv takes 16 bytes, the rest
    // stays queued. The next recv must return it immediately - the peer is
    // still open and will send nothing more, so anything that waits hangs.
    const first = callRecv(lib, fake, fd, 16);
    expect(first).toBe(16);

    const started = Date.now();
    const second = callRecv(lib, fake, fd, 8191);
    expect(Date.now() - started).toBeLessThan(PROMPT_MS);
    expect(second).toBe(RESPONSE.length - 16);

    fake.setRegister(0, fd);
    callVector('CloseSocket', lib, fake);
    await settle();
  }, IO_TEST_TIMEOUT_MS);
});
