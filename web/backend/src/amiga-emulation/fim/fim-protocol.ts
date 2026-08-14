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

  /**
   * Type-ahead buffer: input that arrived via queueInput() while no command
   * was waiting for it. Drained by the next input-style command
   * (NR_PromptChars / AR_GetKey / NR_HotKey / AR_HotKey).
   */
  private inputQueue: string[] = [];

  /** Message currently deferred pending terminal input (paused emulator). */
  private pendingMsg: number | null = null;
  private pendingKind: "line" | "key" | null = null;
  /** NR_PromptChars Data2 mode for the pending line request (echo style). */
  private pendingMode = 0;

  constructor(deps: FIMDeps) {
    this.emulator = deps.emulator;
    this.execLibrary = deps.execLibrary;
    this.socket = deps.socket;
    this.bbsSession = deps.bbsSession;
    this.nodeId = deps.nodeId;
    this.onShutdown = deps.onShutdown;
  }

  /**
   * Deliver terminal input to the door. If a command is currently deferred
   * waiting for input (NR_PromptChars / AR_GetKey / NR_HotKey / AR_HotKey),
   * complete it and resume the emulator. Otherwise buffer the input
   * (type-ahead) for the next input-style command to consume.
   */
  queueInput(data: string): void {
    if (this.pendingMsg === null) {
      this.inputQueue.push(data);
      return;
    }
    const msgAddr = this.pendingMsg;
    const kind = this.pendingKind;
    this.pendingMsg = null;
    this.pendingKind = null;
    if (kind === "line") {
      this.completeLineInput(msgAddr, data, this.pendingMode);
    } else {
      this.completeKeyInput(msgAddr, data);
    }
    this.emulator.resume();
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

      case FIM_CMD.AR_SendStr: {
        const stringPtr = this.emulator.readMemory32(msgAddr + FDOM.STRINGPTR);
        if (stringPtr === 0) {
          this.reply(msgAddr, FIM_RC.FAIL);
          break;
        }
        const data1 = this.emulator.readMemory32(msgAddr + FDOM.DATA1);
        let text = this.readCString(stringPtr, FDOM.IOSTRING_LEN);
        if (data1 === 1) {
          text += "\r\n";
        }
        this.socket?.emit("ansi-output", text);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_SendStr:
      case FIM_CMD.NR_SendStrCRLF: {
        let text = this.readCString(msgAddr + FDOM.IOSTRING, FDOM.IOSTRING_LEN);
        if (command === FIM_CMD.NR_SendStrCRLF) {
          text += "\r\n";
        }
        this.socket?.emit("ansi-output", text);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_PromptChars: {
        this.handlePromptChars(msgAddr);
        break;
      }

      case FIM_CMD.AR_GetKey:
      case FIM_CMD.NR_HotKey:
      case FIM_CMD.AR_HotKey: {
        this.handleKeyCommand(msgAddr);
        break;
      }

      case FIM_CMD.CF_ShowText: {
        const name = this.readCString(msgAddr + FDOM.IOSTRING, FDOM.IOSTRING_LEN);
        debugLog(`[FIM] CF_ShowText ${name}`);
        this.reply(msgAddr, FIM_RC.NOTIMPLEMENTED);
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
   * NR_PromptChars (14): prompt-and-read-a-line. Data1=max chars,
   * Data2=echo mode (0 normal, 4 password echoed as '*'). Modes 1-3 are
   * denied for MVP (mode 2 is denied on real FAME too). IOString on entry
   * holds the prompt text, emitted before deferring for input.
   */
  private handlePromptChars(msgAddr: number): void {
    const mode = this.emulator.readMemory32(msgAddr + FDOM.DATA2);
    if (mode === 1 || mode === 2 || mode === 3) {
      this.reply(msgAddr, FIM_RC.DENIED);
      return;
    }

    const prompt = this.readCString(msgAddr + FDOM.IOSTRING, FDOM.IOSTRING_LEN);
    if (prompt.length > 0) {
      this.socket?.emit("ansi-output", prompt);
    }

    if (this.inputQueue.length > 0) {
      const line = this.inputQueue.shift()!;
      this.completeLineInput(msgAddr, line, mode);
      return;
    }

    this.pendingMsg = msgAddr;
    this.pendingKind = "line";
    this.pendingMode = mode;
    this.emulator.pause();
  }

  /**
   * Complete a deferred (or type-ahead-answered) NR_PromptChars: strip a
   * trailing CR/LF, cap at 201 chars, write into IOSTRING NUL-terminated,
   * echo what was typed (masked with '*' for password mode), and reply OK.
   */
  private completeLineInput(msgAddr: number, rawLine: string, mode: number): void {
    const line = rawLine.replace(/[\r\n]+$/, "").slice(0, 201);
    this.socket?.emit("ansi-output", mode === 4 ? "*".repeat(line.length) : line);
    this.writeCString(msgAddr + FDOM.IOSTRING, line, FDOM.IOSTRING_LEN);
    this.reply(msgAddr, FIM_RC.OK);
  }

  /**
   * AR_GetKey (800) / NR_HotKey (15) / AR_HotKey (861): read a single key.
   * If input is already type-ahead buffered, answer synchronously without
   * pausing the emulator; otherwise defer until queueInput() delivers a key.
   */
  private handleKeyCommand(msgAddr: number): void {
    if (this.inputQueue.length > 0) {
      const key = this.inputQueue.shift()!;
      this.completeKeyInput(msgAddr, key);
      return;
    }

    this.pendingMsg = msgAddr;
    this.pendingKind = "key";
    this.emulator.pause();
  }

  /**
   * Complete a deferred (or type-ahead-answered) key command: per
   * FAMEDoorCommands.h the key code returns in Data3; we also write it as
   * the first (NUL-terminated) byte of IOString for doors that read it there.
   */
  private completeKeyInput(msgAddr: number, data: string): void {
    const code = data.length > 0 ? data.charCodeAt(0) & 0xff : 0;
    this.emulator.writeMemory32(msgAddr + FDOM.DATA3, code);
    this.emulator.writeMemory(msgAddr + FDOM.IOSTRING, code);
    this.emulator.writeMemory(msgAddr + FDOM.IOSTRING + 1, 0);
    this.reply(msgAddr, FIM_RC.OK);
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
