/**
 * bsdsocket.library Implementation
 *
 * Provides BSD socket API for network operations.
 * Bridges Amiga socket calls to Node.js net/tls modules.
 *
 * This enables 68K doors like dannounce to make network connections.
 *
 * Key functions:
 * - socket() - Create a socket
 * - connect() - Connect to a server
 * - send()/recv() - Send and receive data
 * - gethostbyname() - DNS resolution
 * - CloseSocket() - Close a socket
 */

import * as net from 'net';
import * as dns from 'dns';
import * as deasync from 'deasync';
import type { MoiraEmulator } from '../cpu/MoiraEmulator';

// Amiga socket constants
export const AF_INET = 2;
export const SOCK_STREAM = 1;
export const SOCK_DGRAM = 2;

// Error codes. These are the classic BSD/AmigaOS values a 68K door actually
// compares against, taken verbatim from the Roadshow NDK header vendored at
// Documentation/7-Reference Sources/NDK3.2R4/SANA+RoadshowTCP-IP/netinclude/sys/errno.h
// (lines 74, 99, 147, 148) - NOT the Linux errno numbering, which differs for
// everything above 34 and would make a door branching on errno misbehave.
export const ENOENT = 2;
export const EMFILE = 24;
export const EINPROGRESS = 36;
export const ENETUNREACH = 51;
export const ECONNRESET = 54;
export const ETIMEDOUT = 60;
export const ECONNREFUSED = 61;
export const EHOSTUNREACH = 65;

/**
 * Maps a Node socket error to the classic BSD/AmigaOS errno a 68K door
 * compares against. Everything unrecognised becomes ECONNREFUSED, which is
 * what this file reported for every failure before this mapping existed.
 */
function amigaErrnoForNodeError(err: NodeJS.ErrnoException | null): number {
  switch (err?.code) {
    case 'ETIMEDOUT': return ETIMEDOUT;
    case 'ENETUNREACH': return ENETUNREACH;
    case 'EHOSTUNREACH': return EHOSTUNREACH;
    case 'ECONNRESET': return ECONNRESET;
    default: return ECONNREFUSED;
  }
}

// Socket option level/name, from the vendored Roadshow NDK header
// SANA+RoadshowTCP-IP/netinclude/sys/socket.h lines 145 and 165.
export const SOL_SOCKET = 0xffff;
export const SO_ERROR = 0x1007;

// FIONBIO, from SANA+RoadshowTCP-IP/netinclude/sys/filio.h:87 -
// _IOW('f', 126, long), i.e. 0x80000000 | (4 << 16) | ('f' << 8) | 126.
// Confirmed against a real door: the emulator logged this exact request
// value when DoorRepo set its socket non-blocking.
export const FIONBIO = 0x8004667e;

// Descriptor table size. Classic AmiTCP/bsdsocket hands out small fds
// starting at 0, and the universal AmigaOS idiom for building an fd_set is
// `1L << s` against a single 32-bit long. A descriptor >= 32 makes that
// shift undefined behaviour on 68K (shift count >= word size), so the bit
// never lands where WaitSelect looks and the door hangs forever. Keep every
// live descriptor strictly below this bound.
export const BSD_FD_SETSIZE = 32;

// hostent structure offsets
const HOSTENT_SIZE = 20;
const H_NAME = 0;       // char* h_name
const H_ALIASES = 4;    // char** h_aliases
const H_ADDRTYPE = 8;   // int h_addrtype
const H_LENGTH = 12;    // int h_length
const H_ADDR_LIST = 16; // char** h_addr_list

// sockaddr_in structure
const SOCKADDR_IN_SIZE = 16;
const SIN_LEN = 0;      // u_char sin_len (BSD style)
const SIN_FAMILY = 1;   // u_char sin_family
const SIN_PORT = 2;     // u_short sin_port
const SIN_ADDR = 4;     // struct in_addr sin_addr

interface SocketState {
  fd: number;
  socket: net.Socket | null;
  connected: boolean;
  /** Set by IoctlSocket(FIONBIO). Governs whether connect() blocks. */
  nonBlocking: boolean;
  /**
   * Pending SO_ERROR for this socket: the outcome of a non-blocking connect
   * that has already finished. Read (and cleared) by getsockopt(SO_ERROR),
   * which is how a door learns that a socket which became "writable" had in
   * fact failed. 0 means no error.
   */
  soError: number;
  /** True between a non-blocking connect() and its resolution. */
  connectPending: boolean;
  host?: string;
  port?: number;
  error?: number;
  // Buffers for async data
  readBuffer: Buffer[];
  readResolve?: (data: Buffer | null) => void;
  connectResolve?: (success: boolean) => void;
  // For TLS upgrade
  tlsSocket?: any; // Will be set by AmiSSLLibrary
}

export class BsdSocketLibrary {
  private emulator: MoiraEmulator;
  private sockets: Map<number, SocketState> = new Map();
  // bsdsocket descriptors are a namespace separate from AmigaDOS file
  // handles, so there is no need (and no basis in real AmiTCP) to offset
  // them away from 0. Descriptors are allocated low and reused after
  // CloseSocket() so a long-running door cycling sockets never climbs past
  // BSD_FD_SETSIZE. See BSD_FD_SETSIZE for why staying below 32 matters.
  private nextFd: number = 0;
  private freeFds: number[] = [];
  private hostentBuffer: number = 0; // Allocated memory for hostent
  private addrBuffer: number = 0; // Allocated memory for IP addresses
  private errno: number = 0;

  // Library base address (set when opened)
  public baseAddress: number = 0;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  /**
   * Get the last error code
   */
  getErrno(): number {
    return this.errno;
  }

  /**
   * Allocate the next free socket descriptor, reusing a closed slot when
   * available. Returns null when the descriptor table is exhausted (mirrors
   * real bsdsocket returning -1/EMFILE rather than handing out a descriptor
   * that can't be represented in a 32-bit fd_set mask).
   */
  private allocateFd(): number | null {
    const reused = this.freeFds.pop();
    if (reused !== undefined) {
      return reused;
    }
    if (this.nextFd >= BSD_FD_SETSIZE) {
      return null;
    }
    return this.nextFd++;
  }

  /**
   * Set errno pointer in memory (for doors that check it)
   */
  setErrnoPtr(addr: number): void {
    if (addr !== 0) {
      this.emulator.writeMemory32(addr, this.errno);
    }
  }

  /**
   * socket() - Create a socket
   * LVO: -30
   *
   * Parameters:
   *   D0 = domain (AF_INET)
   *   D1 = type (SOCK_STREAM, SOCK_DGRAM)
   *   D2 = protocol (usually 0)
   *
   * Returns:
   *   D0 = socket descriptor or -1 on error
   */
  socket(): number {
    const domain = this.emulator.getRegister(0); // D0
    const type = this.emulator.getRegister(1);   // D1
    const protocol = this.emulator.getRegister(2); // D2

    console.log(`[BsdSocketLibrary] socket(domain=${domain}, type=${type}, protocol=${protocol})`);

    if (domain !== AF_INET) {
      console.log(`[BsdSocketLibrary] Unsupported domain: ${domain}`);
      this.errno = ENOENT;
      return -1;
    }

    if (type !== SOCK_STREAM) {
      console.log(`[BsdSocketLibrary] Unsupported socket type: ${type}`);
      this.errno = ENOENT;
      return -1;
    }

    const fd = this.allocateFd();
    if (fd === null) {
      console.log(`[BsdSocketLibrary] socket: descriptor table exhausted (limit ${BSD_FD_SETSIZE})`);
      this.errno = EMFILE;
      return -1;
    }

    const state: SocketState = {
      fd,
      socket: null,
      connected: false,
      nonBlocking: false,
      soError: 0,
      connectPending: false,
      readBuffer: [],
    };

    this.sockets.set(fd, state);
    console.log(`[BsdSocketLibrary] Created socket fd=${fd}`);

    return fd;
  }

  /**
   * connect() - Connect to a server
   * LVO: -54
   *
   * Parameters:
   *   D0 = socket descriptor
   *   A0 = pointer to sockaddr structure
   *   D1 = address length
   *
   * Returns:
   *   D0 = 0 on success, -1 on error
   */
  connect(): number {
    const fd = this.emulator.getRegister(0);     // D0
    const addrPtr = this.emulator.getRegister(8); // A0
    const addrLen = this.emulator.getRegister(1); // D1

    const state = this.sockets.get(fd);
    if (!state) {
      console.log(`[BsdSocketLibrary] connect: invalid fd ${fd}`);
      this.errno = ENOENT;
      return -1;
    }

    // Parse sockaddr_in structure
    const family = this.emulator.readMemory(addrPtr + SIN_FAMILY);
    const port = this.emulator.readMemory16(addrPtr + SIN_PORT);
    const addr = this.emulator.readMemory32(addrPtr + SIN_ADDR);

    // Convert IP address to string
    const ip = `${(addr >> 24) & 0xFF}.${(addr >> 16) & 0xFF}.${(addr >> 8) & 0xFF}.${addr & 0xFF}`;

    console.log(`[BsdSocketLibrary] connect(fd=${fd}, ${ip}:${port})`);

    state.host = ip;
    state.port = port;

    if (state.nonBlocking) {
      return this.connectNonBlocking(state, ip, port);
    }
    // Create and connect the socket synchronously using blocking pattern
    return this.connectSync(state, ip, port);
  }

  /**
   * IoctlSocket() - I/O control on a socket
   * LVO: -114
   *
   * Parameters:
   *   D0 = socket descriptor
   *   D1 = request
   *   A0 = argument pointer
   *
   * Only FIONBIO is honoured. It used to be discarded, on the reasoning that
   * node sockets are already non-blocking - but the door does not see node's
   * sockets, it sees connect(), and connect() blocked regardless. A door that
   * asked for non-blocking I/O so it could impose its own connect timeout got
   * a 30-second stall instead.
   */
  ioctlSocket(): number {
    const fd = this.emulator.getRegister(0);      // D0
    const request = this.emulator.getRegister(1) >>> 0; // D1
    const argPtr = this.emulator.getRegister(8);  // A0

    const state = this.sockets.get(fd);
    if (!state) {
      console.log(`[BsdSocketLibrary] IoctlSocket: invalid fd ${fd}`);
      this.errno = ENOENT;
      return -1;
    }

    if (request === FIONBIO) {
      const value = argPtr !== 0 ? this.emulator.readMemory32(argPtr) : 0;
      state.nonBlocking = value !== 0;
      console.log(`[BsdSocketLibrary] IoctlSocket(fd=${fd}, FIONBIO, ${value}) -> nonBlocking=${state.nonBlocking}`);
      return 0;
    }

    // Every other request stays a no-op returning success, as before.
    console.log(`[BsdSocketLibrary] IoctlSocket(fd=${fd}, cmd=0x${request.toString(16)}) -> 0 (unhandled, treated as success)`);
    return 0;
  }

  /**
   * getsockopt() - Get a socket option
   * LVO: -96
   *
   * Parameters:
   *   D0 = socket descriptor
   *   D1 = level
   *   D2 = option name
   *   A0 = option value buffer
   *   A1 = pointer to the buffer length
   *
   * Only SOL_SOCKET/SO_ERROR is implemented, because that is the one a door
   * cannot work without: after a non-blocking connect reports the socket
   * writable, SO_ERROR is the only way to distinguish "connected" from
   * "failed". Reading it clears it, matching BSD ("get error status and
   * clear", socket.h:145).
   */
  getsockopt(): number {
    const fd = this.emulator.getRegister(0);     // D0
    const level = this.emulator.getRegister(1);  // D1
    const optname = this.emulator.getRegister(2); // D2
    const optvalPtr = this.emulator.getRegister(8); // A0

    const state = this.sockets.get(fd);
    if (!state) {
      console.log(`[BsdSocketLibrary] getsockopt: invalid fd ${fd}`);
      this.errno = ENOENT;
      return -1;
    }

    if (level === SOL_SOCKET && optname === SO_ERROR) {
      const pending = state.soError;
      state.soError = 0; // "get error status and clear"
      if (optvalPtr !== 0) {
        this.emulator.writeMemory32(optvalPtr, pending);
      }
      console.log(`[BsdSocketLibrary] getsockopt(fd=${fd}, SO_ERROR) = ${pending}`);
      return 0;
    }

    console.log(`[BsdSocketLibrary] getsockopt(fd=${fd}, level=${level}, opt=${optname}) - unhandled, returning 0`);
    return 0;
  }

  /**
   * Synchronous connect using event loop blocking
   * This is necessary because 68K code expects synchronous behavior
   */
  /**
   * Installs the data/close handlers every connected socket needs, whichever
   * connect path created it. Extracted so the blocking and non-blocking
   * paths cannot drift apart.
   */
  private attachStreamHandlers(state: SocketState): void {
    if (!state.socket) return;

    state.socket.on('data', (data) => {
      console.log(`[BsdSocketLibrary] Received ${data.length} bytes`);
      console.log(`[BsdSocketLibrary] recv data (full): ${data.toString('utf8')}`);
      state.readBuffer.push(data);
      if (state.readResolve) {
        const resolve = state.readResolve;
        state.readResolve = undefined;
        resolve(state.readBuffer.shift() || null);
      }
    });

    state.socket.on('close', () => {
      console.log(`[BsdSocketLibrary] Socket closed`);
      state.connected = false;
    });
  }

  /**
   * Non-blocking connect, the AmigaOS way: return -1 with errno EINPROGRESS
   * immediately and let the door wait for writability via WaitSelect(), then
   * read the real outcome from getsockopt(SO_ERROR). This is what a door that
   * called IoctlSocket(FIONBIO, 1) is written against - and the only way its
   * own connect timeout can ever be honoured, since the blocking path below
   * stalls the whole emulator for up to 30 seconds regardless of what
   * timeout the door asked for.
   */
  private connectNonBlocking(state: SocketState, host: string, port: number): number {
    state.socket = new net.Socket();
    state.soError = 0;
    state.connectPending = true;

    state.socket.on('connect', () => {
      console.log(`[BsdSocketLibrary] Connected to ${host}:${port} (non-blocking)`);
      state.connected = true;
      state.connectPending = false;
    });

    state.socket.on('error', (err) => {
      console.log(`[BsdSocketLibrary] Connection error (non-blocking): ${err.message}`);
      state.soError = amigaErrnoForNodeError(err);
      state.connected = false;
      state.connectPending = false;
    });

    this.attachStreamHandlers(state);
    state.socket.connect(port, host);

    console.log(`[BsdSocketLibrary] connect: non-blocking, returning -1/EINPROGRESS`);
    this.errno = EINPROGRESS;
    return -1;
  }

  private connectSync(state: SocketState, host: string, port: number): number {
    let connected = false;
    let error: NodeJS.ErrnoException | null = null;
    let done = false;

    state.socket = new net.Socket();

    state.socket.on('connect', () => {
      console.log(`[BsdSocketLibrary] Connected to ${host}:${port}`);
      connected = true;
      state.connected = true;
      done = true;
    });

    state.socket.on('error', (err) => {
      console.log(`[BsdSocketLibrary] Connection error: ${err.message}`);
      error = err;
      done = true;
    });

    this.attachStreamHandlers(state);

    // Start connection
    state.socket.connect(port, host);

    // Block until connected or error (with timeout)
    const startTime = Date.now();
    const timeout = 30000; // 30 second timeout

    // Use synchronous waiting with setImmediate
    // Note: This blocks the event loop which is not ideal but necessary for 68K compatibility
        deasync.loopWhile(() => !done && (Date.now() - startTime) < timeout);

    if (!done) {
      console.log(`[BsdSocketLibrary] Connection timeout`);
      state.socket.destroy();
      this.errno = ETIMEDOUT;
      return -1;
    }

    if (error || !connected) {
      // Report the actual reason. This used to be a flat ECONNREFUSED, so a
      // host-unreachable or reset connection was reported to the door as
      // "connection refused" - a wrong diagnosis, not merely a vague one.
      this.errno = amigaErrnoForNodeError(error);
      return -1;
    }

    return 0;
  }

  /**
   * send() - Send data on a socket
   * LVO: -66
   *
   * Parameters:
   *   D0 = socket descriptor
   *   A0 = buffer pointer
   *   D1 = buffer length
   *   D2 = flags
   *
   * Returns:
   *   D0 = bytes sent or -1 on error
   */
  send(): number {
    const fd = this.emulator.getRegister(0);      // D0
    const bufPtr = this.emulator.getRegister(8);  // A0
    const len = this.emulator.getRegister(1);     // D1
    const flags = this.emulator.getRegister(2);   // D2

    const state = this.sockets.get(fd);
    if (!state || !state.socket || !state.connected) {
      console.log(`[BsdSocketLibrary] send: invalid or disconnected socket ${fd}`);
      this.errno = ENOENT;
      return -1;
    }

    // Read data from emulator memory
    const buffer = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
      buffer[i] = this.emulator.readMemory(bufPtr + i);
    }

    console.log(`[BsdSocketLibrary] send(fd=${fd}, len=${len})`);
    console.log(`[BsdSocketLibrary] send data: ${buffer.toString('utf8').substring(0, 200)}`);

    // Use TLS socket if available, otherwise regular socket
    const socket = state.tlsSocket || state.socket;
    socket.write(buffer);

    return len;
  }

  /**
   * recv() - Receive data from a socket
   * LVO: -78
   *
   * Parameters:
   *   D0 = socket descriptor
   *   A0 = buffer pointer
   *   D1 = buffer length
   *   D2 = flags
   *
   * Returns:
   *   D0 = bytes received or -1 on error
   */
  recv(): number {
    const fd = this.emulator.getRegister(0);      // D0
    const bufPtr = this.emulator.getRegister(8);  // A0
    const len = this.emulator.getRegister(1);     // D1
    const flags = this.emulator.getRegister(2);   // D2

    const state = this.sockets.get(fd);
    if (!state || !state.socket) {
      console.log(`[BsdSocketLibrary] recv: invalid socket ${fd}`);
      this.errno = ENOENT;
      return -1;
    }

    console.log(`[BsdSocketLibrary] recv(fd=${fd}, len=${len})`);

    // Check if we have buffered data
    if (state.readBuffer.length > 0) {
      const data = state.readBuffer.shift()!;
      const copyLen = Math.min(data.length, len);
      for (let i = 0; i < copyLen; i++) {
        this.emulator.writeMemory(bufPtr + i, data[i]);
      }
      // If we have leftover data, put it back
      if (data.length > len) {
        state.readBuffer.unshift(data.slice(len));
      }
      return copyLen;
    }

    if (!state.connected) {
      return 0; // EOF
    }

    // Block waiting for data (with timeout)
        let received: Buffer | null = null;
    let done = false;

    state.readResolve = (data) => {
      received = data;
      done = true;
    };

    // Set up timeout
    const timeout = setTimeout(() => {
      done = true;
    }, 30000);

    deasync.loopWhile(() => !done);
    clearTimeout(timeout);

    const data = received as Buffer | null;
    if (data !== null && data.length > 0) {
      const copyLen = Math.min(data.length, len);
      for (let i = 0; i < copyLen; i++) {
        this.emulator.writeMemory(bufPtr + i, data[i]);
      }
      // If we have leftover data, buffer it
      if (data.length > len) {
        state.readBuffer.unshift(data.slice(len));
      }
      return copyLen;
    }

    return 0; // EOF or timeout
  }

  /**
   * CloseSocket() - Close a socket
   * LVO: -120
   *
   * Parameters:
   *   D0 = socket descriptor
   *
   * Returns:
   *   D0 = 0 on success, -1 on error
   */
  closeSocket(): number {
    const fd = this.emulator.getRegister(0); // D0

    const state = this.sockets.get(fd);
    if (!state) {
      console.log(`[BsdSocketLibrary] CloseSocket: invalid fd ${fd}`);
      return -1;
    }

    console.log(`[BsdSocketLibrary] CloseSocket(fd=${fd})`);

    if (state.tlsSocket) {
      state.tlsSocket.destroy();
    }
    if (state.socket) {
      state.socket.destroy();
    }

    this.sockets.delete(fd);
    this.freeFds.push(fd);
    return 0;
  }

  /**
   * gethostbyname() - Resolve hostname to IP address
   * LVO: -210
   *
   * Parameters:
   *   A0 = hostname string
   *
   * Returns:
   *   D0 = pointer to hostent structure or NULL on error
   */
  gethostbyname(): number {
    const hostPtr = this.emulator.getRegister(8); // A0
    const hostname = this.emulator.readString(hostPtr);

    console.log(`[BsdSocketLibrary] gethostbyname("${hostname}")`);

    // Synchronous name resolution with timeout.
    //
    // dns.lookup(), NOT dns.resolve4(): resolve4() speaks to a DNS server and
    // nothing else, so it fails on the two inputs a sysop is most likely to
    // put in a door's config file - a dotted-quad literal ("192.168.0.10")
    // and a hosts-file name ("localhost"). Real AmiTCP/Roadshow
    // gethostbyname() resolves both without any DNS traffic: a literal goes
    // through inet_addr(), and names are checked against the stack's hosts
    // file first. lookup() is the faithful equivalent - it handles literals,
    // consults /etc/hosts, and only then queries DNS.
    let addresses: string[] | null = null;
    let done = false;
    const startTime = Date.now();
    const DNS_TIMEOUT = 5000; // 5 second timeout

    dns.lookup(hostname, { family: 4, all: true }, (err, addrs) => {
      if (!err && addrs.length > 0) {
        addresses = addrs.map((entry) => entry.address);
      }
      done = true;
    });

    deasync.loopWhile(() => !done && (Date.now() - startTime) < DNS_TIMEOUT);

    if (!done) {
      console.log(`[BsdSocketLibrary] gethostbyname: DNS timeout for ${hostname}`);
      return 0; // NULL - timeout
    }

    const resolvedAddresses = addresses as string[] | null;
    if (resolvedAddresses === null || resolvedAddresses.length === 0) {
      console.log(`[BsdSocketLibrary] gethostbyname: failed to resolve ${hostname}`);
      return 0; // NULL
    }
    console.log(`[BsdSocketLibrary] Resolved ${hostname} to ${resolvedAddresses[0]}`);

    // Allocate memory for hostent structure if not already allocated
    if (this.hostentBuffer === 0) {
      // Allocate space for hostent + name + address list + addresses
      const totalSize = HOSTENT_SIZE + 256 + 32 + 16;
      this.hostentBuffer = this.allocateMemory(totalSize);
      this.addrBuffer = this.hostentBuffer + HOSTENT_SIZE + 256;
    }

    // Build hostent structure
    const hostentAddr = this.hostentBuffer;
    const nameAddr = hostentAddr + HOSTENT_SIZE;
    const addrListAddr = this.addrBuffer;
    const addrAddr = addrListAddr + 8; // Leave room for pointer array

    // Write hostname
    this.emulator.writeString(nameAddr, hostname);

    // Parse IP address and write as 4 bytes
    const ipParts = resolvedAddresses[0].split('.').map((p: string) => parseInt(p, 10));
    const ipValue = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    this.emulator.writeMemory32(addrAddr, ipValue);

    // Write address list (array of pointers ending with NULL)
    this.emulator.writeMemory32(addrListAddr, addrAddr);
    this.emulator.writeMemory32(addrListAddr + 4, 0); // NULL terminator

    // Fill in hostent structure
    this.emulator.writeMemory32(hostentAddr + H_NAME, nameAddr);
    this.emulator.writeMemory32(hostentAddr + H_ALIASES, 0); // No aliases
    this.emulator.writeMemory32(hostentAddr + H_ADDRTYPE, AF_INET);
    this.emulator.writeMemory32(hostentAddr + H_LENGTH, 4); // IPv4 = 4 bytes
    this.emulator.writeMemory32(hostentAddr + H_ADDR_LIST, addrListAddr);

    return hostentAddr;
  }

  /**
   * Get socket state by fd (used by AmiSSL for TLS upgrade)
   */
  getSocketState(fd: number): SocketState | undefined {
    return this.sockets.get(fd);
  }

  /**
   * Set TLS socket on a fd (called by AmiSSL after SSL_connect)
   */
  setTlsSocket(fd: number, tlsSocket: any): void {
    const state = this.sockets.get(fd);
    if (state) {
      state.tlsSocket = tlsSocket;
    }
  }

  /**
   * Allocate memory from the emulator
   */
  private allocateMemory(size: number): number {
    // Use a simple allocation from high memory
    // In a real implementation, this would use exec.AllocMem
    const addr = 0x300000 + Math.floor(Math.random() * 0x10000);
    return addr;
  }

  /**
   * WaitSelect() - Wait for socket activity (Amiga-specific select with signals)
   * LVO: -126
   */
  waitSelect(): number {
    const nfds = this.emulator.getRegister(0);       // D0
    const readfdsPtr = this.emulator.getRegister(8);  // A0
    const writefdsPtr = this.emulator.getRegister(9); // A1
    const exceptfdsPtr = this.emulator.getRegister(10); // A2
    const timeoutPtr = this.emulator.getRegister(11);  // A3

    let timeoutMs = 30000;
    if (timeoutPtr !== 0) {
      const tvSec = this.emulator.readMemory32(timeoutPtr);
      const tvUsec = this.emulator.readMemory32(timeoutPtr + 4);
      timeoutMs = tvSec * 1000 + Math.floor(tvUsec / 1000);
      if (timeoutMs === 0) timeoutMs = 1;
    }

    console.log(`[BsdSocketLibrary] WaitSelect(nfds=${nfds}, timeout=${timeoutMs}ms)`);

    const readFds = this.parseFdSet(readfdsPtr, nfds);
    const writeFds = this.parseFdSet(writefdsPtr, nfds);
    const readyReadFds: number[] = [];
    const readyWriteFds: number[] = [];
    const startTime = Date.now();

    deasync.loopWhile(() => {
      for (const fd of readFds) {
        const state = this.sockets.get(fd);
        // A socket whose non-blocking connect is still in flight is neither
        // readable nor at EOF - without this guard the `!state.connected`
        // clause below would report it ready the instant it was created.
        if (state && !state.connectPending &&
            (state.readBuffer.length > 0 || !state.connected)) {
          if (!readyReadFds.includes(fd)) readyReadFds.push(fd);
        }
      }
      for (const fd of writeFds) {
        const state = this.sockets.get(fd);
        if (!state) continue;
        // A failed non-blocking connect also makes the socket writable - that
        // is precisely how BSD reports it, and the door then reads the reason
        // from getsockopt(SO_ERROR). Waking only on success would leave a
        // door with a refused connection blocked until its own timeout.
        const connectFailed = !state.connectPending && state.soError !== 0;
        if ((state.connected && state.socket) || connectFailed) {
          if (!readyWriteFds.includes(fd)) readyWriteFds.push(fd);
        }
      }
      const elapsed = Date.now() - startTime;
      return readyReadFds.length === 0 && readyWriteFds.length === 0 && elapsed < timeoutMs;
    });

    if (readfdsPtr !== 0) {
      this.clearFdSet(readfdsPtr, nfds);
      for (const fd of readyReadFds) this.setFdBit(readfdsPtr, fd);
    }
    if (writefdsPtr !== 0) {
      this.clearFdSet(writefdsPtr, nfds);
      for (const fd of readyWriteFds) this.setFdBit(writefdsPtr, fd);
    }
    if (exceptfdsPtr !== 0) this.clearFdSet(exceptfdsPtr, nfds);

    const totalReady = readyReadFds.length + readyWriteFds.length;
    console.log(`[BsdSocketLibrary] WaitSelect returning ${totalReady}`);
    return totalReady;
  }

  private parseFdSet(ptr: number, nfds: number): number[] {
    if (ptr === 0) return [];
    const fds: number[] = [];
    for (let fd = 0; fd < Math.min(nfds, 256); fd++) {
      const wordIndex = Math.floor(fd / 32);
      const bitIndex = fd % 32;
      const word = this.emulator.readMemory32(ptr + wordIndex * 4);
      if (word & (1 << bitIndex)) fds.push(fd);
    }
    return fds;
  }

  private clearFdSet(ptr: number, nfds: number): void {
    if (ptr === 0) return;
    for (let i = 0; i < Math.ceil(Math.min(nfds, 256) / 32); i++) {
      this.emulator.writeMemory32(ptr + i * 4, 0);
    }
  }

  private setFdBit(ptr: number, fd: number): void {
    if (ptr === 0 || fd < 0 || fd >= 256) return;
    const wordIndex = Math.floor(fd / 32);
    const bitIndex = fd % 32;
    const wordAddr = ptr + wordIndex * 4;
    const word = this.emulator.readMemory32(wordAddr);
    this.emulator.writeMemory32(wordAddr, word | (1 << bitIndex));
  }

  /**
   * Cleanup all sockets
   */
  cleanup(): void {
    for (const [fd, state] of this.sockets) {
      if (state.tlsSocket) {
        state.tlsSocket.destroy();
      }
      if (state.socket) {
        state.socket.destroy();
      }
    }
    this.sockets.clear();
  }
}
