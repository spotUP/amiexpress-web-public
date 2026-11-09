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

import { Socket } from 'socket.io';
import { clearScreenFor } from '../utils/ansi.util';
import { joinChatRoom, leaveChatRoom, sendChatRoomMessage, createChatRoom, listChatRooms, type JoinedRoom, type CreatedRoom, type NewRoomOptions } from './door-chat-rooms';
import { EventEmitter } from 'events';
import { doorReadFile, doorWriteFile, doorFileExists, doorReadInfoFile, doorWriteInfoFile, doorListFiles } from './door-files';
import {
  doorGetTheme, doorSetTheme, doorListThemes, doorListScreenThemes, doorGetScreenTheme,
  doorListCoSysopPersonas, doorGetCoSysopPersona, doorSetCoSysopPersona, doorSetScreenTheme,
} from './door-themes';
import { doorSendMessage, doorPostMessage } from './door-messages';
import { doorEmitCustomEvent, doorAchievement, doorNotify, doorNotifications, doorAchievements } from './door-events';
import { doorRequestArchiveUpload, doorInstallDoor, doorGrantBeebRomAccess } from './door-archive';
import { doorJoinConference, doorListConferences, doorGetSystemInfo, doorGetNodes, doorAddUserNote } from './door-board';
import { doorExecuteCommand, doorGetDoorList, doorDeleteDoor, doorSetDoorEnabled } from './door-commands';
import {
  doorIsKeyPressed, doorGetPressedKeys, doorOnKeyDown, doorOnKeyUp, doorOnKeyEvent, doorHotkey, doorSetModemSpeed,
} from './door-input';
import { doorGetUser, doorGetUserList, doorEraseMyAccount, doorSetUserEmail } from './door-users';
import type { BBSSession } from '../index';
import { PetsciiStreamConverter } from '../utils/petscii.util';
import { db } from '../database';
import { checkConfAccess } from '../handlers/message/message-scan.handler';
import {
  MODEM_OPTIONS, webTerminalState, applyModemSpeed, togglePetsciiPalette as applyPetsciiPalette,
  togglePetsciiCharset as applyPetsciiCharset, petsciiCharsetNotice, toggleAnimations as applyAnimations,
  type WebTerminalState,
} from '../services/user-settings/web-terminal-settings';
import { animationsAllowed } from '../services/user-settings/animations';
import { bindToDoorContext } from './door-effects-context';
import { TERMINAL_FONTS } from '../constants/terminal-fonts';
import { chooseTerminalFont as applyTerminalFont } from '../services/terminal-font.service';
import { myDataRows } from '../handlers/user/gdpr.handler';
import {
  enableGameMode as enableGameModeForSession,
  disableGameMode as disableGameModeForSession,
} from '../services/game-mode.service';
import { applyInstallMetadata, buildDoorList, DoorListEntry } from './door-list';
import './ami-stripper.lib'; // ensure module is in require cache for DOORMAN

import { doorTerminalSize } from './door-terminal-size';
import { wrapDoorTextForSession } from '../utils/wrap-for-session.util';
import { puaToUnicode } from '@amiexpress/bbs-door-sdk/petscii';
import { sessionWantsPetscii } from '../utils/petscii-session-model';
import { sendKittyImage, sessionHasKittyGraphics, type KittyImage, type SendKittyImageOptions } from '../services/kitty-graphics.service';
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
    this.socket.emit('ansi-output', clearScreenFor(this.session));
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
    return doorTerminalSize(this.session);
  }

  /** The call's Alt+Enter choice: true = responsive, false = 80x25 (every call starts false). */
  getTerminalModeChoice(): boolean {
    return this.session?.terminalWideChoice === true;
  }

  /**
   * Remember the caller's Alt+Enter choice for the rest of the CALL (never
   * saved on the account) and tell the running door its new size. Telnet and
   * SSH callers cannot resize their terminal, so no NAWS follows a toggle:
   * the door hears the size it should now draw through screen:resize, the
   * same event a real resize raises. Web callers get the real resize too.
   */
  setTerminalModeChoice(wide: boolean): void {
    this.session.terminalWideChoice = wide;
    this.announceTerminalSize();
  }

  private announceTerminalSize(): void {
    const size = this.getTerminalSize();
    this.emitInternal('screen:resize', { cols: size.width, rows: size.height });
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

  /** The terminal answered the kitty graphics query OK (services/kitty-graphics.service.ts). */
  get kittyGraphics(): boolean { return sessionHasKittyGraphics(this.session); }

  /** Picture for a kitty caller, else `opts.fallback`; not via `write`, whose wrap breaks base64. */
  sendImage(image: KittyImage, opts: SendKittyImageOptions = {}): boolean {
    return sendKittyImage(this.session, image, opts, (apc) => { this.socket.emit('ansi-output', apc); }, (t) => { this.write(t); });
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
      // Input fires in socket.io's context; carry the door's (effect gate).
      this.session.doorInputHandler = bindToDoorContext(handler);
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

      // Input fires in socket.io's context; carry the door's (effect gate).
      this.session.doorInputHandler = bindToDoorContext(handler);
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
    this.session.doorTerminalWide = mode === 'wide';
    this.socket.emit('terminal-mode', mode);
    this.announceTerminalSize();
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

  /** W row 23 for the WEBTERM door: true when animations are now on. */
  async toggleAnimations(): Promise<boolean> {
    return applyAnimations(this.socket, this.session);
  }

  /** The board's one animations gate (W row 23, games exempt), read live. */
  animationsAllowed(): boolean {
    return animationsAllowed(this.session);
  }

  myData(): Array<{ label: string; value: string }> {
    return this.session.user ? myDataRows(this.session.user).map(([label, value]) => ({ label, value })) : [];
  }


  /** See doorEraseMyAccount in ./door-users. */
  async eraseMyAccount(
    answers: { confirm: string; password: string; username: string },
    opts: { check?: boolean } = {},
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    return doorEraseMyAccount(this.socket, this.session, answers, opts);
  }

  /** See doorSetModemSpeed in ./door-input. */
  setModemSpeed(bps: number): void {
    return doorSetModemSpeed(this.socket, this.session, bps);
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

  /** See doorIsKeyPressed in ./door-input. */
  isKeyPressed(key: string): boolean {
    return doorIsKeyPressed(this.session, key);
  }

  /** See doorGetPressedKeys in ./door-input. */
  getPressedKeys(): string[] {
    return doorGetPressedKeys(this.session);
  }

  /** See doorOnKeyDown in ./door-input. */
  onKeyDown(
    callback: (key: string, keyState: Record<string, boolean>, repeat: boolean) => void,
  ): void {
    return doorOnKeyDown(this.session, callback);
  }

  /** See doorOnKeyUp in ./door-input. */
  onKeyUp(callback: (key: string, keyState: Record<string, boolean>) => void): void {
    return doorOnKeyUp(this.session, callback);
  }

  /** See doorOnKeyEvent in ./door-input. */
  onKeyEvent(
    callback: (
      key: string,
      pressed: boolean,
      keyState: Record<string, boolean>,
      repeat: boolean,
    ) => void,
  ): void {
    return doorOnKeyEvent(this.session, callback);
  }

  /** See doorHotkey in ./door-input. */
  async hotkey(options: string[], prompt?: string): Promise<string> {
    return doorHotkey(this.socket, this.session, options, prompt);
  }

  // ========================================
  // USER DATA FUNCTIONS (like AEDoor GetDT)
  // ========================================

  /** See doorGetTheme in ./door-themes. */
  getTheme(): any {
    return doorGetTheme(this.session);
  }

  /** The id alone, for a door that only wants to know which one is active. */
  getThemeId(): string {
    return this.getTheme().id;
  }

  /** See doorSetTheme in ./door-themes. */
  async setTheme(id: string): Promise<string> {
    return doorSetTheme(this.session, id);
  }

  /** See doorListThemes in ./door-themes. */
  listThemes(): Array<{ id: string; name: string; blurb: string }> {
    return doorListThemes();
  }

  /** See doorListScreenThemes in ./door-themes. */
  listScreenThemes(): Array<{ slug: string; title: string; author: string; widths: number[]; status: string }> {
    return doorListScreenThemes(this.session);
  }

  /** See doorGetScreenTheme in ./door-themes. */
  getScreenTheme(): string {
    return doorGetScreenTheme(this.session);
  }

  // ---- Co-sysop personas (2026-09-08, s.2 + s.3) ----

  /** See doorListCoSysopPersonas in ./door-themes. */
  listCoSysopPersonas(): Array<{ slug: string; handle: string; name: string; blurb: string }> {
    return doorListCoSysopPersonas();
  }

  /** See doorGetCoSysopPersona in ./door-themes. */
  getCoSysopPersona(): string {
    return doorGetCoSysopPersona(this.session);
  }

  /** See doorSetCoSysopPersona in ./door-themes. */
  async setCoSysopPersona(slug: string): Promise<string> {
    return doorSetCoSysopPersona(this.session, slug);
  }

  /** See doorSetScreenTheme in ./door-themes. */
  async setScreenTheme(slug: string): Promise<string> {
    return doorSetScreenTheme(this.socket, this.session, slug);
  }

  /** See doorGetUser in ./door-users. */
  getUser(): BBSUser | null {
    return doorGetUser(this.session);
  }

  /** See doorGetUserList in ./door-users. */
  async getUserList(limit: number = 1000): Promise<BBSUser[]> {
    return doorGetUserList(limit);
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

  /** See doorJoinConference in ./door-board. */
  async joinConference(confNum: number): Promise<boolean> {
    return doorJoinConference(this.session, confNum);
  }

  /** See doorListConferences in ./door-board. */
  async listConferences(): Promise<BBSConference[]> {
    return doorListConferences();
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

  /** See doorGetSystemInfo in ./door-board. */
  async getSystemInfo(): Promise<BBSSystemInfo> {
    return doorGetSystemInfo();
  }

  /** See doorGetNodes in ./door-board. */
  async getNodes(): Promise<BBSNode[]> {
    return doorGetNodes(this.session);
  }

  // ========================================
  // FILE I/O FUNCTIONS (like DOS.library)
  // ========================================

  /** See doorReadFile in ./door-files. */
  async readFile(filename: string): Promise<string | null> {
    return doorReadFile(filename);
  }

  /** See doorWriteFile in ./door-files. */
  async writeFile(filename: string, content: string): Promise<boolean> {
    return doorWriteFile(filename, content);
  }

  /** See doorFileExists in ./door-files. */
  async fileExists(filename: string): Promise<boolean> {
    return doorFileExists(filename);
  }

  /** See doorReadInfoFile in ./door-files. */
  async readInfoFile(filename: string): Promise<Array<{ key: string; value: string; commented: boolean }> | null> {
    return doorReadInfoFile(filename);
  }

  /**
   * Append a sysop note about `username` to that user's notes - the SAME store
   * the account editor's `*` User Notes view reads (express.e userNotes,
   * bbsLoc/userNotes/<slot>). Used by livechat's "Add note". Returns false if
   * the user is unknown or has no slot.
   */
  async addUserNote(username: string, text: string): Promise<boolean> {
    return doorAddUserNote(this.session, username, text);
  }

  /** See doorWriteInfoFile in ./door-files. */
  async writeInfoFile(filename: string, tooltypes: Array<{ key: string; value: string; commented?: boolean }>): Promise<boolean> {
    return doorWriteInfoFile(filename, tooltypes);
  }

  /** See doorListFiles in ./door-files. */
  async listFiles(directory: string, pattern?: string): Promise<string[]> {
    return doorListFiles(directory, pattern);
  }

  // ========================================
  // MESSAGE FUNCTIONS
  // ========================================

  /** See doorSendMessage in ./door-messages. */
  async sendMessage(toUsername: string, subject: string, body: string): Promise<boolean> {
    return doorSendMessage(this.session, toUsername, subject, body);
  }

  /** See doorPostMessage in ./door-messages. */
  async postMessage(subject: string, body: string, to?: string): Promise<boolean> {
    return doorPostMessage(this.session, subject, body, to);
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
  async joinRoom(roomName: string, password?: string): Promise<JoinedRoom> {
    return joinChatRoom(this.socket, this.session, roomName, password);
  }

  /**
   * Leave the current chat room
   */
  async leaveRoom(): Promise<boolean> {
    return leaveChatRoom(this.socket, this.session);
  }

  /**
   * Send a message to the current chat room
   */
  async sendRoomMessage(message: string, options?: { clientId?: string; replyTo?: string | number }): Promise<boolean> {
    return sendChatRoomMessage(this.socket, this.session, message, options);
  }

  /**
   * Create a new chat room
   */
  async createRoom(roomName: string, options?: NewRoomOptions): Promise<CreatedRoom> {
    return createChatRoom(this.socket, this.session, roomName, options);
  }

  /**
   * List available chat rooms
   */
  async listRooms(showPrivate?: boolean): Promise<any[]> {
    return listChatRooms(showPrivate);
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

  /** See doorExecuteCommand in ./door-commands. */
  async executeCommand(command: string, params?: string | string[]): Promise<void> {
    return doorExecuteCommand(this.socket, this.session, command, params);
  }

  /** See doorGetDoorList in ./door-commands. */
  async getDoorList(): Promise<DoorListEntry[]> {
    return doorGetDoorList(this.session);
  }

  /** See doorDeleteDoor in ./door-commands. */
  async deleteDoor(
    identifier: string,
    isTypeScriptDoor?: boolean,
    onStep?: (step: { kind: 'ok' | 'skip' | 'fail'; text: string }) => void
  ): Promise<{ success: boolean; message: string; removed?: string[] }> {
    return doorDeleteDoor(this.session, identifier, isTypeScriptDoor, onStep);
  }

  /** See doorSetDoorEnabled in ./door-commands. */
  async setDoorEnabled(command: string, enabled: boolean): Promise<{ success: boolean; message: string }> {
    return doorSetDoorEnabled(this.session, command, enabled);
  }

  /** See doorEmitCustomEvent in ./door-events. */
  emitCustomEvent(eventType: string, message: string, data?: Record<string, any>): void {
    return doorEmitCustomEvent(this.session, eventType, message, data);
  }

  /** See doorAchievement in ./door-events. */
  achievement(type: string, opts: { value?: number; key?: string } = {}): boolean {
    return doorAchievement(this.session, type, opts);
  }

  /** See doorNotify in ./door-events. */
  notify(type: string, toUser: string, item: { title: string; body: string; url?: string; objectId: string }): boolean {
    return doorNotify(this.session, type, toUser, item);
  }

  /** See doorNotifications in ./door-events. */
  notifications(): import('@amiexpress/bbs-door-sdk/formats/notify').DoorNotificationsApi {
    return doorNotifications(this.socket, this.session);
  }

  /** See doorAchievements in ./door-events. */
  achievements(): import('../achievements/door-api').DoorAchievementsApi {
    return doorAchievements();
  }

  /** See doorSetUserEmail in ./door-users. */
  async setUserEmail(email: string): Promise<boolean> {
    return doorSetUserEmail(this.session, email);
  }

  /** See doorGrantBeebRomAccess in ./door-archive. */
  grantBeebRomAccess(): string {
    return doorGrantBeebRomAccess(this.session);
  }

  /** See doorRequestArchiveUpload in ./door-archive. */
  requestArchiveUpload(): Promise<{ path: string; filename: string }> {
    return doorRequestArchiveUpload(this.socket, this.session);
  }

  /** See doorInstallDoor in ./door-archive. */
  async installDoor(archivePath: string): Promise<{
    success: boolean;
    message: string;
    doorName?: string;
    command?: string;
    type?: string;
  }> {
    return doorInstallDoor(archivePath);
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
