/**
 * Unified BBS API for All Door Types
 *
 * This module provides a comprehensive BBS API that gives TypeScript, Python, and ARexx doors
 * the same capabilities that native 68k Amiga doors have through the library system.
 *
 * Native Amiga doors access these functions through:
 * - AEDoorLibrary: BBS-specific functions (GetDT, WriteStr, Prompt, etc.)
 * - DosLibrary: File I/O (Open, Close, Read, Write, etc.)
 * - ExecLibrary: Memory, ports, messages
 *
 * This API exposes equivalent functionality in a modern JavaScript/TypeScript interface.
 */

import * as fs from 'fs';
import { appendUserNote } from '../utils/user-notes.util';
import { grantRomAccess } from '../server/beeb-rom-access';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { Socket } from 'socket.io';
import { AnsiUtil } from '../utils/ansi.util';
import { EventEmitter } from 'events';
import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { PetsciiStreamConverter } from '../utils/petscii.util';
import { db } from '../database';
import { checkConfAccess } from '../handlers/message/message-scan.handler';
import { changeAccount } from '../services/account.service';
import {
  MODEM_OPTIONS, webTerminalState, applyModemSpeed, togglePetsciiPalette as applyPetsciiPalette,
  togglePetsciiCharset as applyPetsciiCharset, petsciiCharsetNotice, type WebTerminalState,
} from '../services/user-settings/web-terminal-settings';
import { TERMINAL_FONTS } from '../constants/terminal-fonts';
import { chooseTerminalFont as applyTerminalFont } from '../services/terminal-font.service';
import {
  myDataRows, refuseErasureConfirm, refuseErasurePassword, refuseErasureUsername, performErasure,
} from '../handlers/user/gdpr.handler';
import { getSystemTime } from '../utils/date-time.util';
import {
  enableGameMode as enableGameModeForSession,
  disableGameMode as disableGameModeForSession,
} from '../services/game-mode.service';
import { applyInstallMetadata, buildDoorList, DoorListEntry } from './door-list';
import { deleteDoorAndRefresh } from './door-delete';
import './ami-stripper.lib'; // ensure module is in require cache for DOORMAN

import { doorScreenHeight, doorScreenWidth } from '../amiga-emulation/xim/screen-width.util';
import { wrapDoorTextForSession } from '../utils/wrap-for-session.util';
import { puaToUnicode } from '@amiexpress/bbs-door-sdk/petscii';
import { sessionWantsPetscii } from '../utils/petscii-session-model';
import { getBoardConfig } from '../services/bbs-config-file.service';
import { config as appConfig } from '../config';
import { listOnlineNodes, type OnlineNode } from './who-is-online';
import { doorConferencePath, doorTooltypes } from './conference-access';

// applyInstallMetadata and the list build moved to ./door-list on 2026-08-31
// so the door list and its metadata rule live together and the HTTP route can
// reach them without a session. Re-exported because this is the import path
// DOORMAN and the existing tests already use - one definition, two ways in.
export { applyInstallMetadata, buildDoorList };
export type { DoorListEntry };

// The door-facing shapes live in ./bbs-api-types (2026-09-28, file size);
// re-exported so every existing import from here still resolves.
import type { BBSUser, BBSConference, BBSNode, BBSSystemInfo, UiSound } from './bbs-api-types';
export type { BBSUser, BBSConference, BBSNode, BBSSystemInfo, UiSound };

/**
 * Shortest gap between two plays of the SAME sound.
 *
 * A held cursor key steps a list about eight times a second (120ms), so this
 * sits just under one step: every deliberate move is heard, and a burst
 * cannot stack two copies of one blip into a buzz.
 */
const UI_SOUND_MIN_GAP_MS = 60;

/**
 * Main BBS API class
 * Provides all functions that doors need to interact with the BBS
 */
export class BBSApi {
  private socket: Socket;
  private session: BBSSession;
  private inputCallback?: (input: string) => void;
  private boundSocketHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  // Internal event emitter for server-side events (like resize)
  // This is needed because socket.emit() sends to the client, not to server-side listeners
  private internalEmitter: EventEmitter = new EventEmitter();

  // Streaming PETSCII converter for writePetscii/writePetsciiLine: doors emit
  // output in many small Buffer chunks, so charset/color/reverse state must
  // persist across calls instead of resetting on every chunk (audit B2).
  private petsciiConverter?: PetsciiStreamConverter;

  /** When each UI sound last went out; see playUiSound. */
  private lastUiSoundAt: Map<UiSound, number> = new Map();

  constructor(socket: Socket, session: BBSSession) {
    this.socket = socket;
    this.session = session;
  }

  setSocket(socket: Socket): void {
    if (this.socket === socket) return;

    for (const { event, handler } of this.boundSocketHandlers) {
      this.socket.off(event, handler);
    }

    this.socket = socket;

    for (const { event, handler } of this.boundSocketHandlers) {
      this.socket.on(event, handler);
    }
  }

  private bindSocketEvent(event: string, handler: (...args: any[]) => void): void {
    this.boundSocketHandlers.push({ event, handler });
    this.socket.on(event, handler);
  }

  /**
   * Register an event handler
   * Used by doors to listen for events like screen:resize
   * Listens on BOTH socket (client->server) AND internal emitter (server-side)
   */
  on(event: string, handler: (...args: any[]) => void): void {
    // Listen on socket for client-originated events
    this.bindSocketEvent(event, handler);
    // Also listen on internal emitter for server-side events (like resize)
    this.internalEmitter.on(event, handler);
  }

  /**
   * Emit an event internally (server-side only)
   * Used by socket handlers to notify the door of events like resize
   */
  emitInternal(event: string, ...args: any[]): void {
    this.internalEmitter.emit(event, ...args);
  }

  // ========================================
  // OUTPUT FUNCTIONS (like AEDoor WriteStr)
  // ========================================

  /**
   * Write text to user's terminal
   * Equivalent to AEDoor WriteStr() function
   *
   * A door's prose goes through the session wrap choke (C64/40-col plan,
   * Task 8): on a PETSCII session a row wider than the C64's screen folds
   * and eats the row beneath it, and fixing that per door - as Task 6 did
   * for phreakwars and ami-stripper - is fixing it in the wrong place. The
   * choke is identity for every ANSI caller at any width, and identity for
   * positioned output, so a blessed door's frames are untouched byte for
   * byte.
   */
  write(text: string): void {
    /*
     * A DOOR'S PROSE CARRIES AUTHORED MARKERS TOO.
     *
     * A colour a caller picked is `U+E200 + vic` and a glyph he drew is
     * `U+E1xx` (`sdk/petscii/pua.ts`). The board's own output folds those on
     * the way out (`ansi-buffer.util`); a door's did not, so a chat line with
     * a colour in it reached an eighty-column reader as a private-use
     * codepoint - tofu in xterm, `?` from iconv on a telnet Amiga.
     *
     * Same rule as the board's: the PEN is folded for everyone, because the
     * transducer turns SGR into the C64's colour byte anyway; the GLYPHS are
     * held back for a PETSCII caller, whose own transducer draws them
     * exactly.
     */
    const readable = puaToUnicode(text, { glyphs: !sessionWantsPetscii(this.session) });
    this.socket.emit('ansi-output', wrapDoorTextForSession(readable, this.session));
  }

  /**
   * Write text with newline
   *
   * Through `write` so there is ONE wrap decision for a door's prose, not
   * two that can drift apart.
   */
  writeLine(text: string): void {
    this.write(text + '\r\n');
  }

  /**
   * Clear screen
   */
  clearScreen(): void {
    this.socket.emit('ansi-output', AnsiUtil.clearScreen());
  }

  /**
   * Move cursor to position (1-indexed like Amiga)
   */
  moveCursor(row: number, col: number): void {
    this.socket.emit('ansi-output', `\x1b[${row};${col}H`);
  }

  /**
   * Set ANSI color
   */
  setColor(colorCode: number): void {
    this.socket.emit('ansi-output', `\x1b[${colorCode}m`);
  }

  // ========================================
  // PETSCII OUTPUT FUNCTIONS (for C64 mode)
  // ========================================

  /**
   * Check if session is in PETSCII mode (C64 terminal)
   * When true, doors should use 40x25 layout and PETSCII output
   */
  /**
   * Who is on the board.
   *
   * The SDK's BBSApi interface has declared `getOnlineUsers` since it was
   * written and nothing implemented it, so a door calling it got `undefined`
   * and no error. The telnet front end worked around the gap with a
   * Socket.IO round trip that could not complete - a door's socket talks to
   * the BROWSER - and drew placeholders instead of the node table.
   *
   * Reads the session map directly, because a door is in the same process
   * as it.
   */
  getOnlineUsers(): OnlineNode[] {
    return listOnlineNodes();
  }

  isPetsciiMode(): boolean {
    return this.session?.petsciiMode === true;
  }

  /**
   * False when the caller has ANSI colour off (M, or a terminal without ANSI).
   * The board then strips every SGR on the way out (AnsiUtil.forCaller), so a
   * door must show each state with a character, not a colour.
   */
  isAnsiMode(): boolean {
    return this.session?.ansiMode !== false;
  }

  /**
   * Get terminal dimensions (40x25 for PETSCII, 80x25 for ANSI).
   *
   * This is the ONLY geometry a TypeScript door ever sees: the SDK's
   * `createScreen()` calls it (sdk/utils/blessed-helpers.ts:923) and sizes
   * the blessed Screen from the answer, so a 40 here is what puts a door on
   * the XXS tier (sdk/engines/ui/blessed/core/responsive-constants.ts).
   *
   * The width comes from `doorScreenWidth()` - the same single source of
   * truth that answers BB_SCRWIDTH for 68K doors and sets launch-time
   * lineWrap (amiga-emulation/xim/screen-width.util.ts). A PETSCII session
   * is 40 columns even if `screenWidth` is missing or carries a stale 80
   * (a web caller's xterm reports 80 before the caller answers `P`);
   * anything else keeps exactly the width it had before, so 80-column
   * doors are byte-for-byte unchanged.
   */
  getTerminalSize(): { width: number; height: number } {
    const reported = this.session?.screenWidth;
    // FLOORED AT 80 for every non-PETSCII caller, the same rule
    // sessionColumns() applies at the door gate: `max(80, reported)`, never
    // narrower. createScreen() turns a width under 41 into the XXS
    // single-column profile (blessed-helpers.ts responsive/isCompactWidth),
    // so handing it a phone's raw 40 gave an ANSI caller the C64 layout - an
    // 80-column regression on a live path (socket-handlers.ts writes the
    // reported cols unfiltered for every web socket). One width authority,
    // not two.
    const floored = Math.max(80, reported && reported > 0 ? reported : 80);
    return {
      width: doorScreenWidth(this.session, floored),
      // Same rule for the other axis, through the SAME authority the 68K
      // side reads (doorScreenHeight): a PETSCII text screen is 25 rows BY
      // DEFINITION at both widths, so a stale 24 reported by a browser
      // terminal before the caller answered `P` must not shrink a PETSCII
      // door's canvas. Two answers to one question is how the width came to
      // disagree with itself before it had an authority.
      height: doorScreenHeight(this.session, this.session?.screenHeight || 25)
    };
  }

  /**
   * Get connection type (web, telnet, or ssh)
   * Used by SDK helpers to determine if Unicode conversion is needed
   */
  get connectionType(): 'web' | 'telnet' | 'ssh' {
    return (this.session as any)?.connectionType || 'web';
  }

  /**
   * Check if terminal supports Unicode
   * - Web terminals: Always true (xterm.js supports Unicode)
   * - Telnet/SSH: Detected via TTYPE negotiation
   *   - Modern terminals (xterm, PuTTY, iTerm): true
   *   - Amiga terminals (Term, NComm): false
   *   - Unknown: defaults to false for safety
   */
  get unicodeCapable(): boolean {
    // Web always supports Unicode
    if (this.connectionType === 'web') {
      return true;
    }
    // For telnet/SSH, check detected capability (defaults to false if unknown)
    return (this.session as any)?.unicodeCapable === true;
  }

  /**
   * Do key-down / key-up EDGES reach this door?
   *
   * False for every byte transport: telnet and SSH deliver a character stream
   * with no key-up, and nothing server-side decodes one (the browser's
   * key-down / key-up / keys:state arrive as socket.io events,
   * server/socket-handlers.ts:493-569). Doors branch on this through
   * DoorInputManager.isKeyStateActive() to choose held-key movement over their
   * character handler; a door that believes it has edges and never gets one
   * simply stops moving, which is what the eight arcade doors did on telnet.
   *
   * ONE fact answers it today - the same one `unicodeCapable` above starts
   * from - and that is deliberate: when a future transport gains key edges,
   * exactly one function changes and no door does.
   *
   * HAND-OVER, recorded so this does not become a second body of the same
   * predicate. `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md` gives
   * that function one home, `transportCapabilities(session).keyEvents` in
   * `server/transport-adapter.ts` (task TP-3). TP-7 landed before TP-3, so the
   * derivation is inline here for exactly as long as that takes; the answer is
   * identical, because the struct derives every field from
   * `session.connectionType` too. When the struct lands, this body becomes
   * `return transportCapabilities(this.session).keyEvents;` and nothing else
   * moves.
   */
  get deliversKeyEvents(): boolean {
    return this.connectionType === 'web';
  }

  /**
   * The board's own UI sounds, as heard by this caller.
   *
   * WHY THIS EXISTS, 2026-09-15. The sysop, twice: "doorman is solid but
   * silent". It is - it has no audio code at all, and neither does any other
   * server-rendered door, because there was no way for one to make a sound.
   * `ArcadeSfx` is not that way: it crosses to a door's own CLIENT bundle,
   * so a door without one (doorman, and every blessed utility) had nothing.
   *
   * This is the BOARD's channel, which the terminal has always had and
   * nothing on the server ever used: `audio:play-sfx` lands in
   * `packages/terminal/src/utils/media-handler.ts`, whose library is chrome -
   * click, select, error, join, mention - and which is GATED BY THE CALLER'S
   * UI-SOUNDS SETTING. That gate is the reason this belongs here rather than
   * in a door: a door must not be able to ignore it.
   *
   * Silent by construction where nothing can listen: a telnet or SSH caller
   * has no MediaHandler, and the emit lands nowhere, which is correct rather
   * than an error to guard against.
   */
  playUiSound(sound: UiSound): void {
    /*
     * A held cursor key steps a list about eight times a second and every
     * step asks for a sound. These are short synth blips; overlapping them
     * turns navigation into a buzz, so the same sound cannot restart inside
     * one blip's own length.
     *
     * Per SOUND, not global: a move and the select that ends it are two
     * different noises and must not silence each other.
     */
    const now = Date.now();
    const last = this.lastUiSoundAt.get(sound);
    if (last !== undefined && now - last < UI_SOUND_MIN_GAP_MS) return;
    this.lastUiSoundAt.set(sound, now);

    this.socket.emit('audio:play-sfx', { type: 'library', soundId: sound });
  }

  /**
   * Check if modem emulation is enabled
   * When true, output is throttled character-by-character to simulate modem speeds
   * Used by blessed SDK to enable slow connection mode (differential rendering)
   */
  get modemEmulationEnabled(): boolean {
    return this.session?.modemEmulationEnabled === true;
  }

  /**
   * Get modem emulation speed in bps
   * 0 = disabled, otherwise simulated baud rate (300, 1200, 2400, 9600, etc.)
   */
  get modemBps(): number {
    if (!this.session?.modemEmulationEnabled) {
      return 0;
    }
    return this.session?.modemBps || this.session?.user?.baud || 0;
  }

  /**
   * Write PETSCII content to terminal
   *
   * Buffer input (raw PETSCII bytes, e.g. from a door emitting native C64
   * output) goes out over the Task 9 raw-byte transport: 'petscii-bytes'
   * (base64), rendered by the web terminal's PetsciiMachine/PetsciiCanvas
   * and forwarded byte-for-byte to real C64 telnet callers by the
   * connection emitter (server/connection-emitter.ts). String input
   * (already Unicode-PUA text, e.g. hand-built screens) keeps the legacy
   * 'petscii-output' PetMe64-font path.
   *
   * @param data String (already in Unicode PUA format) or Buffer (raw PETSCII bytes)
   */
  writePetscii(data: string | Buffer): void {
    if (Buffer.isBuffer(data)) {
      this.socket.emit('petscii-bytes', data.toString('base64'));
    } else {
      // Already a string - send directly
      this.socket.emit('petscii-output', data);
    }
  }

  /**
   * Write PETSCII content with newline
   */
  writePetsciiLine(data: string | Buffer): void {
    if (Buffer.isBuffer(data)) {
      this.petsciiConverter = this.petsciiConverter ?? new PetsciiStreamConverter();
      const converted = this.petsciiConverter.convert(data);
      this.socket.emit('petscii-output', converted + '\r\n');
    } else {
      this.socket.emit('petscii-output', data + '\r\n');
    }
  }

  /**
   * Auto-detect mode and write appropriate output
   * Use this when you have both ANSI and PETSCII versions of content
   *
   * @param ansiText Text/ANSI output for modern terminals
   * @param petsciiData PETSCII output for C64 terminals (optional, falls back to ANSI)
   */
  writeAuto(ansiText: string, petsciiData?: string | Buffer): void {
    if (this.isPetsciiMode() && petsciiData !== undefined) {
      this.writePetscii(petsciiData);
    } else {
      this.write(ansiText);
    }
  }

  /**
   * Clear screen - auto-detects PETSCII vs ANSI mode
   */
  clearScreenAuto(): void {
    if (this.isPetsciiMode()) {
      // PETSCII clear screen: CHR$(147) = 0x93
      this.writePetscii(Buffer.from([0x93]));
    } else {
      this.clearScreen();
    }
  }

  // ========================================
  // INPUT FUNCTIONS (like AEDoor Prompt)
  // ========================================

  /**
   * Get line of input from user with optional prompt
   * Equivalent to AEDoor Prompt() function
   * Buffers input until Enter is pressed
   *
   * @param prompt Text to display before input
   * @param maxLength Maximum input length (default 255)
   * @returns Promise that resolves with user's input
   */
  async getLine(prompt?: string, maxLength: number = 255): Promise<string> {
    if (prompt) {
      this.socket.emit('ansi-output', prompt);
    }

    return new Promise<string>((resolve) => {
      let buffer = '';

      const handler = (input: string) => {
        // Handle each character
        for (let i = 0; i < input.length; i++) {
          const ch = input.charAt(i);
          const code = input.charCodeAt(i);

          // Enter key - submit line
          if (ch === '\r' || ch === '\n') {
            delete this.session.doorInputHandler;
            resolve(buffer);
            return;
          }

          // Backspace - delete last character
          if (code === 127 || code === 8) {
            if (buffer.length > 0) {
              buffer = buffer.substring(0, buffer.length - 1);
              // Send backspace sequence: move left, space, move left
              this.socket.emit('ansi-output', '\b \b');
            }
            continue;
          }

          // Regular character - add to buffer if printable and under max length
          if (code >= 32 && code <= 126 && buffer.length < maxLength) {
            buffer += ch;
            // Echo character
            this.socket.emit('ansi-output', ch);
          }
        }
      };

      // Register handler in session
      this.session.doorInputHandler = handler;
    });
  }

  /**
   * Get single keypress from user
   * Equivalent to AEDoor GetKey() function
   */
  async getKey(prompt?: string): Promise<string> {
    if (prompt) {
      this.socket.emit('ansi-output', prompt);
    }

    return new Promise<string>((resolve) => {
      const handler = (input: string) => {
        delete this.session.doorInputHandler;
        resolve(input.charAt(0)); // Return first character only
      };

      this.session.doorInputHandler = handler;
    });
  }

  // ========================================
  // GAME MODE INPUT (real-time key tracking)
  // ========================================

  /**
   * Enable game mode for real-time keyboard input
   * When enabled:
   * - Frontend sends raw keydown/keyup events (no OS key repeat delay)
   * - Multiple keys can be held simultaneously
   * - Use isKeyPressed() to check key states
   * - Use onKeyDown/onKeyUp for event callbacks
   */
  enableGameMode(doorType: string = 'TS'): void {
    // Delegate so session.gameModeEnabled / currentDoorType track the emit.
    enableGameModeForSession(this.socket, this.session, doorType);
  }

  /**
   * Disable game mode and return to normal input
   */
  disableGameMode(): void {
    // Delegate so keyRepeatManager teardown + keyState reset happen too.
    disableGameModeForSession(this.socket, this.session);
  }

  /**
   * Enable mouse events for the door
   * When enabled, mouse clicks, movement, and wheel events are sent to the door
   * Required for neo-blessed and other UI frameworks that use mouse input
   */
  enableMouseEvents(): void {
    console.log('[BBSApi] enableMouseEvents() called, session:', typeof this.session, 'session.mouseEventsEnabled before:', this.session.mouseEventsEnabled);
    this.session.mouseEventsEnabled = true;
    console.log('[BBSApi] Mouse events enabled, session.mouseEventsEnabled after:', this.session.mouseEventsEnabled);
  }

  /**
   * Disable mouse events
   */
  disableMouseEvents(): void {
    this.session.mouseEventsEnabled = false;
console.log('[BBSApi] Mouse events disabled');
  }

  /**
   * Set terminal mode for responsive sizing
   * - 'fixed': 80 columns (default, for ANSI art compatibility)
   * - 'wide': responsive width (for neo-blessed doors that support wider layouts)
   */
  setTerminalMode(mode: 'fixed' | 'wide'): void {
    console.log(`[BBSApi] setTerminalMode called with mode=${mode}, socket.id=${this.socket.id}`);
    // Remembered on the session, so the board can put fixed back on door
    // exit even when the door never calls disableWideMode (crash, kick,
    // or a door that never learned the call) - stranded wide terminals at
    // the menu are that omission, live 2026-09-11.
    (this.session as any).doorTerminalWide = mode === 'wide';
    this.socket.emit('terminal-mode', mode);
    console.log(`[BBSApi] Emitted terminal-mode event with mode=${mode}`);
  }

  /**
   * Enable wide terminal mode (responsive width)
   * Call this at door startup if your door supports wider layouts
   */
  enableWideMode(): void {
    this.setTerminalMode('wide');
  }

  /**
   * Restore fixed 80-column terminal mode
   * Call this before door exit to restore normal BBS display
   */
  disableWideMode(): void {
    this.setTerminalMode('fixed');
  }

  /**
   * Set cursor style for mouse hover feedback (CSS cursor property)
   * Valid styles: 'default', 'pointer', 'text', 'move', 'grab', 'grabbing',
   *               'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize',
   *               'col-resize', 'row-resize', 'crosshair', 'not-allowed'
   */
  setCursorStyle(style: string): void {
    this.socket.emit('cursor-style', style);
  }

  /**
   * Declare which touch control scheme the player needs.
   *
   * 'menu' means swipes should move a selection and a tap should confirm;
   * 'game' means the door's own pad or gestures. Only the door knows which it
   * is showing, and a phone player cannot get past a menu that expects arrow
   * keys without being told (reported live 2026-08-25). Server-rendered doors
   * reach the terminal UI through this; client doors dispatch the same event
   * directly (sdk/client/input-mode.ts).
   */
  setInputMode(mode: 'game' | 'menu'): void {
    this.socket.emit('door:input-mode', mode);
  }

  // ===== Modem Emulation =====

  /**
   * Get current modem emulation speed in bps
   * Returns 0 if modem emulation is disabled (full speed)
   */
  getModemSpeed(): number {
    return (this.session as any).modemSpeed || 0;
  }

  /** W's web terminal rows for the WEBTERM door - services/user-settings/web-terminal-settings.ts. */
  webTerminalSettings(): WebTerminalState { return webTerminalState(this.session); }

  modemSpeedChoices(): string[] { return MODEM_OPTIONS.map(o => o.label); }

  async chooseModemSpeed(choice: number): Promise<boolean> {
    return applyModemSpeed(this.socket, this.session, choice);
  }

  terminalFontChoices(): Array<{ id: string; label: string }> {
    return TERMINAL_FONTS.map(f => ({ id: f.id, label: f.label }));
  }

  async chooseTerminalFont(fontId: string): Promise<'set' | 'petscii'> {
    return applyTerminalFont(this.socket, this.session, fontId);
  }

  async togglePetsciiPalette(): Promise<'vdc' | 'vic'> {
    return applyPetsciiPalette(this.socket, this.session);
  }

  async togglePetsciiCharset(): Promise<{ charset: 'standard' | 'swedish'; notice: string }> {
    const charset = await applyPetsciiCharset(this.socket, this.session);
    return { charset, notice: petsciiCharsetNotice(charset) };
  }

  myData(): Array<{ label: string; value: string }> {
    return this.session.user ? myDataRows(this.session.user).map(([label, value]) => ({ label, value })) : [];
  }

  private static readonly MAX_ERASE_PASSWORD_REFUSALS = 5;

  /**
   * The board's three GDPR erasure checks, in the board's order and with its
   * texts. `check: true` answers without erasing, so the door can take its
   * screen down before the board writes its erasure lines and drops the line.
   */
  async eraseMyAccount(
    answers: { confirm: string; password: string; username: string },
    opts: { check?: boolean } = {},
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const user = this.session.user;
    if (!user) return { ok: false, reason: 'Session has no user bound. Deletion cancelled.' };
    // A door can ask this as often as it likes, so the password check is an
    // oracle unless it is limited: five refused passwords per session, then no more.
    const counted = this.session as { erasurePasswordRefusals?: number };
    if ((counted.erasurePasswordRefusals ?? 0) >= BBSApi.MAX_ERASE_PASSWORD_REFUSALS) {
      return { ok: false, reason: 'Too many attempts. Deletion cancelled.' };
    }
    let reason = refuseErasureConfirm(answers.confirm);
    if (!reason) {
      reason = await refuseErasurePassword(user, answers.password);
      if (reason) {
        counted.erasurePasswordRefusals = (counted.erasurePasswordRefusals ?? 0) + 1;
        console.warn(`[gdpr] eraseMyAccount password refused for user ${user.id} (refusal ${counted.erasurePasswordRefusals})`);
      }
    }
    reason = reason ?? refuseErasureUsername(user, answers.username);
    if (reason) return { ok: false, reason };
    if (!opts.check) await performErasure(this.socket, this.session);
    return { ok: true };
  }

  /**
   * Set modem emulation speed
   * @param bps Baud rate (e.g., 2400, 9600, 14400). Use 0 to disable emulation (full speed)
   */
  setModemSpeed(bps: number): void {
    (this.session as any).modemSpeed = bps;

    // Update backend modem emulator (the one that wraps socket.emit)
    const { getModemEmulator } = require('../utils/modem-emulator.util');
    const modemEmulator = getModemEmulator(this.socket);
    if (bps > 0) {
      modemEmulator.enable(bps);
    } else {
      modemEmulator.disable();
    }

    // Notify frontend modem emulator as well
    this.socket.emit('modem-speed', bps);
  }

  /**
   * Disable modem emulation (full speed)
   */
  disableModemEmulation(): void {
    this.setModemSpeed(0);
  }

  /**
   * Check if modem emulation is active
   */
  isModemEmulationActive(): boolean {
    return this.getModemSpeed() > 0;
  }

  /**
   * Check if a key is currently pressed (game mode only)
   * @param key Key to check (e.g., 'ArrowLeft', 'a', 'space')
   */
  isKeyPressed(key: string): boolean {
    return this.session.keyState?.[key] === true;
  }

  /**
   * Get all currently pressed keys (game mode only)
   */
  getPressedKeys(): string[] {
    if (!this.session.keyState) return [];
    return Object.keys(this.session.keyState).filter(k => this.session.keyState![k]);
  }

  /**
   * Register callback for keydown events (game mode only)
   * Callback receives key name and full keyState object
   */
  onKeyDown(
    callback: (key: string, keyState: Record<string, boolean>, repeat: boolean) => void,
  ): void {
    const handler = (data: {
      key: string;
      pressed: boolean;
      keyState: Record<string, boolean>;
      repeat?: boolean;
    }) => {
      if (data.pressed) {
        // Third argument, so every existing two-argument callback is
        // untouched: a door that does not care about repeats never sees one.
        callback(data.key, data.keyState, data.repeat === true);
      }
    };
    this.session.doorKeyStateHandler = handler;
  }

  /**
   * Register callback for keyup events (game mode only)
   * Callback receives key name and full keyState object
   */
  onKeyUp(callback: (key: string, keyState: Record<string, boolean>) => void): void {
    const existingHandler = this.session.doorKeyStateHandler;
    const newHandler = (data: {
      key: string;
      pressed: boolean;
      keyState: Record<string, boolean>;
      repeat?: boolean;
    }) => {
      if (!data.pressed) {
        callback(data.key, data.keyState);
      }
      // Call existing handler if present (for onKeyDown)
      if (existingHandler && data.pressed) {
        existingHandler(data);
      }
    };
    this.session.doorKeyStateHandler = newHandler;
  }

  /**
   * Register callback for all key events (both down and up)
   * More efficient than separate onKeyDown/onKeyUp calls
   */
  onKeyEvent(
    callback: (
      key: string,
      pressed: boolean,
      keyState: Record<string, boolean>,
      repeat: boolean,
    ) => void,
  ): void {
    this.session.doorKeyStateHandler = (data: {
      key: string;
      pressed: boolean;
      keyState: Record<string, boolean>;
      repeat?: boolean;
    }) => {
      callback(data.key, data.pressed, data.keyState, data.repeat === true);
    };
  }

  /**
   * Display menu and get hotkey choice
   * Returns the key pressed (uppercase)
   */
  async hotkey(options: string[], prompt?: string): Promise<string> {
    if (prompt) {
      this.socket.emit('ansi-output', prompt);
    }

    return new Promise<string>((resolve) => {
      const handler = (input: string) => {
        delete this.session.doorInputHandler;
        const key = input.charAt(0).toUpperCase();
        resolve(key);
      };

      this.session.doorInputHandler = handler;
    });
  }

  // ========================================
  // USER DATA FUNCTIONS (like AEDoor GetDT)
  // ========================================

  /**
   * The caller's door theme, resolved.
   *
   * This is how a door stops hardcoding colours:
   *
   *     const theme = bbs.getTheme();
   *     const s = themeStyles(theme);
   *     createBox({ ...s.panel, label: ' DOORS ' });
   *
   * Always returns a theme - an absent or unrecognised preference resolves
   * to CLASSIC, which reproduces the board exactly as it has always looked.
   * A door never has to handle "no theme", and a cosmetic setting can never
   * be the reason a door fails to draw.
   */
  getTheme(): any {
    const { themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
    return themeById(this.session.user?.themePreference);
  }

  /** The id alone, for a door that only wants to know which one is active. */
  getThemeId(): string {
    return this.getTheme().id;
  }

  /**
   * Change the caller's theme and remember it.
   *
   * Resolved before it is stored, so an id this board does not have can
   * neither be written to the user's row nor puzzle somebody later - it
   * becomes CLASSIC, which is the board as it always was. Returns the id
   * that was actually saved.
   *
   * Takes effect the next time a door draws: a door already on screen has
   * its widgets built from the old theme, and repainting somebody's UI out
   * from under them is worse than asking them to re-enter it.
   */
  async setTheme(id: string): Promise<string> {
    const { themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
    const resolved = themeById(id);

    if (this.session.user) {
      const { db } = require('../database');
      await db.updateUser(this.session.user.id, { themePreference: resolved.id });
      this.session.user.themePreference = resolved.id;
    }
    return resolved.id;
  }

  /** Every theme this board offers, for a door that wants to show a list. */
  listThemes(): Array<{ id: string; name: string; blurb: string }> {
    const { THEMES } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
    return THEMES.map((t: any) => ({ id: t.id, name: t.name, blurb: t.blurb }));
  }

  /**
   * The SCREEN themes this caller may wear - the board's ART, not the door
   * colours above.
   *
   * Answered by `selectableThemes`, the same function the loader consults, so
   * a picker can never offer a theme the loader would then refuse.
   */
  listScreenThemes(): Array<{ slug: string; title: string; author: string; widths: number[]; status: string }> {
    const { selectableThemes } = require('../screens/caller-theme');
    const { config } = require('../config');
    return selectableThemes(config.get('dataDir'), {
      username: this.session.user?.username,
      secLevel: this.session.user?.secLevel,
      screenTheme: this.session.user?.screenTheme,
    }).map((theme: { slug: string; title: string; author: string; widths: number[]; status: string }) => ({
      slug: theme.slug, title: theme.title, author: theme.author,
      widths: theme.widths, status: theme.status,
    }));
  }

  /** The screen theme this caller is wearing right now. */
  getScreenTheme(): string {
    const { resolveCallerTheme } = require('../screens/caller-theme');
    const { config } = require('../config');
    return resolveCallerTheme(config.get('dataDir'), {
      username: this.session.user?.username,
      secLevel: this.session.user?.secLevel,
      screenTheme: this.session.user?.screenTheme,
    });
  }

  // ---- Co-sysop personas (2026-09-08, s.2 + s.3) ----

  /** Every persona this caller may pick - presets plus the sysop's own. */
  listCoSysopPersonas(): Array<{ slug: string; handle: string; name: string; blurb: string }> {
    try {
      const { allPersonas } = require('../handlers/sysop-ai/personas');
      const { db } = require('../database');
      let extra: any[] = [];
      try { extra = db.getOperatorChatRepository().listPersonas(); } catch { /* table not yet migrated */ }
      return allPersonas(extra).map((p: any) => ({ slug: p.slug, handle: p.handle, name: p.name, blurb: p.blurb }));
    } catch {
      const { PRESET_PERSONAS } = require('../handlers/sysop-ai/personas');
      return PRESET_PERSONAS.map((p: any) => ({ slug: p.slug, handle: p.handle, name: p.name, blurb: p.blurb }));
    }
  }

  /** The slug the caller chose - '' for the board's, 'random', or a persona slug. */
  getCoSysopPersona(): string {
    return (this.session.user?.aiPersona ?? '') as string;
  }

  /**
   * Remember which co-sysop answers this caller's pages. Answers the slug
   * actually in force: a slug nothing recognises is REFUSED, because a stored
   * preference the chat would not honour is a caller who pages and gets a
   * stranger while the picker says otherwise.
   */
  async setCoSysopPersona(slug: string): Promise<string> {
    const raw = String(slug ?? '').trim().toLowerCase();
    // '' and 'random' are choices, not personas - the board answers with them.
    if (raw === '' || raw === 'random') {
      if (this.session.user) {
        const { db } = require('../database');
        await db.updateUser(this.session.user.id, { aiPersona: raw });
        this.session.user.aiPersona = raw;
      }
      return raw;
    }
    // Anything else must be a persona the board knows - preset or the sysop's own.
    const roster = this.listCoSysopPersonas();
    const wanted = roster.find((p) => p.slug.toLowerCase() === raw);
    if (!wanted) return this.getCoSysopPersona();
    if (this.session.user) {
      const { db } = require('../database');
      await db.updateUser(this.session.user.id, { aiPersona: wanted.slug });
      this.session.user.aiPersona = wanted.slug;
    }
    return wanted.slug;
  }

  /**
    * Wear a screen theme. Answers the slug that is actually in force.
   *
   * Refusing rather than storing an unwearable slug is the point: a stored
   * preference the loader will not honour is a caller who sees the default
   * board and a picker that says otherwise. A theme that names a companion
   * DOOR theme applies it in the same action, through `setTheme` so an unknown
   * id resolves to `classic` rather than a broken door - and never the reverse:
   * picking a door theme leaves the board's art alone, because a door theme is
   * the board's and a screen theme may be one artist's work.
   */
  async setScreenTheme(slug: string): Promise<string> {
    const { canWearTheme, companionDoorTheme, resolveCallerTheme } = require('../screens/caller-theme');
    const { findTheme, DEFAULT_SLUG } = require('../screens/theme-registry');
    const { config } = require('../config');
    const root = config.get('dataDir');

    const caller = {
      username: this.session.user?.username,
      secLevel: this.session.user?.secLevel,
      screenTheme: this.session.user?.screenTheme,
    };

    const wanted = (slug ?? '').trim().toLowerCase();
    const entry = wanted === DEFAULT_SLUG ? null : findTheme(root, wanted);
    const allowed = wanted === DEFAULT_SLUG || (entry && canWearTheme(caller, entry));
    if (!allowed) return resolveCallerTheme(root, caller);

    if (this.session.user) {
      const { db } = require('../database');
      await db.updateUser(this.session.user.id, { screenTheme: wanted });
      this.session.user.screenTheme = wanted;
    }
    // The browser remembers the theme for the screens it draws before the
    // next login (the title). It was told only at login, so a theme picked
    // mid-call drew the OLD theme's title at the next connect and the right
    // one only the time after (sysop, 2026-10-02: h7 picked, 607080's title).
    this.socket.emit('screen-theme', { screenTheme: wanted });

    const companion = companionDoorTheme(root, wanted);
    if (companion) await this.setTheme(companion);

    return wanted;
  }

  /**
   * Get current user information
   * Equivalent to AEDoor GetDT() function with DT_NAME, DT_LOCATION, etc.
   */
  getUser(): BBSUser | null {
    if (!this.session.user) return null;

    return {
      id: this.session.user.id,
      username: this.session.user.username,
      realname: this.session.user.realname,
      location: this.session.user.location,
      phone: this.session.user.phone,
      email: this.session.user.email,
      secLevel: this.session.user.secLevel || 0,
      downloads: this.session.user.downloads || 0,
      uploads: this.session.user.uploads || 0,
      timeToday: this.session.user.timeToday || 0,
      lastCall: this.session.user.lastCall,
      numCalls: this.session.user.numCalls || 0,
      birthday: this.session.user.birthday,
      gender: this.session.user.gender
    };
  }

  /**
   * Get list of users (for autocomplete / directory UIs)
   */
  async getUserList(limit: number = 1000): Promise<BBSUser[]> {
    const users = await db.getUsers({ limit });
    return users.map((user: any) => ({
      id: user.id,
      username: user.username,
      realname: user.realname,
      location: user.location,
      phone: user.phone,
      email: user.email,
      secLevel: user.secLevel || 0,
      downloads: user.downloads || 0,
      uploads: user.uploads || 0,
      timeToday: user.timeToday || 0,
      lastCall: user.lastCall,
      numCalls: user.numCalls || 0,
      birthday: user.birthday,
      gender: user.gender,
    }));
  }

  /**
   * Get user's security level
   */
  getUserSecLevel(): number {
    return this.session.user?.secLevel || 0;
  }

  /**
   * Get user's time remaining (in minutes)
   */
  getTimeRemaining(): number {
    return this.session.timeRemaining || 60;
  }

  /**
   * Get time user has been online (in minutes)
   */
  getTimeOnline(): number {
    if (!this.session.loginTime) return 0;
    return Math.floor((Date.now() - this.session.loginTime) / 60000);
  }

  // ========================================
  // CONFERENCE FUNCTIONS
  // ========================================

  /**
   * Get current conference number
   */
  getCurrentConference(): number {
    return this.session.currentConf || 1;
  }

  /**
   * WHERE this conference's files are, as a host path - see
   * `./conference-access`, which is also where the rule lives that it comes
   * from `LOCATION.n` and never from the conference's number.
   */
  getConferencePath(conferenceNumber?: number): string {
    return doorConferencePath(
      appConfig.get('dataDir'),
      conferenceNumber ?? this.getCurrentConference(),
    );
  }

  /**
   * The ENABLED tooltypes of an icon under the board's directory - a door's
   * own settings, read the way the board reads them. See
   * `./conference-access`.
   */
  readTooltypes(relativePath: string): Record<string, string> {
    return doorTooltypes(appConfig.get('dataDir'), relativePath);
  }

  /**
   * Get current conference name
   */
  getCurrentConferenceName(): string {
    return this.session.currentConfName || 'Main';
  }

  /**
   * Move the caller into conference `confNum`: the board's own join state
   * (conference.handler joinConferenceForDoor), refused without access.
   * Setting currentConf alone left joinedConf, the rejoin values, the
   * conference's account counters and read pointers on the old conference.
   */
  async joinConference(confNum: number): Promise<boolean> {
    try {
      const { joinConferenceForDoor } = require('../handlers/operations/conference.handler');
      return await joinConferenceForDoor(this.session, confNum);
    } catch (error) {
console.error('[BBSApi] Error joining conference:', error);
      return false;
    }
  }

  /**
   * List available conferences
   */
  async listConferences(): Promise<BBSConference[]> {
    try {
      const conferences = await db.getConferences();
      return conferences.map((conf: any) => ({
        id: conf.id,
        name: conf.name,
        description: conf.description || '',
        accessLevel: conf.accessLevel ?? conf.access_level ?? 0
      }));
    } catch (error) {
console.error('[BBSApi] Error listing conferences:', error);
      return [];
    }
  }

  // ========================================
  // NODE/SYSTEM FUNCTIONS
  // ========================================

  /**
   * Get current node number
   */
  getNodeNumber(): number {
    return this.session.nodeId || 1;
  }

  /**
   * Get BBS system information
   */
  async getSystemInfo(): Promise<BBSSystemInfo> {
    const sysConfig = getBoardConfig(appConfig.get('dataDir'));
    return {
      bbsName: sysConfig?.bbs_name || 'AmiExpress-Web',
      sysopName: sysConfig?.sysop_name || 'Sysop',
      version: '2.x',
      nodes: sysConfig?.max_nodes || 255
    };
  }

  /**
   * Get information about all nodes (for WHO doors)
   */
  async getNodes(): Promise<BBSNode[]> {
    try {
      // Import NodeStatusManager (avoid circular dependency by lazy loading)
      const { nodeStatusManager } = await import('../nodes/NodeStatusManager');
      const activeNodes = nodeStatusManager.getActiveNodes();

      return activeNodes.map(node => ({
        nodeId: node.nodeId,
        username: node.handle || 'Unknown',
        location: node.location || '',
        activity: node.misc1 || 'Online',
        online: true
      }));
    } catch (error) {
console.error('[BBSApi] Error getting nodes:', error);
      // Fallback: return current node only
      return [
        {
          nodeId: this.getNodeNumber(),
          username: this.session.user?.username || 'Unknown',
          location: 'In door',
          activity: 'Running door',
          online: true
        }
      ];
    }
  }

  // ========================================
  // FILE I/O FUNCTIONS (like DOS.library)
  // ========================================

  /**
   * Read text file and return contents
   * Equivalent to DOS Open()/Read()/Close()
   *
   * @param filename Path relative to BBS root or absolute
   * @returns File contents as string, or null if error
   */
  async readFile(filename: string): Promise<string | null> {
    try {
      // Resolve path relative to BBS data directory
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      const content = amigafs.readFileSync(fullPath, 'utf8');
      return content.toString();
    } catch (error) {
console.error(`[BBSApi] Error reading file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Write text to file
   * Equivalent to DOS Open()/Write()/Close()
   */
  async writeFile(filename: string, content: string): Promise<boolean> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      amigafs.writeFileSync(fullPath, content, 'utf8');
      return true;
    } catch (error) {
console.error(`[BBSApi] Error writing file ${filename}:`, error);
      return false;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filename: string): Promise<boolean> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      return amigafs.existsSync(fullPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Read and parse Amiga .info file (tooltypes)
   * Returns array of key/value pairs extracted from the binary .info file
   *
   * @param filename Path to .info file relative to BBS root or absolute
   * @returns Array of tooltype entries, or null if error
   */
  async readInfoFile(filename: string): Promise<Array<{ key: string; value: string; commented: boolean }> | null> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      // Use the proper .info file parser that handles binary format
      const { parseInfoFile } = require('../utils/info-file.util');
      const infoFile = parseInfoFile(fullPath);

      // Return tooltypes in a simplified format
      return infoFile.tooltypes.map((tt: any) => ({
        key: tt.key,
        value: tt.value,
        commented: tt.commented
      }));
    } catch (error) {
console.error(`[BBSApi] Error reading .info file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Append a sysop note about `username` to that user's notes - the SAME store
   * the account editor's `*` User Notes view reads (express.e userNotes,
   * bbsLoc/userNotes/<slot>). Used by livechat's "Add note". Returns false if
   * the user is unknown or has no slot.
   */
  async addUserNote(username: string, text: string): Promise<boolean> {
    const target = await db.getUserByUsername(username);
    if (!target?.slotNumber) return false;
    // With no caller the note is the board's own: signed with the sysop name
    // the board is configured with (getSystemInfo), not a literal account
    // name - there is no account called sysop on the live board (2026-09-28).
    const author = this.session?.user?.username ?? (await this.getSystemInfo()).sysopName;
    return appendUserNote(target.slotNumber, author, text);
  }

  /**
   * Write/update Amiga .info file tooltypes
   * Preserves binary header and icon data, only updates tooltypes
   *
   * @param filename Path to .info file relative to BBS root or absolute
   * @param tooltypes Array of tooltype entries to write
   * @returns true if successful, false on error
   */
  async writeInfoFile(filename: string, tooltypes: Array<{ key: string; value: string; commented?: boolean }>): Promise<boolean> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(bbsRoot, filename);

      // Use the proper .info file parser and writer
      const { parseInfoFile, writeInfoFile } = require('../utils/info-file.util');

      // Parse existing file to preserve header and icon data
      const infoFile = parseInfoFile(fullPath);

      // Update tooltypes
      infoFile.tooltypes = tooltypes.map((tt: any) => ({
        key: tt.key.toUpperCase(),
        value: tt.value,
        commented: tt.commented || false,
        originalLine: `${tt.commented ? '!' : ''}${tt.key.toUpperCase()}=${tt.value}`
      }));

      // Write back to file
      writeInfoFile(infoFile);
console.log(`[BBSApi] writeInfoFile OK: ${fullPath} (${tooltypes.length} tooltypes)`);
      return true;
    } catch (error) {
console.error(`[BBSApi] writeInfoFile FAILED: ${filename}:`, error);
      return false;
    }
  }

  /**
   * List files in directory
   * Equivalent to DOS ExAll()
   */
  async listFiles(directory: string, pattern?: string): Promise<string[]> {
    try {
      const config = require('../config').config;
      const bbsRoot = config.get('dataDir');
      const fullPath = path.isAbsolute(directory)
        ? directory
        : path.join(bbsRoot, directory);

      const files = amigafs.readdirSync(fullPath);

      // Apply pattern filter if provided (simple glob matching)
      if (pattern) {
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
          'i'
        );
        return files.filter(f => regex.test(f));
      }

      return files;
    } catch (error) {
console.error(`[BBSApi] Error listing directory ${directory}:`, error);
      return [];
    }
  }

  // ========================================
  // MESSAGE FUNCTIONS
  // ========================================

  /**
   * Send private message to another user
   * Equivalent to AEDoor JH_PM command
   */
  async sendMessage(toUsername: string, subject: string, body: string): Promise<boolean> {
    try {
      const messageData = {
        subject,
        body,
        author: this.session.user?.username || 'Unknown',
        timestamp: getSystemTime(),
        conferenceId: this.getCurrentConference(),
        messageBaseId: 1, // Default to first message base
        isPrivate: true,
        toUser: toUsername,
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
        editedAt: undefined
      };

      await db.createMessage(messageData);
console.log(`[BBSApi] Sent private message to ${toUsername}: ${subject}`);
      return true;
    } catch (error) {
console.error('[BBSApi] Error sending message:', error);
      return false;
    }
  }

  /**
   * Post message to current conference
   * Equivalent to AEDoor JH_SM command
   */
  /**
   * Post a message, optionally TO SOMEBODY.
   *
   * The recipient is the third argument and used to be missing entirely, so
   * the mail composer - the one door that sends mail - called this with
   * `(to, subject, body)` and had its arguments read as `(subject, body)`:
   * the recipient became the SUBJECT, the subject became the BODY, and what
   * the caller actually wrote was dropped on the floor. It arrived as a
   * public message to ALL with the recipient's name as its title (the sysop,
   * 2026-09-23, reading back a message he had sent to dino).
   *
   * A message addressed to a name is PRIVATE, which is express.e's own rule;
   * `ALL` is the public case and the default when no name is given.
   */
  async postMessage(subject: string, body: string, to?: string): Promise<boolean> {
    try {
      const recipient = (to ?? '').trim();
      const addressed = recipient.length > 0 && recipient.toUpperCase() !== 'ALL';
      const messageData = {
        subject,
        body,
        author: this.session.user?.username || 'Unknown',
        timestamp: getSystemTime(),
        conferenceId: this.getCurrentConference(),
        messageBaseId: 1, // Default to first message base
        isPrivate: addressed,
        toUser: addressed ? recipient : undefined,
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
        editedAt: undefined
      };

      await db.createMessage(messageData);
console.log(`[BBSApi] Posted message to conference ${this.getCurrentConference()}: ${subject}${addressed ? ` (to ${recipient})` : ''}`);
      return true;
    } catch (error) {
console.error('[BBSApi] Error posting message:', error);
      return false;
    }
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  /**
   * A TypeScript door's line in the CallersLog - its BB_CALLERSLOG
   * (express.e:3804-3805), which goes in as given. The line is the door's
   * own; by express.e's convention a detail line starts with a tab.
   */
  async logActivity(action: string, details?: string): Promise<void> {
    const { callersLogManager } = require('../services/CallersLogManager');
    const nodeId = this.getNodeNumber();
    callersLogManager.logActivity(nodeId, details ? `${action} ${details}` : action);
  }

  /**
   * Display ANSI file to user
   * Equivalent to express.e ShowGFile() function
   */
  async displayFile(filename: string): Promise<boolean> {
    const content = await this.readFile(filename);
    if (content) {
      this.write(content);
      return true;
    }
    return false;
  }

  /**
   * Pause for user keypress
   */
  async pause(prompt: string = '\r\n\x1b[32mPress any key to continue...\x1b[0m'): Promise<void> {
    await this.getKey(prompt);
  }

  /**
   * Display text with MCI codes processed.
   * Equivalent to express.e processMci() function.
   *
   * NOTE: parseMciCodes is async (returns a Promise<{ parsed, ... }>)
   * because it does database lookups for some user-info codes.
   * Previously this method called it without `await`, treating the
   * Promise as a string — broken since async parseMciCodes landed.
   * No live caller in the repo (audit 2026-05-05), so this returns
   * a Promise now; if a caller appears, it must `await` the result.
   */
  async displayMCI(text: string): Promise<void> {
    const { parseMciCodes, addAnsiEscapes } = require('../handlers/screen.handler');

    const result = await parseMciCodes(text, this.session);
    let processed = result?.parsed ?? '';
    processed = addAnsiEscapes(processed);
    processed = processed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    this.write(processed);
  }

  // ========================================
  // DATABASE FUNCTIONS
  // ========================================

  /**
   * Execute SQL query (for advanced doors)
   * Restricted by user security level
   */
  async query(sql: string, params?: any[]): Promise<any[]> {
    // Only allow for high security users
    if (this.getUserSecLevel() < 100) {
      throw new Error('Database access requires security level 100+');
    }

    const { db } = require('../database');
    const result = await db.query(sql, params);
    return result.rows;
  }

  // ========================================
  // CHAT ROOM FUNCTIONS (for LiveChat door)
  // ========================================

  /**
   * Join a chat room
   * Calls the handler directly instead of socket emit
   * Note: setGroupChatDependencies is called at server startup in index.ts
   */
  async joinRoom(roomName: string, password?: string): Promise<{ success: boolean; roomId?: string; roomName?: string; memberCount?: number; members?: any[]; error?: string }> {
    try {
      const { handleRoomJoin } = require('../handlers/chat/group-chat.handler');

      // Create a response collector
      let response: any = null;
      // Restore what was FOUND, not a bound copy of it: on a socket.io Socket
      // `emit` lives on the PROTOTYPE, so assigning a bound copy back would pin
      // a permanent own property onto the instance. Same rule as
      // `c64-door-adapter.ts:333-344`.
      const hadOwnEmit = Object.prototype.hasOwnProperty.call(this.socket, 'emit');
      const found = this.socket.emit;
      const downstream = found.bind(this.socket);

      // Intercept the room:joined event
      const interceptor = ((event: string, ...args: any[]) => {
        if (event === 'room:joined') {
          response = args[0];
        }
        return downstream(event, ...args);
      }) as any;
      this.socket.emit = interceptor;

      try {
        // Call handler directly
        await handleRoomJoin(this.socket, this.session, { roomName, password });
      } finally {
        // In a `finally` so a throwing handler cannot leak the interceptor, and
        // only while ours is still the live one, so a wrapper installed during
        // the handler is not torn off.
        if (this.socket.emit === interceptor) {
          if (hadOwnEmit) this.socket.emit = found;
          else delete (this.socket as any).emit;
        }
      }

      if (response) {
        return {
          success: true,
          roomId: response.roomId,
          roomName: response.roomName,
          memberCount: response.memberCount,
          members: response.members
        };
      }

      return { success: false, error: 'Failed to join room' };
    } catch (error) {
console.error('[BBSApi] Error joining room:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Leave the current chat room
   */
  async leaveRoom(): Promise<boolean> {
    try {
      const { handleRoomLeave } = require('../handlers/chat/group-chat.handler');
      await handleRoomLeave(this.socket, this.session);
      return true;
    } catch (error) {
console.error('[BBSApi] Error leaving room:', error);
      return false;
    }
  }

  /**
   * Send a message to the current chat room
   */
  async sendRoomMessage(message: string): Promise<boolean> {
    try {
      const { handleRoomMessage } = require('../handlers/chat/group-chat.handler');
      await handleRoomMessage(this.socket, this.session, { message });
      return true;
    } catch (error) {
console.error('[BBSApi] Error sending room message:', error);
      return false;
    }
  }

  /**
   * Create a new chat room
   */
  async createRoom(roomName: string, options?: { topic?: string; isPublic?: boolean; password?: string; maxUsers?: number }): Promise<{ success: boolean; roomId?: string; error?: string }> {
    try {
      const { handleRoomCreate } = require('../handlers/chat/group-chat.handler');

      let response: any = null;
      // Restore what was FOUND - see the note in joinRoom above.
      const hadOwnEmit = Object.prototype.hasOwnProperty.call(this.socket, 'emit');
      const found = this.socket.emit;
      const downstream = found.bind(this.socket);

      const interceptor = ((event: string, ...args: any[]) => {
        if (event === 'room:created') {
          response = args[0];
        }
        return downstream(event, ...args);
      }) as any;
      this.socket.emit = interceptor;

      try {
        await handleRoomCreate(this.socket, this.session, {
          roomName,
          topic: options?.topic,
          isPublic: options?.isPublic,
          password: options?.password,
          maxUsers: options?.maxUsers
        });
      } finally {
        if (this.socket.emit === interceptor) {
          if (hadOwnEmit) this.socket.emit = found;
          else delete (this.socket as any).emit;
        }
      }

      if (response) {
        return { success: true, roomId: response.roomId };
      }

      return { success: false, error: 'Failed to create room' };
    } catch (error) {
console.error('[BBSApi] Error creating room:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * List available chat rooms
   */
  async listRooms(showPrivate?: boolean): Promise<any[]> {
    try {
      const { db } = require('../database');
      const rooms = await db.listChatRooms(!showPrivate);
      return rooms || [];
    } catch (error) {
console.error('[BBSApi] Error listing rooms:', error);
      return [];
    }
  }

  /**
   * Get current room ID from session
   */
  getCurrentRoomId(): string | undefined {
    return this.session.currentRoomId;
  }

  /**
   * Get current room name from session
   */
  getCurrentRoomName(): string | undefined {
    return this.session.currentRoomName;
  }

  /**
   * Register handler for incoming chat messages
   * Note: This listens for messages FROM OTHER USERS in the room
   */
  onRoomMessage(callback: (msg: { userId: string; username: string; content: string; timestamp: Date }) => void): void {
    this.bindSocketEvent('chat:message', (data: any) => {
      callback({
        userId: data.userId,
        username: data.username,
        content: data.content,
        timestamp: new Date(data.createdAt)
      });
    });
  }

  /**
   * Register handler for user join events
   */
  onUserJoined(callback: (data: { userId: number; username: string }) => void): void {
    this.bindSocketEvent('room:user-joined', callback);
  }

  /**
   * Register handler for user leave events
   */
  onUserLeft(callback: (data: { userId: number; username: string }) => void): void {
    this.bindSocketEvent('room:user-left', callback);
  }

  /**
   * Execute a BBS command (same path as user-typed commands)
   * If a door is active, queue the command to run after the door exits.
   *
   * "A door is active" is session.doorExecuting, which executeTypeScriptDoor
   * holds for the whole of execute(). inDoorManager alone is not enough: the
   * SDK's dispose() clears it while the door is still inside execute(), and a
   * command run from there starts before the door returns (DOORS picking
   * PHREAKWARS: the menu door came back over it). inDoorManager still counts
   * for the runners that set only it (ARexx).
   */
  async executeCommand(command: string, params?: string | string[]): Promise<void> {
    const trimmed = (command || '').trim();
    if (!trimmed) return;

    const paramText = Array.isArray(params) ? params.join(' ') : (params || '').trim();
    const commandLine = paramText ? `${trimmed} ${paramText}` : trimmed;

    if (this.session.doorExecuting || this.session.inDoorManager) {
      if (!this.session.pendingDoorCommands) {
        this.session.pendingDoorCommands = [];
      }
      this.session.pendingDoorCommands.push(commandLine);
console.log(`[BBSApi.executeCommand] Queued command for after door exit: ${commandLine}`);
      return;
    }

    const { handleCommand } = require('../handlers/command.handler');
    // Bypass READ_COMMAND's line buffering and execute like an entered command.
    this.session.commandText = commandLine.toUpperCase();
    this.session.subState = LoggedOnSubState.PROCESS_COMMAND;
    await handleCommand(this.socket, this.session, '');
  }

  /**
   * Get list of available doors
   * Used by door menu systems to display available doors
   *
   * The build itself lives in ./door-list so the same rules serve the HTTP
   * route the DoorRepo C door reads (GET /api/door-admin/installed). This
   * method contributes the one thing a session knows and a route does not:
   * where the BBS root is.
   */
  async getDoorList(): Promise<DoorListEntry[]> {
    const bbsRoot = (this.session as any)?.dataDir || process.env.BBS_DATA_DIR || process.cwd();
    return buildDoorList(bbsRoot);
  }

  /**
   * Delete a door completely (directory + .info files)
   * Used by door manager for uninstalling doors
   * @param identifier - Door name (directory name for TS doors) or command name (for Amiga doors)
   * @param isTypeScriptDoor - Set to true if this is a TypeScript/SDK door
   * @returns Result object with success status and message
   */
  async deleteDoor(
    identifier: string,
    isTypeScriptDoor?: boolean,
    onStep?: (step: { kind: 'ok' | 'skip' | 'fail'; text: string }) => void
  ): Promise<{ success: boolean; message: string; removed?: string[] }> {
    // Check if user has sysop access
    if (this.session.user && this.session.user.secLevel < 250) {
      return {
        success: false,
        message: 'Access denied: SysOp access required to delete doors'
      };
    }

    // The removal and the cache reloads live in ./door-delete so the HTTP
    // route DELETE /api/door-admin/installed/:cmd runs the identical path.
    // Authorization stays here, because that route authorizes differently -
    // a launch token's secLevel, not a session's.
    return deleteDoorAndRefresh(identifier, isTypeScriptDoor, onStep);
  }

  /**
   * Enable or disable a door by its command name.
   * Requires SysOp access (secLevel >= 250).
   */
  async setDoorEnabled(command: string, enabled: boolean): Promise<{ success: boolean; message: string }> {
    if (this.session.user && this.session.user.secLevel < 250) {
      return { success: false, message: 'Access denied: SysOp access required' };
    }
    try {
      const { getAmigaDoorManager } = await import('./amigaDoorManager');
      const manager = getAmigaDoorManager();
      const result = await manager.setDoorEnabled(command, enabled);
      return result;
    } catch (error) {
      return { success: false, message: `Failed: ${(error as Error).message}` };
    }
  }

  /**
   * Emit a custom door event that will be broadcast to LiveChat and webhooks
   *
   * @param eventType - Type of event (e.g., 'project_created', 'task_completed', 'achievement_unlocked')
   * @param message - Human-readable message for display in LiveChat
   * @param data - Optional additional data to include with the event
   *
   * @example
   * ```typescript
   * ctx.bbs.emitCustomEvent('project_created', 'Created new demo project "Revision 2025"', {
   *   projectName: 'Revision 2025',
   *   projectType: 'demo'
   * });
   * ```
   */
  emitCustomEvent(eventType: string, message: string, data?: Record<string, any>): void {
    try {
      const { emitCustomDoorEvent } = require('../services/bbs-event-emitter');

      emitCustomDoorEvent({
        username: this.session.user?.username || 'Unknown',
        // Identity for the webhook PII policy. Without these two, every door
        // event was anonymised to the bare string "anon": applyPiiPolicy()
        // strips the username unless the user consented (or the board opts
        // in system-wide), and with no userId it cannot even fall back to
        // "User #12". Door score posts therefore never named the scorer.
        // Same shape the file/chat/message emitters already use.
        userId: (this.session.user as any)?.id,
        gdprConsented: !!(this.session.user as any)?.gdprConsentAt,
        nodeId: this.session.nodeId || 0,
        // The door's REGISTERED command. commandText is the raw input line -
        // it carries arguments ("GMASTER -X") and whatever alias or menu
        // command was used to launch, none of which a per-door webhook
        // filter can match. Falls back to the first word of the input.
        doorName: this.session.currentDoorName
          || this.session.commandText?.split(' ')[0]
          || 'Door',
        eventType,
        message,
        data,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[BBSApi.emitCustomEvent] Failed to emit event:', error);
      // Don't throw - event emission failures should not crash the door
    }
  }

  /**
   * Achievements (SP2, S10): report one of THIS door's own achievement
   * events. The type must be `door.<command>.<slug>` for the running door -
   * a door cannot report into another door's namespace or into a BBS
   * family - and it goes through the same reporter and the same outbox as
   * every BBS event. There is no direct HTTP call from a door. Returns
   * true when a row was written; false (with one WARN) otherwise, and it
   * never throws.
   *
   * @example
   * ```typescript
   * bbs.achievement('door.gmaster.win', { key: 'fast' });
   * ```
   */
  achievement(type: string, opts: { value?: number; key?: string } = {}): boolean {
    try {
      const command = String(this.session.currentDoorName || this.session.commandText?.split(' ')[0] || '').toLowerCase();
      const ns = new RegExp(`^door\\.${command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[a-z0-9_]+$`);
      if (!command || !ns.test(type)) {
        console.warn(`[WARN] achievements: door ${command || '?'} may not report ${type}; only door.${command || '<command>'}.<slug>`);
        return false;
      }
      const { report } = require('../achievements/reporter');
      return report(this.session, type, { value: opts.value, key: opts.key, door: command.toUpperCase() }) !== null;
    } catch (error) {
      console.warn(`[WARN] achievements: door report failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Notifications (NOTIFY door): raise one of THIS door's own events for a
   * user. The type must be `door.<command>.<slug>` for the running door - the
   * same namespace rule as achievement() - and `toUser` is a user id or a
   * name. `objectId` is required (it dedupes repeats); a call without one is
   * refused. It only queues an outbox row: whether and where the user hears
   * about it is their own NOTIFY choice. Returns true when a row was queued;
   * false (one WARN when the namespace is refused) otherwise. Never throws.
   *
   * @example
   * ```typescript
   * bbs.notify('door.tetris.your-turn', 'dino', { title: 'Your turn', body: 'bob moved' });
   * ```
   */
  notify(type: string, toUser: string, item: { title: string; body: string; url?: string; objectId: string }): boolean {
    try {
      const command = String(this.session.currentDoorName || this.session.commandText?.split(' ')[0] || '').toLowerCase();
      const { notifyFromDoor } = require('../notify/sites');
      return notifyFromDoor(command, type, toUser, item) === true;
    } catch (error) {
      console.warn(`[WARN] notify: door notify failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Notifications (NOTIFY door): the caller's own choices - catalogue, get/set,
   * follow, email verification, test. Acts on this session's user only. See
   * notify/door-api.ts.
   */
  notifications(): import('@amiexpress/bbs-door-sdk/formats/notify').DoorNotificationsApi {
    const { doorNotificationsApi } = require('../notify/door-api');
    return doorNotificationsApi(this.session, undefined, this.socket);
  }

  /**
   * Achievements (SP3): the server, through the board. The door gets the
   * answers; the board key stays here. See achievements/door-api.ts.
   */
  achievements(): import('../achievements/door-api').DoorAchievementsApi {
    const { doorAchievementsApi } = require('../achievements/door-api');
    return doorAchievementsApi();
  }

  /**
   * Achievements (SP3, S1): a caller with no address is not a player, and
   * the ACHIEVE door is where one is asked for. Changed on the caller's
   * account in memory, so the reporter sees it from now on, and written to
   * the user record with the account at logoff (express.e 8207). Returns
   * false (and changes nothing) for anything that is not shaped like an
   * address.
   */
  async setUserEmail(email: string): Promise<boolean> {
    const trimmed = String(email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254 || !this.session.user?.id) return false;
    try {
      // The caller's own account, in memory; saved with it (express.e 8207).
      await changeAccount(this.session, { email: trimmed });
      return true;
    } catch (error) {
      console.warn(`[WARN] achievements: could not store the address: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * A short-lived grant letting THIS caller fetch the BBC ROMs.
   *
   * The board refuses `/beeb/roms` to anyone who has not shown they own
   * them, so a door that is about to open the machine asks for one of
   * these and puts it on the emulator's URL. Callers who have not proved
   * are never given one - the door checks that before it calls.
   */
  grantBeebRomAccess(): string {
    const who = String(this.session.user?.id ?? this.session.user?.username ?? 'unknown');
    return grantRomAccess(who);
  }

  /**
   * Request the user to upload a door archive via the browser file picker.
   * Resolves with the local path once upload completes; rejects after 5 min or on cancel.
   */
  requestArchiveUpload(): Promise<{ path: string; filename: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.session.pendingDoorUpload = false;
        this.session.pendingDoorUploadCallback = null;
        this.session.pendingDoorUploadReject = null;
        reject(new Error('Upload timed out after 5 minutes'));
      }, 5 * 60 * 1000);

      this.session.pendingDoorUpload = true;
      this.session.pendingDoorUploadCallback = (result) => {
        clearTimeout(timeout);
        this.session.pendingDoorUpload = false;
        this.session.pendingDoorUploadCallback = null;
        this.session.pendingDoorUploadReject = null;
        resolve(result);
      };
      this.session.pendingDoorUploadReject = (err) => {
        clearTimeout(timeout);
        this.session.pendingDoorUpload = false;
        this.session.pendingDoorUploadCallback = null;
        this.session.pendingDoorUploadReject = null;
        reject(err);
      };

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { issueUploadTicket } = require('../handlers/file/download-ticket');
      this.socket.emit('show-file-upload', {
        // /api/upload takes no login: this one-time ticket is what says the
        // board asked THIS caller for a file.
        uploadUrl: issueUploadTicket(this.socket.id),
        accept: '.zip,.lha,.lzh,.lzx',
        maxSize: 100 * 1024 * 1024,
        multiple: false,
      });
    });
  }

  /**
   * Install a door archive at the given path.
   * Extracts, auto-detects type, places in Doors/, creates registration .info.
   */
  async installDoor(archivePath: string): Promise<{
    success: boolean;
    message: string;
    doorName?: string;
    command?: string;
    type?: string;
  }> {
    const { config } = require('../config');
    const { DoorInstaller } = require('./door-installer');
    const installer = new DoorInstaller(config.get('dataDir'));
    return installer.install(archivePath);
  }
}

/**
 * Create BBS API instance for a door session
 */
export function createBBSApi(socket: Socket, session: BBSSession): BBSApi {
  const api = new BBSApi(socket, session);
  console.log('[createBBSApi] Created BBSApi, has enableMouseEvents:', typeof api.enableMouseEvents);
  return api;
}
