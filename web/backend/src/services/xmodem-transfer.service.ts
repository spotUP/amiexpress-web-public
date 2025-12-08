/**
 * XMODEM File Transfer Protocol Implementation
 *
 * Supports:
 * - XMODEM (128-byte blocks, checksum)
 * - XMODEM-CRC (128-byte blocks, CRC-16)
 * - XMODEM-1K (1024-byte blocks, CRC-16)
 *
 * Control Characters:
 * - SOH (0x01): Start of 128-byte block
 * - STX (0x02): Start of 1024-byte block
 * - EOT (0x04): End of transmission
 * - ACK (0x06): Positive acknowledgment
 * - NAK (0x15): Negative acknowledgment / checksum mode request
 * - CAN (0x18): Cancel transfer
 * - C   (0x43): CRC mode request
 *
 * Packet Format:
 * [SOH/STX] [SEQ] [~SEQ] [DATA...] [CHECK]
 * - SEQ: Block sequence number (1-255, wraps)
 * - ~SEQ: One's complement of SEQ
 * - DATA: 128 or 1024 bytes
 * - CHECK: 1-byte checksum or 2-byte CRC-16
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { CONTROL_CHARS, calculateCRC16, calculateChecksum } from '../utils/transfer-protocol.util';

// Control characters (re-export for compatibility)
const SOH = CONTROL_CHARS.SOH;  // 128-byte block header
const STX = CONTROL_CHARS.STX;  // 1024-byte block header
const EOT = CONTROL_CHARS.EOT;  // End of transmission
const ACK = CONTROL_CHARS.ACK;  // Positive acknowledgment
const NAK = CONTROL_CHARS.NAK;  // Negative acknowledgment
const CAN = CONTROL_CHARS.CAN;  // Cancel
const C = 0x43;    // 'C' - CRC mode request
const SUB = CONTROL_CHARS.SUB;  // Padding byte (Ctrl-Z)

export type XmodemMode = 'checksum' | 'crc' | '1k';
export type TransferDirection = 'send' | 'receive';

export interface XmodemOptions {
  mode?: XmodemMode;
  timeout?: number;      // Timeout in ms (default: 10000)
  maxRetries?: number;   // Max retries per block (default: 10)
  onProgress?: (sent: number, total: number) => void;
  onError?: (error: string) => void;
  onComplete?: (success: boolean, bytesTransferred: number) => void;
}

export interface XmodemTransfer {
  direction: TransferDirection;
  filePath: string;
  options: XmodemOptions;
}

/**
 * XMODEM Transfer Manager
 * Handles both sending and receiving files using XMODEM protocol
 */
export class XmodemTransferManager extends EventEmitter {
  private mode: XmodemMode;
  private timeout: number;
  private maxRetries: number;
  private blockSize: number;
  private useCRC: boolean;
  private active: boolean = false;
  private cancelled: boolean = false;

  // Transfer state
  private direction: TransferDirection = 'send';
  private filePath: string = '';
  private fileData: Buffer | null = null;
  private fileSize: number = 0;
  private bytesTransferred: number = 0;
  private blockNumber: number = 1;
  private retryCount: number = 0;
  private receiveBuffer: Buffer = Buffer.alloc(0);
  private receivedBlocks: Buffer[] = [];
  private lastSentBlock: Buffer | null = null;

  // State machine
  private state: 'idle' | 'waiting_start' | 'sending' | 'receiving' | 'complete' | 'error' = 'idle';
  private timeoutHandle: NodeJS.Timeout | null = null;

  // Callbacks
  private sendCallback: ((data: Buffer) => void) | null = null;
  private options: XmodemOptions;

  constructor(options: XmodemOptions = {}) {
    super();
    this.mode = options.mode || 'crc';
    this.timeout = options.timeout || 10000;
    this.maxRetries = options.maxRetries || 10;
    this.blockSize = this.mode === '1k' ? 1024 : 128;
    this.useCRC = this.mode !== 'checksum';
    this.options = options;
  }

  /**
   * Set the send callback for transmitting data
   */
  setSendCallback(callback: (data: Buffer) => void): void {
    this.sendCallback = callback;
  }

  /**
   * Start sending a file
   */
  async startSend(filePath: string): Promise<void> {
    if (this.active) {
      throw new Error('Transfer already in progress');
    }

    // Read file
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    this.fileData = fs.readFileSync(filePath);
    this.fileSize = this.fileData.length;
    this.filePath = filePath;
    this.direction = 'send';
    this.blockNumber = 1;
    this.bytesTransferred = 0;
    this.retryCount = 0;
    this.active = true;
    this.cancelled = false;
    this.state = 'waiting_start';

    console.log(`[XMODEM] Starting send: ${path.basename(filePath)} (${this.fileSize} bytes)`);

    // Wait for receiver to send NAK (checksum) or 'C' (CRC)
    this.startTimeout();
  }

  /**
   * Start receiving a file
   */
  async startReceive(filePath: string): Promise<void> {
    if (this.active) {
      throw new Error('Transfer already in progress');
    }

    this.filePath = filePath;
    this.direction = 'receive';
    this.blockNumber = 1;
    this.bytesTransferred = 0;
    this.retryCount = 0;
    this.active = true;
    this.cancelled = false;
    this.receivedBlocks = [];
    this.receiveBuffer = Buffer.alloc(0);
    this.state = 'waiting_start';

    console.log(`[XMODEM] Starting receive to: ${filePath}`);

    // Send initial handshake - 'C' for CRC mode or NAK for checksum mode
    if (this.useCRC) {
      this.send(Buffer.from([C]));
    } else {
      this.send(Buffer.from([NAK]));
    }

    this.startTimeout();
  }

  /**
   * Handle incoming data from remote
   */
  handleInput(data: Buffer): void {
    if (!this.active || this.cancelled) {
      return;
    }

    this.clearTimeout();

    if (this.direction === 'send') {
      this.handleSendInput(data);
    } else {
      this.handleReceiveInput(data);
    }
  }

  /**
   * Handle input during send operation
   */
  private handleSendInput(data: Buffer): void {
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];

      switch (this.state) {
        case 'waiting_start':
          // Waiting for receiver's handshake
          if (byte === C) {
            // CRC mode requested
            this.useCRC = true;
            console.log('[XMODEM] Receiver requested CRC mode');
            this.state = 'sending';
            this.sendNextBlock();
          } else if (byte === NAK) {
            // Checksum mode requested
            this.useCRC = false;
            console.log('[XMODEM] Receiver requested checksum mode');
            this.state = 'sending';
            this.sendNextBlock();
          } else if (byte === CAN) {
            this.handleCancel();
            return;
          }
          break;

        case 'sending':
          if (byte === ACK) {
            // Block acknowledged, send next
            this.retryCount = 0;
            this.blockNumber = (this.blockNumber % 255) + 1;
            this.sendNextBlock();
          } else if (byte === NAK) {
            // Block rejected, retry
            this.retryCount++;
            if (this.retryCount > this.maxRetries) {
              this.finish(false, 'Max retries exceeded');
              return;
            }
            console.log(`[XMODEM] NAK received, retry ${this.retryCount}/${this.maxRetries}`);
            if (this.lastSentBlock) {
              this.send(this.lastSentBlock);
              this.startTimeout();
            }
          } else if (byte === CAN) {
            this.handleCancel();
            return;
          }
          break;

        case 'complete':
          if (byte === ACK) {
            // EOT acknowledged, transfer complete
            this.finish(true);
          }
          break;
      }
    }
  }

  /**
   * Handle input during receive operation
   */
  private handleReceiveInput(data: Buffer): void {
    // Append to receive buffer
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

    while (this.receiveBuffer.length > 0) {
      const firstByte = this.receiveBuffer[0];

      // Check for EOT
      if (firstByte === EOT) {
        this.send(Buffer.from([ACK]));
        this.saveReceivedFile();
        this.finish(true);
        return;
      }

      // Check for CAN
      if (firstByte === CAN) {
        // Two CANs in a row = abort
        if (this.receiveBuffer.length >= 2 && this.receiveBuffer[1] === CAN) {
          this.handleCancel();
          return;
        }
      }

      // Determine block type and expected size
      let blockSize: number;
      let headerByte: number;

      if (firstByte === SOH) {
        blockSize = 128;
        headerByte = SOH;
      } else if (firstByte === STX) {
        blockSize = 1024;
        headerByte = STX;
      } else {
        // Unknown byte, discard and continue
        this.receiveBuffer = this.receiveBuffer.slice(1);
        continue;
      }

      // Calculate expected packet size: header(1) + seq(1) + ~seq(1) + data + check(1 or 2)
      const checkSize = this.useCRC ? 2 : 1;
      const packetSize = 1 + 1 + 1 + blockSize + checkSize;

      // Wait for complete packet
      if (this.receiveBuffer.length < packetSize) {
        this.startTimeout();
        return;
      }

      // Parse packet
      const packet = this.receiveBuffer.slice(0, packetSize);
      this.receiveBuffer = this.receiveBuffer.slice(packetSize);

      const seqNum = packet[1];
      const seqComp = packet[2];
      const blockData = packet.slice(3, 3 + blockSize);

      // Validate sequence number complement
      if ((seqNum ^ seqComp) !== 0xFF) {
        console.log('[XMODEM] Sequence complement mismatch');
        this.sendNak();
        continue;
      }

      // Validate checksum/CRC
      let valid: boolean;
      if (this.useCRC) {
        const receivedCRC = (packet[3 + blockSize] << 8) | packet[3 + blockSize + 1];
        const calculatedCRC = calculateCRC16(blockData);
        valid = receivedCRC === calculatedCRC;
      } else {
        const receivedChecksum = packet[3 + blockSize];
        const calculatedChecksum = calculateChecksum(blockData);
        valid = receivedChecksum === calculatedChecksum;
      }

      if (!valid) {
        console.log('[XMODEM] Checksum/CRC mismatch');
        this.sendNak();
        continue;
      }

      // Check sequence number
      if (seqNum === this.blockNumber) {
        // Expected block
        this.receivedBlocks.push(blockData);
        this.bytesTransferred += blockSize;
        this.blockNumber = (this.blockNumber % 255) + 1;
        this.retryCount = 0;

        if (this.options.onProgress) {
          this.options.onProgress(this.bytesTransferred, 0);
        }

        this.send(Buffer.from([ACK]));
      } else if (seqNum === ((this.blockNumber - 1) & 0xFF) ||
                 (this.blockNumber === 1 && seqNum === 255)) {
        // Duplicate of previous block (sender didn't get our ACK)
        console.log('[XMODEM] Duplicate block received, re-ACKing');
        this.send(Buffer.from([ACK]));
      } else {
        // Out of sequence
        console.log(`[XMODEM] Sequence error: expected ${this.blockNumber}, got ${seqNum}`);
        this.sendNak();
      }
    }

    this.startTimeout();
  }

  /**
   * Send next data block
   */
  private sendNextBlock(): void {
    if (!this.fileData) {
      return;
    }

    const offset = (this.blockNumber - 1) * this.blockSize;

    if (offset >= this.fileSize) {
      // All data sent, send EOT
      console.log('[XMODEM] All blocks sent, sending EOT');
      this.state = 'complete';
      this.send(Buffer.from([EOT]));
      this.startTimeout();
      return;
    }

    // Get block data, pad with SUB (0x1A) if necessary
    const remaining = this.fileSize - offset;
    const dataSize = Math.min(this.blockSize, remaining);
    const blockData = Buffer.alloc(this.blockSize, SUB);
    this.fileData.copy(blockData, 0, offset, offset + dataSize);

    // Build packet
    const headerByte = this.blockSize === 1024 ? STX : SOH;
    const seqNum = this.blockNumber & 0xFF;
    const seqComp = (~seqNum) & 0xFF;

    let packet: Buffer;
    if (this.useCRC) {
      const crc = calculateCRC16(blockData);
      packet = Buffer.alloc(1 + 1 + 1 + this.blockSize + 2);
      packet[0] = headerByte;
      packet[1] = seqNum;
      packet[2] = seqComp;
      blockData.copy(packet, 3);
      packet[3 + this.blockSize] = (crc >> 8) & 0xFF;
      packet[3 + this.blockSize + 1] = crc & 0xFF;
    } else {
      const checksum = calculateChecksum(blockData);
      packet = Buffer.alloc(1 + 1 + 1 + this.blockSize + 1);
      packet[0] = headerByte;
      packet[1] = seqNum;
      packet[2] = seqComp;
      blockData.copy(packet, 3);
      packet[3 + this.blockSize] = checksum;
    }

    this.lastSentBlock = packet;
    this.bytesTransferred = offset + dataSize;

    if (this.options.onProgress) {
      this.options.onProgress(this.bytesTransferred, this.fileSize);
    }

    console.log(`[XMODEM] Sending block ${this.blockNumber} (${dataSize} bytes)`);
    this.send(packet);
    this.startTimeout();
  }

  /**
   * Send NAK for retry
   */
  private sendNak(): void {
    this.retryCount++;
    if (this.retryCount > this.maxRetries) {
      this.finish(false, 'Max retries exceeded');
      return;
    }
    this.send(Buffer.from([NAK]));
    this.startTimeout();
  }

  /**
   * Handle cancel request
   */
  private handleCancel(): void {
    console.log('[XMODEM] Transfer cancelled by remote');
    // Send CAN twice to confirm
    this.send(Buffer.from([CAN, CAN]));
    this.finish(false, 'Cancelled by remote');
  }

  /**
   * Cancel the transfer
   */
  cancel(): void {
    if (!this.active) return;
    this.cancelled = true;
    this.send(Buffer.from([CAN, CAN]));
    this.finish(false, 'Cancelled by user');
  }

  /**
   * Save received file to disk
   */
  private saveReceivedFile(): void {
    if (this.receivedBlocks.length === 0) {
      console.log('[XMODEM] No data received');
      return;
    }

    // Combine all blocks
    const fullData = Buffer.concat(this.receivedBlocks);

    // Remove padding (trailing SUB bytes)
    let actualLength = fullData.length;
    while (actualLength > 0 && fullData[actualLength - 1] === SUB) {
      actualLength--;
    }

    const trimmedData = fullData.slice(0, actualLength);

    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, trimmedData);
    console.log(`[XMODEM] File saved: ${this.filePath} (${trimmedData.length} bytes)`);
  }

  /**
   * Send data to remote
   */
  private send(data: Buffer): void {
    if (this.sendCallback) {
      this.sendCallback(data);
    }
  }

  /**
   * Start timeout timer
   */
  private startTimeout(): void {
    this.clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      this.handleTimeout();
    }, this.timeout);
  }

  /**
   * Clear timeout timer
   */
  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /**
   * Handle timeout
   */
  private handleTimeout(): void {
    this.retryCount++;

    if (this.retryCount > this.maxRetries) {
      this.finish(false, 'Timeout - max retries exceeded');
      return;
    }

    console.log(`[XMODEM] Timeout, retry ${this.retryCount}/${this.maxRetries}`);

    if (this.direction === 'receive') {
      // Resend handshake
      if (this.state === 'waiting_start') {
        if (this.useCRC) {
          this.send(Buffer.from([C]));
        } else {
          this.send(Buffer.from([NAK]));
        }
      } else {
        this.send(Buffer.from([NAK]));
      }
    } else if (this.direction === 'send') {
      // Resend last block
      if (this.lastSentBlock) {
        this.send(this.lastSentBlock);
      }
    }

    this.startTimeout();
  }

  /**
   * Finish transfer
   */
  private finish(success: boolean, error?: string): void {
    this.clearTimeout();
    this.active = false;
    this.state = success ? 'complete' : 'error';

    if (error) {
      console.log(`[XMODEM] Transfer failed: ${error}`);
      if (this.options.onError) {
        this.options.onError(error);
      }
    } else {
      console.log(`[XMODEM] Transfer complete: ${this.bytesTransferred} bytes`);
    }

    if (this.options.onComplete) {
      this.options.onComplete(success, this.bytesTransferred);
    }

    this.emit('complete', success, this.bytesTransferred);
  }

  /**
   * Check if transfer is active
   */
  isActive(): boolean {
    return this.active;
  }
}

export default XmodemTransferManager;
