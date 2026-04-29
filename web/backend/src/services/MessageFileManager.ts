/**
 * MessageFileManager — thin wrapper around `utils/message-file.util.ts`.
 *
 * Express.e canonical layout: `<conf>/MsgBase/<msgNum>` (no extension, raw body).
 * This class exists for legacy callers (`message-repository.ts`,
 * `conference-repository.ts`); new code should call the util module directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Message } from '../database';
import { messageIndexManager, MsgStatus, MsgHeader } from './MessageIndexManager';

export class MessageFileManager {
  private bbsRoot: string;

  constructor() {
    // Path resolution: 4 levels up from src/services/ to project root
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
  }

  /** `<bbsRoot>/Conf{N}/MsgBase/` — express.e msgBaseLocation default. */
  private getMsgBaseDir(confNumber: number): string {
    return path.join(this.bbsRoot, `Conf${confNumber}`, 'MsgBase');
  }

  /** `<msgBaseLocation>/<msgNum>` — express.e:10694, no `.msg` extension. */
  private getMessagePath(confNumber: number, msgNumber: number): string {
    return path.join(this.getMsgBaseDir(confNumber), String(msgNumber));
  }

  private ensureMsgBaseDir(confNumber: number): void {
    const dir = this.getMsgBaseDir(confNumber);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Write raw message body to `<conf>/MsgBase/<msgNum>` and append a HeaderFile
   * entry. express.e:10700-10703 — body file holds nothing but raw lines;
   * headers (from/to/subj/date/recv/status) live in HeaderFile.
   */
  writeMessageFile(message: Message, confNumber: number, msgNumber: number): void {
    try {
      this.ensureMsgBaseDir(confNumber);
      const filePath = this.getMessagePath(confNumber, msgNumber);

      // express.e:10700-10703 — body lines only
      const body = message.body || '';
      const content = body.endsWith('\n') ? body : body + '\n';
      fs.writeFileSync(filePath, content, 'binary');

      // Append HeaderFile entry (skip if one already exists for this msgNum —
      // saveMessage in message-entry.handler may have written it already).
      const existing = messageIndexManager.readHeaderFile(confNumber)
        .find(h => h.msgNumb === msgNumber);
      if (!existing) {
        const isPrivate = !!message.isPrivate;
        const censored = (message as any).censored;
        const status: number = isPrivate
          ? MsgStatus.PRIVATE
          : (censored ? MsgStatus.CENSORED : MsgStatus.NORMAL);
        const ts = message.timestamp instanceof Date
          ? message.timestamp
          : new Date(message.timestamp);
        const header: MsgHeader = {
          status,
          msgNumb: msgNumber,
          toName: message.toUser || 'ALL',
          fromName: message.author || 'Unknown',
          subject: message.subject || '',
          msgDate: Math.floor(ts.getTime() / 1000),
          recv: 0,
          extMsgNum: -1,
        };
        messageIndexManager.appendMessageHeader(confNumber, header);
      }

console.log(`[MessageFileManager] Wrote msg ${msgNumber} to ${filePath}`);
    } catch (error) {
console.error(`[MessageFileManager] Error writing message ${msgNumber}:`, error);
      throw error;
    }
  }

  /** Same as write — overwrites the body file in place. */
  updateMessageFile(message: Message, confNumber: number, msgNumber: number): void {
    this.writeMessageFile(message, confNumber, msgNumber);
  }

  /** Delete the body file. HeaderFile status is updated via deleteMessageHeader. */
  deleteMessageFile(confNumber: number, msgNumber: number): void {
    try {
      const filePath = this.getMessagePath(confNumber, msgNumber);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
console.log(`[MessageFileManager] Deleted msg ${msgNumber} from ${filePath}`);
      }
    } catch (error) {
console.error(`[MessageFileManager] Error deleting message ${msgNumber}:`, error);
      throw error;
    }
  }

  /**
   * Returns the next msgNum to assign. Same semantic as
   * `messageIndexManager.getNextMessageNumber` (express.e: current high IS the
   * next id; saveMessageHeader bumps high+1 afterward).
   */
  getNextMessageNumber(confNumber: number): number {
    return messageIndexManager.getNextMessageNumber(confNumber);
  }

  /** List on-disk msg numbers (filenames in MsgBase/, no extension). */
  listMessageFiles(confNumber: number): number[] {
    this.ensureMsgBaseDir(confNumber);
    const dir = this.getMsgBaseDir(confNumber);
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir);
    const out: number[] = [];
    for (const file of files) {
      // Skip MailStats / HeaderFile / MailLock / non-numeric names
      const n = parseInt(file, 10);
      if (!isNaN(n) && String(n) === file) {
        out.push(n);
      }
    }
    return out.sort((a, b) => a - b);
  }

  /** Initialize MsgBase dirs for default conferences. */
  initializeMessageDirs(): void {
console.log('[MessageFileManager] Initializing MsgBase directories...');
    for (let i = 1; i <= 10; i++) {
      this.ensureMsgBaseDir(i);
    }
console.log('[MessageFileManager] MsgBase directories initialized');
  }
}

export const messageFileManager = new MessageFileManager();
