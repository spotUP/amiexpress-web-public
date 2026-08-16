/**
 * DreamDoor.library Emulation
 *
 * DayDream BBS compatibility layer for 68K doors.
 * Provides InquirePointers-based access to BBS data structures.
 *
 * LVO offsets live in `../dd/dd-constants.ts` (DD_LVO) — this file only
 * implements the vector bodies and struct population; the vectors table
 * (Task 3) wires DD_LVO entries to these methods.
 *
 * Struct offsets (DP_OFFSET/USER_OFFSET/CONF_OFFSET/CFG_OFFSET/DP_SIZEOF)
 * come from Task 1's `dd-constants.ts`, which is the confirmed/inferred
 * source of truth recovered by RE (see that file's header comment). Fields
 * not covered by Task 1 (struct total sizes beyond DP_SIZEOF, the node-info
 * sub-struct layout beyond its confirmed node-id byte) are still guesses —
 * each is called out below with an "unconfirmed" comment rather than
 * silently presented as fact.
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { DP_OFFSET, DP_SIZEOF, USER_OFFSET, CONF_OFFSET, CFG_OFFSET } from '../dd/dd-constants';
import { convertAmigaTextForTerminal } from '../../utils/ansi-conversion.util';

const MEMF_CLEAR = 1 << 16;

/**
 * USER_SIZEOF is not part of Task 1's confirmed offset table (only field
 * offsets within the USER struct are confirmed/inferred). The highest
 * confirmed/inferred field is USER_TIMEREMAINING@0x102 (word, ends at
 * 0x104); size the struct to 0x110 to leave headroom for fields that exist
 * in the real struct but haven't been RE'd yet.
 */
const USER_SIZEOF = 0x110;

/**
 * CONF_SIZEOF is unconfirmed by Task 1 (only CONF_NUMBER@0/CONF_NAME@1 are
 * known). Kept generous for the conference-name string plus headroom.
 */
const CONF_SIZEOF = 0x3c;

/**
 * CFG_SIZEOF is unconfirmed by Task 1 (only CFG_SYSOPNAME@0x1a, a sub-field
 * of dp_DayDream, is confirmed). Kept generous for headroom; we only
 * populate the confirmed field below — no BBS-name offset is guessed.
 */
const CFG_SIZEOF = 0x80;

/**
 * Node-info sub-struct pointed to by dp_CurrentNode. Task 1 confirms only
 * the node-id byte's sub-offset (+0x0e); the rest of the layout, including
 * total size, is unconfirmed and sized generously for headroom.
 */
const NODE_INFO_NODEID_OFFSET = 0x0e;
const NODE_INFO_SIZEOF = 0x20;

/** Minimal exec.library allocator surface DreamDoorLibrary depends on. */
export interface DreamDoorMemAllocator {
  allocMem(size: number, flags?: number): number;
  freeMem(addr: number, size: number): void;
}

/** Socket surface DreamDoorLibrary needs to push terminal output. */
export interface DreamDoorSocketLike {
  emit(event: string, ...args: unknown[]): unknown;
}

export interface DreamDoorSessionUser {
  username?: string;
  location?: string;
  phone?: string;
  secLevel?: number;
  ratio?: number;
  messagesPosted?: number;
  uploads?: number;
  downloads?: number;
  timesCalled?: number;
  dailyTimeLimit?: number;
  bytesUpload?: number;
  bytesDownload?: number;
  linesPerScreen?: number;
}

export interface DreamDoorSession {
  user?: DreamDoorSessionUser;
  bbsName?: string;
  sysopName?: string;
  conferenceName?: string;
  conferenceId?: number;
  /** Minutes remaining in the caller's session — a BBSSession-level field
   *  (not per-user), matching the real session shape run-amiga-door.ts /
   *  corpus-integration-runner.ts / the live BBS all construct. */
  timeRemaining?: number;
}

export class DreamDoorLibrary {
  private emulator: MoiraEmulator;
  private alloc: DreamDoorMemAllocator;
  private bbsSession: DreamDoorSession = {};
  private socket: DreamDoorSocketLike | null = null;

  // Memory allocations for structures (allocated via the injected exec
  // allocator — never a fixed base address, see Task 2 brief).
  private pointersAddr = 0;
  private userStructAddr = 0;
  private confStructAddr = 0;
  private configStructAddr = 0;
  private nodeInfoAddr = 0;
  private doorHandle = 0;
  private initialized = false;

  /**
   * Deferred Prompt/GetKey input state (Task 4). Mirrors FIMProtocol's
   * pendingKind/pause()/resume() state machine (fim-protocol.ts:64-110,
   * 567-664 in that file's own numbering) but at the trap-call level
   * instead of the message level, since DreamDoor calls are direct
   * synchronous library JSRs, not PutMsg/GetMsg round trips.
   */

  /** Raw terminal input not yet consumed — type-ahead backlog, same role
   * as FIMProtocol.inputBuffer. */
  private inputBuffer = "";
  /** Caller's A0 buffer address, captured when prompt() defers. Non-null
   * while a Prompt call is pending completion via queueInput(). */
  private pendingPromptBuffer: number | null = null;
  private pendingPromptMaxLen = 0;
  private pendingPromptMode = 0;
  /** Chars accumulated so far for the pending Prompt request (mirrors
   * FIMProtocol.lineBuffer). Not part of the brief's explicit field list
   * but required to accumulate a line across multiple queueInput() calls. */
  private promptLineBuffer = "";
  /** GetKey has no buffer to fill, only D0 — no address needs capturing,
   * just whether a GetKey call is waiting on the next queued char. */
  private pendingKeyPending = false;

  constructor(emulator: MoiraEmulator, alloc: DreamDoorMemAllocator) {
    this.emulator = emulator;
    this.alloc = alloc;
  }

  /**
   * Set session data for door operations
   */
  setSession(bbsSession: DreamDoorSession | null | undefined, socket: DreamDoorSocketLike | null): void {
    this.bbsSession = bbsSession || {};
    this.socket = socket;
  }

  /**
   * InitDoor (DD_LVO.InitDoor)
   * Initialize door and return handle
   * Input: A0 = Node ID string
   * Output: D0 = Door handle (0 on failure)
   */
  initDoor(nodeIdAddr: number): number {
    const nodeId = this.emulator.readString(nodeIdAddr, 16);
    console.log(`[DreamDoor] InitDoor: nodeId="${nodeId}"`);

    // Defensive (Task 4 review fix): a paused door can never be the one
    // calling InitDoor again (the CPU is stopped while a Prompt/GetKey is
    // pending), so this is always safe — but callers outside the 68K CPU
    // (Task 5's disconnect/timeout teardown paths) can reinit this
    // instance without going through a matching closeDoor() first. Clear
    // any leftover deferred-input state so a stale buffer address or a
    // permanently-paused emulator can never leak from a prior door
    // session into this one. See resetPendingInput()'s doc comment.
    this.resetPendingInput();

    if (this.initialized) {
      console.log(`[DreamDoor] Already initialized, returning existing handle`);
      return this.doorHandle;
    }

    // Allocate memory for all structures via the injected exec allocator.
    this.allocateStructures();

    // Populate structures with BBS data
    this.populateUserStruct();
    this.populateConfStruct();
    this.populateConfigStruct();
    this.populatePointersStruct();

    const parsedNodeId = parseInt(nodeId, 10);
    this.emulator.writeMemory(
      this.nodeInfoAddr + NODE_INFO_NODEID_OFFSET,
      Number.isNaN(parsedNodeId) ? 1 : parsedNodeId & 0xff
    );

    this.initialized = true;
    // The Pointers struct address doubles as the opaque door handle — it's
    // a real allocation from the injected allocator, so it can never
    // collide with another library's fixed base address.
    this.doorHandle = this.pointersAddr;

    console.log(`[DreamDoor] InitDoor complete, handle=0x${this.doorHandle.toString(16)}`);
    return this.doorHandle;
  }

  /**
   * InquirePointers (DD_LVO.InquirePointers)
   * Fill pointers structure with BBS data pointers
   * Input: A0 = Pointers buffer, D0 = Door handle
   * Output: D0 unchanged
   */
  inquirePointers(pointersBufferAddr: number, handle: number): number {
    console.log(`[DreamDoor] InquirePointers: buffer=0x${pointersBufferAddr.toString(16)}, handle=0x${handle.toString(16)}`);

    if (!this.initialized) {
      console.warn(`[DreamDoor] InquirePointers called before InitDoor`);
      return handle;
    }

    this.writePointersFields(pointersBufferAddr);

    console.log(`[DreamDoor] InquirePointers: userStruct=0x${this.userStructAddr.toString(16)}, confStruct=0x${this.confStructAddr.toString(16)}`);
    return handle;
  }

  /**
   * Prompt (DD_LVO.Prompt)
   * Display prompt and get user input.
   * Real calling convention: prompt(handle, bufferAddr, promptTextAddr, maxLen, mode).
   *
   * Deferred/blocking (Task 4): emits the prompt text, then drains any
   * type-ahead already sitting in inputBuffer through the same
   * per-keystroke accumulator queueInput() uses. If a CR was already
   * buffered, the request completes synchronously and the real status is
   * returned directly (no pause). Otherwise the emulator is paused and a
   * placeholder D0 is returned; queueInput() completes the request later
   * (see completePrompt()), overwriting D0 with the real status before
   * resume() lets the paused CPU continue — see LibraryTraps.handleTrap's
   * `this.emulator.setRegister(0, result)` (api/LibraryTraps.ts:1701),
   * which writes the handler's synchronous return value to D0
   * immediately after invoking the handler but before any pause takes
   * effect on the batch-execution loop (MoiraEmulator.pause()/resume()
   * just flip a `paused` boolean the loop checks — MoiraEmulator.ts:266-283
   * — so the placeholder write is harmless and gets clobbered by the real
   * value once queueInput() calls setRegister(0, ...) + resume()).
   */
  prompt(handle: number, bufferAddr: number, promptTextAddr: number, maxLen: number, mode: number): number {
    console.log(
      `[DreamDoor] Prompt: handle=0x${handle.toString(16)}, buffer=0x${bufferAddr.toString(16)}, maxLen=${maxLen}, mode=${mode}`
    );

    // Important 3 (DD final-review wave, 2026-08-16): the confirmed binding
    // spec (thoughts/shared/research/2026-08-14_fame-dd-door-compat.md,
    // DayDream RE section, LVO -48 row) has Prompt taking only TWO
    // arguments — +2(L)=A0 buffer ptr (prompt text copied in by the door,
    // then the answer copied back in place by the BBS) and +6(L)=packed
    // D1/D2 — there is no A1 argument at all. An earlier implementation
    // plan wrongly prescribed a separate A1 prompt-text pointer, which
    // dreamdoor-vectors.ts's Prompt handler still reads and passes here as
    // promptTextAddr; that register is NOT part of the real protocol and
    // can hold garbage/residual state from a prior call, which the OLD
    // code here would echo verbatim (up to 200 bytes of arbitrary emulator
    // memory sent to the terminal).
    //
    // CONFIRMED against primary source, not just RE inference: the real
    // Xim.s client (Sources/_Assembly/DD-XIM/Xim.s in the sibling
    // amiexpress_doors checkout, extracted from the official DayDream BBS
    // distribution) never sets A1 before either of its two _LVOPrompt
    // call sites. At JH_LI (Xim.s:346-360) A1 is left pointing PAST the
    // end of a just-copied string (pure side effect of an unrelated copy
    // loop at :350-352); at JH_PM (Xim.s:393-403) A1 is never touched at
    // all in that code path and simply carries over whatever an earlier,
    // unrelated call left in it. Both sites instead load A0 with the SAME
    // struct pointer that already holds the prompt text (`Move.L A2,A0`
    // at Xim.s:356/399, where A2 is the original incoming A0). This is
    // direct proof A1 was never a real Prompt argument in the shipping
    // protocol — it's accidental register residue, exactly the "up to 200
    // bytes of arbitrary emulator memory echoed" risk this fix closes.
    //
    // Fix: read the prompt text from the A0 buffer FIRST — it is intact at
    // call entry (the answer only overwrites it later, in
    // completePrompt()) — and only fall back to the legacy/unreliable A1
    // register if that read comes back empty, so a genuinely
    // spec-conformant door (prompt text in A0, A1 untouched/garbage) still
    // gets its prompt echoed instead of silently dropped.
    let promptStr = bufferAddr > 0 ? this.emulator.readString(bufferAddr, 200) : '';
    if (!promptStr && promptTextAddr > 0) {
      promptStr = this.emulator.readString(promptTextAddr, 200);
    }
    if (promptStr) {
      // Layout-bug fix (found live-testing DreamTagWall/AVH-BaudCheck,
      // 2026-08-16): this reads RAW text straight out of the door's own
      // 68K memory, exactly like xim/system-commands.ts's equivalent
      // Amiga-text-read call sites (which already wrap every emit in
      // convertAmigaTextForTerminal()) — but this one didn't. Real Amiga
      // doors rely on console.device's leniency: bare CSI (0x9B) / bare
      // "[32m" without an ESC prefix, and bare LF line endings (no CR).
      // A modern xterm.js terminal doesn't do either of those — bare "["
      // codes print as literal garbage characters and bare LF produces
      // the classic staircase effect, both of which read as "layout
      // issues" (misaligned banners, stray bracket/number noise).
      this.socket?.emit('ansi-output', convertAmigaTextForTerminal(promptStr));
    }

    this.pendingPromptBuffer = bufferAddr;
    this.pendingPromptMaxLen = Math.min(maxLen > 0 ? maxLen : 200, 200);
    this.pendingPromptMode = mode;
    this.promptLineBuffer = "";

    // Drain any input already buffered (type-ahead). May complete the
    // request synchronously (a CR was already in the backlog), in which
    // case pendingPromptBuffer is cleared and we must not pause.
    this.drainPromptInput();
    if (this.pendingPromptBuffer === null) {
      return 1;
    }

    this.emulator.pause();
    return 0; // placeholder — see doc comment above
  }

  /**
   * SendString (DD_LVO.SendString)
   * Send text string to user terminal
   * Input: D0 = handle, A0 = string pointer
   * Output: D0 unchanged
   */
  sendString(handle: number, stringAddr: number): number {
    const str = this.emulator.readString(stringAddr, 500);
    console.log(`[DreamDoor] SendString: "${str.substring(0, 50)}..."`);

    if (str) {
      // Same layout-bug fix as prompt() above — SendString is DreamDoor's
      // primary banner/text-output call and reads raw door-authored text
      // straight out of 68K memory, so it needs the same
      // convertAmigaTextForTerminal() every other raw-Amiga-text read
      // path in this codebase already applies (xim/system-commands.ts).
      this.socket?.emit('ansi-output', convertAmigaTextForTerminal(str));
    }

    return handle;
  }

  /**
   * GetKey (DD_LVO.GetKey)
   * Get single key press.
   * Real calling convention: getKey(handle, flags).
   *
   * If a char is already buffered (type-ahead), consumes and returns it
   * immediately — a byte, matching v1.0's `move.b (A1),D0`. Otherwise
   * pauses the emulator and defers to queueInput() (see completePrompt's
   * doc comment on prompt() for the D0-after-resume mechanism this and
   * that share).
   */
  getKey(handle: number, flags: number): number {
    console.log(`[DreamDoor] GetKey: handle=0x${handle.toString(16)}, flags=${flags}`);

    if (flags & 8) {
      // v6.0 documents a word-extended return via this flag bit; not
      // implemented — falls back to the v1.0 byte behavior below.
      console.log('[DreamDoor] GetKey: v6 extended-key flag set but not implemented');
    }

    if (this.inputBuffer.length > 0) {
      const ch = this.inputBuffer[0];
      this.inputBuffer = this.inputBuffer.slice(1);
      return ch.charCodeAt(0) & 0xff;
    }

    this.emulator.pause();
    this.pendingKeyPending = true;
    return 0; // placeholder — overwritten via setRegister(0, ...) in queueInput()
  }

  /**
   * Deliver terminal input to the door (mirrors FIMProtocol.queueInput).
   * Buffers into inputBuffer, then drains into whichever of
   * prompt-line-accumulation / key-wait is pending — including neither,
   * in which case the data just sits as type-ahead for the next Prompt/
   * GetKey call.
   */
  queueInput(data: string): void {
    this.inputBuffer += data;

    if (this.pendingKeyPending) {
      if (this.inputBuffer.length === 0) {
        return;
      }
      const ch = this.inputBuffer[0];
      this.inputBuffer = this.inputBuffer.slice(1);
      this.pendingKeyPending = false;
      this.emulator.setRegister(0, ch.charCodeAt(0) & 0xff);
      this.emulator.resume();
      return;
    }

    if (this.pendingPromptBuffer !== null) {
      this.drainPromptInput();
    }
    // else: nothing pending — data stays in inputBuffer as type-ahead.
  }

  /**
   * True while a Prompt or GetKey call is deferred, waiting on terminal
   * input via queueInput(). Lets AmigaDoorSession's input router (Task 5)
   * decide whether to forward a keystroke here instead of XIM/TIM/DOS
   * stdin, the same way it checks FIMProtocol before those.
   *
   * NOT used by the live input router (see isActive() below) — gating
   * routing on this alone made type-ahead (keys typed between Prompt/GetKey
   * calls) unreachable in production, since input typed while nothing is
   * pending would fall through to DOS stdin instead of this library's own
   * inputBuffer (Important 2, DD final-review wave, 2026-08-16). Kept for
   * callers that specifically need to know "is a call deferred right now"
   * rather than "is a DD door active".
   */
  isWaitingForInput(): boolean {
    return this.pendingPromptBuffer !== null || this.pendingKeyPending;
  }

  /**
   * True from InitDoor() through CloseDoor() — the whole lifetime of a
   * running DreamDoor (DD) door, not just while a Prompt/GetKey call is
   * deferred. Backed by the existing `initialized` flag (set in
   * initDoor(), cleared in closeDoor()) rather than a new field.
   *
   * This is what the live input router (door-input-router.ts) routes on
   * (Important 2, DD final-review wave): mirrors FIMProtocol's own
   * pattern of routing unconditionally on protocol presence and letting
   * the library's own state machine (queueInput()'s type-ahead buffering
   * vs. pending-completion branches) decide what to do with each byte,
   * instead of gating routing on isWaitingForInput() and losing every
   * keystroke typed between deferred calls to the DOS stdin fallback.
   */
  isActive(): boolean {
    return this.initialized;
  }

  /**
   * Feed buffered chars into the pending Prompt request one at a time:
   * backspace (0x08/0x7F) drops the last buffered char and echoes
   * "\b \b"; printable chars (0x20-0x7E) are appended and echoed up to
   * pendingPromptMaxLen, then silently ignored past cap — echo is '*' for
   * mode 4 (password), the literal char otherwise; CR completes the
   * request (a following LF is swallowed as part of the same CRLF pair).
   * Other control chars are dropped. Copies FIMProtocol.feedLineChars'
   * per-keystroke shape (fim-protocol.ts:990-1028).
   */
  private drainPromptInput(): void {
    while (this.pendingPromptBuffer !== null && this.inputBuffer.length > 0) {
      const ch = this.inputBuffer[0];
      this.inputBuffer = this.inputBuffer.slice(1);

      if (ch === '\r') {
        if (this.inputBuffer[0] === '\n') {
          this.inputBuffer = this.inputBuffer.slice(1); // LF following CR ignored
        }
        this.completePrompt();
        return;
      }

      const code = ch.charCodeAt(0);
      if (code === 0x08 || code === 0x7f) {
        if (this.promptLineBuffer.length > 0) {
          this.promptLineBuffer = this.promptLineBuffer.slice(0, -1);
          this.socket?.emit('ansi-output', '\b \b');
        }
        continue;
      }

      if (code >= 0x20 && code <= 0x7e && this.promptLineBuffer.length < this.pendingPromptMaxLen) {
        this.promptLineBuffer += ch;
        if (this.pendingPromptMode === 4) {
          this.socket?.emit('ansi-output', '*');
        } else {
          this.socket?.emit('ansi-output', ch);
        }
      }
      // Non-printable, or already at cap: drop silently (backspace/CR still work).
    }
  }

  /**
   * Complete the pending Prompt: write the accumulated line into the
   * caller's buffer, set D0=1 (success — matches the real library's
   * `Cmp.L #0,D0 / Beq .clost`; 0 only means carrier lost, which this
   * emulation never synthesizes on its own), and resume the emulator.
   * Safe to call from prompt() itself for the synchronous-complete path
   * (CR already buffered before pause()) — resume() on an
   * already-not-paused emulator is a harmless no-op (MoiraEmulator.ts:275-283),
   * same as FIMProtocol.completeLineNow() relies on.
   */
  private completePrompt(): void {
    const bufferAddr = this.pendingPromptBuffer!;
    const maxLen = this.pendingPromptMaxLen;
    const line = this.promptLineBuffer;

    this.pendingPromptBuffer = null;
    this.pendingPromptMaxLen = 0;
    this.pendingPromptMode = 0;
    this.promptLineBuffer = "";

    this.writeString(bufferAddr, line, maxLen);
    this.emulator.setRegister(0, 1);
    this.emulator.resume();
  }

  /**
   * Clear all deferred Prompt/GetKey input state (Task 4 review fix).
   * Called from closeDoor() and defensively from initDoor(). If a
   * Prompt/GetKey was genuinely still pending (the emulator paused) when
   * this runs, resume() it as part of the reset — otherwise nothing would
   * ever call resume() again (queueInput()'s completion branches only
   * fire when pendingPromptBuffer !== null or pendingKeyPending is true,
   * both of which this just cleared), leaving the CPU permanently paused.
   */
  private resetPendingInput(): void {
    const hadPending = this.pendingPromptBuffer !== null || this.pendingKeyPending;

    this.inputBuffer = "";
    this.pendingPromptBuffer = null;
    this.pendingPromptMaxLen = 0;
    this.pendingPromptMode = 0;
    this.promptLineBuffer = "";
    this.pendingKeyPending = false;

    if (hadPending) {
      this.emulator.resume();
    }
  }

  /**
   * DisplayFile (DD_LVO.DisplayFile)
   * Display file with optional pause
   * Input: D0 = handle, A0 = filename, D1 = pause flag
   * Output: D0 unchanged
   */
  displayFile(handle: number, filenameAddr: number, pauseFlag: number): number {
    const filename = this.emulator.readString(filenameAddr, 256);
    console.log(`[DreamDoor] DisplayFile: "${filename}", pause=${pauseFlag}`);

    // File display would be handled by BBS file display system
    // For now, just log it

    return handle;
  }

  /**
   * DDCommand (DD_LVO.DDCommand)
   * Execute door command
   * Input: D0 = handle, A0 = command string
   * Output: D0 unchanged
   */
  ddCommand(handle: number, commandAddr: number): number {
    const command = this.emulator.readString(commandAddr, 256);
    console.log(`[DreamDoor] DDCommand: "${command}"`);

    // Command execution would be handled by BBS command system

    return handle;
  }

  /**
   * CloseDoor (DD_LVO.CloseDoor)
   * Close door and cleanup resources
   * Input: D0 = handle
   * Output: D0 unchanged
   */
  closeDoor(handle: number): number {
    console.log(`[DreamDoor] CloseDoor: handle=0x${handle.toString(16)}`);

    if (this.initialized) {
      this.alloc.freeMem(this.pointersAddr, DP_SIZEOF);
      this.alloc.freeMem(this.userStructAddr, USER_SIZEOF);
      this.alloc.freeMem(this.confStructAddr, CONF_SIZEOF);
      this.alloc.freeMem(this.configStructAddr, CFG_SIZEOF);
      this.alloc.freeMem(this.nodeInfoAddr, NODE_INFO_SIZEOF);
    }

    this.pointersAddr = 0;
    this.userStructAddr = 0;
    this.confStructAddr = 0;
    this.configStructAddr = 0;
    this.nodeInfoAddr = 0;
    this.initialized = false;
    this.doorHandle = 0;

    // Task 4 review fix: a pending Prompt/GetKey (paused emulator, stale
    // buffer address, partial line) must never survive CloseDoor. Left
    // alone, Task 5's external disconnect/timeout teardown could tear the
    // door down while genuinely mid-Prompt/GetKey, leaving the emulator
    // permanently paused (nothing left pending to ever call resume()
    // again) or leaking a freed buffer address into a subsequent door's
    // session on this same library instance.
    this.resetPendingInput();

    return handle;
  }

  /**
   * JoinConference (DD_LVO.JoinConference)
   * Switch to different conference
   * Input: D0 = handle, D1 = conference number
   * Output: D0 unchanged
   */
  joinConference(handle: number, confNum: number): number {
    console.log(`[DreamDoor] JoinConference: conf=${confNum}`);

    // Conference switching would be handled by BBS

    return handle;
  }

  /**
   * XprSend (DD_LVO.XprSend)
   * Xmodem/Zmodem protocol handler
   * Input: D0 = handle, A0 = file buffer, A1 = output buffer
   * Output: D0 unchanged
   */
  xprSend(handle: number, fileBufferAddr: number, outputBufferAddr: number): number {
    console.log(`[DreamDoor] XprSend: fileBuffer=0x${fileBufferAddr.toString(16)}`);

    // Protocol handling would be done by transfer system

    return handle;
  }

  /**
   * ScanFileDirs (DD_LVO.ScanFileDirs)
   * Scan file directories in conference
   * Input: D0 = handle, D1 = conference number
   * Output: D0 unchanged
   */
  scanFileDirs(handle: number, confNum: number): number {
    console.log(`[DreamDoor] ScanFileDirs: conf=${confNum}`);

    return handle;
  }

  /**
   * Disconnect (DD_LVO.Disconnect)
   * Drop DTR line, disconnect user
   * Input: D0 = handle
   * Output: D0 unchanged
   */
  disconnect(handle: number): number {
    console.log(`[DreamDoor] Disconnect`);

    // Disconnect would be handled by BBS connection manager

    return handle;
  }

  // =========================================================================
  // Private helper methods
  // =========================================================================

  private allocateStructures(): void {
    // Real exec allocations — can never collide with another library's
    // fixed base address (this was the bug: a hardcoded 0xE0000 DREAMDOOR_BASE
    // collided with ExecLibrary's INTUITION_LIB_ADDR at 0x0e0000).
    this.pointersAddr = this.alloc.allocMem(DP_SIZEOF, MEMF_CLEAR);
    this.userStructAddr = this.alloc.allocMem(USER_SIZEOF, MEMF_CLEAR);
    this.confStructAddr = this.alloc.allocMem(CONF_SIZEOF, MEMF_CLEAR);
    this.configStructAddr = this.alloc.allocMem(CFG_SIZEOF, MEMF_CLEAR);
    this.nodeInfoAddr = this.alloc.allocMem(NODE_INFO_SIZEOF, MEMF_CLEAR);

    console.log(
      `[DreamDoor] Allocated structures: pointers=0x${this.pointersAddr.toString(16)}, user=0x${this.userStructAddr.toString(16)}, conf=0x${this.confStructAddr.toString(16)}, config=0x${this.configStructAddr.toString(16)}, node=0x${this.nodeInfoAddr.toString(16)}`
    );
  }

  private populateUserStruct(): void {
    const user = this.bbsSession.user || {};
    const addr = this.userStructAddr;

    // Confirmed/inferred string fields (USER_OFFSET, dd-constants.ts).
    // maxLen values are capped to the gap before the NEXT confirmed field
    // so a long value can never clobber a field at a higher offset.
    this.writeString(addr + USER_OFFSET.USER_HANDLE, user.username || 'Guest', 25); // gap to USER_ORGANIZATION@0x34
    this.writeString(addr + USER_OFFSET.USER_ORGANIZATION, user.location || 'Unknown', 46); // gap to USER_VOICEPHONE@0x63
    this.writeString(addr + USER_OFFSET.USER_VOICEPHONE, user.phone || '', 15); // gap to USER_PASSWORD@0x78 is 21 bytes — stay well under that, don't "safely" bump toward 0xbc
    // USER_PASSWORD@0x78 is intentionally left zeroed — doors get session
    // state, not the plaintext password.

    // Confirmed/inferred numeric fields.
    this.emulator.writeMemory(addr + USER_OFFSET.USER_SCREENLENGTH, user.linesPerScreen || 24);
    this.emulator.writeMemory32(addr + USER_OFFSET.USER_ULBYTES, user.bytesUpload || 0);
    this.emulator.writeMemory32(addr + USER_OFFSET.USER_DLBYTES, user.bytesDownload || 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_ULFILES, user.uploads || 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_DLFILES, user.downloads || 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_PUBMESSAGES, user.messagesPosted || 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_CONNECTIONS, user.timesCalled || 1);
    this.emulator.writeMemory(addr + USER_OFFSET.USER_BYTERATIO, user.ratio || 0);
    this.emulator.writeMemory(addr + USER_OFFSET.USER_SECURITYLEVEL, user.secLevel || 10);
    // USER_LASTCALL: intentionally unmodeled — no bbsSession field carries a
    // last-call timestamp yet, so this is left zeroed rather than forgotten.
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_LASTCALL, 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_DAILYTIMELIMIT, user.dailyTimeLimit || 60);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_TIMEREMAINING, this.bbsSession.timeRemaining || 60);
  }

  private populateConfStruct(): void {
    const addr = this.confStructAddr;

    this.emulator.writeMemory(addr + CONF_OFFSET.CONF_NUMBER, this.bbsSession.conferenceId || 1);
    this.writeString(addr + CONF_OFFSET.CONF_NAME, this.bbsSession.conferenceName || 'Main', 58);
  }

  private populateConfigStruct(): void {
    const addr = this.configStructAddr;

    // Only CFG_SYSOPNAME is confirmed (dp_DayDream sub-field @+0x1a). No
    // BBS-name offset is guessed here — see CFG_SIZEOF comment above.
    this.writeString(addr + CFG_OFFSET.CFG_SYSOPNAME, this.bbsSession.sysopName || 'Sysop', 31);
  }

  private populatePointersStruct(): void {
    this.writePointersFields(this.pointersAddr);
  }

  /** Shared by populatePointersStruct (internal copy) and InquirePointers (caller's buffer). */
  private writePointersFields(addr: number): void {
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_DayDream, this.configStructAddr);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_CurrConf, this.confStructAddr);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_CurrUser, this.userStructAddr);
    // dp_DoorParams isn't written by the real library's InquirePointers reply
    // (a confirmed gap — see dd-constants.ts), but we populate it anyway
    // since both sides (this emulation and our own doors) agree on the layout.
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_DoorParams, 0);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_BpsRate, 115200);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_IODevice, 0);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_CurrentNode, this.nodeInfoAddr);
  }

  private writeString(addr: number, str: string, maxLen: number): void {
    const bytes = Buffer.from(str.substring(0, maxLen), 'ascii');
    for (let i = 0; i < bytes.length; i++) {
      this.emulator.writeMemory(addr + i, bytes[i]);
    }
    // Null terminate
    this.emulator.writeMemory(addr + bytes.length, 0);
  }
}
