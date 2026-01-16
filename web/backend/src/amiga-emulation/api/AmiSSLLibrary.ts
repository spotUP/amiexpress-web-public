/**
 * amisslmaster.library and amissl.library Implementation
 *
 * Provides OpenSSL-compatible API for TLS/SSL operations.
 * Bridges AmiSSL calls to Node.js tls module.
 *
 * This enables 68K doors like dannounce to make HTTPS connections.
 *
 * amisslmaster.library:
 * - InitAmiSSLMaster() - Initialize AmiSSL
 * - OpenAmiSSL() - Open AmiSSL library
 * - CloseAmiSSL() - Close AmiSSL library
 *
 * amissl.library:
 * - SSL_CTX_new() - Create SSL context
 * - SSL_new() - Create SSL connection
 * - SSL_connect() - Perform TLS handshake
 * - SSL_read()/SSL_write() - Read/write encrypted data
 */

import * as tls from 'tls';
import * as deasync from 'deasync';
import type { MoiraEmulator } from '../cpu/MoiraEmulator';
import type { BsdSocketLibrary } from './BsdSocketLibrary';

// AmiSSL constants
export const AMISSL_CURRENT_VERSION = 6;
export const AMISSLMASTER_MIN_VERSION = 4;

// SSL verify modes
export const SSL_VERIFY_NONE = 0;
export const SSL_VERIFY_PEER = 1;
export const SSL_VERIFY_FAIL_IF_NO_PEER_CERT = 2;

// Tag constants
export const TAG_DONE = 0;
export const AmiSSL_SocketBase = 0x80000001;
export const AmiSSL_ErrNoPtr = 0x8000000B;

// Fake pointer values for contexts (we'll use these as handles)
const SSL_CTX_BASE = 0x400000;
const SSL_BASE = 0x410000;
const BIO_BASE = 0x420000;
const X509_BASE = 0x430000;

interface SSLContext {
  id: number;
  verifyMode: number;
  verifyCallback: number;
}

interface SSLConnection {
  id: number;
  ctx: SSLContext;
  fd: number;
  tlsSocket: tls.TLSSocket | null;
  connected: boolean;
  peerCertificate: tls.PeerCertificate | null;
  // Buffers for async data
  readBuffer: Buffer[];
  readResolve?: (data: Buffer | null) => void;
}

interface BIOHandle {
  id: number;
  type: string;
  data: any;
}

/**
 * amisslmaster.library implementation
 */
export class AmiSSLMasterLibrary {
  private emulator: MoiraEmulator;
  private initialized: boolean = false;
  private amisslBase: number = 0;

  // Callback to install amissl vectors when OpenAmiSSL is called
  private onOpenAmiSSL: (() => void) | null = null;

  public baseAddress: number = 0;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  /**
   * Set callback to be called when OpenAmiSSL() is invoked
   * This allows LibraryTraps to install amissl.library vectors
   */
  setOnOpenAmiSSL(callback: () => void): void {
    this.onOpenAmiSSL = callback;
  }

  /**
   * InitAmiSSLMaster() - Initialize AmiSSL
   * LVO: -30
   *
   * Parameters:
   *   D0 = version required
   *   D1 = use OpenSSL structures flag
   *
   * Returns:
   *   D0 = TRUE if successful, FALSE otherwise
   */
  initAmiSSLMaster(): number {
    const version = this.emulator.getRegister(0); // D0
    const useOpenSSL = this.emulator.getRegister(1); // D1

    console.log(`[AmiSSLMasterLibrary] InitAmiSSLMaster(version=${version}, useOpenSSL=${useOpenSSL})`);

    if (version > AMISSL_CURRENT_VERSION) {
      console.log(`[AmiSSLMasterLibrary] Version ${version} not supported (max: ${AMISSL_CURRENT_VERSION})`);
      return 0; // FALSE
    }

    this.initialized = true;
    console.log(`[AmiSSLMasterLibrary] Initialized successfully`);
    return 1; // TRUE
  }

  /**
   * OpenAmiSSL() - Open AmiSSL library
   * LVO: -36
   *
   * Returns:
   *   D0 = AmiSSL library base or NULL
   */
  openAmiSSL(): number {
    console.log(`[AmiSSLMasterLibrary] OpenAmiSSL()`);

    if (!this.initialized) {
      console.log(`[AmiSSLMasterLibrary] Not initialized!`);
      return 0;
    }

    // Return the same address that ExecLibrary uses for amissl.library
    // This ensures vectors are installed at the address dannounce will call
    this.amisslBase = 0x0f6000; // Must match AMISSL_LIB_ADDR in ExecLibrary
    console.log(`[AmiSSLMasterLibrary] Opened AmiSSL at 0x${this.amisslBase.toString(16)}`);

    // Trigger installation of amissl.library vectors
    if (this.onOpenAmiSSL) {
      this.onOpenAmiSSL();
    }

    return this.amisslBase;
  }

  /**
   * CloseAmiSSL() - Close AmiSSL library
   * LVO: -42
   */
  closeAmiSSL(): void {
    console.log(`[AmiSSLMasterLibrary] CloseAmiSSL()`);
    this.amisslBase = 0;
  }

  getAmiSSLBase(): number {
    return this.amisslBase;
  }
}

/**
 * amissl.library implementation
 */
export class AmiSSLLibrary {
  private emulator: MoiraEmulator;
  private bsdSocketLib: BsdSocketLibrary | null = null;

  private contexts: Map<number, SSLContext> = new Map();
  private connections: Map<number, SSLConnection> = new Map();
  private bios: Map<number, BIOHandle> = new Map();

  private nextCtxId: number = 1;
  private nextSslId: number = 1;
  private nextBioId: number = 1;

  private socketBase: number = 0;
  private errnoPtr: number = 0;

  public baseAddress: number = 0;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  setBsdSocketLibrary(lib: BsdSocketLibrary): void {
    this.bsdSocketLib = lib;
  }

  /**
   * InitAmiSSLA() - Initialize AmiSSL with tags
   * LVO: -30
   *
   * Parameters:
   *   A0 = tag list
   *
   * Returns:
   *   D0 = 0 if successful, error code otherwise
   */
  initAmiSSLA(): number {
    const tagList = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] InitAmiSSLA(tagList=0x${tagList.toString(16)})`);

    // Parse tags
    let tagPtr = tagList;
    while (tagPtr !== 0) {
      const tag = this.emulator.readMemory32(tagPtr);
      const data = this.emulator.readMemory32(tagPtr + 4);

      if (tag === TAG_DONE) break;

      if (tag === AmiSSL_SocketBase) {
        this.socketBase = data;
        console.log(`[AmiSSLLibrary] SocketBase = 0x${data.toString(16)}`);
      } else if (tag === AmiSSL_ErrNoPtr) {
        this.errnoPtr = data;
        console.log(`[AmiSSLLibrary] ErrNoPtr = 0x${data.toString(16)}`);
      }

      tagPtr += 8;
    }

    console.log(`[AmiSSLLibrary] Initialized successfully`);
    return 0; // Success
  }

  /**
   * CleanupAmiSSLA() - Cleanup AmiSSL
   * LVO: -36
   */
  cleanupAmiSSLA(): void {
    console.log(`[AmiSSLLibrary] CleanupAmiSSLA()`);

    // Close all connections
    for (const [id, conn] of this.connections) {
      if (conn.tlsSocket) {
        conn.tlsSocket.destroy();
      }
    }

    this.contexts.clear();
    this.connections.clear();
    this.bios.clear();
  }

  /**
   * OPENSSL_init_ssl() - Initialize OpenSSL
   * LVO: -66 (approximate, varies by version)
   */
  openSSLInitSSL(): number {
    const opts = this.emulator.getRegister(0); // D0
    const settings = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] OPENSSL_init_ssl(opts=0x${opts.toString(16)})`);
    return 1; // Success
  }

  /**
   * TLS_client_method() - Get TLS client method
   * LVO: varies
   */
  tlsClientMethod(): number {
    console.log(`[AmiSSLLibrary] TLS_client_method()`);
    // Return a fake method pointer
    return 0x460000;
  }

  /**
   * SSL_CTX_new() - Create SSL context
   * LVO: varies
   */
  sslCtxNew(): number {
    const method = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] SSL_CTX_new(method=0x${method.toString(16)})`);

    const ctx: SSLContext = {
      id: this.nextCtxId++,
      verifyMode: SSL_VERIFY_NONE,
      verifyCallback: 0,
    };

    const ctxAddr = SSL_CTX_BASE + ctx.id * 0x100;
    this.contexts.set(ctxAddr, ctx);

    console.log(`[AmiSSLLibrary] Created SSL_CTX at 0x${ctxAddr.toString(16)}`);
    return ctxAddr;
  }

  /**
   * SSL_CTX_free() - Free SSL context
   */
  sslCtxFree(): void {
    const ctxAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] SSL_CTX_free(ctx=0x${ctxAddr.toString(16)})`);
    this.contexts.delete(ctxAddr);
  }

  /**
   * SSL_CTX_set_verify() - Set verify mode
   */
  sslCtxSetVerify(): void {
    const ctxAddr = this.emulator.getRegister(8); // A0
    const mode = this.emulator.getRegister(0);    // D0
    const callback = this.emulator.getRegister(9); // A1

    console.log(`[AmiSSLLibrary] SSL_CTX_set_verify(ctx=0x${ctxAddr.toString(16)}, mode=${mode})`);

    const ctx = this.contexts.get(ctxAddr);
    if (ctx) {
      ctx.verifyMode = mode;
      ctx.verifyCallback = callback;
    }
  }

  /**
   * SSL_CTX_set_default_verify_paths() - Set default verify paths
   */
  sslCtxSetDefaultVerifyPaths(): number {
    const ctxAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] SSL_CTX_set_default_verify_paths(ctx=0x${ctxAddr.toString(16)})`);
    return 1; // Success
  }

  /**
   * SSL_new() - Create SSL connection
   */
  sslNew(): number {
    const ctxAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] SSL_new(ctx=0x${ctxAddr.toString(16)})`);

    const ctx = this.contexts.get(ctxAddr);
    if (!ctx) {
      console.log(`[AmiSSLLibrary] Invalid context!`);
      return 0;
    }

    const conn: SSLConnection = {
      id: this.nextSslId++,
      ctx,
      fd: -1,
      tlsSocket: null,
      connected: false,
      peerCertificate: null,
      readBuffer: [],
    };

    const sslAddr = SSL_BASE + conn.id * 0x100;
    this.connections.set(sslAddr, conn);

    console.log(`[AmiSSLLibrary] Created SSL at 0x${sslAddr.toString(16)}`);
    return sslAddr;
  }

  /**
   * SSL_free() - Free SSL connection
   */
  sslFree(): void {
    const sslAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] SSL_free(ssl=0x${sslAddr.toString(16)})`);

    const conn = this.connections.get(sslAddr);
    if (conn && conn.tlsSocket) {
      conn.tlsSocket.destroy();
    }
    this.connections.delete(sslAddr);
  }

  /**
   * SSL_set_fd() - Associate socket with SSL
   */
  sslSetFd(): number {
    const sslAddr = this.emulator.getRegister(8); // A0
    const fd = this.emulator.getRegister(0);      // D0

    console.log(`[AmiSSLLibrary] SSL_set_fd(ssl=0x${sslAddr.toString(16)}, fd=${fd})`);

    const conn = this.connections.get(sslAddr);
    if (!conn) {
      console.log(`[AmiSSLLibrary] Invalid SSL!`);
      return 0;
    }

    conn.fd = fd;
    return 1; // Success
  }

  /**
   * SSL_connect() - Perform TLS handshake
   * This is where we upgrade the socket to TLS using Node.js
   */
  sslConnect(): number {
    const sslAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] SSL_connect(ssl=0x${sslAddr.toString(16)})`);

    const conn = this.connections.get(sslAddr);
    if (!conn) {
      console.log(`[AmiSSLLibrary] Invalid SSL!`);
      return -1;
    }

    if (!this.bsdSocketLib) {
      console.log(`[AmiSSLLibrary] BsdSocketLibrary not set!`);
      return -1;
    }

    const socketState = this.bsdSocketLib.getSocketState(conn.fd);
    if (!socketState || !socketState.socket) {
      console.log(`[AmiSSLLibrary] Invalid socket fd ${conn.fd}!`);
      return -1;
    }

    // Upgrade to TLS using Node.js
    console.log(`[AmiSSLLibrary] Upgrading socket to TLS...`);

        let done = false;
    let success = false;

    const options: tls.ConnectionOptions = {
      socket: socketState.socket,
      rejectUnauthorized: false, // AmiSSL typically handles cert verification itself
      servername: socketState.host,
    };

    const tlsSocket = tls.connect(options);

    tlsSocket.on('secureConnect', () => {
      console.log(`[AmiSSLLibrary] TLS handshake complete`);
      conn.tlsSocket = tlsSocket;
      conn.connected = true;
      conn.peerCertificate = tlsSocket.getPeerCertificate();

      // Update the bsdsocket state with TLS socket
      this.bsdSocketLib!.setTlsSocket(conn.fd, tlsSocket);

      success = true;
      done = true;
    });

    tlsSocket.on('error', (err) => {
      console.log(`[AmiSSLLibrary] TLS error: ${err.message}`);
      done = true;
    });

    tlsSocket.on('data', (data) => {
      console.log(`[AmiSSLLibrary] Received ${data.length} bytes`);
      conn.readBuffer.push(data);
      if (conn.readResolve) {
        const resolve = conn.readResolve;
        conn.readResolve = undefined;
        resolve(conn.readBuffer.shift() || null);
      }
    });

    tlsSocket.on('close', () => {
      console.log(`[AmiSSLLibrary] TLS socket closed`);
      conn.connected = false;
    });

    // Wait for handshake (with timeout)
    const startTime = Date.now();
    const timeout = 30000;

    deasync.loopWhile(() => !done && (Date.now() - startTime) < timeout);

    if (!done) {
      console.log(`[AmiSSLLibrary] TLS handshake timeout`);
      tlsSocket.destroy();
      return -1;
    }

    return success ? 1 : -1;
  }

  /**
   * SSL_write() - Write data over TLS
   */
  sslWrite(): number {
    const sslAddr = this.emulator.getRegister(8); // A0
    const bufPtr = this.emulator.getRegister(9);  // A1
    const len = this.emulator.getRegister(0);     // D0

    console.log(`[AmiSSLLibrary] SSL_write(ssl=0x${sslAddr.toString(16)}, len=${len})`);

    const conn = this.connections.get(sslAddr);
    if (!conn || !conn.tlsSocket || !conn.connected) {
      console.log(`[AmiSSLLibrary] Invalid or disconnected SSL!`);
      return -1;
    }

    // Read data from emulator memory
    const buffer = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
      buffer[i] = this.emulator.readMemory(bufPtr + i);
    }

    conn.tlsSocket.write(buffer);
    return len;
  }

  /**
   * SSL_read() - Read data over TLS
   */
  sslRead(): number {
    const sslAddr = this.emulator.getRegister(8); // A0
    const bufPtr = this.emulator.getRegister(9);  // A1
    const len = this.emulator.getRegister(0);     // D0

    console.log(`[AmiSSLLibrary] SSL_read(ssl=0x${sslAddr.toString(16)}, len=${len})`);

    const conn = this.connections.get(sslAddr);
    if (!conn) {
      console.log(`[AmiSSLLibrary] Invalid SSL!`);
      return -1;
    }

    // Check if we have buffered data
    if (conn.readBuffer.length > 0) {
      const data = conn.readBuffer.shift()!;
      const copyLen = Math.min(data.length, len);
      for (let i = 0; i < copyLen; i++) {
        this.emulator.writeMemory(bufPtr + i, data[i]);
      }
      // If we have leftover data, put it back
      if (data.length > len) {
        conn.readBuffer.unshift(data.slice(len));
      }
      return copyLen;
    }

    if (!conn.connected) {
      return 0; // EOF
    }

    // Block waiting for data (with timeout)
        let received: Buffer | null = null;
    let done = false;

    conn.readResolve = (data) => {
      received = data;
      done = true;
    };

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
      if (data.length > len) {
        conn.readBuffer.unshift(data.slice(len));
      }
      return copyLen;
    }

    return 0; // EOF or timeout
  }

  /**
   * SSL_shutdown() - Shut down TLS connection
   */
  sslShutdown(): number {
    const sslAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] SSL_shutdown(ssl=0x${sslAddr.toString(16)})`);

    const conn = this.connections.get(sslAddr);
    if (conn && conn.tlsSocket) {
      conn.tlsSocket.end();
      conn.connected = false;
    }

    return 0;
  }

  /**
   * SSL_get_current_cipher() - Get current cipher
   */
  sslGetCurrentCipher(): number {
    const sslAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] SSL_get_current_cipher(ssl=0x${sslAddr.toString(16)})`);

    const conn = this.connections.get(sslAddr);
    if (conn && conn.tlsSocket) {
      const cipher = conn.tlsSocket.getCipher();
      console.log(`[AmiSSLLibrary] Cipher: ${cipher?.name || 'unknown'}`);
      // Return fake cipher pointer
      return 0x470000;
    }

    return 0;
  }

  /**
   * SSL_get_peer_certificate() - Get peer certificate
   */
  sslGetPeerCertificate(): number {
    const sslAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] SSL_get_peer_certificate(ssl=0x${sslAddr.toString(16)})`);

    const conn = this.connections.get(sslAddr);
    if (conn && conn.peerCertificate) {
      // Return fake X509 pointer
      return X509_BASE + conn.id;
    }

    return 0;
  }

  /**
   * X509_get_subject_name() - Get certificate subject name
   */
  x509GetSubjectName(): number {
    const certAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] X509_get_subject_name(cert=0x${certAddr.toString(16)})`);

    // Return fake X509_NAME pointer
    return 0x480000;
  }

  /**
   * X509_get_issuer_name() - Get certificate issuer name
   */
  x509GetIssuerName(): number {
    const certAddr = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] X509_get_issuer_name(cert=0x${certAddr.toString(16)})`);

    // Return fake X509_NAME pointer
    return 0x490000;
  }

  /**
   * X509_NAME_oneline() - Convert X509_NAME to string
   */
  x509NameOneline(): number {
    const name = this.emulator.getRegister(8);  // A0
    const buf = this.emulator.getRegister(9);   // A1
    const size = this.emulator.getRegister(0);  // D0

    console.log(`[AmiSSLLibrary] X509_NAME_oneline(name=0x${name.toString(16)})`);

    // Write a placeholder string
    const result = "/CN=unknown";
    const resultAddr = buf !== 0 ? buf : 0x4A0000;
    this.emulator.writeString(resultAddr, result);

    return resultAddr;
  }

  /**
   * X509_free() - Free X509 certificate
   */
  x509Free(): void {
    const certAddr = this.emulator.getRegister(8); // A0
    console.log(`[AmiSSLLibrary] X509_free(cert=0x${certAddr.toString(16)})`);
    // Nothing to do - we don't actually allocate X509 structures
  }

  /**
   * CRYPTO_free() - Free memory allocated by OpenSSL
   */
  cryptoFree(): void {
    const ptr = this.emulator.getRegister(8);   // A0
    const file = this.emulator.getRegister(9);  // A1
    const line = this.emulator.getRegister(0);  // D0

    console.log(`[AmiSSLLibrary] CRYPTO_free(ptr=0x${ptr.toString(16)})`);
    // Nothing to do - we don't actually allocate memory
  }

  /**
   * BIO_new() - Create new BIO
   */
  bioNew(): number {
    const type = this.emulator.getRegister(8); // A0

    console.log(`[AmiSSLLibrary] BIO_new(type=0x${type.toString(16)})`);

    const bio: BIOHandle = {
      id: this.nextBioId++,
      type: 'file',
      data: null,
    };

    const bioAddr = BIO_BASE + bio.id * 0x100;
    this.bios.set(bioAddr, bio);

    return bioAddr;
  }

  /**
   * BIO_s_file() - Get file BIO method
   */
  bioSFile(): number {
    console.log(`[AmiSSLLibrary] BIO_s_file()`);
    return 0x4B0000; // Fake method pointer
  }

  /**
   * BIO_ctrl() - Control BIO
   */
  bioCtrl(): number {
    const bio = this.emulator.getRegister(8);   // A0
    const cmd = this.emulator.getRegister(0);   // D0
    const larg = this.emulator.getRegister(1);  // D1
    const parg = this.emulator.getRegister(9);  // A1

    console.log(`[AmiSSLLibrary] BIO_ctrl(bio=0x${bio.toString(16)}, cmd=${cmd})`);
    return 1; // Success
  }

  /**
   * ERR_print_errors() - Print SSL errors
   */
  errPrintErrors(): void {
    const bio = this.emulator.getRegister(8); // A0
    console.log(`[AmiSSLLibrary] ERR_print_errors(bio=0x${bio.toString(16)})`);
    // We don't have actual errors to print
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    for (const [id, conn] of this.connections) {
      if (conn.tlsSocket) {
        conn.tlsSocket.destroy();
      }
    }
    this.contexts.clear();
    this.connections.clear();
    this.bios.clear();
  }
}
