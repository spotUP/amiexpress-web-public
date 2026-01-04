/**
 * MessageFileManager - Manages AmiExpress .msg binary message files
 *
 * Creates and maintains message files in format:
 * - Conf{n}/Messages/{msgnum}.msg
 *
 * File format (from express.e line 10662-10700):
 * - mailHeader struct (110 bytes) - NOT written separately, embedded in .msg file
 * - Message body (text lines)
 *
 * Text .msg format (actual format used):
 * Line 1: From name
 * Line 2: To name
 * Line 3: Subject
 * Line 4: Date/time
 * Line 5: Message ID
 * Line 6+: Message body text
 *
 * References:
 * - axobjects.e:179-188 - mailHeader struct (110 bytes)
 * - express.e:10660-10700 - Message writing code
 * - express.e:8953-8964 - Message reading code
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Message } from '../database';

interface MailHeader {
  status: number;      // CHAR (1 byte) - 0=unread, 1=read, 2=deleted
  msgNumb: number;     // LONG (4 bytes)
  toName: string;      // CHAR[31] (31 bytes)
  fromName: string;    // CHAR[31] (31 bytes)
  subject: string;     // CHAR[31] (31 bytes)
  msgDate: number;     // LONG (4 bytes) - Unix timestamp
  recv: number;        // LONG (4 bytes) - Receive timestamp
  extMsgNum: number;   // INT (2 bytes) - External message number
}

export class MessageFileManager {
  private readonly MAILHEADER_SIZE = 110;
  private bbsRoot: string;

  constructor() {
    // Path resolution: 4 levels up from src/services/ to project root
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
  }

  /**
   * Get the Messages directory path for a conference
   */
  private getMessagesDir(confNumber: number): string {
    return path.join(this.bbsRoot, `Conf${confNumber}`, 'Messages');
  }

  /**
   * Get the path for a specific message file
   */
  private getMessagePath(confNumber: number, msgNumber: number): string {
    return path.join(this.getMessagesDir(confNumber), `${msgNumber}.msg`);
  }

  /**
   * Ensure Messages directory exists for a conference
   */
  private ensureMessagesDir(confNumber: number): void {
    const dir = this.getMessagesDir(confNumber);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
console.log(`[MessageFileManager] Created directory: ${dir}`);
    }
  }

  /**
   * Format timestamp as AmiExpress expects: "DD-Mon-YY HH:MM:SS"
   */
  private formatDateTime(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Write a message to disk in AmiExpress text format
   *
   * Format (from express.e:10662-10700):
   * Line 1: fromName
   * Line 2: toName
   * Line 3: subject
   * Line 4: formatted date/time
   * Line 5: message ID (or empty)
   * Line 6+: message body (each line)
   */
  writeMessageFile(message: Message, confNumber: number, msgNumber: number): void {
    try {
      this.ensureMessagesDir(confNumber);
      const filePath = this.getMessagePath(confNumber, msgNumber);

      // Build message content in AmiExpress format
      const lines: string[] = [];

      // Line 1: From name
      lines.push(message.author || 'Unknown');

      // Line 2: To name (empty for public messages)
      lines.push(message.toUser || '');

      // Line 3: Subject
      lines.push(message.subject || 'No Subject');

      // Line 4: Formatted date/time
      const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
      lines.push(this.formatDateTime(timestamp));

      // Line 5: Message ID (use database ID)
      lines.push(String(message.id));

      // Line 6+: Message body (split by newlines)
      const bodyLines = (message.body || '').split('\n');
      lines.push(...bodyLines);

      // Write file with Unix line endings (LF)
      // AmiExpress uses Write() which doesn't add CR, so we use \n
      const content = lines.join('\n');
      fs.writeFileSync(filePath, content, 'utf8');

console.log(`[MessageFileManager] Wrote message ${msgNumber} to ${filePath}`);
    } catch (error) {
console.error(`[MessageFileManager] Error writing message ${msgNumber}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing message file
   */
  updateMessageFile(message: Message, confNumber: number, msgNumber: number): void {
    // Same as write - overwrites the file
    this.writeMessageFile(message, confNumber, msgNumber);
  }

  /**
   * Delete a message file from disk
   */
  deleteMessageFile(confNumber: number, msgNumber: number): void {
    try {
      const filePath = this.getMessagePath(confNumber, msgNumber);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
console.log(`[MessageFileManager] Deleted message ${msgNumber} from ${filePath}`);
      } else {
console.warn(`[MessageFileManager] Message file not found: ${filePath}`);
      }
    } catch (error) {
console.error(`[MessageFileManager] Error deleting message ${msgNumber}:`, error);
      throw error;
    }
  }

  /**
   * Read a message file from disk (for verification/debugging)
   */
  readMessageFile(confNumber: number, msgNumber: number): {
    fromName: string;
    toName: string;
    subject: string;
    date: string;
    messageId: string;
    body: string;
  } | null {
    try {
      const filePath = this.getMessagePath(confNumber, msgNumber);

      if (!fs.existsSync(filePath)) {
console.warn(`[MessageFileManager] Message file not found: ${filePath}`);
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      if (lines.length < 5) {
console.error(`[MessageFileManager] Invalid message format in ${filePath}`);
        return null;
      }

      return {
        fromName: lines[0] || '',
        toName: lines[1] || '',
        subject: lines[2] || '',
        date: lines[3] || '',
        messageId: lines[4] || '',
        body: lines.slice(5).join('\n')
      };
    } catch (error) {
console.error(`[MessageFileManager] Error reading message ${msgNumber}:`, error);
      return null;
    }
  }

  /**
   * Get the next available message number for a conference
   */
  getNextMessageNumber(confNumber: number): number {
    this.ensureMessagesDir(confNumber);
    const dir = this.getMessagesDir(confNumber);

    if (!fs.existsSync(dir)) {
      return 1;
    }

    const files = fs.readdirSync(dir);
    let maxNum = 0;

    for (const file of files) {
      if (file.endsWith('.msg')) {
        const num = parseInt(file.replace('.msg', ''), 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }

    return maxNum + 1;
  }

  /**
   * List all message files in a conference
   */
  listMessageFiles(confNumber: number): number[] {
    this.ensureMessagesDir(confNumber);
    const dir = this.getMessagesDir(confNumber);

    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir);
    const msgNumbers: number[] = [];

    for (const file of files) {
      if (file.endsWith('.msg')) {
        const num = parseInt(file.replace('.msg', ''), 10);
        if (!isNaN(num)) {
          msgNumbers.push(num);
        }
      }
    }

    return msgNumbers.sort((a, b) => a - b);
  }

  /**
   * Initialize message directories for existing conferences
   */
  initializeMessageDirs(): void {
console.log('[MessageFileManager] Initializing message directories...');

    // Create directories for Conf1 through Conf10 if they don't exist
    for (let i = 1; i <= 10; i++) {
      this.ensureMessagesDir(i);
    }

console.log('[MessageFileManager] Message directories initialized');
  }
}

// Export singleton instance
export const messageFileManager = new MessageFileManager();
