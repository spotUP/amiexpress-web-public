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

// Error codes
export const ENOENT = 2;
export const ECONNREFUSED = 111;
export const ETIMEDOUT = 110;

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
  private nextFd: number = 100; // Start at 100 to avoid conflicts with file handles
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

    const fd = this.nextFd++;
    const state: SocketState = {
      fd,
      socket: null,
      connected: false,
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

    // Create and connect the socket synchronously using blocking pattern
    return this.connectSync(state, ip, port);
  }

  /**
   * Synchronous connect using event loop blocking
   * This is necessary because 68K code expects synchronous behavior
   */
  private connectSync(state: SocketState, host: string, port: number): number {
    let connected = false;
    let error: Error | null = null;
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

    state.socket.on('data', (data) => {
      console.log(`[BsdSocketLibrary] Received ${data.length} bytes`);
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
      this.errno = ECONNREFUSED;
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

    // Synchronous DNS lookup with timeout
    let addresses: string[] | null = null;
    let done = false;
    const startTime = Date.now();
    const DNS_TIMEOUT = 5000; // 5 second timeout

    dns.resolve4(hostname, (err, addrs) => {
      if (!err) {
        addresses = addrs;
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
