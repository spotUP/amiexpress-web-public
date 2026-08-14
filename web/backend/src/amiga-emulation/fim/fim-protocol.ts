/**
 * FIM ("FAME Interface Module") door protocol handler.
 *
 * Mirrors XIMProtocol's role for AEDoor.library-based doors, but for the
 * simpler FAME BBS FAMEDoorMsg message shape (see fim-constants.ts). A door
 * running under this protocol allocates a FAMEDoorMsg via FAME.library
 * (FameLibrary.allocObject), fills in COMMAND / DATA1-4 / IOSTRING, and
 * PutMsg()s it to "FAMEDoorPort<node>". ExecLibrary.putMsg() detects that port-name
 * prefix and forwards the message here via the fimMessageCallback wired in
 * AmigaDoorSession.
 *
 * Reply mechanics (copy XIM semantics — see XIMProtocol.ts / ExecLibrary
 * ReplyMsg): write FDOM.RETURNCODE, set the exec Message ln_Type byte at
 * msgAddr+8 to NT_REPLYMSG (6), read the reply port from
 * msgAddr+FDOM.MN_REPLYPORT, then execLibrary.putMsg(replyPort, msgAddr,
 * { suppressDoorCallback: true }) so the reply doesn't re-trigger the
 * doorMessageCallback / fimMessageCallback routing.
 */

import { MoiraEmulator } from "../cpu/MoiraEmulator";
import { FDOM, FIM_CMD, FIM_RC } from "./fim-constants";
import { debugLog } from "../../utils/debug-log";

const NT_REPLYMSG = 6;
const LN_TYPE_OFFSET = 8;

export interface FIMExecLibrary {
  putMsg(
    port: number,
    msg: number,
    opts?: { suppressDoorCallback?: boolean }
  ): void;
}

export interface FIMSocket {
  emit(ev: string, data?: string): boolean;
}

export interface FIMDeps {
  emulator: MoiraEmulator;
  execLibrary: FIMExecLibrary;
  socket: FIMSocket | null;
  bbsSession: Record<string, unknown>;
  nodeId: number;
  onShutdown(rc: number, lastWords?: string): void;
}

export class FIMProtocol {
  private emulator: MoiraEmulator;
  private execLibrary: FIMExecLibrary;
  private socket: FIMSocket | null;
  private bbsSession: Record<string, unknown>;
  private nodeId: number;
  private onShutdown: (rc: number, lastWords?: string) => void;

  /** Input queued via queueInput() for a future command that reads it. */
  private inputQueue: string[] = [];

  constructor(deps: FIMDeps) {
    this.emulator = deps.emulator;
    this.execLibrary = deps.execLibrary;
    this.socket = deps.socket;
    this.bbsSession = deps.bbsSession;
    this.nodeId = deps.nodeId;
    this.onShutdown = deps.onShutdown;
  }

  /**
   * Queue terminal input for the door to consume on its next input-style
   * command (NR_* / AR_GetKey etc, wired in later tasks). Skeleton for now.
   */
  queueInput(data: string): void {
    this.inputQueue.push(data);
  }

  /**
   * Handle a FAMEDoorMsg PutMsg()'d to FAMEDoorPort<node>. Always replies
   * (never hangs the door), even for commands not yet implemented.
   */
  handleMessage(msgAddr: number): void {
    const command = this.emulator.readMemory32(msgAddr + FDOM.COMMAND);

    switch (command) {
      case FIM_CMD.MC_DoorStart: {
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.MC_ShutDown: {
        this.reply(msgAddr, FIM_RC.OK);
        this.onShutdown(0);
        break;
      }

      case FIM_CMD.MC_ShutDownLastWords: {
        const lastWords = this.readCString(
          msgAddr + FDOM.IOSTRING,
          FDOM.IOSTRING_LEN
        );
        this.reply(msgAddr, FIM_RC.OK);
        this.onShutdown(0, lastWords);
        break;
      }

      default: {
        debugLog(`[FIM] not implemented: ${command}`);
        this.reply(msgAddr, FIM_RC.NOTIMPLEMENTED);
        break;
      }
    }
  }

  /**
   * Read a NUL-terminated Latin-1 (raw byte) C string from Amiga memory,
   * capped at `max` bytes.
   */
  private readCString(addr: number, max: number): string {
    let out = "";
    for (let i = 0; i < max; i++) {
      const byte = this.emulator.readMemory(addr + i);
      if (byte === 0) {
        break;
      }
      out += String.fromCharCode(byte);
    }
    return out;
  }

  /**
   * Write a NUL-terminated Latin-1 (raw byte) C string to Amiga memory,
   * capped at max-1 characters plus the terminating NUL.
   */
  private writeCString(addr: number, s: string, max: number): void {
    if (max <= 0) {
      return;
    }
    const limit = max - 1;
    let i = 0;
    for (; i < limit && i < s.length; i++) {
      this.emulator.writeMemory(addr + i, s.charCodeAt(i) & 0xff);
    }
    this.emulator.writeMemory(addr + i, 0);
  }

  /**
   * Reply to a FAMEDoorMsg: write the return code, mark the message as a
   * reply (NT_REPLYMSG), and PutMsg() it back to the door's reply port.
   */
  private reply(msgAddr: number, rc: number): void {
    this.emulator.writeMemory32(msgAddr + FDOM.RETURNCODE, rc >>> 0);
    this.emulator.writeMemory(msgAddr + LN_TYPE_OFFSET, NT_REPLYMSG);
    const replyPort = this.emulator.readMemory32(msgAddr + FDOM.MN_REPLYPORT);
    this.execLibrary.putMsg(replyPort, msgAddr, { suppressDoorCallback: true });
  }
}
