/**
 * Punter C1 (New Punter) File Transfer Protocol Implementation
 *
 * The Punter protocol was developed by Steve Punter in 1984 for Commodore 64 BBSes.
 * It uses three-byte ASCII handshake strings and dual checksums for reliability.
 *
 * Handshake Strings (3 bytes each):
 * - GOO: General acknowledgment/ready
 * - BAD: Checksum error
 * - ACK: Positive acknowledgment
 * - S/B: Synchronization/block marker
 * - SYN: Synchronization terminator
 *
 * Block Structure (7-byte header + payload):
 * [0-1] Additive checksum (16-bit, little-endian)
 * [2-3] Cyclic checksum (16-bit, little-endian, XOR with rotation)
 * [4]   Size of next block (0-255)
 * [5-6] Block index (little-endian, 0xFFFF = last block)
 * [7+]  Payload data (variable length, max 248 bytes)
 *
 * File Types:
 * - 0: PRG (program file)
 * - 1: SEQ (sequential file)
 *
 * Transfer Phases:
 * - Phase A: Transmit file type (single byte in an 8-byte block)
 * - Phase B: Transmit file data (7-byte header blocks followed by data blocks)
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// Handshake strings (3 bytes each)
const GOO = Buffer.from('GOO');
const BAD = Buffer.from('BAD');
const ACK = Buffer.from('ACK');
const SB = Buffer.from('S/B');
const SYN = Buffer.from('SYN');

// File types
const FILE_TYPE_PRG = 0;
const FILE_TYPE_SEQ = 1;

// Block structure
const HEADER_SIZE = 7;
const MAX_PAYLOAD_SIZE = 248;
const LAST_BLOCK_INDEX = 0xFFFF;

export type PunterFileType = 'prg' | 'seq';
export type TransferDirection = 'send' | 'receive';

export interface PunterOptions {
  fileType?: PunterFileType;
  timeout?: number;      // Timeout in ms (default: 10000)
  maxRetries?: number;   // Max retries per block (default: 10)
  onProgress?: (sent: number, total: number) => void;
  onError?: (error: string) => void;
  onComplete?: (success: boolean, bytesTransferred: number) => void;
}

/**
 * Calculate additive checksum (16-bit)
 * Sum of all bytes from offset 4 onwards, modulo 65536
 */
function calculateAdditiveChecksum(data: Buffer, offset: number = 4): number {
  let sum = 0;
  for (let i = offset; i < data.length; i++) {
    sum = (sum + data[i]) & 0xFFFF;
  }
  return sum;
}

/**
 * Calculate cyclic checksum (16-bit)
 * XOR all bytes with 16-bit result, rotating left after each byte
 */
function calculateCyclicChecksum(data: Buffer, offset: number = 4): number {
  let crc = 0;
  for (let i = offset; i < data.length; i++) {
    crc ^= data[i];
    // Rotate left by 1 bit
    crc = ((crc << 1) | (crc >> 15)) & 0xFFFF;
  }
  return crc;
}

/**
 * Set checksums in a block
 */
function setBlockChecksums(block: Buffer): void {
  const additive = calculateAdditiveChecksum(block);
  const cyclic = calculateCyclicChecksum(block);

  // Little-endian
  block[0] = additive & 0xFF;
  block[1] = (additive >> 8) & 0xFF;
  block[2] = cyclic & 0xFF;
  block[3] = (cyclic >> 8) & 0xFF;
}

/**
 * Verify block checksums
 */
function verifyBlockChecksums(block: Buffer): boolean {
  const storedAdditive = block[0] | (block[1] << 8);
  const storedCyclic = block[2] | (block[3] << 8);

  const calculatedAdditive = calculateAdditiveChecksum(block);
  const calculatedCyclic = calculateCyclicChecksum(block);

  return storedAdditive === calculatedAdditive && storedCyclic === calculatedCyclic;
}

/**
 * Punter Transfer Manager
 * Handles both sending and receiving files using Punter C1 protocol
 */
export class PunterTransferManager extends EventEmitter {
  private timeout: number;
  private maxRetries: number;
  private active: boolean = false;
  private cancelled: boolean = false;

  // Transfer state
  private direction: TransferDirection = 'send';
  private filePath: string = '';
  private fileData: Buffer | null = null;
  private fileSize: number = 0;
  private fileType: number = FILE_TYPE_PRG;
  private bytesTransferred: number = 0;
  private blockIndex: number = 0;
  private retryCount: number = 0;
  private receiveBuffer: Buffer = Buffer.alloc(0);
  private receivedData: Buffer[] = [];
  private lastSentBlock: Buffer | null = null;
  private receivedFileType: number = FILE_TYPE_PRG;

  // State machine
  private state: string = 'idle';
  private phase: 'A' | 'B' = 'A';
  private timeoutHandle: NodeJS.Timeout | null = null;

  // Pending handshake expectation
  private expectedHandshake: Buffer | null = null;
  private handshakeBuffer: Buffer = Buffer.alloc(0);

  // Callbacks
  private sendCallback: ((data: Buffer) => void) | null = null;
  private options: PunterOptions;

  constructor(options: PunterOptions = {}) {
    super();
    this.timeout = options.timeout || 10000;
    this.maxRetries = options.maxRetries || 10;
    this.fileType = options.fileType === 'seq' ? FILE_TYPE_SEQ : FILE_TYPE_PRG;
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

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    this.fileData = fs.readFileSync(filePath);
    this.fileSize = this.fileData.length;
    this.filePath = filePath;
    this.direction = 'send';
    this.blockIndex = 0;
    this.bytesTransferred = 0;
    this.retryCount = 0;
    this.active = true;
    this.cancelled = false;
    this.phase = 'A';
    this.state = 'send_goo1';

    // Determine file type from extension
    const ext = path.extname(filePath).toLowerCase();
    this.fileType = (ext === '.prg' || ext === '.p00') ? FILE_TYPE_PRG : FILE_TYPE_SEQ;

console.log(`[PUNTER] Starting send: ${path.basename(filePath)} (${this.fileSize} bytes, type=${this.fileType === FILE_TYPE_PRG ? 'PRG' : 'SEQ'})`);

    // Phase A: Send first GOO
    this.send(GOO);
    this.state = 'wait_goo1';
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
    this.blockIndex = 0;
    this.bytesTransferred = 0;
    this.retryCount = 0;
    this.active = true;
    this.cancelled = false;
    this.receivedData = [];
    this.receiveBuffer = Buffer.alloc(0);
    this.phase = 'A';
    this.state = 'wait_goo1';

console.log(`[PUNTER] Starting receive to: ${filePath}`);

    // Receiver waits for sender's GOO
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

    // Add to handshake buffer
    this.handshakeBuffer = Buffer.concat([this.handshakeBuffer, data]);

    // Process handshakes and data
    this.processInput();
  }

  /**
   * Process buffered input
   */
  private processInput(): void {
    while (this.handshakeBuffer.length >= 3 || this.isExpectingBlock()) {
      // Check for 3-byte handshakes first
      if (this.handshakeBuffer.length >= 3) {
        const first3 = this.handshakeBuffer.slice(0, 3);

        if (this.matchesHandshake(first3, GOO)) {
          this.handshakeBuffer = this.handshakeBuffer.slice(3);
          this.handleGOO();
          continue;
        }
        if (this.matchesHandshake(first3, BAD)) {
          this.handshakeBuffer = this.handshakeBuffer.slice(3);
          this.handleBAD();
          continue;
        }
        if (this.matchesHandshake(first3, ACK)) {
          this.handshakeBuffer = this.handshakeBuffer.slice(3);
          this.handleACK();
          continue;
        }
        if (this.matchesHandshake(first3, SB)) {
          this.handshakeBuffer = this.handshakeBuffer.slice(3);
          this.handleSB();
          continue;
        }
        if (this.matchesHandshake(first3, SYN)) {
          this.handshakeBuffer = this.handshakeBuffer.slice(3);
          this.handleSYN();
          continue;
        }
      }

      // Check for block data
      if (this.isExpectingBlock()) {
        if (!this.tryReadBlock()) {
          break;  // Need more data
        }
        continue;
      }

      // Unknown data, discard one byte and continue
      if (this.handshakeBuffer.length > 0) {
        this.handshakeBuffer = this.handshakeBuffer.slice(1);
      } else {
        break;
      }
    }

    if (this.active) {
      this.startTimeout();
    }
  }

  /**
   * Check if buffers match a handshake
   */
  private matchesHandshake(data: Buffer, handshake: Buffer): boolean {
    return data.length >= 3 &&
           data[0] === handshake[0] &&
           data[1] === handshake[1] &&
           data[2] === handshake[2];
  }

  /**
   * Check if we're expecting block data
   */
  private isExpectingBlock(): boolean {
    return this.state === 'wait_block';
  }

  /**
   * Try to read a complete block from buffer
   */
  private tryReadBlock(): boolean {
    // Need at least header to determine full block size
    if (this.handshakeBuffer.length < HEADER_SIZE) {
      return false;
    }

    // Get next block size from header byte 4
    const nextBlockSize = this.handshakeBuffer[4];

    // For Phase A type block, payload is just 1 byte (file type)
    // For Phase B, we use the header's nextBlockSize field

    // Determine current expected block size
    let expectedSize: number;

    if (this.phase === 'A') {
      // Phase A: 8-byte block (7 header + 1 file type)
      expectedSize = 8;
    } else {
      // Phase B: Header blocks (7 bytes) or data blocks (up to 255 bytes)
      // The previous block's nextBlockSize tells us expected size
      expectedSize = HEADER_SIZE + nextBlockSize;
      if (expectedSize > 255) {
        expectedSize = 255;  // Max block size
      }
    }

    // Wait for complete block
    if (this.handshakeBuffer.length < expectedSize) {
      return false;
    }

    // Extract block
    const block = this.handshakeBuffer.slice(0, expectedSize);
    this.handshakeBuffer = this.handshakeBuffer.slice(expectedSize);

    // Verify checksums
    if (!verifyBlockChecksums(block)) {
console.log('[PUNTER] Block checksum error');
      this.send(BAD);
      this.retryCount++;
      if (this.retryCount > this.maxRetries) {
        this.finish(false, 'Max retries exceeded');
      }
      return true;
    }

    // Process block based on phase
    if (this.phase === 'A') {
      // File type block
      this.receivedFileType = block[7];
console.log(`[PUNTER] Received file type: ${this.receivedFileType === FILE_TYPE_PRG ? 'PRG' : 'SEQ'}`);
      this.send(GOO);
      this.state = 'wait_ack_phase_a';
    } else {
      // Data block
      const blockIdx = block[5] | (block[6] << 8);
      const isLastBlock = blockIdx === LAST_BLOCK_INDEX;

      if (block.length > HEADER_SIZE) {
        const payload = block.slice(HEADER_SIZE);
        this.receivedData.push(payload);
        this.bytesTransferred += payload.length;

        if (this.options.onProgress) {
          this.options.onProgress(this.bytesTransferred, 0);
        }
      }

console.log(`[PUNTER] Received block ${blockIdx}${isLastBlock ? ' (last)' : ''}`);

      if (isLastBlock) {
        this.send(GOO);
        this.state = 'wait_final_ack';
      } else {
        this.send(GOO);
        this.state = 'wait_block';
      }
    }

    return true;
  }

  /**
   * Handle GOO handshake
   */
  private handleGOO(): void {
console.log(`[PUNTER] Received GOO in state ${this.state}`);

    switch (this.state) {
      case 'wait_goo1':
        if (this.direction === 'send') {
          this.send(GOO);
          this.state = 'wait_ack1';
        } else {
          this.send(GOO);
          this.state = 'wait_goo2';
        }
        break;

      case 'wait_goo2':
        this.send(ACK);
        this.state = 'wait_sb';
        break;

      case 'wait_block_ack':
        // Block acknowledged, send next
        this.retryCount = 0;
        this.sendNextBlock();
        break;

      case 'wait_final_ack':
        // Transfer complete
        this.saveReceivedFile();
        this.finish(true);
        break;
    }
  }

  /**
   * Handle BAD handshake (checksum error, resend)
   */
  private handleBAD(): void {
console.log(`[PUNTER] Received BAD - checksum error`);
    this.retryCount++;

    if (this.retryCount > this.maxRetries) {
      this.finish(false, 'Max retries exceeded');
      return;
    }

    if (this.lastSentBlock) {
      this.send(this.lastSentBlock);
    }
  }

  /**
   * Handle ACK handshake
   */
  private handleACK(): void {
console.log(`[PUNTER] Received ACK in state ${this.state}`);

    switch (this.state) {
      case 'wait_ack1':
        this.send(SB);
        this.state = 'send_type_block';
        this.sendTypeBlock();
        break;

      case 'wait_ack_phase_a':
        this.send(SB);
        this.phase = 'B';
        this.state = 'wait_block';
        break;

      case 'wait_ack_phase_b':
        this.send(SB);
        this.state = 'wait_block';
        break;
    }
  }

  /**
   * Handle S/B handshake
   */
  private handleSB(): void {
console.log(`[PUNTER] Received S/B in state ${this.state}`);

    switch (this.state) {
      case 'wait_sb':
        this.state = 'wait_block';
        break;

      case 'send_next_block':
        this.sendNextBlock();
        break;
    }
  }

  /**
   * Handle SYN handshake
   */
  private handleSYN(): void {
console.log(`[PUNTER] Received SYN in state ${this.state}`);

    // SYN typically signals end of transfer handshake
    if (this.state === 'wait_syn') {
      this.send(SYN);
      this.send(SB);
      if (this.direction === 'receive') {
        this.saveReceivedFile();
      }
      this.finish(true);
    }
  }

  /**
   * Send file type block (Phase A)
   */
  private sendTypeBlock(): void {
    // 8-byte block: 7 header + 1 file type
    const block = Buffer.alloc(8);

    // Block index 0 for type block
    block[5] = 0;
    block[6] = 0;

    // Next block size (header-only for Phase B start)
    block[4] = 0;

    // File type
    block[7] = this.fileType;

    // Calculate checksums
    setBlockChecksums(block);

    this.lastSentBlock = block;
    this.send(block);
    this.state = 'wait_block_ack';
  }

  /**
   * Send next data block
   */
  private sendNextBlock(): void {
    if (!this.fileData) {
      return;
    }

    const offset = this.blockIndex * MAX_PAYLOAD_SIZE;

    if (offset >= this.fileSize) {
      // All data sent, send final block with index 0xFFFF
console.log('[PUNTER] All blocks sent, sending final block');
      this.sendFinalBlock();
      return;
    }

    // Calculate payload for this block
    const remaining = this.fileSize - offset;
    const payloadSize = Math.min(MAX_PAYLOAD_SIZE, remaining);
    const payload = this.fileData.slice(offset, offset + payloadSize);

    // Calculate next block's size
    const nextOffset = offset + payloadSize;
    const nextRemaining = this.fileSize - nextOffset;
    const nextBlockSize = nextRemaining > 0 ? Math.min(MAX_PAYLOAD_SIZE, nextRemaining) : 0;

    // Build block
    const block = Buffer.alloc(HEADER_SIZE + payloadSize);

    // Block index (little-endian)
    block[5] = this.blockIndex & 0xFF;
    block[6] = (this.blockIndex >> 8) & 0xFF;

    // Next block size
    block[4] = nextBlockSize;

    // Copy payload
    payload.copy(block, HEADER_SIZE);

    // Calculate checksums
    setBlockChecksums(block);

    this.lastSentBlock = block;
    this.blockIndex++;
    this.bytesTransferred = offset + payloadSize;

    if (this.options.onProgress) {
      this.options.onProgress(this.bytesTransferred, this.fileSize);
    }

console.log(`[PUNTER] Sending block ${this.blockIndex - 1} (${payloadSize} bytes)`);
    this.send(block);
    this.state = 'wait_block_ack';
  }

  /**
   * Send final block (index 0xFFFF)
   */
  private sendFinalBlock(): void {
    const block = Buffer.alloc(HEADER_SIZE);

    // Final block index
    block[5] = 0xFF;
    block[6] = 0xFF;

    // No next block
    block[4] = 0;

    // Calculate checksums
    setBlockChecksums(block);

    this.lastSentBlock = block;
console.log('[PUNTER] Sending final block');
    this.send(block);
    this.state = 'wait_final_goo';
  }

  /**
   * Cancel the transfer
   */
  cancel(): void {
    if (!this.active) return;
    this.cancelled = true;
    this.finish(false, 'Cancelled by user');
  }

  /**
   * Save received file to disk
   */
  private saveReceivedFile(): void {
    if (this.receivedData.length === 0) {
console.log('[PUNTER] No data received');
      return;
    }

    // Combine all blocks
    const fullData = Buffer.concat(this.receivedData);

    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, fullData);
console.log(`[PUNTER] File saved: ${this.filePath} (${fullData.length} bytes)`);
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

console.log(`[PUNTER] Timeout in state ${this.state}, retry ${this.retryCount}/${this.maxRetries}`);

    // Resend appropriate response based on state
    if (this.lastSentBlock && this.state.includes('wait_block')) {
      this.send(this.lastSentBlock);
    } else {
      // Resend S/B for sync
      this.send(SB);
    }

    this.startTimeout();
  }

  /**
   * Finish transfer
   */
  private finish(success: boolean, error?: string): void {
    this.clearTimeout();
    this.active = false;

    if (error) {
console.log(`[PUNTER] Transfer failed: ${error}`);
      if (this.options.onError) {
        this.options.onError(error);
      }
    } else {
console.log(`[PUNTER] Transfer complete: ${this.bytesTransferred} bytes`);
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

  /**
   * Get received file type
   */
  getReceivedFileType(): PunterFileType {
    return this.receivedFileType === FILE_TYPE_PRG ? 'prg' : 'seq';
  }
}

export default PunterTransferManager;
