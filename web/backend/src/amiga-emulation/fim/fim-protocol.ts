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
import { getSystemTime, formatLongDateTime } from "../../utils/date-time.util";
import { writeToCallersLog, writeToUDLog } from "../../utils/download-logging.util";

/**
 * Amiga epoch (January 1, 1978 00:00:00) — same reference point
 * date-time.util.ts's dateStampToDateTime/dateTimeToDateStamp use for
 * AmigaDOS DateStamp conversions. FAMEDoorCommands.h's NR_CurrTime comment
 * is truncated mid-sentence in the shipped header ("Retrieve the current
 * time in seconds since January" — no year given, and identical across all
 * three shipped copies of the header checked: FA_DE103, FA_DE100,
 * FAMECFPR). Rather than guess a Unix-epoch interpretation, this reuses the
 * codebase's own established Amiga-epoch convention for every "seconds"
 * time field in this command family (NR_CurrTime, NR_TimeLastOn).
 */
const AMIGA_EPOCH_MS = new Date(1978, 0, 1).getTime();

function secondsSinceAmigaEpoch(date: Date): number {
  return Math.floor((date.getTime() - AMIGA_EPOCH_MS) / 1000) >>> 0;
}

const NT_REPLYMSG = 6;
/** Runaway guard for AR_SendStr StringPtr reads (arbitrary-length C strings;
 * only bounds a missing NUL terminator, not legitimate output). */
const AR_SENDSTR_MAX = 65536;
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
  /** FAME "Chat flag" (SR_ChatSet Data2) as 0/1. Semantics verified by A/B
   * against 5D_Page: 1 = flag SET = sysop NOT pageable ("Sysop is not
   * arround"); 0 = clear = door proceeds to page. Maps from AmiExpress
   * sysopAvail as `available ? 0 : 1`. Injected so the emulation layer
   * stays decoupled from server state; absent → 0 (pageable), matching the
   * server's sysopAvailable=true boot default. */
  getChatFlag?(): number;
  /** Execute a BBS internal menu command on the door's behalf
   * (CF_InternalCmd 404 — 5D_Page runs "C" to trigger the sysop page).
   * Return true when handled; false → the door gets rc=NOTIMPLEMENTED. */
  runInternalCommand?(cmd: string): boolean;
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
   * and — while pendingKind==="line" or "key" — the queued tail still being
   * typed across multiple queueInput() calls (see feedLineChars() /
   * feedKeyChar()).
   */
  private inputBuffer = "";

  /**
   * Message currently deferred pending terminal input (paused emulator).
   * Only NR_PromptChars ("line") and NR_WaitChar ("key") ever defer — the
   * poll commands (AR_GetKey, NR_HotKey, AR_HotKey) always answer
   * immediately and never populate this.
   */
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
    this.getChatFlag = deps.getChatFlag;
    this.runInternalCommand = deps.runInternalCommand;
  }

  private getChatFlag?: () => number;
  private runInternalCommand?: (cmd: string) => boolean;

  /**
   * Deliver terminal input to the door. If NR_PromptChars is pending, feeds
   * the new chars through the per-keystroke line accumulator (echo,
   * backspace, CR-completes). If NR_WaitChar (the only blocking key
   * command) is pending, consumes the first char and completes it. If
   * nothing is pending, buffers the input (type-ahead) for the next
   * input-style command to consume — including the non-blocking polls
   * (AR_GetKey / NR_HotKey / AR_HotKey), which read straight from
   * inputBuffer the next time they're called rather than through this
   * deferred path.
   */
  queueInput(data: string): void {
    this.inputBuffer += this.stripEscapeSequences(data);
    if (this.pendingKind === "line") {
      this.feedLineChars();
    } else if (this.pendingKind === "key") {
      this.feedKeyChar();
    }
    // else: nothing pending — data stays in inputBuffer as type-ahead.
  }

  /** Carry-over parser state: inside an ESC/CSI sequence that spans
   * queueInput calls (web terminals deliver input per keystroke, so a
   * mouse report like ESC[<35;68;25M arrives one char at a time). */
  private inEscapeSeq = false;

  /**
   * Drop terminal escape sequences from door input — most importantly
   * xterm SGR mouse-tracking reports (ESC[<btn;x;yM), which otherwise
   * get echoed and typed into FIM line input as "[<35;68;25M" garbage
   * whenever the user's mouse crosses the terminal (XIM has mouse
   * throttling; FIM's per-keystroke line editor saw the raw bytes).
   * Stateful: a sequence may span multiple queueInput calls.
   */
  private stripEscapeSequences(data: string): string {
    let out = "";
    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (this.inEscapeSeq) {
        // CSI parameter/intermediate bytes are 0x20-0x3F ('<', digits, ';',
        // etc.); the final byte is 0x40-0x7E ('M', 'm', letters, '~').
        // '[' immediately after ESC opens the CSI and is not a final byte.
        if (ch === "[") continue;
        if (code >= 0x40 && code <= 0x7e) this.inEscapeSeq = false;
        continue;
      }
      if (code === 0x1b) {
        this.inEscapeSeq = true;
        continue;
      }
      out += ch;
    }
    return out;
  }

  /**
   * Handle a FAMEDoorMsg PutMsg()'d to FAMEDoorPort<node>. Always replies
   * (never hangs the door), even for commands not yet implemented.
   */
  handleMessage(msgAddr: number): void {
    const command = this.emulator.readMemory32(msgAddr + FDOM.COMMAND);
    if (process.env.DEBUG_68K === '1' || process.env.DEBUG_68K === 'true') {
      const d1 = this.emulator.readMemory32(msgAddr + FDOM.DATA1);
      const io = this.readCString(msgAddr + FDOM.IOSTRING, 60).replace(/[\r\n]/g, s => s === '\r' ? '\\r' : '\\n');
      debugLog(`[FIM] cmd=${command} Data1=${d1} IOString="${io}"`);
    }

    // Per-command return-field convention (FAMEDoorCommands.h): each
    // command documents its OWN mapping of which of Data2/Data3/IOString
    // carries the result — there is no single fixed slot for "the value" or
    // "the char". Mixing them up is an easy, silent bug: three commands in
    // this file (NR_HotKey/AR_HotKey, AR_GetKey, NR_Uploads/NR_Downloads)
    // previously wrote the wrong field because this convention lived only
    // in a reviewer's memory, not in the code. When adding a new command,
    // re-read its header comment block and match Data2 vs Data3 vs
    // IOString exactly — don't infer from a neighboring command.
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
        // StringPtr sends are arbitrary-length C strings — that is the whole
        // point of the pointer variant vs the 202-byte inline IOString.
        // Capping at IOSTRING_LEN truncated 5D_Page's banner mid-line
        // (dropping a \r\n and wrecking its cursor-overlay math). The large
        // cap is only a runaway guard against a missing NUL terminator.
        let text = this.readCString(stringPtr, AR_SENDSTR_MAX);
        if (process.env.DEBUG_68K === '1') {
          debugLog(`[FIM] AR_SendStr ptr=0x${stringPtr.toString(16)} len=${text.length} bytes=${JSON.stringify(text.slice(0, 400))}`);
        }
        // FAMEDoorCommands.h AR_SendStr: "Data1 <- if not 0 a \"\\r\\n\"
        // combination will be send" — any nonzero value, not just 1.
        // readMemory32 returns unsigned (>>> 0), so a door writing -1
        // (0xFFFFFFFF) still compares !== 0 correctly here.
        if (data1 !== 0) {
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

      case FIM_CMD.AR_GetKey: {
        this.handleGetKey(msgAddr);
        break;
      }

      case FIM_CMD.NR_HotKey:
      case FIM_CMD.AR_HotKey: {
        this.handleHotKey(msgAddr);
        break;
      }

      case FIM_CMD.NR_WaitChar: {
        this.handleWaitChar(msgAddr);
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

      case FIM_CMD.NR_StampTime: {
        // FAMEDoorCommands.h: "Retrieve the current time string / IOString
        // -> Contains the current timestring." No format is specified;
        // reuse formatLongDateTime (the codebase's one existing
        // "DDD DD-MMM-YYYY HH:MM:SS" timestring formatter, already used for
        // the ~LC MCI code) for consistency with NR_StampLastOn (49) below,
        // which needs the identical format for a different timestamp.
        const stampTime = formatLongDateTime(getSystemTime());
        this.writeCString(msgAddr + FDOM.IOSTRING, stampTime, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_CurrTime: {
        // FAMEDoorCommands.h: "Retrieve the current time in seconds since
        // January / Data2 -> Contains the current timevalue." (comment is
        // truncated in the shipped header — see AMIGA_EPOCH_MS above for
        // why Amiga epoch was chosen over guessing Unix epoch.)
        const currTime = secondsSinceAmigaEpoch(getSystemTime());
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, currTime);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_ThisConfAccess: {
        // FAMEDoorCommands.h: "Retrieve the users conference access of
        // selected Conf / Data1 <- The Confnumber you are checking the
        // access of the online user. / Data2 -> 1 if the user has access
        // to the conference, else 0. / Note: If Data1 is lower than 1 or
        // higher than the last conference available, Data1 will be set to
        // the current conference number!"
        //
        // amiexpress-web has no per-conference ACL data available at this
        // protocol layer (bbsSession carries only the CURRENT conference
        // id, not a full conference list/ACL table to validate Data1's
        // upper bound against) — a logged-in session already implies
        // access to whatever conference it's in, so this returns the
        // permissive default (Data2=1, always granted) rather than
        // fabricating a deny. Documented gap: the upper-bound half of the
        // header's Data1 range check ("or higher than the last conference
        // available") is NOT implemented — only the lower-bound case
        // (Data1 <= 0) is corrected, using bbsSession.conferenceId as
        // "the current conference number" per the header's own wording.
        const data1 = this.emulator.readMemory32(msgAddr + FDOM.DATA1);
        if (data1 <= 0) {
          const currentConf = Number(this.bbsSession.conferenceId ?? 0);
          this.emulator.writeMemory32(msgAddr + FDOM.DATA1, currentConf >>> 0);
        }
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, 1);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_Name: {
        const user = this.getUser();
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
        const user = this.getUser();
        const location = String(user.location ?? "");
        this.writeCString(msgAddr + FDOM.IOSTRING, location, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_From: {
        // FAMEDoorCommands.h: "Retrieve users from / IOString -> Contains
        // the User's origin." No dedicated "origin" field exists separate
        // from location in this codebase's User type (see
        // database/types.ts) — door.handler.ts:524 already collapses
        // connectionHostname/remoteAddress into the SAME `location` field
        // fed to NR_Location/XIM's DT_LOCATION, so there is no distinct
        // "origin" concept to draw from either. Mirrors user.location.
        const user = this.getUser();
        const from = String(user.location ?? "");
        this.writeCString(msgAddr + FDOM.IOSTRING, from, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_PhoneNumber: {
        // FAMEDoorCommands.h: "Retrieve users phone number / IOString ->
        // Contains the User's phonenumber." — documents a normal return
        // value with no privacy caveat, same as NR_Password's header text.
        // NR_Password (above) already applies a deliberate DENY-and-blank
        // policy regardless of the header for that reason: PII should
        // never be handed to an emulated door. Phone numbers are the same
        // class of PII — apply the identical privacy default here.
        this.writeCString(msgAddr + FDOM.IOSTRING, "", FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.DENIED);
        break;
      }

      case FIM_CMD.NR_SlotNumber: {
        // FAMEDoorCommands.h: "Retrieve users slotnumber / Data2 -> Contains
        // the User's slotnumber." Same field + same precedence XIM's
        // DT_SLOTNUMBER uses (xim/data-query.ts:236-243): prefer
        // bbsSession.userSlotNumber (door.handler.ts's live/authoritative
        // slot for the current session) over user.slotNumber (persisted on
        // the User record), falling back to 0 if neither is a positive
        // number.
        const sessionSlot = Number((this.bbsSession as Record<string, unknown>).userSlotNumber);
        const user = this.getUser();
        const userSlot = Number(user.slotNumber);
        const slotNumber =
          Number.isFinite(sessionSlot) && sessionSlot > 0
            ? sessionSlot
            : Number.isFinite(userSlot) && userSlot > 0
              ? userSlot
              : 0;
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, slotNumber >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_AccessLevel: {
        const user = this.getUser();
        const secLevel = Number(user.secLevel ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, secLevel >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_RatioType: {
        // FAMEDoorCommands.h: "Retrieve users ratiotype / Data2 -> Contains
        // the User's ratiotype." Direct field match: User.ratioType.
        const user = this.getUser();
        const ratioType = Number(user.ratioType ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, ratioType >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_Ratio: {
        // FAMEDoorCommands.h: "Retrieve users ratio / Data2 -> Contains the
        // User's ratio." Direct field match: User.ratio.
        const user = this.getUser();
        const ratio = Number(user.ratio ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, ratio >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_CompType: {
        // FAMEDoorCommands.h: "Retrieve users computertype code / Data2 ->
        // Contains the User's computertype code. / IOString -> Contains
        // the User's computer." Two distinct outputs: a FAME-internal
        // numeric computer-type code (enum unknown/unmapped — this
        // codebase has no FAME computer-type table, so Data2 is always 0,
        // documented gap) and the free-text computer name, which DOES map
        // directly to User.computer.
        const user = this.getUser();
        const computer = String(user.computer ?? "");
        this.writeCString(msgAddr + FDOM.IOSTRING, computer, FDOM.IOSTRING_LEN);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_ModemType: {
        // FAMEDoorCommands.h: "Retrieve users modemtype code / Data2 ->
        // Contains the User's modemtype code. / IOString -> Contains the
        // User's modem." amiexpress-web is a web BBS — no modem/baud
        // negotiation concept exists on the User record — so both outputs
        // are the documented "absent field" default (0 / "").
        this.writeCString(msgAddr + FDOM.IOSTRING, "", FDOM.IOSTRING_LEN);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_MessagePosted: {
        // FAMEDoorCommands.h: "Retrieve users messagesposted / Data3 ->
        // Contains the User's message posted." Direct field match:
        // User.messagesPosted.
        const user = this.getUser();
        const messagesPosted = Number(user.messagesPosted ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, messagesPosted >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_MessageRead: {
        // FAMEDoorCommands.h: "Retrieve the number of readen Msg's / Data3
        // -> Contains the User's message read." No "messages read" counter
        // exists on User (database/types.ts) — always 0, documented gap
        // (never crash, per the absent-field convention every other arm in
        // this file uses).
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_NoCalls: {
        // FAMEDoorCommands.h: "Retrieve number of usercalls / Data3 ->
        // Contains the User's calls." Direct field match: User.calls.
        const user = this.getUser();
        const calls = Number(user.calls ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, calls >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_TimeLastOn: {
        // FAMEDoorCommands.h: "Retrieve time user last called / Data2 ->
        // Contains the User's last time called." No unit stated, but this
        // sits in the same NUMERIC-timestamp family as NR_CurrTime (29) —
        // and is paired with NR_StampLastOn (49) below exactly the way
        // NR_StampTime (28)/NR_CurrTime (29) are paired (string vs numeric
        // form of the same timestamp) — so it uses the same
        // seconds-since-Amiga-epoch convention. User.lastLogin absent ->
        // 0, never crash.
        const user = this.getUser();
        const lastLogin = user.lastLogin;
        const timeLastOn = lastLogin instanceof Date ? secondsSinceAmigaEpoch(lastLogin) : 0;
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, timeLastOn >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_TimeUsed: {
        // FAMEDoorCommands.h: "Retrieve timeused today / Data2 -> Contains
        // the User's time used." Direct field match: User.timeUsed.
        const user = this.getUser();
        const timeUsed = Number(user.timeUsed ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, timeUsed >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_TimeLimit: {
        // FAMEDoorCommands.h: "Retrieve timeallowed for a user / Data2 ->
        // Contains the User's time limit." Direct field match:
        // User.timeLimit.
        const user = this.getUser();
        const timeLimit = Number(user.timeLimit ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, timeLimit >>> 0);
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

      case FIM_CMD.NR_StampLastOn: {
        // FAMEDoorCommands.h: "Retrieve the date string containing the
        // date when the user last logged on / IOString -> Contains the
        // User's last time called as an timestring." String twin of
        // NR_TimeLastOn (45) above — same formatLongDateTime formatter
        // NR_StampTime (28) uses, applied to user.lastLogin instead of
        // "now". Absent lastLogin -> "" (never crash).
        const user = this.getUser();
        const lastLogin = user.lastLogin;
        const stampLastOn = lastLogin instanceof Date ? formatLongDateTime(lastLogin) : "";
        this.writeCString(msgAddr + FDOM.IOSTRING, stampLastOn, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_ConfAccess: {
        // FAMEDoorCommands.h: "Retrieve the users conference access /
        // IOString -> Contains the User's conference access alias."
        // Direct field match: User.confAccess (database/types.ts:58).
        const user = this.getUser();
        const confAccess = String(user.confAccess ?? "");
        this.writeCString(msgAddr + FDOM.IOSTRING, confAccess, FDOM.IOSTRING_LEN);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_Uploads: {
        // FAMEDoorCommands.h: "Data3 -> Contains the User's number of
        // uploads." (Data2 unused, unlike NR_AccessLevel/NR_TimeRemain).
        const user = this.getUser();
        const uploads = Number(user.uploads ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, uploads >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_Downloads: {
        // FAMEDoorCommands.h: "Data3 -> Contains the User's number of
        // downloads."
        const user = this.getUser();
        const downloads = Number(user.downloads ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, downloads >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_BytesUpload: {
        const user = this.getUser();
        const bytesUpload = Number(user.bytesUpload ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, bytesUpload >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.NR_BytesDownload: {
        const user = this.getUser();
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
        // FAMEDoorCommands.h: "Data2 -> The actual conferencenumber. /
        // Data3 -> The relative conferencenumber." amiexpress-web has no
        // separate relative-numbering scheme (conferences aren't
        // per-user-renumbered), so Data3 mirrors Data2 rather than being
        // left 0 — matches the header's own note that a relative number of
        // 0 normally means "no access", which is never true here.
        const conferenceId = Number(this.bbsSession.conferenceId ?? 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, conferenceId >>> 0);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, conferenceId >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.SR_NodeNumber: {
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, this.nodeId >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.SR_ChatSet: {
        // FAMEDoorCommands.h: "Retrieve the chat status / Data2 ->
        // Contains the Chat flag." A/B-verified against 5D_Page: flag SET
        // (1) => "Sysop is not arround"; clear (0) => door pages. Default
        // 0 = pageable, matching sysopAvailable=true at boot.
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, (this.getChatFlag?.() ?? 0) >>> 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.CF_InternalCmd: {
        // FAMEDoorCommands.h: "Execute an internal menu command /
        // IOString <- The internal menu command to be executed." 5D_Page
        // sends "C" (sysop chat/page) when the chat flag is clear.
        const internalCmd = this.readCString(msgAddr + FDOM.IOSTRING, FDOM.IOSTRING_LEN).trim();
        const handled = this.runInternalCommand?.(internalCmd) ?? false;
        if (handled) {
          this.reply(msgAddr, FIM_RC.OK);
        } else {
          debugLog(`[FIM] CF_InternalCmd not handled: "${internalCmd}"`);
          this.reply(msgAddr, FIM_RC.NOTIMPLEMENTED);
        }
        break;
      }

      case FIM_CMD.SR_FAMEVersion: {
        // FAMEDoorCommands.h: "Data2 -> Contains the versionnumber of
        // FAME. / Data3 -> Contains the revsionnumber of FAME." These are
        // two separate fields (major version, revision), not one packed
        // value — report version 6, revision 0.
        this.writeCString(
          msgAddr + FDOM.IOSTRING,
          "FAME 6.0 (amiexpress-web compat)",
          FDOM.IOSTRING_LEN
        );
        this.emulator.writeMemory32(msgAddr + FDOM.DATA2, 6);
        this.emulator.writeMemory32(msgAddr + FDOM.DATA3, 0);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.CF_CallersLog: {
        // FAMEDoorCommands.h: "add a line of text to the callers.log /
        // IOString <- The string added to the callers.log." Routed through
        // the same express.e-port util the BBS itself uses (fire-and-forget;
        // the log line is not worth blocking the door's reply on).
        const line = this.readCString(msgAddr + FDOM.IOSTRING, FDOM.IOSTRING_LEN).replace(/[\r\n]+$/, "");
        const username = String(
          (this.bbsSession.user as Record<string, unknown> | undefined)?.username ?? "Door"
        );
        void writeToCallersLog(username, line, this.nodeId);
        this.reply(msgAddr, FIM_RC.OK);
        break;
      }

      case FIM_CMD.CF_UDLog: {
        // FAMEDoorCommands.h: "add a line of text to the ud.log" — same
        // shape as CF_CallersLog, different target log.
        const line = this.readCString(msgAddr + FDOM.IOSTRING, FDOM.IOSTRING_LEN).replace(/[\r\n]+$/, "");
        void writeToUDLog(line, this.nodeId);
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
   * bbsSession.user, typed and defaulted to {} — shared by every FIM command
   * that reads a user field (NR_Name, NR_Location, NR_AccessLevel,
   * NR_Uploads, NR_Downloads, NR_BytesUpload, NR_BytesDownload). Extracted
   * to a single helper so the (Record<string, unknown>) ?? {} idiom isn't
   * duplicated at each call site.
   */
  private getUser(): Record<string, unknown> {
    return (this.bbsSession.user as Record<string, unknown>) ?? {};
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
   * IOSTRING field width), Data2=echo mode. Modes implemented:
   *   0 Normal line editing (also the fallback for mode 6, see below).
   *   4 Password, echoed as '*' per typed char.
   *   7 Password, NO echo at all — FAMEDoorCommands.h: "here will
   *     definality no single char be typed on the screen. No single char
   *     means also NO stars (*)." (the header's "Display Passwords to
   *     SysOp" console-only exception is not implemented — no separate
   *     sysop-facing echo channel exists in this emulation).
   *   8 Numeric-only: non-digit printable chars are silently rejected
   *     (same drop-not-error handling as an at-cap char), matching the
   *     header's "Only alphanumeric chars can be typed and no alphabetical
   *     ones" (i.e. digits accepted, letters/symbols rejected).
   * Mode 6 ("real feature", full in-string cursor editing with
   * insert/delete-at-position) is NOT implemented as a distinct editor —
   * it degrades to mode-0 append-only line editing (no cursor movement,
   * no mid-string insert/delete). Modes 1-3 are denied for MVP (mode 2 is
   * denied on real FAME too). IOString on entry holds the prompt text,
   * emitted before deferring.
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
   * "\b \b" (mode 7 suppresses this echo too — "no single char" means NO
   * visual feedback at all, not just no stars); printable chars (0x20-0x7E)
   * are appended and echoed up to pendingCap, then silently ignored past
   * cap — echo is '*' for mode 4, nothing for mode 7, the literal char
   * otherwise; mode 8 additionally rejects (drops, doesn't error) any
   * printable char that isn't a digit 0-9; CR completes the request (a
   * following LF is swallowed as part of the same CRLF pair). Other
   * control chars are dropped. Stops as soon as the request completes or
   * the buffer is exhausted — the rest of a partial line waits for a
   * future queueInput() call.
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
          if (this.pendingMode !== 7) {
            this.socket?.emit("ansi-output", "\b \b");
          }
        }
        continue;
      }

      if (code >= 0x20 && code <= 0x7e && this.lineBuffer.length < this.pendingCap) {
        const isDigit = code >= 0x30 && code <= 0x39;
        if (this.pendingMode === 8 && !isDigit) {
          continue; // numeric mode: reject non-digit chars silently
        }
        this.lineBuffer += ch;
        if (this.pendingMode === 4) {
          this.socket?.emit("ansi-output", "*");
        } else if (this.pendingMode !== 7) {
          this.socket?.emit("ansi-output", ch);
        }
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
    // Echo the line terminator, matching real FAME console behavior: the
    // door's post-input cursor math assumes Enter advanced one row (5D_Page
    // emits 4xCRLF after input and printed "Sysop is not arround" over its
    // own Registered box when this echo was missing).
    this.socket?.emit("ansi-output", "\r\n");
    this.writeCString(msgAddr + FDOM.IOSTRING, line, FDOM.IOSTRING_LEN);
    this.reply(msgAddr, FIM_RC.OK);
    this.emulator.resume();
  }

  /**
   * AR_GetKey (800): "Look for a keypress without waiting for it." Per
   * FAMEDoorCommands.h: "Data2 -> 0 means nothing happens, 1 means a key
   * was pressed!" and "AR_GetKey is the same as NR_HotKey, but on
   * AR_GetKey you wont get the char, only a notify that a char was
   * present." This is a PEEK, not a consume: the char (if any) stays in
   * inputBuffer so a following NR_HotKey/AR_HotKey still gets it. Always
   * answers immediately — never pauses the emulator, never defers.
   */
  private handleGetKey(msgAddr: number): void {
    const present = this.inputBuffer.length > 0 ? 1 : 0;
    this.emulator.writeMemory32(msgAddr + FDOM.DATA2, present);
    this.emulator.writeMemory32(msgAddr + FDOM.DATA3, 0); // 0 = console char
    this.reply(msgAddr, FIM_RC.OK);
  }

  /**
   * NR_HotKey (15) / AR_HotKey (861): "Gets a char without waiting for
   * it." Per FAMEDoorCommands.h: "Data2 -> The char typed by the user. /
   * Data3 -> 0 = Console char, 1 = Serial char." and "This command checks
   * for a available char. If there is a char available you will get it
   * immediatly, else you will get 0 in Data2." Non-blocking poll: if a
   * char is buffered, consume exactly one and return it in Data2
   * immediately; if the buffer is empty, Data2=0 immediately (rc=OK) — no
   * pause, no pending/deferred state, unlike NR_WaitChar's blocking wait.
   *
   * AR_HotKey additionally documents a Data1 cursor-key base offset
   * ("Data1+2 for UP, Data1+3 for DOWN, Data1+1 for RIGHT and Data1 for
   * LEFT") for self-definable cursor-key return codes. NOT IMPLEMENTED:
   * this emulation doesn't distinguish/report raw cursor-key escape
   * sequences through the key-command path, so Data1 is never read here.
   */
  private handleHotKey(msgAddr: number): void {
    let code = 0;
    if (this.inputBuffer.length > 0) {
      code = this.inputBuffer.charCodeAt(0) & 0xff;
      this.inputBuffer = this.inputBuffer.slice(1);
    }
    this.emulator.writeMemory32(msgAddr + FDOM.DATA2, code);
    this.emulator.writeMemory32(msgAddr + FDOM.DATA3, 0); // 0 = console char
    this.reply(msgAddr, FIM_RC.OK);
  }

  /**
   * NR_WaitChar (92): "Get a char with waiting for it." Per
   * FAMEDoorCommands.h: "Data2 -> The char typed be the user. / Data3 -> 0
   * = Console char, 1 = Serial char. / IOString <- String will be
   * displayed to the user." This is the BLOCKING counterpart to
   * NR_HotKey — reuses the same pendingKind:"key" pause/resume machinery
   * NR_PromptChars uses for line input (see feedLineChars()/pendingKind
   * "line"), but for a single char. The IOString prompt is read and
   * emitted BEFORE deferring/consuming, same as handlePromptChars —
   * covers both the synchronous type-ahead-answered path and the deferred
   * (pause-until-queueInput) path.
   *
   * NOT IMPLEMENTED: the header documents raw cursor-key return codes
   * (UP=4, DOWN=5, RIGHT=3, LEFT=2) alongside the typed-char value for
   * this command; this emulation doesn't distinguish/report raw
   * cursor-key escape sequences through the key-command path (same gap
   * disclosed on AR_HotKey's Data1 cursor-key remap above).
   */
  private handleWaitChar(msgAddr: number): void {
    const prompt = this.readCString(msgAddr + FDOM.IOSTRING, FDOM.IOSTRING_LEN);
    if (prompt.length > 0) {
      this.socket?.emit("ansi-output", prompt);
    }

    if (this.inputBuffer.length > 0) {
      const key = this.inputBuffer[0];
      this.inputBuffer = this.inputBuffer.slice(1);
      this.completeWaitChar(msgAddr, key);
      return;
    }

    this.pendingMsg = msgAddr;
    this.pendingKind = "key";
    this.emulator.pause();
  }

  /**
   * Consume the first buffered char for the pending NR_WaitChar request,
   * complete it, and resume the emulator. No-ops if inputBuffer is still
   * empty (waits for a future queueInput() call).
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
    this.completeWaitChar(msgAddr, key);
    this.emulator.resume();
  }

  /**
   * Complete a deferred NR_WaitChar: per FAMEDoorCommands.h the char
   * returns in Data2 (Data3 is the console/serial flag, always 0 here).
   */
  private completeWaitChar(msgAddr: number, data: string): void {
    const code = data.length > 0 ? data.charCodeAt(0) & 0xff : 0;
    this.emulator.writeMemory32(msgAddr + FDOM.DATA2, code);
    this.emulator.writeMemory32(msgAddr + FDOM.DATA3, 0);
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
