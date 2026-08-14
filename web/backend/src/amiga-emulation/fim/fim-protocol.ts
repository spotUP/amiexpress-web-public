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
   * Raw terminal input not yet consumed by a command. The web terminal
   * delivers door:input per keystroke, so this is a plain string (not an
   * array of chunks): it holds type-ahead backlog when nothing is pending,
   * and — while pendingKind==="line" — the queued tail of a partial line
   * still being typed across multiple queueInput() calls (see
   * feedLineChars()).
   */
  private inputBuffer = "";

  /** Message currently deferred pending terminal input (paused emulator). */
  private pendingMsg: number | null = null;
  private pendingKind: "line" | "key" | null = null;
  /** NR_PromptChars Data2 echo mode for the pending line request. */
  private pendingMode = 0;
  /** NR_PromptChars max chars for the pending line request (Data1, capped at 201). */
  private pendingCap = 201;
  /** Chars accumulated so far for the pending line request. */
  private lineBuffer = "";

  constructor(deps: FIMDeps) {
    this.emulator = deps.emulator;
    this.execLibrary = deps.execLibrary;
    this.socket = deps.socket;
    this.bbsSession = deps.bbsSession;
    this.nodeId = deps.nodeId;
    this.onShutdown = deps.onShutdown;
  }

  /**
   * Deliver terminal input to the door. If NR_PromptChars is pending, feeds
   * the new chars through the per-keystroke line accumulator (echo,
   * backspace, CR-completes). If a key command (AR_GetKey / NR_HotKey /
   * AR_HotKey) is pending, consumes only the first char and leaves any
   * remainder buffered. If nothing is pending, buffers the input
   * (type-ahead) for the next input-style command to consume.
   */
  queueInput(data: string): void {
    this.inputBuffer += data;
    if (this.pendingKind === "line") {
      this.feedLineChars();
    } else if (this.pendingKind === "key") {
      this.feedKeyChar();
    }
    // else: nothing pending — data stays in inputBuffer as type-ahead.
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
        // FAMEDoorCommands.h: "IOString <- The string to be send to the
        // user." Must reach the terminal, not just onShutdown's debug log —
        // this is a door's documented, courteous way to explain WHY it is
        // bailing out (e.g. FAMEWHO's "Command 88 not implemented..." when
        // it hits something it can't handle), and was previously silently
        // swallowed (see AR_SendStr/NR_SendStr above for the same
        // ansi-output pattern this mirrors).
        const lastWords = this.readCString(
          msgAddr + FDOM.IOSTRING,
          FDOM.IOSTRING_LEN
        );
        if (lastWords.length > 0) {
          this.socket?.emit("ansi-output", lastWords);
        }
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

      case FIM_CMD.NR_BBSName: {
        const bbsName = String(this.bbsSession.bbsName ?? "");
        this.writeCString(msgAddr + FDOM.IOSTRING, bbsName, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_SysOp: {
        const sysopName = String(this.bbsSession.sysopName ?? "");
        this.writeCString(msgAddr + FDOM.IOSTRING, sysopName, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_MainLine: {
        // Same source as xim/bbs-info.ts:528-533 (BB_MAINLINE).
        const mainLine = String(
          this.bbsSession.doorParams || this.bbsSession.doorCommand || ""
        );
        this.writeCString(msgAddr + FDOM.IOSTRING, mainLine, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_GetFullArg: {
        this.writeCString(
          msgAddr + FDOM.IOSTRING,
          this.buildFullArg(),
          FDOM.IOSTRING_LEN
        );
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_GetArgument1: {
        this.writeCString(
          msgAddr + FDOM.IOSTRING,
          this.getArgument(1),
          FDOM.IOSTRING_LEN
        );
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_GetArgument2: {
        this.writeCString(
          msgAddr + FDOM.IOSTRING,
          this.getArgument(2),
          FDOM.IOSTRING_LEN
        );
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_GetArgument3: {
        this.writeCString(
          msgAddr + FDOM.IOSTRING,
          this.getArgument(3),
          FDOM.IOSTRING_LEN
        );
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_GetArgument4: {
        this.writeCString(
          msgAddr + FDOM.IOSTRING,
          this.getArgument(4),
          FDOM.IOSTRING_LEN
        );
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_Name: {
        const user = (this.bbsSession.user as Record<string, unknown>) ?? {};
        const username = String(user.username ?? "");
        this.writeCString(msgAddr + FDOM.IOSTRING, username, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_Password: {
        // Never leak the password: deny and blank the reply string.
        this.writeCString(msgAddr + FDOM.IOSTRING, "", FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.DENIED);
        break;
      }

      case FIM_CMD.NR_Location: {
        const user = (this.bbsSession.user as Record<string, unknown>) ?? {};
        const location = String(user.location ?? "");
        this.writeCString(msgAddr + FDOM.IOSTRING, location, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_AccessLevel: {
        const user = (this.bbsSession.user as Record<string, unknown>) ?? {};
        const secLevel = Number(user.secLevel ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, secLevel >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_TimeRemain: {
        // FAMEDoorCommands.h's NR_TimeRemain comment ("Retrieve total time
        // remaining" / "Data2 -> Contains the User's total time remain.")
        // does not state a unit (checked all three shipped header copies:
        // FA_DE103, FA_DE100, FAMECFPR pre-release — identical, no
        // "seconds"/"minutes" wording, and no door source in the corpus
        // consumes NR_TimeRemain to infer one from usage). bbsSession is
        // the AmiExpress-native source of truth and stores minutes, so pass
        // it through unconverted rather than guessing a conversion factor.
        const timeRemaining = Number(this.bbsSession.timeRemaining ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, timeRemaining >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_Uploads: {
        const user = (this.bbsSession.user as Record<string, unknown>) ?? {};
        const uploads = Number(user.uploads ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, uploads >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_Downloads: {
        const user = (this.bbsSession.user as Record<string, unknown>) ?? {};
        const downloads = Number(user.downloads ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, downloads >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_BytesUpload: {
        const user = (this.bbsSession.user as Record<string, unknown>) ?? {};
        const bytesUpload = Number(user.bytesUpload ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, bytesUpload >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_BytesDownload: {
        const user = (this.bbsSession.user as Record<string, unknown>) ?? {};
        const bytesDownload = Number(user.bytesDownload ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, bytesDownload >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.SR_ConfName: {
        const conferenceName = String(this.bbsSession.conferenceName ?? "");
        this.writeCString(msgAddr + FDOM.IOSTRING, conferenceName, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.SR_ConfNum: {
        const conferenceId = Number(this.bbsSession.conferenceId ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, conferenceId >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.SR_NodeNumber: {
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, this.nodeId >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.SR_FAMEVersion: {
        this.writeCString(
          msgAddr + FDOM.IOSTRING,
          "FAME 6.0 (amiexpress-web compat)",
          FDOM.IOSTRING_LEN
        );
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, 60);
        this.reply(msgAddr, FIM_RC.OK);
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
   * The door's argument string, per FAMEDoorCommands.h's NR_GetFullArg /
   * NR_GetArgument1-4 semantics: "you get ONLY the arguments, not the
   * commandname". bbsSession.doorParams holds the FULL command line
   * "COMMAND arg1 arg2..." (see door.handler.ts's fullCommandLine and
   * NR_MainLine above, which reads the same field unstripped) — strip the
   * leading doorCommand token to get pure arguments. No doorParams (or no
   * match against doorCommand) falls back to "" — an absent/unparseable
   * argument string, not an error.
   */
  private getArgString(): string {
    const full = String(this.bbsSession.doorParams ?? "");
    if (!full) {
      return "";
    }
    const cmd = String(this.bbsSession.doorCommand ?? "");
    if (cmd && full.toLowerCase().startsWith(cmd.toLowerCase())) {
      return full.slice(cmd.length).replace(/^\s+/, "");
    }
    return full;
  }

  /** Whitespace-delimited argument tokens with their start offset in `args`. */
  private tokenizeArgs(args: string): Array<{ text: string; index: number }> {
    const tokens: Array<{ text: string; index: number }> = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(args)) !== null) {
      tokens.push({ text: m[0], index: m.index });
    }
    return tokens;
  }

  /**
   * NR_GetFullArg (87): "The first 4 arguments will automaticly be sorted
   * by FAME, arguments after argument with a single space between each
   * other, but all other arguments behind 4 will be like they are typed
   * it." — normalize whitespace between the first 4 tokens to single
   * spaces, then append the 5th-and-beyond arguments verbatim (original
   * spacing preserved) after a single separating space.
   */
  private buildFullArg(): string {
    const args = this.getArgString();
    const tokens = this.tokenizeArgs(args);
    if (tokens.length === 0) {
      return "";
    }
    const firstFour = tokens.slice(0, 4).map((t) => t.text).join(" ");
    if (tokens.length <= 4) {
      return firstFour;
    }
    const tail = args.slice(tokens[4].index);
    return `${firstFour} ${tail}`;
  }

  /**
   * NR_GetArgument1/2/3 (88/89/90): the Nth argument alone. NR_GetArgument4
   * (91): "Get all other arguments" — "Will be the fourth and all other
   * arguments", i.e. from the 4th token to the end of the string, verbatim
   * (original spacing preserved), not just the single 4th token. Fewer than
   * N arguments present -> "" (header does not document a
   * fail/denied return code for a missing argument; every other
   * absent-optional-field arm in this file — NR_BBSName, NR_SysOp, etc. —
   * likewise replies OK with an empty string).
   */
  private getArgument(n: 1 | 2 | 3 | 4): string {
    const args = this.getArgString();
    const tokens = this.tokenizeArgs(args);
    if (tokens.length < n) {
      return "";
    }
    if (n === 4 && tokens.length > 4) {
      return args.slice(tokens[3].index);
    }
    return tokens[n - 1].text;
  }

  /**
   * NR_PromptChars (14): prompt-and-read-a-line. Data1=max chars (0 falls
   * back to 201; the door's own max always wins, capped at 201 — the
   * IOSTRING field width), Data2=echo mode (0 normal, 4 password echoed as
   * '*'). Modes 1-3 are denied for MVP (mode 2 is denied on real FAME too).
   * IOString on entry holds the prompt text, emitted before deferring.
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

    const data1 = this.emulator.readMemory32(msgAddr + FDOM.DATA1);
    this.pendingMsg = msgAddr;
    this.pendingKind = "line";
    this.pendingMode = mode;
    this.pendingCap = Math.min(data1 > 0 ? data1 : 201, 201);
    this.lineBuffer = "";

    // Drain any input already buffered (type-ahead) through the same
    // per-keystroke accumulator queueInput() uses. This may complete the
    // request synchronously (a CR was already in the backlog), in which
    // case pendingMsg is cleared and we must not pause.
    this.feedLineChars();
    if (this.pendingMsg !== null) {
      this.emulator.pause();
    }
  }

  /**
   * Feed buffered chars (inputBuffer) into the pending line request one at
   * a time: backspace (0x08/0x7F) drops the last buffered char and echoes
   * "\b \b"; printable chars (0x20-0x7E) are appended and echoed (masked
   * '*' for password mode) up to pendingCap, then silently ignored past
   * cap; CR completes the request (a following LF is swallowed as part of
   * the same CRLF pair). Other control chars are dropped. Stops as soon as
   * the request completes or the buffer is exhausted — the rest of a
   * partial line waits for a future queueInput() call.
   */
  private feedLineChars(): void {
    while (this.pendingKind === "line" && this.inputBuffer.length > 0) {
      const ch = this.inputBuffer[0];
      this.inputBuffer = this.inputBuffer.slice(1);

      if (ch === "\r") {
        if (this.inputBuffer[0] === "\n") {
          this.inputBuffer = this.inputBuffer.slice(1); // LF following CR ignored
        }
        this.completeLineNow();
        return;
      }

      const code = ch.charCodeAt(0);
      if (code === 0x08 || code === 0x7f) {
        if (this.lineBuffer.length > 0) {
          this.lineBuffer = this.lineBuffer.slice(0, -1);
          this.socket?.emit("ansi-output", "\b \b");
        }
        continue;
      }

      if (code >= 0x20 && code <= 0x7e && this.lineBuffer.length < this.pendingCap) {
        this.lineBuffer += ch;
        this.socket?.emit("ansi-output", this.pendingMode === 4 ? "*" : ch);
      }
      // Non-printable, or already at cap: drop silently (backspace/CR still work).
    }
  }

  /**
   * Complete the pending NR_PromptChars: write the accumulated line into
   * IOSTRING NUL-terminated, reply OK, resume the emulator.
   */
  private completeLineNow(): void {
    const msgAddr = this.pendingMsg!;
    const line = this.lineBuffer;
    this.pendingMsg = null;
    this.pendingKind = null;
    this.lineBuffer = "";
    this.pendingMode = 0; // reset — stale value would otherwise leak if read before the next handlePromptChars() sets it
    this.writeCString(msgAddr + FDOM.IOSTRING, line, FDOM.IOSTRING_LEN);
    this.reply(msgAddr, FIM_RC.OK);
    this.emulator.resume();
  }

  /**
   * AR_GetKey (800) / NR_HotKey (15) / AR_HotKey (861): read a single key.
   * If input is already type-ahead buffered, answer synchronously without
   * pausing the emulator — consuming only the first char and leaving any
   * remainder in inputBuffer for the next input command (e.g. "yes\r" ->
   * 'y' now, "es\r" stays queued). Otherwise defer until queueInput()
   * delivers a key.
   */
  private handleKeyCommand(msgAddr: number): void {
    if (this.inputBuffer.length > 0) {
      const key = this.inputBuffer[0];
      this.inputBuffer = this.inputBuffer.slice(1);
      this.completeKeyInput(msgAddr, key);
      return;
    }

    this.pendingMsg = msgAddr;
    this.pendingKind = "key";
    this.emulator.pause();
  }

  /**
   * Consume the first buffered char for the pending key command, leaving
   * any remainder in inputBuffer, complete it, and resume the emulator.
   * No-ops if inputBuffer is still empty (waits for a future queueInput()).
   */
  private feedKeyChar(): void {
    if (this.inputBuffer.length === 0) {
      return;
    }
    const key = this.inputBuffer[0];
    this.inputBuffer = this.inputBuffer.slice(1);
    const msgAddr = this.pendingMsg!;
    this.pendingMsg = null;
    this.pendingKind = null;
    this.completeKeyInput(msgAddr, key);
    this.emulator.resume();
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
