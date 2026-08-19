/**
 * The bsdsocket byte capture (BSDSOCKET_TEE_DIR).
 *
 * Why it exists at all: see src/amiga-emulation/api/bsdsocket-tee.ts. It was
 * written to settle a DoorRepo download that hashed to the same wrong digest
 * twice on the live BBS while the server, the network and the same door
 * binary all verified clean everywhere else.
 *
 * What these tests pin, and why each matters for that job:
 *
 *   - It is OFF unless the env var names a directory. A capture that turns
 *     itself on would write a copy of every byte every door downloads.
 *   - The `recv` stream equals what recv() copied into the door's memory,
 *     including across a partial drain. This is the whole point: if the
 *     capture and the door's memory could disagree, comparing the capture
 *     against curl would prove nothing.
 *   - The `wire` stream equals what the peer sent. Same reason, other end.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as net from 'net';
import {
  BsdSocketLibrary,
  AF_INET,
  SOCK_STREAM,
} from '../../src/amiga-emulation/api/BsdSocketLibrary';
import {
  SocketTee,
  TEE_DIR_ENV,
  teeDir,
  _resetSequenceForTests,
} from '../../src/amiga-emulation/api/bsdsocket-tee';

const IO_TEST_TIMEOUT_MS = 20000;
const SOCKADDR = 0x500000;
const RECV_BUF = 0x600000;

class FakeEmulator {
  bytes = new Map<number, number>();
  registers = new Array(18).fill(0);
  getRegister(reg: number): number { return this.registers[reg]; }
  setRegister(reg: number, value: number): void { this.registers[reg] = value >>> 0; }
  readMemory(address: number): number { return this.bytes.get(address) || 0; }
  writeMemory(address: number, value: number): void { this.bytes.set(address, value & 0xff); }
  readMemory16(address: number): number { return (this.readMemory(address) << 8) | this.readMemory(address + 1); }
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
    for (let a = address; ; a++) { const b = this.readMemory(a); if (b === 0) break; out += String.fromCharCode(b); }
    return out;
  }
  writeString(address: number, value: string): void {
    for (let i = 0; i < value.length; i++) this.writeMemory(address + i, value.charCodeAt(i));
    this.writeMemory(address + value.length, 0);
  }
  /** The door's view of its own receive buffer. */
  readBytes(address: number, len: number): Buffer {
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i++) out[i] = this.readMemory(address + i);
    return out;
  }
}

function asEmu(fake: FakeEmulator): any { return fake; }

function callSocket(lib: BsdSocketLibrary, fake: FakeEmulator): number {
  fake.setRegister(0, AF_INET);
  fake.setRegister(1, SOCK_STREAM);
  fake.setRegister(2, 0);
  return lib.socket();
}

function callConnect(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number, port: number): number {
  fake.writeMemory(SOCKADDR + 1, AF_INET);
  fake.writeMemory(SOCKADDR + 2, (port >> 8) & 0xff);
  fake.writeMemory(SOCKADDR + 3, port & 0xff);
  fake.writeMemory32(SOCKADDR + 4, 0x7f000001);
  fake.setRegister(0, fd);
  fake.setRegister(8, SOCKADDR);
  fake.setRegister(1, 16);
  return lib.connect();
}

function callRecv(lib: BsdSocketLibrary, fake: FakeEmulator, fd: number, len: number): number {
  fake.setRegister(0, fd);
  fake.setRegister(8, RECV_BUF);
  fake.setRegister(1, len);
  fake.setRegister(2, 0);
  return lib.recv();
}

describe('bsdsocket byte capture', () => {
  let tmpDir: string;
  const savedEnv = process.env[TEE_DIR_ENV];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsdtee-'));
    _resetSequenceForTests();
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env[TEE_DIR_ENV];
    else process.env[TEE_DIR_ENV] = savedEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('capture is off when the environment variable is unset', () => {
    expect(teeDir({})).toBeNull();
    expect(SocketTee.create(0, 'host', {})).toBeNull();
  });

  test('an empty environment variable is off, not a capture into the working directory', () => {
    expect(teeDir({ [TEE_DIR_ENV]: '   ' })).toBeNull();
    expect(SocketTee.create(0, 'host', { [TEE_DIR_ENV]: '' })).toBeNull();
  });

  test('two connections on the same reused descriptor get separate files', () => {
    const first = SocketTee.create(3, 'a.example', { [TEE_DIR_ENV]: tmpDir });
    const second = SocketTee.create(3, 'a.example', { [TEE_DIR_ENV]: tmpDir });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.wirePath).not.toBe(first!.wirePath);
  });

  test('a hostile host label cannot escape the capture directory', () => {
    const tee = SocketTee.create(0, '../../etc/passwd', { [TEE_DIR_ENV]: tmpDir });

    expect(tee).not.toBeNull();
    expect(path.dirname(tee!.wirePath)).toBe(tmpDir);
  });
});

describe('bsdsocket byte capture against a real socket', () => {
  let tmpDir: string;
  let server: net.Server | null = null;
  let port = 0;
  const accepted: net.Socket[] = [];
  const savedEnv = process.env[TEE_DIR_ENV];
  // 3 KB, every byte value cycling, so a dropped, duplicated or reordered
  // chunk changes the capture rather than hiding inside repeated bytes.
  const PAYLOAD = Buffer.from(Array.from({ length: 3072 }, (_, i) => i % 256));

  beforeAll(async () => {
    server = net.createServer((sock) => {
      accepted.push(sock);
      sock.write(PAYLOAD);
    });
    port = await new Promise<number>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve((server!.address() as net.AddressInfo).port));
    });
  }, IO_TEST_TIMEOUT_MS);

  afterAll(async () => {
    for (const s of accepted) s.destroy();
    accepted.length = 0;
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  }, IO_TEST_TIMEOUT_MS);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsdtee-io-'));
    process.env[TEE_DIR_ENV] = tmpDir;
    _resetSequenceForTests();
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env[TEE_DIR_ENV];
    else process.env[TEE_DIR_ENV] = savedEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('the recv capture is byte-for-byte what recv() put in the door\'s memory, across a partial drain', () => {
    const fake = new FakeEmulator();
    const lib = new BsdSocketLibrary(asEmu(fake));
    const fd = callSocket(lib, fake);
    expect(callConnect(lib, fake, fd, port)).toBe(0);

    // Deliberately smaller than the payload, so the drain has to split a
    // queued chunk and continue from the remainder on the next call - the
    // case a naive capture gets wrong by recording the whole chunk.
    const CHUNK = 500;
    const seen: Buffer[] = [];
    let total = 0;
    while (total < PAYLOAD.length) {
      const n = callRecv(lib, fake, fd, CHUNK);
      if (n <= 0) break;
      seen.push(fake.readBytes(RECV_BUF, n));
      total += n;
    }

    const intoDoorMemory = Buffer.concat(seen);
    expect(intoDoorMemory.length).toBe(PAYLOAD.length);

    const files = fs.readdirSync(tmpDir);
    const recvFile = files.find((f) => f.endsWith('.recv.bin'));
    const wireFile = files.find((f) => f.endsWith('.wire.bin'));
    expect(recvFile).toBeDefined();
    expect(wireFile).toBeDefined();

    expect(fs.readFileSync(path.join(tmpDir, recvFile!)).equals(intoDoorMemory)).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, wireFile!)).equals(PAYLOAD)).toBe(true);

    // Leave no live socket behind: its 'close' handler logs, and jest fails
    // the run for logging after the test has finished.
    fake.setRegister(0, fd);
    lib.closeSocket();
  }, IO_TEST_TIMEOUT_MS);
});
