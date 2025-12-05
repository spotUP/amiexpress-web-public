/**
 * Unified Transfer Protocol Service
 *
 * Provides a unified interface for all file transfer protocols:
 * - ZMODEM (default for modern terminals)
 * - YMODEM (batch transfers, 1K blocks)
 * - XMODEM (legacy, 128/1K blocks, checksum or CRC)
 * - Punter (C64/C128 specific)
 *
 * Protocol selection is based on:
 * 1. User preference (stored in user.protocol)
 * 2. Terminal type detection (PETSCII mode = Punter/XMODEM)
 * 3. Explicit command (RZ, RX, RY, RP for receive; SZ, SX, SY, SP for send)
 */

import { EventEmitter } from 'events';
import { BBSSession } from '../index';
import { ZmodemTransferManager, TransferTransport, TransferDirection as ZmodemDirection } from './zmodem-transfer.service';
import { XmodemTransferManager, XmodemMode } from './xmodem-transfer.service';
import { YmodemTransferManager, FileToSend } from './ymodem-transfer.service';
import { PunterTransferManager } from './punter-transfer.service';

export type TransferProtocol = 'zmodem' | 'ymodem' | 'xmodem' | 'xmodem-crc' | 'xmodem-1k' | 'punter';
export type TransferDirection = 'upload' | 'download';

// Protocol name mappings for display
export const PROTOCOL_NAMES: Record<TransferProtocol, string> = {
  'zmodem': 'ZMODEM',
  'ymodem': 'YMODEM (Batch)',
  'xmodem': 'XMODEM (Checksum)',
  'xmodem-crc': 'XMODEM-CRC',
  'xmodem-1k': 'XMODEM-1K',
  'punter': 'Punter (C64)'
};

// Protocol IDs for AmiExpress compatibility
export const PROTOCOL_IDS: Record<TransferProtocol, number> = {
  'xmodem': 1,
  'xmodem-crc': 2,
  'xmodem-1k': 3,
  'ymodem': 4,
  'zmodem': 5,
  'punter': 6
};

// Reverse mapping
export const ID_TO_PROTOCOL: Record<number, TransferProtocol> = {
  1: 'xmodem',
  2: 'xmodem-crc',
  3: 'xmodem-1k',
  4: 'ymodem',
  5: 'zmodem',
  6: 'punter'
};

export interface TransferOptions {
  protocol?: TransferProtocol;
  direction: TransferDirection;
  files: string[];  // Paths for download, destination for upload
  onProgress?: (filename: string, transferred: number, total: number) => void;
  onFileComplete?: (filename: string, success: boolean) => void;
  onComplete?: (success: boolean, files: string[]) => void;
  onError?: (error: string) => void;
}

export interface TransferResult {
  success: boolean;
  files: string[];
  bytesTransferred: number;
  protocol: TransferProtocol;
  error?: string;
}

/**
 * Get the appropriate protocol for a session based on terminal type
 */
export function getDefaultProtocol(session: BBSSession): TransferProtocol {
  // If user has a stored protocol preference, use it
  if (session.user?.protocol) {
    const userProtocol = session.user.protocol.toLowerCase();
    if (userProtocol in PROTOCOL_NAMES) {
      return userProtocol as TransferProtocol;
    }
    // Try to match by ID
    const protocolId = parseInt(userProtocol);
    if (!isNaN(protocolId) && protocolId in ID_TO_PROTOCOL) {
      return ID_TO_PROTOCOL[protocolId];
    }
  }

  // PETSCII mode = C64/C128, prefer Punter or XMODEM
  if ((session as any).petsciiMode) {
    return 'punter';
  }

  // Default to ZMODEM for modern terminals
  return 'zmodem';
}

/**
 * Get list of protocols suitable for the current terminal
 */
export function getAvailableProtocols(session: BBSSession): TransferProtocol[] {
  const protocols: TransferProtocol[] = [];

  if ((session as any).petsciiMode) {
    // C64/C128 terminals
    protocols.push('punter', 'xmodem', 'xmodem-crc');
  } else {
    // Modern terminals
    protocols.push('zmodem', 'ymodem', 'xmodem-1k', 'xmodem-crc', 'xmodem');
    // Also offer Punter for testing/compatibility
    protocols.push('punter');
  }

  return protocols;
}

/**
 * Unified Transfer Protocol Manager
 * Creates and manages the appropriate protocol handler
 */
export class TransferProtocolManager extends EventEmitter {
  private session: BBSSession;
  private protocol: TransferProtocol;
  private direction: TransferDirection;
  private active: boolean = false;
  private manager: any;  // Active protocol manager
  private transport: TransferTransport;
  private options: TransferOptions;
  private completedFiles: string[] = [];
  private bytesTransferred: number = 0;

  constructor(
    session: BBSSession,
    transport: TransferTransport,
    options: TransferOptions
  ) {
    super();
    this.session = session;
    this.transport = transport;
    this.options = options;
    this.protocol = options.protocol || getDefaultProtocol(session);
    this.direction = options.direction;
  }

  /**
   * Start the transfer
   */
  async start(): Promise<void> {
    if (this.active) {
      throw new Error('Transfer already in progress');
    }

    this.active = true;
    this.completedFiles = [];
    this.bytesTransferred = 0;

    console.log(`[TRANSFER] Starting ${this.protocol} ${this.direction}`);

    // Mark session as in raw transfer mode
    (this.session as any).transferRawActive = true;
    (this.session as any).transferManager = this;

    try {
      switch (this.protocol) {
        case 'zmodem':
          await this.startZmodem();
          break;
        case 'ymodem':
          await this.startYmodem();
          break;
        case 'xmodem':
        case 'xmodem-crc':
        case 'xmodem-1k':
          await this.startXmodem();
          break;
        case 'punter':
          await this.startPunter();
          break;
        default:
          throw new Error(`Unsupported protocol: ${this.protocol}`);
      }
    } catch (error: any) {
      this.finish(false, error.message);
    }
  }

  /**
   * Handle incoming data from remote terminal
   */
  handleInput(data: Buffer): void {
    if (!this.active || !this.manager) {
      return;
    }

    this.manager.handleInput(data);
  }

  /**
   * Cancel the transfer
   */
  cancel(): void {
    if (!this.active) return;

    if (this.manager && typeof this.manager.cancel === 'function') {
      this.manager.cancel();
    } else {
      this.finish(false, 'Cancelled by user');
    }
  }

  /**
   * Start ZMODEM transfer
   */
  private async startZmodem(): Promise<void> {
    const zmDirection: ZmodemDirection = this.direction === 'upload' ? 'upload' : 'download';

    this.manager = new ZmodemTransferManager({
      session: this.session,
      transport: this.transport,
      direction: zmDirection,
      paths: this.options.files,
      onComplete: (success, detail) => {
        const files = this.direction === 'upload' ? detail.received : detail.sent;
        this.completedFiles = files;
        this.finish(success);
      }
    });

    (this.session as any).transferRawSink = (buf: Buffer) => this.manager.handleInput(buf);
    (this.session as any).transferRawSend = this.transport.send;

    this.manager.start();
  }

  /**
   * Start YMODEM transfer
   */
  private async startYmodem(): Promise<void> {
    this.manager = new YmodemTransferManager({
      use1kBlocks: true,
      onProgress: (filename, transferred, total) => {
        this.bytesTransferred = transferred;
        if (this.options.onProgress) {
          this.options.onProgress(filename, transferred, total);
        }
      },
      onFileComplete: (filename, success) => {
        if (success) {
          this.completedFiles.push(filename);
        }
        if (this.options.onFileComplete) {
          this.options.onFileComplete(filename, success);
        }
      },
      onComplete: (success, files) => {
        this.completedFiles = files;
        this.finish(success);
      },
      onError: (error) => {
        if (this.options.onError) {
          this.options.onError(error);
        }
      }
    });

    this.manager.setSendCallback(this.transport.send);
    (this.session as any).transferRawSink = (buf: Buffer) => this.manager.handleInput(buf);
    (this.session as any).transferRawSend = this.transport.send;

    if (this.direction === 'upload') {
      // Receive files
      await this.manager.startReceive(this.options.files[0]);
    } else {
      // Send files
      const filesToSend: FileToSend[] = this.options.files.map(f => ({ path: f }));
      await this.manager.startSend(filesToSend);
    }
  }

  /**
   * Start XMODEM transfer
   */
  private async startXmodem(): Promise<void> {
    let mode: XmodemMode = 'crc';
    if (this.protocol === 'xmodem') {
      mode = 'checksum';
    } else if (this.protocol === 'xmodem-1k') {
      mode = '1k';
    }

    this.manager = new XmodemTransferManager({
      mode,
      onProgress: (transferred, total) => {
        this.bytesTransferred = transferred;
        if (this.options.onProgress) {
          const filename = this.options.files[0] || 'file';
          this.options.onProgress(filename, transferred, total);
        }
      },
      onComplete: (success, transferred) => {
        this.bytesTransferred = transferred;
        if (success && this.options.files.length > 0) {
          this.completedFiles.push(this.options.files[0]);
        }
        this.finish(success);
      },
      onError: (error) => {
        if (this.options.onError) {
          this.options.onError(error);
        }
      }
    });

    this.manager.setSendCallback(this.transport.send);
    (this.session as any).transferRawSink = (buf: Buffer) => this.manager.handleInput(buf);
    (this.session as any).transferRawSend = this.transport.send;

    if (this.direction === 'upload') {
      // Receive file
      await this.manager.startReceive(this.options.files[0]);
    } else {
      // Send file (XMODEM only supports single file)
      await this.manager.startSend(this.options.files[0]);
    }
  }

  /**
   * Start Punter transfer
   */
  private async startPunter(): Promise<void> {
    this.manager = new PunterTransferManager({
      onProgress: (transferred, total) => {
        this.bytesTransferred = transferred;
        if (this.options.onProgress) {
          const filename = this.options.files[0] || 'file';
          this.options.onProgress(filename, transferred, total);
        }
      },
      onComplete: (success, transferred) => {
        this.bytesTransferred = transferred;
        if (success && this.options.files.length > 0) {
          this.completedFiles.push(this.options.files[0]);
        }
        this.finish(success);
      },
      onError: (error) => {
        if (this.options.onError) {
          this.options.onError(error);
        }
      }
    });

    this.manager.setSendCallback(this.transport.send);
    (this.session as any).transferRawSink = (buf: Buffer) => this.manager.handleInput(buf);
    (this.session as any).transferRawSend = this.transport.send;

    if (this.direction === 'upload') {
      // Receive file
      await this.manager.startReceive(this.options.files[0]);
    } else {
      // Send file
      await this.manager.startSend(this.options.files[0]);
    }
  }

  /**
   * Finish the transfer
   */
  private finish(success: boolean, error?: string): void {
    this.active = false;

    // Clean up session transfer state
    (this.session as any).transferRawActive = false;
    (this.session as any).transferRawSink = undefined;
    (this.session as any).transferRawSend = undefined;
    (this.session as any).transferManager = undefined;

    const result: TransferResult = {
      success,
      files: this.completedFiles,
      bytesTransferred: this.bytesTransferred,
      protocol: this.protocol,
      error
    };

    console.log(`[TRANSFER] ${this.protocol} ${this.direction} ${success ? 'complete' : 'failed'}:`, result);

    if (this.options.onComplete) {
      this.options.onComplete(success, this.completedFiles);
    }

    this.emit('complete', result);
  }

  /**
   * Check if transfer is active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Get current protocol
   */
  getProtocol(): TransferProtocol {
    return this.protocol;
  }
}

/**
 * Helper to create a transport from session
 */
export function createTransportFromSession(session: BBSSession, socket: any): TransferTransport {
  const connectionType = (session as any).connectionType;

  let type: TransferTransport['type'] = 'web';
  if (connectionType === 'ssh') {
    type = 'ssh';
  } else if (connectionType === 'telnet') {
    type = 'telnet';
  }

  return {
    type,
    send: (session as any).transferRawSend ||
          ((buf: Buffer) => socket.emit('transfer-raw:data', buf))
  };
}

export default TransferProtocolManager;
