/**
 * XIM System Commands Handler
 *
 * Handles system-level XIM commands (registration, shutdown, chaining, etc).
 */

import { Socket } from 'socket.io';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { XIMMessage, BBSSessionData } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';

export class XIMSystemCommandsHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private socket: Socket;
  private messageParser: XIMMessageParser;
  private bbsSession: BBSSessionData;

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    socket: Socket,
    messageParser: XIMMessageParser,
    bbsSession: BBSSessionData
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.socket = socket;
    this.messageParser = messageParser;
    this.bbsSession = bbsSession;
  }

  /**
   * Handle door registration (JH_REGISTER)
   * From E sources (express.e:3379)
   */
  handleRegister(msg: XIMMessage): void {
    console.log('[XIMSystem] Door registering with BBS');

    // Reply with terminal line length (80 columns)
    this.sendReply(msg, 80);

    console.log('[XIMSystem] Registration acknowledged, line length=80');
  }

  /**
   * Handle door shutdown (JH_SHUTDOWN)
   */
  handleShutdown(msg: XIMMessage): void {
    console.log('[XIMSystem] Door requesting shutdown');

    this.sendReply(msg, 1);

    console.log('[XIMSystem] Door completed execution');
  }

  /**
   * Handle RAWARROW (Toggle Raw Arrow Keys)
   * From E sources (express.e:3814-3815)
   */
  handleRawArrow(msg: XIMMessage): void {
    console.log('[XIMSystem] RAWARROW: Toggle raw arrow mode (no-op in web)');
    this.sendReply(msg, 1);
  }

  /**
   * Handle RETURNCOMMAND / RETURNCOMMAND2
   * From E sources (express.e:3492-3493, 4064-4065)
   */
  handleReturnCommand(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    if (stringAddr !== 0) {
      const command = this.messageParser.readString(stringAddr, 200);
      console.log(`[XIMSystem] RETURNCOMMAND: "${command}"`);

      this.bbsSession.returnCommand = command;
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle CHAIN (Chain to Another Door)
   * From E sources (express.e:3386-3387)
   */
  handleChain(msg: XIMMessage): void {
    console.log('[XIMSystem] CHAIN: Door requesting chain to another door');

    this.sendReply(msg, 1);
  }

  /**
   * Handle ENVSTAT (Environment Status)
   * From E sources (express.e:3677-3683)
   */
  handleEnvStat(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    console.log('[XIMSystem] ENVSTAT - Environment status');

    if (msg.data !== 0) {
      const status = 0;
      this.messageParser.writeString(stringAddr, status.toString(), 10);
      console.log(`  [READ] Status: ${status}`);
    } else {
      const newStatus = this.messageParser.readString(stringAddr);
      console.log(`  [WRITE] Set status: ${newStatus}`);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle SV_NEWMSG (Server New Message)
   * From E sources (express.e:3684-3685)
   */
  handleSvNewMsg(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const message = this.messageParser.readString(stringAddr);

    console.log('[XIMSystem] SV_NEWMSG - Set server message');
    console.log(`  Message: "${message}"`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle PRV_COMMAND (Private Command)
   * From E sources (express.e:3816-3818)
   */
  handlePrvCommand(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const command = this.messageParser.readString(stringAddr);

    console.log('[XIMSystem] PRV_COMMAND - Execute BBS command');
    console.log(`  Command: "${command}"`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle PRV_GROUP (Private Group)
   * From E sources (express.e:3819-3830)
   */
  handlePrvGroup(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const groupData = this.messageParser.readString(stringAddr);

    console.log('[XIMSystem] PRV_GROUP - Modify group settings');
    console.log(`  Group data: "${groupData}"`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_SIGBIT (Signal Bit Query)
   * From E sources (express.e:3463-3464)
   */
  handleSignalBit(msg: XIMMessage): void {
    console.log('[XIMSystem] JH_SIGBIT - Query signal bits');

    this.emulator.writeMemory32(msg.msgAddr + 22, 0);
    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_MCI (MCI Processing)
   * From E sources (express.e:3456-3462)
   */
  handleMCI(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const text = this.messageParser.readString(stringAddr);

    console.log('[XIMSystem] JH_MCI - Process MCI codes');
    console.log(`  Text: "${text}"`);

    this.socket.emit('ansi-output', text);

    if (msg.data !== 0) {
      this.socket.emit('ansi-output', '\r\n');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_SG (Security Screen)
   * From E sources (express.e:3473-3474)
   */
  handleSecurityScreen(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const screenName = this.messageParser.readString(stringAddr);

    console.log('[XIMSystem] JH_SG - Display security screen');
    console.log(`  Screen: "${screenName}"`);

    this.socket.emit('ansi-output', `\r\n[Security screen: ${screenName}]\r\n`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_SF (Show File)
   * From E sources (express.e:3475-3476)
   */
  handleShowFile(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const fileName = this.messageParser.readString(stringAddr);

    console.log('[XIMSystem] JH_SF - Show file');
    console.log(`  File: "${fileName}"`);

    this.socket.emit('ansi-output', `\r\n[Display file: ${fileName}]\r\n`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_EF (Edit File)
   * From E sources (express.e:3477-3485, 1145-1154)
   */
  handleEditFile(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const fileName = this.messageParser.readString(stringAddr);

    console.log('[XIMSystem] JH_EF - Edit file');
    console.log(`  File: "${fileName}"`);

    this.emulator.writeMemory32(msg.msgAddr + 22, 1);
    console.log('  [SUCCESS] File edit acknowledged');

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_FLAGFILE (Flag File)
   * From E sources (express.e:3490-3491, 1160-1161)
   */
  handleFlagFile(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const fileName = this.messageParser.readString(stringAddr);

    console.log('[XIMSystem] JH_FLAGFILE - Flag file for download');
    console.log(`  File: "${fileName}"`);
    console.log('  [TODO] Add to download queue');

    this.sendReply(msg, 1);
  }

  /**
   * Send reply to door
   */
  private sendReply(msg: XIMMessage, data: number): void {
    this.emulator.writeMemory32(msg.msgAddr + 22, data);
    this.execLibrary.replyMsg(msg.msgAddr);
  }
}
