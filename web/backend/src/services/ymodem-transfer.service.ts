/**
 * YMODEM File Transfer Protocol Implementation
 *
 * YMODEM is an extension of XMODEM with batch file transfer support.
 * Key features:
 * - Block 0 header with filename, size, and optional timestamp
 * - Batch transfers (multiple files in one session)
 * - 1024-byte blocks (STX) and 128-byte blocks (SOH)
 * - CRC-16 as default error detection
 *
 * Control Characters (same as XMODEM):
 * - SOH (0x01): Start of 128-byte block
 * - STX (0x02): Start of 1024-byte block
 * - EOT (0x04): End of transmission
 * - ACK (0x06): Positive acknowledgment
 * - NAK (0x15): Negative acknowledgment
 * - CAN (0x18): Cancel transfer
 * - C   (0x43): CRC mode request
 *
 * Block 0 Format (filename block):
 * [SOH/STX] [00] [FF] [filename\0size timestamp mode serialno\0...] [CRC16]
 * - filename: null-terminated ASCII string
 * - size: decimal string (optional)
 * - timestamp: octal Unix timestamp (optional)
 * - Empty block 0 signals end of batch
 *
 * Data Block Format:
 * [SOH/STX] [SEQ] [~SEQ] [DATA...] [CRC16]
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { CONTROL_CHARS, calculateCRC16 } from '../utils/transfer-protocol.util';

// Control characters (re-export for compatibility)
const SOH = CONTROL_CHARS.SOH;  // 128-byte block header
const STX = CONTROL_CHARS.STX;  // 1024-byte block header
const EOT = CONTROL_CHARS.EOT;  // End of transmission
const ACK = CONTROL_CHARS.ACK;  // Positive acknowledgment
const NAK = CONTROL_CHARS.NAK;  // Negative acknowledgment
const CAN = CONTROL_CHARS.CAN;  // Cancel
const C = 0x43;    // 'C' - CRC mode request
const SUB = CONTROL_CHARS.SUB;  // Padding byte (Ctrl-Z)

export type YmodemMode = 'standard' | 'g';  // YMODEM or YMODEM-G (streaming)
export type TransferDirection = 'send' | 'receive';

export interface YmodemOptions {
  mode?: YmodemMode;
  timeout?: number;      // Timeout in ms (default: 10000)
  maxRetries?: number;   // Max retries per block (default: 10)
  use1kBlocks?: boolean; // Use 1024-byte blocks (default: true)
  onProgress?: (filename: string, sent: number, total: number) => void;
  onFileStart?: (filename: string, size: number) => void;
  onFileComplete?: (filename: string, success: boolean) => void;
  onError?: (error: string) => void;
  onComplete?: (success: boolean, files: string[]) => void;
}

export interface FileToSend {
  path: string;
  name?: string;  // Override filename if desired
}

/**
 * YMODEM Transfer Manager
 * Handles batch file transfers using YMODEM protocol
 */
export class YmodemTransferManager extends EventEmitter {
  private mode: YmodemMode;
  private timeout: number;
  private maxRetries: number;
  private use1kBlocks: boolean;
  private active: boolean = false;
  private cancelled: boolean = false;

  // Transfer state
  private direction: TransferDirection = 'send';
  private files: FileToSend[] = [];
  private currentFileIndex: number = 0;
  private currentFile: { name: string; data: Buffer; size: number } | null = null;
  private bytesTransferred: number = 0;
  private blockNumber: number = 0;
  private retryCount: number = 0;
  private receiveBuffer: Buffer = Buffer.alloc(0);
  private receivedBlocks: Buffer[] = [];
  private lastSentBlock: Buffer | null = null;
  private completedFiles: string[] = [];

  // Receive state
  private receivePath: string = '';
  private expectedFileSize: number = 0;
  private currentReceiveFilename: string = '';

  // State machine
  private state: string = 'idle';
  private timeoutHandle: NodeJS.Timeout | null = null;

  // Callbacks
  private sendCallback: ((data: Buffer) => void) | null = null;
  private options: YmodemOptions;

  constructor(options: YmodemOptions = {}) {
    super();
    this.mode = options.mode || 'standard';
    this.timeout = options.timeout || 10000;
    this.maxRetries = options.maxRetries || 10;
    this.use1kBlocks = options.use1kBlocks !== false;  // Default true
    this.options = options;
  }

  /**
   * Set the send callback for transmitting data
   */
  setSendCallback(callback: (data: Buffer) => void): void {
    this.sendCallback = callback;
  }

  /**
   * Start sending files (batch transfer)
   */
  async startSend(files: FileToSend[]): Promise<void> {
    if (this.active) {
      throw new Error('Transfer already in progress');
    }

    // Validate all files exist
    for (const file of files) {
      if (!fs.existsSync(file.path)) {
        throw new Error(`File not found: ${file.path}`);
      }
    }

    this.files = files;
    this.currentFileIndex = 0;
    this.completedFiles = [];
    this.direction = 'send';
    this.active = true;
    this.cancelled = false;
    this.state = 'waiting_start';

    console.log(`[YMODEM] Starting batch send: ${files.length} file(s)`);

    // Wait for receiver to send 'C' (CRC mode)
    this.startTimeout();
  }

  /**
   * Start receiving files
   */
  async startReceive(destinationPath: string): Promise<void> {
    if (this.active) {
      throw new Error('Transfer already in progress');
    }

    this.receivePath = destinationPath;
    this.direction = 'receive';
    this.completedFiles = [];
    this.active = true;
    this.cancelled = false;
    this.state = 'waiting_block0';
    this.receivedBlocks = [];

    // Ensure destination exists
    if (!fs.existsSync(destinationPath)) {
      fs.mkdirSync(destinationPath, { recursive: true });
    }

    console.log(`[YMODEM] Starting batch receive to: ${destinationPath}`);

    // Send 'C' to request CRC mode and block 0
    this.send(Buffer.from([C]));
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
          if (byte === C) {
            console.log('[YMODEM] Receiver requested CRC mode');
            this.sendBlock0();
          } else if (byte === NAK) {
            // Checksum mode not supported in YMODEM
            console.log('[YMODEM] NAK received, resending C request');
            this.retryCount++;
            if (this.retryCount > this.maxRetries) {
              this.finish(false, 'Receiver does not support CRC mode');
              return;
            }
            this.startTimeout();
          } else if (byte === CAN) {
            this.handleCancel();
            return;
          }
          break;

        case 'waiting_block0_ack':
          if (byte === ACK) {
            // Block 0 acknowledged, wait for 'C' to start data
            this.state = 'waiting_data_start';
            this.startTimeout();
          } else if (byte === NAK || byte === C) {
            // Resend block 0
            this.retryBlock();
          } else if (byte === CAN) {
            this.handleCancel();
            return;
          }
          break;

        case 'waiting_data_start':
          if (byte === C) {
            // Start sending data blocks
            this.blockNumber = 1;
            this.bytesTransferred = 0;
            this.state = 'sending_data';
            this.sendNextDataBlock();
          } else if (byte === NAK) {
            this.retryBlock();
          } else if (byte === CAN) {
            this.handleCancel();
            return;
          }
          break;

        case 'sending_data':
          if (byte === ACK) {
            this.retryCount = 0;
            this.blockNumber = (this.blockNumber % 255) + 1;
            this.sendNextDataBlock();
          } else if (byte === NAK) {
            this.retryBlock();
          } else if (byte === CAN) {
            this.handleCancel();
            return;
          }
          break;

        case 'waiting_eot_ack':
          if (byte === NAK) {
            // First NAK after EOT, send EOT again
            this.send(Buffer.from([EOT]));
            this.state = 'waiting_eot_ack2';
            this.startTimeout();
          } else if (byte === ACK) {
            // File complete, move to next file
            this.fileComplete(true);
          } else if (byte === CAN) {
            this.handleCancel();
            return;
          }
          break;

        case 'waiting_eot_ack2':
          if (byte === ACK) {
            // File complete
            this.fileComplete(true);
          } else if (byte === CAN) {
            this.handleCancel();
            return;
          }
          break;

        case 'waiting_final_ack':
          if (byte === ACK) {
            // Batch transfer complete
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
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

    while (this.receiveBuffer.length > 0) {
      const firstByte = this.receiveBuffer[0];

      // Check for EOT
      if (firstByte === EOT) {
        this.receiveBuffer = this.receiveBuffer.slice(1);

        if (this.state === 'receiving_data') {
          // File complete, send NAK then ACK (YMODEM protocol)
          this.send(Buffer.from([NAK]));
          this.state = 'waiting_eot2';
        } else if (this.state === 'waiting_eot2') {
          // Second EOT, save file and wait for next file or end
          this.send(Buffer.from([ACK]));
          this.saveCurrentFile();
          this.state = 'waiting_block0';
          this.send(Buffer.from([C]));  // Request next file's block 0
        }
        continue;
      }

      // Check for CAN
      if (firstByte === CAN) {
        if (this.receiveBuffer.length >= 2 && this.receiveBuffer[1] === CAN) {
          this.handleCancel();
          return;
        }
      }

      // Determine block type
      let blockSize: number;
      if (firstByte === SOH) {
        blockSize = 128;
      } else if (firstByte === STX) {
        blockSize = 1024;
      } else {
        // Unknown byte, discard
        this.receiveBuffer = this.receiveBuffer.slice(1);
        continue;
      }

      // Calculate expected packet size: header(1) + seq(1) + ~seq(1) + data + CRC(2)
      const packetSize = 1 + 1 + 1 + blockSize + 2;

      if (this.receiveBuffer.length < packetSize) {
        // Need more data
        this.startTimeout();
        return;
      }

      // Extract packet
      const packet = this.receiveBuffer.slice(0, packetSize);
      this.receiveBuffer = this.receiveBuffer.slice(packetSize);

      const seqNum = packet[1];
      const seqComp = packet[2];
      const blockData = packet.slice(3, 3 + blockSize);
      const receivedCRC = (packet[3 + blockSize] << 8) | packet[3 + blockSize + 1];

      // Validate sequence complement
      if ((seqNum ^ seqComp) !== 0xFF) {
        console.log('[YMODEM] Sequence complement mismatch');
        this.send(Buffer.from([NAK]));
        continue;
      }

      // Validate CRC
      const calculatedCRC = calculateCRC16(blockData);
      if (receivedCRC !== calculatedCRC) {
        console.log('[YMODEM] CRC mismatch');
        this.send(Buffer.from([NAK]));
        continue;
      }

      // Process block based on state
      if (this.state === 'waiting_block0') {
        if (seqNum === 0) {
          this.processBlock0(blockData);
        }
      } else if (this.state === 'receiving_data') {
        if (seqNum === (this.blockNumber & 0xFF)) {
          this.receivedBlocks.push(blockData);
          this.bytesTransferred += blockSize;
          this.blockNumber++;

          if (this.options.onProgress && this.currentReceiveFilename) {
            this.options.onProgress(
              this.currentReceiveFilename,
              this.bytesTransferred,
              this.expectedFileSize
            );
          }

          this.send(Buffer.from([ACK]));
        } else {
          // Duplicate or out of sequence
          this.send(Buffer.from([ACK]));  // ACK duplicate
        }
      }
    }

    this.startTimeout();
  }

  /**
   * Process block 0 (filename block)
   */
  private processBlock0(data: Buffer): void {
    // Find null terminator for filename
    let nullPos = data.indexOf(0);
    if (nullPos === -1) {
      nullPos = data.length;
    }

    const filename = data.slice(0, nullPos).toString('ascii').trim();

    if (filename === '') {
      // Empty filename = end of batch
      console.log('[YMODEM] End of batch signaled');
      this.send(Buffer.from([ACK]));
      this.finish(true);
      return;
    }

    // Parse size and other metadata after filename
    let fileSize = 0;
    if (nullPos + 1 < data.length) {
      const metadata = data.slice(nullPos + 1);
      const metaNull = metadata.indexOf(0);
      const metaStr = metadata.slice(0, metaNull > 0 ? metaNull : metadata.length).toString('ascii');
      const parts = metaStr.trim().split(' ');
      if (parts.length > 0 && parts[0]) {
        fileSize = parseInt(parts[0], 10) || 0;
      }
    }

    console.log(`[YMODEM] Receiving file: ${filename} (${fileSize} bytes)`);

    this.currentReceiveFilename = filename;
    this.expectedFileSize = fileSize;
    this.receivedBlocks = [];
    this.bytesTransferred = 0;
    this.blockNumber = 1;

    if (this.options.onFileStart) {
      this.options.onFileStart(filename, fileSize);
    }

    // ACK block 0, then send 'C' to start data transfer
    this.send(Buffer.from([ACK]));
    this.state = 'receiving_data';
    this.send(Buffer.from([C]));
  }

  /**
   * Save the currently received file
   */
  private saveCurrentFile(): void {
    if (this.receivedBlocks.length === 0 || !this.currentReceiveFilename) {
      return;
    }

    // Combine all blocks
    let fullData = Buffer.concat(this.receivedBlocks);

    // Trim to actual file size if known
    if (this.expectedFileSize > 0 && fullData.length > this.expectedFileSize) {
      fullData = fullData.slice(0, this.expectedFileSize);
    }

    const filePath = path.join(this.receivePath, this.currentReceiveFilename);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, fullData);
    console.log(`[YMODEM] File saved: ${filePath} (${fullData.length} bytes)`);

    this.completedFiles.push(filePath);

    if (this.options.onFileComplete) {
      this.options.onFileComplete(this.currentReceiveFilename, true);
    }

    // Reset for next file
    this.currentReceiveFilename = '';
    this.expectedFileSize = 0;
    this.receivedBlocks = [];
  }

  /**
   * Send block 0 (filename block) for current file
   */
  private sendBlock0(): void {
    if (this.currentFileIndex >= this.files.length) {
      // No more files, send empty block 0 to signal end of batch
      this.sendEmptyBlock0();
      return;
    }

    const fileInfo = this.files[this.currentFileIndex];
    const fileData = fs.readFileSync(fileInfo.path);
    const filename = fileInfo.name || path.basename(fileInfo.path);
    const fileSize = fileData.length;
    const mtime = fs.statSync(fileInfo.path).mtime;

    this.currentFile = {
      name: filename,
      data: fileData,
      size: fileSize
    };

    console.log(`[YMODEM] Sending file ${this.currentFileIndex + 1}/${this.files.length}: ${filename} (${fileSize} bytes)`);

    if (this.options.onFileStart) {
      this.options.onFileStart(filename, fileSize);
    }

    // Build block 0: filename\0size timestamp\0padding
    const blockSize = this.use1kBlocks ? 1024 : 128;
    const blockData = Buffer.alloc(blockSize, 0);

    // Filename (null terminated)
    const filenameBytes = Buffer.from(filename, 'ascii');
    filenameBytes.copy(blockData, 0);

    // Size and timestamp (after null terminator)
    const timestamp = Math.floor(mtime.getTime() / 1000);
    const metadata = `${fileSize} ${timestamp.toString(8)}`;
    Buffer.from(metadata, 'ascii').copy(blockData, filenameBytes.length + 1);

    // Build packet
    const headerByte = blockSize === 1024 ? STX : SOH;
    const crc = calculateCRC16(blockData);

    const packet = Buffer.alloc(1 + 1 + 1 + blockSize + 2);
    packet[0] = headerByte;
    packet[1] = 0;    // Block 0
    packet[2] = 0xFF; // Complement
    blockData.copy(packet, 3);
    packet[3 + blockSize] = (crc >> 8) & 0xFF;
    packet[3 + blockSize + 1] = crc & 0xFF;

    this.lastSentBlock = packet;
    this.send(packet);
    this.state = 'waiting_block0_ack';
    this.startTimeout();
  }

  /**
   * Send empty block 0 to signal end of batch
   */
  private sendEmptyBlock0(): void {
    const blockSize = 128;  // Empty block 0 uses 128 bytes
    const blockData = Buffer.alloc(blockSize, 0);

    const crc = calculateCRC16(blockData);

    const packet = Buffer.alloc(1 + 1 + 1 + blockSize + 2);
    packet[0] = SOH;
    packet[1] = 0;
    packet[2] = 0xFF;
    blockData.copy(packet, 3);
    packet[3 + blockSize] = (crc >> 8) & 0xFF;
    packet[3 + blockSize + 1] = crc & 0xFF;

    this.lastSentBlock = packet;
    this.send(packet);
    this.state = 'waiting_final_ack';
    this.startTimeout();

    console.log('[YMODEM] Sent end-of-batch marker');
  }

  /**
   * Send next data block
   */
  private sendNextDataBlock(): void {
    if (!this.currentFile) {
      return;
    }

    const blockSize = this.use1kBlocks ? 1024 : 128;
    const offset = (this.blockNumber - 1) * blockSize;

    if (offset >= this.currentFile.size) {
      // All data sent, send EOT
      console.log(`[YMODEM] All blocks sent for ${this.currentFile.name}, sending EOT`);
      this.send(Buffer.from([EOT]));
      this.state = 'waiting_eot_ack';
      this.startTimeout();
      return;
    }

    // Get block data, pad with SUB if necessary
    const remaining = this.currentFile.size - offset;
    const dataSize = Math.min(blockSize, remaining);
    const blockData = Buffer.alloc(blockSize, SUB);
    this.currentFile.data.copy(blockData, 0, offset, offset + dataSize);

    // Build packet
    const headerByte = blockSize === 1024 ? STX : SOH;
    const seqNum = this.blockNumber & 0xFF;
    const seqComp = (~seqNum) & 0xFF;
    const crc = calculateCRC16(blockData);

    const packet = Buffer.alloc(1 + 1 + 1 + blockSize + 2);
    packet[0] = headerByte;
    packet[1] = seqNum;
    packet[2] = seqComp;
    blockData.copy(packet, 3);
    packet[3 + blockSize] = (crc >> 8) & 0xFF;
    packet[3 + blockSize + 1] = crc & 0xFF;

    this.lastSentBlock = packet;
    this.bytesTransferred = offset + dataSize;

    if (this.options.onProgress && this.currentFile) {
      this.options.onProgress(this.currentFile.name, this.bytesTransferred, this.currentFile.size);
    }

    this.send(packet);
    this.startTimeout();
  }

  /**
   * Retry sending last block
   */
  private retryBlock(): void {
    this.retryCount++;
    if (this.retryCount > this.maxRetries) {
      this.finish(false, 'Max retries exceeded');
      return;
    }

    console.log(`[YMODEM] Retry ${this.retryCount}/${this.maxRetries}`);

    if (this.lastSentBlock) {
      this.send(this.lastSentBlock);
      this.startTimeout();
    }
  }

  /**
   * Handle file completion
   */
  private fileComplete(success: boolean): void {
    if (this.currentFile) {
      console.log(`[YMODEM] File complete: ${this.currentFile.name}`);
      this.completedFiles.push(this.currentFile.name);

      if (this.options.onFileComplete) {
        this.options.onFileComplete(this.currentFile.name, success);
      }
    }

    this.currentFile = null;
    this.currentFileIndex++;
    this.retryCount = 0;

    // Wait for 'C' to send next file's block 0
    this.state = 'waiting_start';
    this.startTimeout();
  }

  /**
   * Handle cancel request
   */
  private handleCancel(): void {
    console.log('[YMODEM] Transfer cancelled by remote');
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

    console.log(`[YMODEM] Timeout, retry ${this.retryCount}/${this.maxRetries}`);

    if (this.direction === 'receive') {
      // Resend 'C' for CRC mode
      this.send(Buffer.from([C]));
    } else if (this.lastSentBlock) {
      this.send(this.lastSentBlock);
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
      console.log(`[YMODEM] Transfer failed: ${error}`);
      if (this.options.onError) {
        this.options.onError(error);
      }
    } else {
      console.log(`[YMODEM] Batch transfer complete: ${this.completedFiles.length} file(s)`);
    }

    if (this.options.onComplete) {
      this.options.onComplete(success, this.completedFiles);
    }

    this.emit('complete', success, this.completedFiles);
  }

  /**
   * Check if transfer is active
   */
  isActive(): boolean {
    return this.active;
  }
}

export default YmodemTransferManager;
