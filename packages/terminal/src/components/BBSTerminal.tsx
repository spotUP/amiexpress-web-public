import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback, useState, useReducer } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io, Socket } from 'socket.io-client';
import { reconnectPolicy, shouldReconnectNow } from '../utils/reconnect-policy';
import '@xterm/xterm/css/xterm.css';
import { XTERM_CONFIG } from '../utils/terminal-utils';
import { createDoubleHeightFilter, type DoubleHeightFilter } from '../utils/teletext-double-height';
import { EmulatorOverlay } from './EmulatorOverlay';
import {
  FIT_TO_WINDOW,
} from '../utils/terminal-zoom';
import {
  DEFAULT_BBS_FONT,
  PRELOADED_FONTS,
  TELETEXT_FONT,
  seamlessTeletextSize,
  applyFont,
  fontFamilyFor,
  lineHeightFor,
  readCachedFont,
} from '../utils/session-font';
import {
  readCookieModemSpeed, writeCookieModemSpeed, writeCookieScreenTheme,
} from '../utils/session-cookie';
import { getZmodem } from '../utils/zmodem';
import { MediaHandler } from '../utils/media-handler';
import { ModemEmulator } from '../utils/modem-emulator';
import { classifyKey, trackKeyId, repeatAlive, mayAutoRepeat } from '../utils/key-overrides';
import { toggleFullscreen } from '../utils/fullscreen';
import { GamepadManager } from '../utils/gamepad-manager';
import { injectedKeyEvent } from '../utils/injected-key-event';
import type { AnyGamepadEvent } from '@amiexpress/bbs-door-sdk';
import { WideScreenMachine, PetsciiMachine, AnsiToPetsciiTransducer, petsciiInputToAscii, petsciiPaletteFor, screenTextInRect, rectFromCorners, type CellRect } from '@amiexpress/bbs-door-sdk/petscii';
import { PetsciiCanvas, type PetsciiCanvasHandle } from '../petscii/PetsciiCanvas';
import { petsciiSurfaceReducer, initialPetsciiSurface, type PetsciiSurface } from '../petscii/surface-state';

// RIP Graphics.
//
// The parser and renderer used to live in web/frontend/src/components/rip
// and were imported by nothing at all - the terminal carried its own
// canvas, its own mode detection and its own buffer, and never drew a
// single pixel. There are zero getContext calls in this file's history.
// The module moved here so the half that draws can meet the half that
// receives, which is what "the rip door never displayed rip graphics" was.
import RIPRenderer, { shouldDismissRipClick, type RIPRendererRef } from '../rip/RIPRenderer';
import { armRipLinger, type RipLinger } from '../rip/rip-linger';

const RIP_WIDTH = 640;
const RIP_HEIGHT = 350;

const SHARED_AUTH_TOKEN_KEY = 'authToken';
const BBS_AUTH_TOKEN_KEY = 'bbs_auth_token';
const SESSION_STATE_KEY = 'bbs_session_state';

interface BBSTerminalProps {
  /** BBS backend URL (defaults to auto-detect based on environment) */
  backendUrl?: string;
  /** Terminal font size */
  fontSize?: number;
  /** Additional CSS class */
  className?: string;
  /** Whether to show connection error UI (default: true) */
  showConnectionError?: boolean;
  /** Connection error callback */
  onConnectionError?: (error: Error) => void;
  /** Connection success callback */
  onConnect?: () => void;
  /** Disconnect callback */
  onDisconnect?: (reason: string) => void;
  /**
   * When set, overrides server 'terminal-mode' events.
   * Pass 'wide' on mobile so FitAddon controls columns.
   */
  forcedMode?: 'fixed' | 'wide';
  /**
   * When true, the terminal refocuses itself whenever it loses focus.
   * Use for full-screen BBS mode where input must always be captured.
   */
  keepFocused?: boolean;
  /**
   * When true the root element fills its parent (height: 100%) instead of the
   * whole viewport (height: 100vh). Set it when the host page reserves space
   * around the terminal — e.g. the mobile on-screen keyboard — otherwise the
   * terminal centres its 80x25 grid in the full viewport and the reserved
   * strip covers the bottom rows.
   */
  fillParent?: boolean;
  // REMOVED (sysop, 2026-09-12): zoomEnabled (viewer zoom override) -
  // the browser window alone decides the size now. Kept out of the props
  // so no host can re-enable what no longer exists.
  /**
   * REMOVED (sysop, 2026-09-12): fired once on mount with FIT_TO_WINDOW
   * for hosts that still listen; no gesture can change it any more.
   */
  onZoomChange?: (fraction: number) => void;
  /**
   * Fires when the terminal switches between the fixed 80x25 screen and a
   * door's wide/fullscreen mode. The host page needs it because the two are
   * sized by different rules: the fixed screen follows the window, while a
   * wide door's column count comes from its cell size and must not inherit
   * the fit.
   */
  onTerminalModeChange?: (mode: 'fixed' | 'wide') => void;
  /**
   * Fixed 80x25 mode only: centre the terminal box in the host's box.
   *
   * True (the default) is the plain reading of a fixed-size screen sitting on
   * a page. A host whose layout is anchored elsewhere passes false - the BBS
   * page does for a handheld session, where the on-screen keyboard reserves
   * the bottom of the viewport and the terminal belongs at the TOP of what is
   * left (measured on a 390x844 phone: centring drops it 166px, opening a gap
   * under the notch). Wide/fullscreen mode ignores this: it fills the screen.
   */
  centerInHost?: boolean;
  /**
   * Fires with the door id whenever a browser-side (client or hybrid) door
   * starts, and with null when it ends. Lets the host page swap in
   * door-specific UI, such as the mobile game controls.
   */
  onDoorChange?: (doorId: string | null) => void;
  /**
   * Fires with the surface the session now renders on: 'xterm' for an ANSI
   * session, 'canvas' once it turns out to be PETSCII (a simulated C64).
   * The host page needs this because a focused <canvas> cannot raise a
   * mobile soft keyboard and xterm's textarea is display:none while the
   * canvas owns the session - so the on-screen keyboard is the ONLY way to
   * type on a 'P' session, in any orientation.
   */
  onSurfaceChange?: (surface: PetsciiSurface) => void;
}

/**
 * Pointer events the doors listen for. The names are the socket event names -
 * see the door SDK's mouse handling and Doors/arkanoid/client.ts, which steers
 * its paddle from mouse-hover, mouse-drag and mouse-up alike.
 */
export type TerminalMouseEventType = 'mouse-hover' | 'mouse-drag' | 'mouse-click' | 'mouse-up';

export interface TerminalMouseModifiers {
  button?: number;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

/** A position on the terminal grid, 0-indexed - the doors add 1 themselves. */
export interface TerminalCell {
  x: number;
  y: number;
}

export interface BBSTerminalRef {
  focus: () => void;
  sendCommand: (command: string) => void;
  /** Feed raw BBS key data through the correct path for the current terminal state.
   *  During login states (username/password/etc.) replicates onKey handler logic directly.
   *  Post-login uses term.input() which fires onData → socket. */
  injectInput: (data: string) => void;
  getSocket: () => Socket | null;
  getTerminal: () => Terminal | null;
  /**
   * True while a teletext session owns the look (TDAText face at 2x).
   * The page's fit and the cell-size effect must not write options
   * past it - see texttv-mode below (ghost: the mode applied, then a
   * refit wrote the calibrated size back and T looked 1x, 2026-09-10).
   */
  isTexttvMode: () => boolean;
  /**
   * Press a key on behalf of an on-screen control. Runs the exact same
   * game-mode path as a physical keydown (held-key state + custom key repeat),
   * so DAS/ARR and held keys behave identically. No-op outside game mode.
   */
  pressGameKey: (key: string, code: string) => void;
  /** Release a key pressed via pressGameKey. Emits the matching key-up. */
  releaseGameKey: (key: string, code: string) => void;
  /**
   * Send a pointer event on behalf of an on-screen control, in terminal cell
   * coordinates. Runs the exact same emitter as the desktop mouse, so a thumb
   * dragged across the mobile trackpad and a mouse moved across the grid are
   * indistinguishable to the door. No-op unless a door or game mode is active.
   */
  sendMouse: (type: TerminalMouseEventType, cell: TerminalCell, modifiers?: TerminalMouseModifiers) => void;
  startDownload: (amigaPath: string) => Promise<void>;
  startUpload: (amigaPath: string, file: File) => Promise<void>;
}

/**
 * Tell the page a teletext session started or ended.
 *
 * The terminal owns the face and the grid; the PAGE owns how big a cell is,
 * because only it knows the window. The mode's own first guess (the
 * calibrated cell doubled) is what the caller sees until this lands, and it
 * fires after the face has loaded so the fit measures TDAText rather than
 * the fallback's metrics.
 */
function announceTexttvMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('bbs:texttv-mode', { detail: { enabled } }));
}

/**
 * Unified BBS Terminal Component
 *
 * Used by both:
 * - BBS Frontend (main terminal interface)
 * - SDK Preview (BBS tab for live testing)
 *
 * Features:
 * - Socket.IO connection to BBS backend
 * - Auto-login support
 * - PETSCII font switching
 * - Configurable connection handling
 */
export const BBSTerminal = forwardRef<BBSTerminalRef, BBSTerminalProps>(({
  backendUrl,
  fontSize = 16,
  className = '',
  showConnectionError = true,
  onConnectionError,
  onConnect,
  onDisconnect,
  forcedMode,
  keepFocused,
  fillParent,
  onZoomChange,
  onTerminalModeChange,
  centerInHost = true,
  onDoorChange,
  onSurfaceChange,
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Always-current refs so socket handlers see the latest values without dep-array reinit
  const forcedModeRef = useRef(forcedMode);
  forcedModeRef.current = forcedMode;
  const keepFocusedRef = useRef(keepFocused);
  // Assigned below, once `emulator` exists: an open emulator surface has to
  // switch the focus keeper off. See the assignment after that state.
  const onDoorChangeRef = useRef(onDoorChange);
  onDoorChangeRef.current = onDoorChange;
  // Id of the browser-side door currently running (null when none). Kept in a
  // ref so the socket handlers, which are registered once, always see it.
  const activeClientDoorId = useRef<string | null>(null);
  // Terminal mode: 'fixed' = 80 cols (centered, max-width), 'wide' = fullscreen responsive
  const [terminalMode, setTerminalMode] = useState<'fixed' | 'wide'>('fixed');

  /**
   * REMOVED (sysop, 2026-09-12): the viewer zoom override is gone - the
   * fraction is always fit-to-window and the browser window alone decides
   * the size. Kept as a constant (not removed) because the canvas surface
   * sizes its box from it below.
   */
  const zoomFraction = FIT_TO_WINDOW;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onTerminalModeChangeRef = useRef(onTerminalModeChange);
  onTerminalModeChangeRef.current = onTerminalModeChange;
  /** REMOVED (sysop, 2026-09-12): corner marks went with the corner drag. */
  /** The bezelled box wrapping the terminal and its overlays. */
  const zoomBoxRef = useRef<HTMLDivElement>(null);

  // Tracks the current calibrated font size so set-font / font-preference events
  // don't override the calibrated size with a hardcoded default. The prop is
  // already the EFFECTIVE size - the page's fit times the viewer's fraction -
  // so there is exactly one multiply and it does not happen here.
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  /**
   * TWO VALUES, because the browser no longer runs a login state machine
   * (TP-9b). The server drives the whole prompt for every transport now -
   * username, password, the new-user question, the password reset and the
   * forced change - and every keystroke leaves here as ordinary `command`
   * input, which is what the board already accepts for every other prompt.
   *
   * What is LEFT to know is only whether this session is past login, and two
   * things ask: `attemptTokenLogin` (do not auto-login over a live session)
   * and the disconnect handler.
   *
   * The eight-value union that used to be here, its five line buffers and the
   * echo they did are gone. They were the second implementation of a machine
   * the server already had, and the browser's copy diverged - its
   * `injectInput` twin handled the new-user prompt differently from
   * `term.onKey`'s, so the on-screen keyboard and a desktop key answered the
   * same question in two ways.
   */
  const loginState = useRef<'server-driven' | 'loggedin'>('server-driven');
  /**
   * A token login is in flight. Not login STATE: it stops the storage-event
   * listener from firing a second `login {token}` while the first is still
   * unanswered, which is the one thing the retired 'logging-in' value was
   * doing that still needs doing.
   */
  const tokenLoginPending = useRef<boolean>(false);
  const doorActive = useRef<boolean>(false);
  /**
   * The same fact as `doorActive`, as STATE, because the PETSCII canvas takes
   * it as a prop and a ref cannot re-render.
   *
   * A C64's cursor is a screen-EDITOR artifact. A door that owns the whole
   * screen has no editor and wants no cursor, but the canvas draws one from
   * the model wherever the last paint left it - so a playfield had a block
   * blinking in it ("i see a blinking petscii cursor in game"). xterm never
   * showed this because a door hides the cursor there; the blessed program
   * starts with `_cursorHidden = true` and so never writes the hide byte at
   * all, which means there is nothing on the wire for the transducer to
   * translate. The browser knows anyway: `door-active` says so.
   */
  const [doorOwnsScreen, setDoorOwnsScreen] = useState(false);
  const reconnectPending = useRef<boolean>(false);
  const forcedDisconnectRef = useRef<boolean>(false);  // Track server-initiated disconnect (logoff)
  const doorReadyMap = useRef<Record<string, boolean>>({});
  const doorMessageBuffer = useRef<Record<string, any[]>>({});
  const doorScripts = useRef<Record<string, HTMLScriptElement | null>>({});
  const keyState = useRef<Record<string, boolean>>({});
  /** Who called pressGameKey last, for the board's `[DOOR-INPUT]` trace. */
  const pressSource = useRef<string>('window');
  const keyRepeatTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});  // Key repeat timers, by physical key
  const keyLastSeen = useRef<Record<string, number>>({});
  /**
   * How fast a HELD key repeats, in ms. Application by default; a door that
   * declares `GAME_REPEAT=1` gets the arcade rate. See `key-repeat-mode`.
   */
  const keyRepeatRateRef = useRef<number>(30);  // Last keydown edge per physical key (repeat heartbeat)
  /**
   * Which repeat the door asked for: `game` (an arcade door, everything
   * repeats) or `application` (a door whose screen is a list or a table).
   * The RATE alone could not answer the question that matters in a menu -
   * WHICH keys may repeat at all.
   */
  const keyRepeatModeRef = useRef<'game' | 'application'>('game');
  /** How long a key must be held before the repeat starts; see the two delays. */
  const keyRepeatDelayRef = useRef<number>(400);
  const keyNames = useRef<Record<string, string>>({});  // Physical key -> last character (for key-up emits)
  const gameMode = useRef<boolean>(false);  // When true, send raw keydown/keyup events
  // Game-mode press/release, published by the init effect so the imperative
  // ref (on-screen game controls) drives the SAME code path as the window
  // keydown/keyup listeners - one input channel, identical DAS/ARR behaviour.
  const gameKeyPressRef = useRef<((key: string, code: string) => void) | null>(null);
  const gameKeyReleaseRef = useRef<((key: string, code: string) => void) | null>(null);
  const mouseButtonDown = useRef<boolean>(false);  // Track mouse button state for drag events
  const lastMouseHoverTime = useRef<number>(0);  // Throttle hover events
  // Pointer-lock virtual pointer (game mode): while the lock holds, real
  // clientX/Y freeze and movementX/Y carry the deltas - this ref is the
  // accumulated position the game keeps steering with.
  /** Whether the running door declared that it owns the pointer. */
  const capturePointer = useRef<boolean>(false);
  const lockedPointer = useRef<{ x: number; y: number } | null>(null);
  const guruTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const guruPhaseRef = useRef<number>(0);
  const guruStaticRendered = useRef<boolean>(false);
  const transferState = useRef<{ direction: 'upload' | 'download' | null; paths?: string[] }>({
    direction: null,
    paths: [],
  });
  const zmodemSentry = useRef<any | null>(null);
  const zmodemRef = useRef<any | null>(null);
  const mediaHandlerRef = useRef<MediaHandler | null>(null);
  const sfxBufferRef = useRef<string>('');
  const modemEmulatorRef = useRef<ModemEmulator | null>(null);

  // Full-canvas PETSCII session (petscii-full-canvas plan, Task 8). The
  // surface is either xterm (ANSI) or the PetsciiCanvas (a simulated C64):
  // every byte for a 'P' session goes transducer -> machine -> canvas,
  // including the login echo. Only a PETSCII event selects the
  // canvas (surface-state.ts); a fresh session on this mounted component
  // resets to xterm via clearPetsciiSession (token login, restore failed,
  // reconnect failed - 'session-restored' is a continuation and keeps it).
  //
  // surfaceRef mirrors `surface` for the socket handlers and writeTerm,
  // which live inside the mount-once effect and would otherwise close over
  // the first render's value forever.
  //
  // There is NO client-side baud pacing on this path, deliberately - see
  // enqueuePetscii below.
  const [surface, dispatchSurface] = useReducer(petsciiSurfaceReducer, initialPetsciiSurface);
  const surfaceRef = useRef<PetsciiSurface>(initialPetsciiSurface);
  const petsciiMachineRef = useRef<PetsciiMachine | null>(null);
  // The same instance as petsciiMachineRef, held in state so the render
  // reads it from state instead of a ref (a ref read during render is not
  // safe under concurrent rendering). Written next to the ref, always.
  /** Which sixteen colours the PETSCII canvas paints with: a C64's, or a C128's. */
  const [petsciiPalette, setPetsciiPalette] = useState<'vic' | 'vdc'>('vic');
  const [petsciiMachine, setPetsciiMachine] = useState<PetsciiMachine | null>(null);
  const petsciiTransducerRef = useRef<AnsiToPetsciiTransducer | null>(null);
  const petsciiCanvasRef = useRef<PetsciiCanvasHandle | null>(null);
  /*
   * DRAG-TO-COPY ON THE PETSCII CANVAS.
   *
   * A PETSCII session is pixels: xterm is hidden and the whole screen is a
   * `<canvas>`, so the browser has no text in it to select and the caller
   * cannot copy a thing ("i cant copy text in petscii mode", the sysop,
   * 2026-09-16). The canvas already reports the cell under the pointer, and
   * the machine still holds the screen codes, so a drag is turned into a
   * rectangle and read back as text here.
   *
   * The mouse is free to do this: a canvas session sends keystrokes to the
   * board and nothing else - `onCellPointer` had no consumer at all - so
   * selection cannot swallow input a door was waiting for.
   *
   * The anchor is a ref because a drag spans renders; the rectangle is state
   * because the canvas paints it as a highlight.
   */
  const petsciiSelectAnchor = useRef<{ x: number; y: number } | null>(null);
  const petsciiSelectionRef = useRef<CellRect | null>(null);
  const [petsciiSelection, setPetsciiSelection] = useState<CellRect | null>(null);
  const showPetsciiSelection = useCallback((rect: CellRect | null) => {
    petsciiSelectionRef.current = rect;
    setPetsciiSelection(rect);
  }, []);
  const clearPetsciiSession = useCallback(() => {
    surfaceRef.current = 'xterm';
    petsciiMachineRef.current = null;
    setPetsciiMachine(null);
    petsciiTransducerRef.current = null;
    dispatchSurface({ type: 'session-reset' });
  }, []);
  // Published by the init effect so injectInput (imperative handle) and the
  // canvas (JSX) drive the SAME login/command path as physical keys.
  const processInputKeyRef = useRef<(key: string) => void>(() => {});
  const focusSurfaceRef = useRef<() => void>(() => {});
  const fitTerminalRef = useRef<() => void>(() => {});
  // The write seam, published for the handlers that live OUTSIDE the socket
  // effect (ZMODEM messages, the Ctrl+C door abort). Writing straight to
  // terminalInstance there would drop the text into a hidden xterm.
  const writeTermRef = useRef<(text: string) => void>(() => {});

  // RIP Graphics state
  const [ripMode, setRipMode] = useState<boolean>(false);

  /**
   * A door asking for pixels instead of character cells.
   *
   * Null almost always. A door that needs a real framebuffer - an emulator,
   * so far - sends `emulator:open` and the surface goes over the terminal
   * until the caller closes it or the door takes it away.
   */
  const [emulator, setEmulator] = useState<{ url: string; title: string; machine?: string } | null>(null);

  /*
   * THE FOCUS KEEPER IS OFF WHILE THE EMULATOR SURFACE IS OPEN.
   *
   * xterm's textarea has a blur listener that takes focus back on the next
   * animation frame, so the terminal keeps the keyboard when a stray click
   * lands elsewhere. That is right for a terminal session and fatal for a
   * frame over the top of it: focusing the emulator blurs the textarea, the
   * keeper grabs focus straight back, and every keystroke goes to the
   * terminal instead of the machine - which looks exactly like an emulator
   * that ignores the keyboard.
   *
   * Assigned during render rather than mutated from an effect, because
   * `keepFocused` is a prop and this used to be a plain reassignment from
   * it on every render - anything an effect set here would be overwritten
   * by the next one.
   */
  keepFocusedRef.current = keepFocused && emulator === null;
  const ripModeRef = useRef<boolean>(false);

  // Web transparency overlays (CSS-based, for web connections only)
  // Position info (x, y, width, height) is in terminal cells, converted to pixels during render
  const [overlays, setOverlays] = useState<Map<string, {
    opacity: number;
    show: boolean;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    exclude?: { x: number; y: number; width: number; height: number };
  }>>(new Map());
  const overlayBufferRef = useRef<string>('');
  const ripRendererRef = useRef<RIPRendererRef | null>(null);
  const ripBuffer = useRef<string>(''); // Buffer for RIP commands
  // When a RIP button last sent a host command - a click that produced none
  // is a click on plain picture, and acts as a dismiss key instead.
  const ripCommandAt = useRef<number>(0);
  // A finished RIP SCREEN (BBSTITLE and friends) lingers until the user's
  // first key or click; the backend has already moved on to the next text
  // prompt underneath. Door pictures never linger - the door itself waits
  // for the dismiss key before sending [2!.
  const ripLinger = useRef<boolean>(false);
  const zmodemSession = useRef<any | null>(null);
  const pendingUploadFiles = useRef<File[]>([]);
  // When the server emits `transfer-raw:init` with direction='upload'
  // we DEFER arming the Sentry until the user picks a file. This kills
  // the ZACK→ZFILE race where rz's post-ZACK timeout (~1s, not affected
  // by `-t`) was firing before the OS file picker returned control.
  const pendingZmodemInit = useRef<{ direction: 'upload' | 'download'; paths: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const transferTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gamepadManagerRef = useRef<GamepadManager | null>(null);
  const musicPlayerRef = useRef<HTMLAudioElement | null>(null);  // Background music player (for doors like GRANDMASTER)
  const mouseTrackingDisabledRef = useRef<boolean>(false); // Ctrl+Shift+M toggle state
  // Teletext session mode (T answer at the graphics prompt, `texttv-mode`
  // event below). The face and palette belong to this session only: the
  // previous theme is remembered for the restore, and the mode flag keeps
  // font-preference / set-font from clobbering the look mid-session.
  const texttvModeRef = useRef<boolean>(false);
  const texttvPrevThemeRef = useRef<any>(null);
  const texttvPrevOverflowRef = useRef<string | null>(null);
  const texttvPrevColsRef = useRef<number | null>(null);
  const texttvPrevRowsRef = useRef<number | null>(null);
  /** The cell size the session had before teletext fitted its own. */
  const texttvPrevFontSizeRef = useRef<number | null>(null);
  /** Turns the board's DECDHL escapes into the face's half-height glyphs. */
  const doubleHeightRef = useRef<DoubleHeightFilter>(createDoubleHeightFilter());

  // Preload all Amiga fonts on mount to prevent mixed rendering when switching fonts
  useEffect(() => {
    const fonts = PRELOADED_FONTS.map(({ family, file }) => ({ family, url: `/fonts/${file}` }));

    const loadFonts = async () => {
      console.log('[Font Preload] Loading all fonts...');
      const promises = fonts.map(async ({ family, url }) => {
        try {
          const fontFace = new FontFace(family, `url(${url})`);
          await fontFace.load();
          document.fonts.add(fontFace);
          console.log('[Font Preload] Loaded:', family);
        } catch (error) {
          console.error('[Font Preload] Failed to load', family, error);
        }
      });
      await Promise.all(promises);
      console.log('[Font Preload] All fonts loaded');
    };

    loadFonts();
  }, []);

  const resetZmodem = () => {
    zmodemSession.current = null;
    zmodemSentry.current = null;
    transferState.current = { direction: null, paths: [] };
    pendingUploadFiles.current = [];
    if (transferTimeout.current) {
      clearTimeout(transferTimeout.current);
      transferTimeout.current = null;
    }
  };

  const requireZmodem = useCallback(() => {
    if (zmodemRef.current) return zmodemRef.current;
    const loaded = getZmodem();
    if (!loaded) {
      console.warn('[ZMODEM] Zmodem library not available');
      return null;
    }
    zmodemRef.current = loaded;
    return loaded;
  }, []);

  // Sound effects are now handled by MediaHandler (see media-handler.ts)
  // MediaHandler uses Web Audio API directly for browser-compatible audio playback

  const getStoredSharedToken = useCallback(() => {
    if (typeof window === 'undefined') return null;

    // sessionStorage is per TAB, so each tab keeps its own identity.
    const own =
      sessionStorage.getItem(SHARED_AUTH_TOKEN_KEY) ||
      sessionStorage.getItem(BBS_AUTH_TOKEN_KEY);
    if (own) return own;

    // localStorage is shared by every tab and window of this origin, so
    // falling back to it unconditionally meant logging in ANYWHERE logged
    // you in EVERYWHERE - a fresh tab silently adopted the last user's
    // token, making it impossible to be two different users at once (and
    // surprising for anyone who opens the BBS in a second window).
    //
    // That cross-tab convenience is exactly what the existing "auto-login"
    // preference describes, so it is now gated on it: opt in and new tabs
    // resume your session, leave it off and every tab is independent.
    const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
    if (!autoLoginEnabled) return null;

    return (
      localStorage.getItem(SHARED_AUTH_TOKEN_KEY) ||
      localStorage.getItem(BBS_AUTH_TOKEN_KEY)
    );
  }, []);

  const saveSessionState = useCallback((sessionData: any) => {
    if (typeof window === 'undefined') return;
    try {
      const sessionState = {
        userId: sessionData.userId || sessionData.user?.id || sessionData.user?.userId,
        username: sessionData.username || sessionData.user?.username,
        nodeId: sessionData.nodeId,
        socketId: sessionData.socketId,
        currentConf: sessionData.currentConf,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(sessionState));
      console.log('[Session Persistence] Session state saved:', sessionState);
    } catch (error) {
      console.error('[Session Persistence] Failed to save session state:', error);
    }
  }, []);

  const getStoredSessionState = useCallback(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(SESSION_STATE_KEY);
      if (!stored) return null;
      const sessionState = JSON.parse(stored);
      // Only use session if it's less than 2 minutes old (connection state recovery window)
      if (Date.now() - sessionState.savedAt > 120000) {
        sessionStorage.removeItem(SESSION_STATE_KEY);
        return null;
      }
      return sessionState;
    } catch (error) {
      console.error('[Session Persistence] Failed to load session state:', error);
      return null;
    }
  }, []);

  const clearSessionState = useCallback(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(SESSION_STATE_KEY);
    sessionStorage.removeItem(BBS_AUTH_TOKEN_KEY);
    sessionStorage.removeItem(SHARED_AUTH_TOKEN_KEY);
    console.log('[Session Persistence] Session state cleared');
  }, []);

  const attemptTokenLogin = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return false;
    if (loginState.current === 'loggedin' || tokenLoginPending.current) {
      return false;
    }

    // Every caller of this function (initial mount, the 'connect' handler's
    // non-restore branch, and 'session-restore-failed') is, by definition,
    // about to begin a FRESH session on this mounted component - either via
    // the token-login branch below (which skips the graphics prompt
    // outright) or by falling through to a brand new graphics-prompt/login
    // flow. Either way a prior PETSCII session must not carry its canvas
    // surface over; see clearPetsciiSession's declaration above.
    clearPetsciiSession();

    const token = getStoredSharedToken();
    if (token) {
      console.log('[AutoLogin] Reusing shared auth token');
      socket.emit('login', { token });
      tokenLoginPending.current = true;
      return true;
    }
    return false;
  }, [getStoredSharedToken, clearPetsciiSession]);

  useEffect(() => {
    attemptTokenLogin();

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === SHARED_AUTH_TOKEN_KEY ||
        event.key === BBS_AUTH_TOKEN_KEY
      ) {
        attemptTokenLogin();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [attemptTokenLogin]);

  const cancelTransfer = () => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!transferState.current.direction) return;
    socket.emit('transfer-raw:cancel');
    writeTermRef.current('\r\nTransfer cancelled.\r\n\r\n');
    resetZmodem();
  };

  const sendPendingFiles = (session?: any) => {
    const active = session || zmodemSession.current;
    if (!active) return;
    const Zmodem = requireZmodem();
    if (!Zmodem) return;
    if (!pendingUploadFiles.current.length) {
      writeTermRef.current('\r\nSelect a file to upload...\r\n\r\n');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        fileInputRef.current.click();
      } else {
        active.close?.();
      }
      return;
    }
    Zmodem.Browser.send_files(active, pendingUploadFiles.current, {})
      .then(() => active.close?.())
      .catch((err: any) => console.error('[ZMODEM] send_files failed:', err));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    pendingUploadFiles.current = files;
    if (!files.length) {
      writeTermRef.current('\r\nUpload cancelled.\r\n\r\n');
      if (pendingZmodemInit.current) {
        socketRef.current?.emit('transfer-raw:cancel');
        pendingZmodemInit.current = null;
      } else {
        zmodemSession.current?.close?.();
      }
      return;
    }
    // Deferred path: user picked file before Sentry was armed. Arm
    // now — beginZmodem will emit `transfer-raw:start`, backend
    // spawns rz, ZRQINIT/ZRINIT/ZSINIT/ZACK/ZFILE all flow in one
    // burst with no user-pick stall.
    if (pendingZmodemInit.current) {
      const init = pendingZmodemInit.current;
      pendingZmodemInit.current = null;
      console.log(`[ZMODEM] file picked (${files.length} file(s)); arming Sentry and starting handshake`);
      beginZmodem(init.direction, init.paths);
      return;
    }
    if (zmodemSession.current && zmodemSession.current.type === 'send') {
      sendPendingFiles(zmodemSession.current);
    }
  };

  const handleZmodemDetection = (detection: any) => {
    const Zmodem = requireZmodem();
    if (!Zmodem) return;
    if (transferTimeout.current) {
      clearTimeout(transferTimeout.current);
      transferTimeout.current = null;
    }
    let zsession: any;
    try {
      zsession = detection.confirm();
    } catch (err) {
      console.error('[ZMODEM] Detection confirm failed:', err);
      return;
    }

    zmodemSession.current = zsession;

    zsession.on('session_end', () => {
      resetZmodem();
    });

    if (zsession.type === 'receive') {
      zsession.on('offer', (xfer: any) => {
        const details = xfer.get_details ? xfer.get_details() : {};
        const name = details.name || 'download.bin';
        xfer.accept()
          .then(() => {
            const payloads = xfer.get_payloads ? xfer.get_payloads() : [];
            Zmodem.Browser.save_to_disk(payloads, name);
          })
          .catch((err: any) => {
            console.error('[ZMODEM] Accept failed:', err);
          });
      });
      zsession.start();
    } else if (zsession.type === 'send') {
      sendPendingFiles(zsession);
    }
  };

  const beginZmodem = (direction: 'upload' | 'download', paths?: string[]) => {
    const socket = socketRef.current;
    if (!socket) return;
    const Zmodem = requireZmodem();
    if (!Zmodem) return;

    transferState.current = { direction, paths: paths || [] };
    const sender = (octets: any) => {
      const u8 = new Uint8Array(octets);
      // Per-call hex preview was invaluable while debugging the
      // ZACK → ZFILE byte path race, but it fires for every header
      // the Send session emits during a transfer — noisy at any real
      // file size. Set `window.__ZMODEM_DEBUG__ = true` in the
      // console to re-enable.
      if ((window as any).__ZMODEM_DEBUG__) {
        console.log(
          `[ZMODEM] sender ${u8.length}B → server: ${Array.from(u8.slice(0, 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}${u8.length > 24 ? ' ...' : ''}`,
        );
      }
      socket.emit('transfer-raw:data', u8);
    };

    console.log(`[ZMODEM] beginZmodem direction=${direction} paths=`, paths);
    zmodemSentry.current = new Zmodem.Sentry({
      to_terminal: (data: any) => {
        if ((window as any).__ZMODEM_DEBUG__) {
          console.log('[ZMODEM] to_terminal bytes:', data?.length, data?.slice?.(0, 32));
        }
      },
      on_detect: (det: any) => {
        console.log('[ZMODEM] on_detect fired:', det);
        handleZmodemDetection(det);
      },
      on_retract: () => {
        console.log('[ZMODEM] on_retract');
      },
      sender,
    });

    socket.emit('transfer-raw:start', { direction });

    if (direction === 'upload') {
      // Auto-cancel after 30s if no negotiation/file selection
      if (transferTimeout.current) {
        clearTimeout(transferTimeout.current);
      }
      transferTimeout.current = setTimeout(() => {
        writeTermRef.current('\r\nUpload timed out. Cancelling.\r\n\r\n');
        socket.emit('transfer-raw:cancel');
        resetZmodem();
      }, 30000);

      try {
        const hdr = Zmodem.Header.build('ZRQINIT');
        sender(new Uint8Array(hdr.to_hex()));
      } catch (err) {
        console.error('[ZMODEM] Failed to send ZRQINIT from client:', err);
      }
    }
  };

  /**
   * The single place a pointer event reaches the socket, in terminal CELL
   * coordinates.
   *
   * Every pointer path funnels through here - the container's React mouse
   * handlers, the game-mode window listener, and the imperative `sendMouse`
   * the mobile on-screen controls use. One implementation means the mobile
   * trackpad cannot drift from the desktop mouse: the door sees the same
   * event names and the same payload shape from both.
   *
   * Coordinates are clamped into the live grid rather than a hardcoded 80x25,
   * so a door that resized the terminal still gets in-range cells.
   */
  const emitMouseCell = (
    type: TerminalMouseEventType,
    cell: TerminalCell,
    modifiers: TerminalMouseModifiers = {}
  ): void => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (!doorActive.current && !gameMode.current) return;

    const term = terminalInstance.current;
    const maxX = (term?.cols ?? 80) - 1;
    const maxY = (term?.rows ?? 25) - 1;

    const payload = {
      x: Math.max(0, Math.min(maxX, Math.round(cell.x))),
      y: Math.max(0, Math.min(maxY, Math.round(cell.y))),
      shift: modifiers.shift ?? false,
      ctrl: modifiers.ctrl ?? false,
      alt: modifiers.alt ?? false,
    };

    // mouse-hover is the one event with no button - keep the payload shape
    // exactly as the doors have always received it.
    socket.emit(
      type,
      type === 'mouse-hover' ? payload : { ...payload, button: modifiers.button ?? 0 }
    );
  };

  // Expose methods to parent components
  useImperativeHandle(ref, () => ({
    focus: () => {
      focusSurfaceRef.current();
    },
    sendCommand: (command: string) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('command', command);
      }
    },
    injectInput: (data: string) => {
      // On-screen/mobile keyboard. Same path as physical keys and the canvas.
      processInputKeyRef.current(data);
    },
    getSocket: () => socketRef.current,
    getTerminal: () => terminalInstance.current,
    isTexttvMode: () => texttvModeRef.current,
    pressGameKey: (key: string, code: string) => gameKeyPressRef.current?.(key, code),
    releaseGameKey: (key: string, code: string) => gameKeyReleaseRef.current?.(key, code),
    sendMouse: (type: TerminalMouseEventType, cell: TerminalCell, modifiers?: TerminalMouseModifiers) => {
      emitMouseCell(type, cell, modifiers);
    },
    startDownload: async (_amigaPath: string) => {
      console.warn('[Terminal] Downloads start from the BBS. Awaiting transfer-raw:init.');
    },
    startUpload: async (_amigaPath: string, file: File) => {
      pendingUploadFiles.current = [file];
      if (zmodemSession.current && zmodemSession.current.type === 'send') {
        sendPendingFiles(zmodemSession.current);
      }
    },
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js terminal for BBS connection
    // Start with standard BBS size (80x25), FitAddon will adjust based on mode
    // The session font is owned by utils/session-font.ts. Open in the font
    // this browser last saw the board use, falling back to the board
    // default - NOT XTERM_CONFIG.fontFamily (mOsOul), which is what made
    // every pre-login screen render in the wrong font while Topaz only
    // arrived after login-success -> get-font-preference. The server
    // preference still wins the moment it answers; this covers the window
    // before it can.
    const initialFont = readCachedFont() ?? DEFAULT_BBS_FONT;
    const term = new Terminal({
      fontFamily: fontFamilyFor(initialFont),
      fontSize: fontSizeRef.current,
      lineHeight: lineHeightFor(initialFont),
      theme: XTERM_CONFIG.theme,
      ...XTERM_CONFIG.options,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'block',
      cols: 80,
      rows: 25,
    });

    // xterm.js 5.5.0 registers touchstart with {passive:true} but calls
    // preventDefault() inside it, producing console warnings. Intercept
    // addEventListener on this element before open() so touchstart is
    // forced non-passive.
    const el = terminalRef.current;
    const _origAddEvent = el.addEventListener.bind(el);
    el.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'touchstart' && options && typeof options === 'object' && options.passive) {
        options = { ...options, passive: false };
      }
      _origAddEvent(type, listener, options);
    };
    term.open(el);
    el.addEventListener = _origAddEvent; // restore immediately after open()
    terminalInstance.current = term;

    // "The font is correct after loading the site two times" (sysop,
    // 2026-09-02). On a cold load the .ttf has not arrived by the time
    // open() measures the cell, so xterm holds the FALLBACK's metrics for
    // the whole session. applyFont awaits the face and then forces the
    // re-measure; on a warm load the promise is already resolved.
    void applyFont(term, initialFont, fontSizeRef.current);

    // When keepFocused is set, auto-refocus whenever the terminal loses focus.
    // Cooldown prevents a blur→focus→blur infinite loop on iOS.
    // relatedTarget===null means focus moved to browser chrome (address bar, etc.) —
    // don't steal it back on desktop. On mobile, always refocus (iOS often returns null
    // relatedTarget even for in-page focus changes).
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let lastRefocus = 0;
    term.textarea?.addEventListener('blur', (e: FocusEvent) => {
      if (!keepFocusedRef.current) return;
      if (!isMobileDevice && !e.relatedTarget) return; // browser chrome took focus — respect it
      const now = Date.now();
      if (now - lastRefocus < 200) return;
      lastRefocus = now;
      requestAnimationFrame(() => {
        if (document.visibilityState === 'visible' && document.activeElement !== term.textarea) {
          term.focus();
        }
      });
    });

    /*
     * XTERM'S OWN IDEA OF FOCUS, RESYNCED WHEN THE WINDOW COMES BACK.
     *
     * `term.focus()` focuses the helper textarea. Doing that while the WINDOW
     * is inactive - which is what happens on a cold load if the viewer is
     * looking at another window, or has devtools open - sets
     * `document.activeElement` without firing a `focus` event, so xterm never
     * learns it is focused: the `.focus` class never lands on `.xterm`.
     *
     * xterm only adds `xterm-cursor-blink` to the cursor cell when IT thinks
     * it is focused, and paints the inactive cursor otherwise. So the board
     * opened with a cursor that did not blink and did not look active until
     * the viewer clicked the screen - "the cursor changed from red to white",
     * "the cursor is not blinking either" (sysop, 2026-09-14), whose own
     * console showed the textarea holding focus while `.xterm` had no `focus`
     * class.
     *
     * The DOM is right and xterm is stale, so the terminal is blurred and
     * focused again, which fires the event it missed. Guarded on the
     * disagreement, so a terminal that is genuinely unfocused stays that way.
     */
    const resyncFocus = () => {
      /*
       * THE RENDERER HAS ITS OWN FOCUS CLASS, AND IT IS THE ONE THAT MATTERS.
       *
       * xterm puts `focus` on `.xterm`, but the blink animation is selected
       * by `.xterm-rows.xterm-focus` - a DIFFERENT class on a DIFFERENT node,
       * added by the DOM renderer's `handleFocus()`, which only runs on a
       * real focus EVENT.
       *
       * Rebuild the renderer while the terminal is already focused - which is
       * what writing `options.fontFamily`/`fontSize`/`lineHeight` does, and
       * `applyFont` writes all three after the caller answers the graphics
       * prompt - and the new row container never gets it. The outer class is
       * still there, so every "am I focused?" check says yes, while the
       * cursor's blink rule no longer matches anything: xterm renders it with
       * `xterm-cursor-blink xterm-cursor-block` (the focused branch, because
       * the SERVICE still says focused) and no rule paints it. That is the
       * sysop's white cursor that never blinks, reported four times.
       */
      const rows = term.element?.querySelector('.xterm-rows');
      const rendererLostIt = !!term.element?.classList.contains('focus')
        && !!rows && !rows.classList.contains('xterm-focus');
      if (term.element?.classList.contains('focus') && !rendererLostIt) return;

      /*
       * WHO HOLDS THE CARET DECIDES WHETHER WE MAY TAKE IT.
       *
       * Two different failures wear the same face, and only this tells them
       * apart:
       *
       *  - the TEXTAREA holds it and xterm is stale. The DOM is right; blur
       *    and focus again to fire the event xterm missed.
       *  - NOTHING in the page holds it - `activeElement` has fallen back to
       *    <body>, which is what DevTools or another window having the caret
       *    looks like from in here. The board is a terminal and its window
       *    has just come back, so it takes the caret.
       *
       * And the case that must keep working: a real element on the page holds
       * it, because the viewer is typing in a field. That is left alone - the
       * board must never yank the caret out from under them.
       */
      const holder = document.activeElement;
      const nobodyHasIt = holder === null || holder === document.body;
      if (holder !== term.textarea && !nobodyHasIt) return;

      term.blur();
      term.focus();
    };
    window.addEventListener('focus', resyncFocus);
    document.addEventListener('visibilitychange', resyncFocus);

    /**
     * Focus the terminal, and make sure xterm NOTICED.
     *
     * Every `term.focus()` here is really `textarea.focus()`, and that is a
     * no-op when the textarea is already `document.activeElement` - no focus
     * event, so xterm's `.focus` class never lands. The board focuses itself
     * twice on the way up, so the second call is always the no-op, and if the
     * first one happened while the window was inactive the class is never set
     * at all. The cursor then neither blinks nor renders as active until the
     * viewer clicks the screen.
     *
     * Listening for `window.focus` alone did not cover it: a plain load into
     * an ALREADY-focused window fires no such event, so nothing ever went
     * back to check. The check belongs next to the attempt.
     */
    const focusTerminal = () => {
      term.focus();
      requestAnimationFrame(resyncFocus);
    };
    // Initialize modem emulator for client-side speed throttling
    modemEmulatorRef.current = new ModemEmulator(term);

    // Apply cached modem speed from cookie before the server responds,
    // so the pre-login banner and login prompt pace at the user's
    // preferred speed rather than full-chat (MAX soft-cap).
    const cookieBps = readCookieModemSpeed();
    if (cookieBps !== null) {
      modemEmulatorRef.current.enable(cookieBps);
    }

    // Canvas bytes go STRAIGHT into the display machine. There is no
    // client-side baud pacing here, and there must not be.
    //
    // There used to be: a queue drained against an elapsed-time token
    // budget, mirroring ModemEmulator.sendThrottled. It made the board's
    // animated logos crawl (sysop, 2026-09-02; measurements in
    // .superpowers/sdd/2026-09-02-petscii-full-canvas/canvas-animation-speed.md),
    // for two reasons that both say the budget does not belong on this side
    // of the wire:
    //
    //  - It was a SECOND pacer. screen.handler's emitWithModem
    //    (screen.handler.ts:2311-2370) already meters the same screen
    //    server-side against session.modemBps, before the bytes reach any
    //    surface, and the server ModemEmulator meters everything else. A
    //    browser canvas has no baud of its own to emulate.
    //  - It metered the wrong stream. Both of the other pacers write ANSI
    //    escape sequences through FREE and charge only printable
    //    characters. This one charged every byte AFTER transduction, where
    //    each ANSI cursor move has become a 2x-inflated PETSCII cursor
    //    walk. Screens/flt.txt is 10,963 bytes of which 9,773 are cursor
    //    moves: 962 ms of paced canvas against 0.05 s of charged bytes on
    //    xterm, a 19x gap on the exact screens the sysop reported.
    //
    // Feeding in one call is also ONE canvas repaint instead of one per 64
    // bytes; PetsciiCanvas coalesces the rest to one per animation frame.
    //
    // The try/catch is load-bearing, and it is the price of dropping the
    // async loop. The old drain ran detached, so anything the machine threw
    // became an unhandled rejection and the session carried on. This runs
    // INSIDE the socket handler that called it - and, on the login-echo
    // path, inside a React event handler, where an uncaught throw unmounts
    // the tree and drops the connection ("pressing P resets the BBS":
    // transport close, then a reconnect inside the grace period). A screen
    // the display machine chokes on must cost the picture, never the
    // session.
    const enqueuePetscii = (bytes: Uint8Array | number[]) => {
      if (bytes.length === 0) return;
      // New output means the cells under any selection box are no longer the
      // ones the caller drew it around, so the box goes rather than sit there
      // outlining something else.
      if (petsciiSelectionRef.current) showPetsciiSelection(null);
      try {
        petsciiMachineRef.current?.feed(bytes);
      } catch (e) {
        console.error('[PETSCII] display machine threw on feed; screen dropped, session kept', e);
      }
    };
    // Canvas mode starts here and only here. The transducer and the display
    // machine both start from power-on state and see the same byte sequence
    // (transducer output + observed raw bytes), so they stay in lockstep.
    const ensurePetsciiSession = (columns: 40 | 80 = 40) => {
      if (!petsciiMachineRef.current) {
        // The screen's SHAPE, from the server's petscii-mode event. 40 is a
        // C64; 80 is this board's wide PETSCII screen (WideScreenMachine:
        // no logical lines, and $02 is not a background prefix there).
        petsciiMachineRef.current = columns === 80 ? new WideScreenMachine() : new PetsciiMachine();
        setPetsciiMachine(petsciiMachineRef.current);
      }
      if (!petsciiTransducerRef.current) petsciiTransducerRef.current = new AnsiToPetsciiTransducer({ columns });
      if (surfaceRef.current !== 'canvas') {
        surfaceRef.current = 'canvas';
        dispatchSurface({ type: 'petscii-session-start' });
      }
    };
    // ONE seam for every direct xterm write in this effect: identical bytes
    // to xterm when it is the surface; transduced onto the canvas otherwise.
    const writeTerm = (text: string) => {
      if (surfaceRef.current === 'canvas') {
        enqueuePetscii(petsciiTransducerRef.current!.transduce(text));
        return;
      }
      term.write(text);
    };
    // term.writeln's seam (the Guru Meditation screen is the only caller).
    // Routed through the same switch so a connection failure during a 'P'
    // session renders as ONE screen on the live surface instead of half on
    // the canvas and half into a hidden xterm.
    const writeTermLn = (text: string) => writeTerm(text + '\r\n');
    writeTermRef.current = writeTerm;
    // Focus follows the surface: xterm's textarea is display:none while the
    // canvas owns the session, so it cannot hold focus there.
    const focusSurface = () => {
      if (surfaceRef.current === 'canvas') petsciiCanvasRef.current?.focus();
      else term.focus();
    };
    focusSurfaceRef.current = focusSurface;

    // Global keydown listener for Ctrl/Cmd+Shift+M mouse toggle
    // Must be on window because xterm.js may not pass modifier combos to attachCustomKeyEventHandler
    const mouseToggleHandler = (event: KeyboardEvent) => {
      const modKey = event.ctrlKey || event.metaKey;
      if (modKey && event.shiftKey && (event.key === 'M' || event.key === 'm')) {
        event.preventDefault();
        event.stopPropagation();
        mouseTrackingDisabledRef.current = !mouseTrackingDisabledRef.current;
        if (mouseTrackingDisabledRef.current) {
          term.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l');
          console.log('[BBSTerminal] Mouse tracking DISABLED (Ctrl+Shift+M)');
        } else {
          term.write('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
          console.log('[BBSTerminal] Mouse tracking ENABLED (Ctrl+Shift+M)');
        }
      }
    };
    window.addEventListener('keydown', mouseToggleHandler, true);

    // Add native wheel event listener directly to xterm element (React onWheel doesn't capture xterm's wheel events)
    const xtermElement = terminalRef.current.querySelector('.xterm-screen') || terminalRef.current;
    const nativeWheelHandler = (ev: WheelEvent) => {
      if (!doorActive.current && !gameMode.current) return;
      if (!socketRef.current?.connected) return;

      // Get terminal coords
      const rect = terminalRef.current?.getBoundingClientRect();
      if (!rect) return;

      const cellWidth = rect.width / 80;
      const cellHeight = rect.height / 24;
      const x = Math.floor((ev.clientX - rect.left) / cellWidth);
      const y = Math.floor((ev.clientY - rect.top) / cellHeight);

      ev.preventDefault();
      ev.stopPropagation();
      socketRef.current.emit('mouse-wheel', {
        x, y,
        deltaY: ev.deltaY,
        shift: ev.shiftKey,
        ctrl: ev.ctrlKey,
        alt: ev.altKey
      });
    };
    xtermElement.addEventListener('wheel', nativeWheelHandler as EventListener, { passive: false });
    // Store for cleanup
    (terminalRef.current as any)._wheelHandler = nativeWheelHandler;
    (terminalRef.current as any)._wheelElement = xtermElement;

    /*
     * NO canvas renderer, for any session.
     *
     * Its texture atlas blits every glyph that comes from the FACE at
     * `cellWidth - 1` device pixels - measured by screenshot, eighty Topaz
     * underscores are eighty runs with a one-pixel gap between each - and no
     * font and no size changes it. That is the artists' complaint: "det ar
     * liksom inte tillrackligt med plats, dom overlappar".
     *
     * It was kept this long for one reason: it draws U+2500-259F out of a
     * table of its own, and the Amiga faces carry none of them, so the DOM
     * renderer had nothing to put in a box border. BBSGraphics carries them
     * now, on the same cell at the same advance (session-font.ts:
     * fontFamilyFor), so every glyph on the screen comes from a face and the
     * DOM renderer can draw the lot - seamlessly, at a whole CSS cell, which
     * seamlessSize provides.
     */

    // Load fit addon for responsive sizing
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Terminal mode: 'fixed' = 80 cols (for ANSI art), 'wide' = responsive width
    // Default to 'fixed' for BBS compatibility; forcedModeRef overrides on mobile
    let terminalMode: 'fixed' | 'wide' = forcedModeRef.current ?? 'fixed';

    // Fit terminal to container, respecting mode
    const fitTerminal = () => {
      if (surfaceRef.current === 'canvas') return; // xterm is display:none; fit() on a hidden element measures nothing
      // In fixed mode, DON'T resize - stay at 80x25
      if (terminalMode === 'fixed') {
        console.log(`[BBSTerminal] Fixed mode - ignoring resize, staying at 80x25`);
        return;
      }

      // Wide mode - fit to container
      const container = terminalRef.current;
      if (container) {
        console.log(`[BBSTerminal] Container size: ${container.clientWidth}x${container.clientHeight}px`);
      }

      const preFitCols = term.cols;
      const preFitRows = term.rows;

      // Perform the fit
      fitAddon.fit();

      const { cols, rows } = term;
      console.log(`[BBSTerminal] FitAddon: ${preFitCols}x${preFitRows} -> ${cols}x${rows} (wide mode)`);

      // Sanity check: ignore unreasonably small sizes (container likely still resizing)
      // Wide mode should give us at least 100+ columns for fullscreen
      if (cols < 40) {
        console.log(`[BBSTerminal] IGNORING resize to ${cols}x${rows} - too small, container likely transitioning`);
        term.resize(preFitCols, preFitRows); // Restore previous size
        return;
      }

      console.log(`[BBSTerminal] Final size: ${cols}x${rows} (mode: ${terminalMode})`);

      if (socketRef.current?.connected) {
        socketRef.current.emit('terminal-size', { cols, rows });
        console.log(`[BBSTerminal] Emitted terminal-size event`);
      }
    };
    fitTerminalRef.current = fitTerminal;

    // DON'T auto-fit on mount - terminal starts at 80x25 (fixed mode)
    // Only resize when:
    // 1. Door calls enableWideMode() (terminal-mode event)
    // 2. User resizes browser window (handled by resize listeners below)
    // 3. Server sends terminal-resize event

    // Throttled resize handler for live resizing
    let resizeThrottleTimer: number | null = null;
    let resizeTrailingTimer: number | null = null;
    let lastResizeTime = 0;
    const THROTTLE_MS = 16; // ~60fps

    const throttledFitTerminal = () => {
      const now = Date.now();

      // Clear any pending trailing call
      if (resizeTrailingTimer) {
        clearTimeout(resizeTrailingTimer);
        resizeTrailingTimer = null;
      }

      // If enough time has passed, fire immediately
      if (now - lastResizeTime >= THROTTLE_MS) {
        lastResizeTime = now;
        fitTerminal();
      } else if (!resizeThrottleTimer) {
        // Otherwise, schedule a throttled call
        resizeThrottleTimer = window.setTimeout(() => {
          resizeThrottleTimer = null;
          lastResizeTime = Date.now();
          fitTerminal();
        }, THROTTLE_MS - (now - lastResizeTime));
      }

      // Always schedule a trailing call to catch the final size
      resizeTrailingTimer = window.setTimeout(() => {
        resizeTrailingTimer = null;
        fitTerminal();
      }, 100);
    };

    // Handle window resize
    const handleResize = () => {
      throttledFitTerminal();
    };
    window.addEventListener('resize', handleResize);
    console.log('[BBSTerminal] Window resize listener attached');

    // Also use ResizeObserver for more reliable container size detection
    let resizeObserver: ResizeObserver | null = null;
    if (terminalRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        throttledFitTerminal();
      });
      resizeObserver.observe(terminalRef.current);
      console.log('[BBSTerminal] ResizeObserver attached');
    }

    // Track pressed keys in normal mode for stuck-key detection
    const normalPressedKeys = new Map<string, number>(); // code -> first press timestamp
    const blockedKeys = new Set<string>(); // keys blocked until real keyup
    const MAX_NORMAL_REPEAT_MS = 5000; // max ms before we assume key is stuck (normal mode only)

    // THE custom key event handler - intercepts keys before xterm processes
    // them. xterm keeps only ONE (a second attachCustomKeyEventHandler
    // replaces the first), so every rule this terminal has lives here: the
    // game-mode block, Alt+Enter, the mouse toggle, copy/select-all,
    // Shift+Arrow and the stuck-key guard. The decision itself is
    // classifyKey(), which is pure and tested; this executes the answer.
    // NOTE: in game mode we only BLOCK - actual key handling is done by window
    // event listeners (handleGameKeyDown/handleGameKeyUp) with key repeat.
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      const action = classifyKey(ev, {
        gameMode: Boolean(gameMode.current),
        connected: Boolean(socketRef.current?.connected),
        mouseTrackingDisabled: mouseTrackingDisabledRef.current,
      });

      // Alt+Enter widens the door AND the window. Only on the press: the
      // release classifies as 'pass', so one keystroke is one toggle.
      if ((action.kind === 'send' || action.kind === 'block') && action.fullscreen) {
        toggleFullscreen(document);
      }

      switch (action.kind) {
        case 'block':
          return false;

        case 'send':
          ev.preventDefault();
          if (socketRef.current?.connected) {
            socketRef.current.emit('command', action.bytes);
          }
          return false;

        case 'select-all':
          term.selectAll();
          return false;

        case 'copy': {
          const selection = term.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).then(() => {
              console.log('[BBSTerminal] Copied to clipboard:', selection.length, 'chars');
            });
          }
          return false;
        }
      }

      // Normal mode: detect stuck keys using repeat duration
      const keyId = ev.code || ev.key;

      if (ev.type === 'keydown') {
        // If this key was blocked as stuck, suppress until real keyup
        if (blockedKeys.has(keyId)) {
          ev.preventDefault();
          return false;
        }

        if (ev.repeat) {
          // Check if this key has been repeating too long
          const firstPress = normalPressedKeys.get(keyId);
          if (firstPress && Date.now() - firstPress > MAX_NORMAL_REPEAT_MS) {
            // Key has been "held" for too long - likely stuck
            blockedKeys.add(keyId);
            normalPressedKeys.delete(keyId);
            ev.preventDefault();
            return false;
          }
        } else {
          // Fresh keydown - record timestamp, unblock if previously blocked
          normalPressedKeys.set(keyId, Date.now());
          blockedKeys.delete(keyId);
        }
      } else if (ev.type === 'keyup') {
        // Key released - clear all tracking
        normalPressedKeys.delete(keyId);
        blockedKeys.delete(keyId);
      }

      // Not in game mode - let xterm handle normally
      return true;
    });

    // Force cursor blinking immediately after open
    term.options.cursorBlink = true;
    term.options.cursorStyle = 'block';
    term.options.cursorInactiveStyle = 'outline';  // see the note below

    // Apply font smoothing settings
    setTimeout(() => {
      term.options.theme = XTERM_CONFIG.theme;
      term.options.cursorBlink = true;
      term.options.cursorStyle = 'block';
      /*
       * AN UNFOCUSED TERMINAL LOOKS UNFOCUSED.
       *
       * 'block' drew the inactive cursor as a solid box that does not blink -
       * xterm only blinks while focused - so a terminal that had simply not
       * taken focus was indistinguishable from a broken cursor. The sysop
       * reported it three times as "the cursor is white and doesn't blink",
       * and two fixes went after the focus desync without changing what the
       * state LOOKED like.
       *
       * 'outline' is xterm's own default and says it plainly: hollow means
       * "click me, I am not focused", solid-and-blinking means "typing here
       * works". The focus resync above stays - this is about the state being
       * legible when it fails, not a substitute for getting it right.
       */
      term.options.cursorInactiveStyle = 'outline';
      term.options.fontSize = fontSizeRef.current;

      const termElement = terminalRef.current?.querySelector('.xterm');
      if (termElement) {
        const style = (termElement as HTMLElement).style as any;
        style.fontSmooth = 'never';
        style.webkitFontSmoothing = 'none';
        style.MozOsxFontSmoothing = 'none';
      }
      term.refresh(0, term.rows - 1);
      focusTerminal();
    }, 100);

    // Determine backend URL
    // In production, frontend and backend are served from same origin, so use window.location.origin
    // In development, use localhost:3001
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const finalBackendUrl = backendUrl ||
      (import.meta as any).env?.VITE_BBS_BACKEND_URL ||
      (isDevelopment ? 'http://localhost:3001' : window.location.origin);

    console.log('[Terminal] Connecting to:', finalBackendUrl);

    // Reset game mode state at initialization to prevent stuck state from previous sessions
    gameMode.current = false;
    keyState.current = {};
    keyNames.current = {};
    keyLastSeen.current = {};
    // Clear any lingering key repeat timers
    Object.keys(keyRepeatTimers.current).forEach(key => {
      clearTimeout(keyRepeatTimers.current[key]);
    });
    keyRepeatTimers.current = {};

    const stopGuruAnimation = () => {
      if (guruTimerRef.current) {
        clearInterval(guruTimerRef.current);
        guruTimerRef.current = null;
      }
    };

    const renderGuruMeditation = (phase: number) => {
      if (!showConnectionError) return;

      // Clear screen and render static content on first render only
      if (!guruStaticRendered.current) {
        writeTerm('\x1b[2J'); // Clear entire screen
        writeTerm('\x1b[H');  // Move cursor to home (top-left)
      } else {
        // On subsequent renders, just position cursor at top for blinking frame
        writeTerm('\x1b[H');
      }

      // Blink border between red and black backgrounds (like Amiga Guru Meditation)
      const borderBg = phase % 2 === 0 ? '\x1b[41m' : '\x1b[40m'; // Red bg or black bg
      const textColor = '\x1b[31m'; // Text always red foreground
      const reset = '\x1b[0m';
      const frameWidth = 80;
      const interiorWidth = 76; // 80 - 4 chars for border (2 on each side)

      const centerLine = (text: string) => {
        const leftPadding = Math.max(0, Math.floor((interiorWidth - text.length) / 2));
        const rightPadding = Math.max(0, interiorWidth - text.length - leftPadding);
        return `${borderBg}  ${reset}${' '.repeat(leftPadding)}${textColor}${text}${reset}${' '.repeat(rightPadding)}${borderBg}  ${reset}`;
      };

      // Draw solid red background frame (thicker than box-drawing chars)
      writeTerm(`${borderBg}${' '.repeat(frameWidth)}${reset}\r\n`); // Top border (full width)
      writeTerm(`${borderBg}  ${reset}${' '.repeat(interiorWidth)}${borderBg}  ${reset}\r\n`); // Empty line
      writeTerm(centerLine('Software Failure.') + '\r\n');
      writeTerm(centerLine('BBS Backend Connection Failed') + '\r\n');
      writeTerm(centerLine('Guru Meditation') + '\r\n');
      writeTerm(`${borderBg}  ${reset}${' '.repeat(interiorWidth)}${borderBg}  ${reset}\r\n`); // Empty line
      writeTerm(`${borderBg}${' '.repeat(frameWidth)}${reset}\r\n`); // Bottom border (full width)

      // Render the static content below on first render only
      if (!guruStaticRendered.current) {
        guruStaticRendered.current = true;
        writeTermLn('');
        writeTermLn('\x1b[33m[!] Cannot connect to BBS server at: \x1b[0m' + finalBackendUrl);
        writeTermLn('');
        writeTermLn('\x1b[37mThe BBS terminal requires the AmiExpress BBS backend to be running.\x1b[0m');
        writeTermLn('');
        writeTermLn('\x1b[32mTo start the BBS backend:\x1b[0m');
        writeTermLn('  \x1b[37m1. Open a new terminal\x1b[0m');
        writeTermLn('  \x1b[37m2. Navigate to project root: \x1b[36mcd amiexpress-web\x1b[0m');
        writeTermLn('  \x1b[37m3. Run: \x1b[36m./dev/scripts/start-servers.sh\x1b[0m');
        writeTermLn('');
        writeTermLn('\x1b[90m' + '-'.repeat(80) + '\x1b[0m');
        writeTermLn('');
        writeTermLn('\x1b[37mNote: You can still use the SDK preview for door development.\x1b[0m');
        writeTermLn('\x1b[37mThe BBS tab is optional and only needed for testing doors in a live BBS.\x1b[0m');
        writeTermLn('');
      }
    };

    const startGuruAnimation = () => {
      if (!showConnectionError) return;
      if (guruTimerRef.current) {
        renderGuruMeditation(guruPhaseRef.current);
        return;
      }

      // Reset static content flag and phase for new animation
      guruStaticRendered.current = false;
      guruPhaseRef.current = 0;
      renderGuruMeditation(guruPhaseRef.current);
      guruTimerRef.current = setInterval(() => {
        guruPhaseRef.current = (guruPhaseRef.current + 1) % 2;
        renderGuruMeditation(guruPhaseRef.current);
      }, 650);
    };

    // Game mode keyboard handlers - bypass OS key repeat delay with custom key repeat
    // Typing keys have initial delay before repeat for single character typing
    // Delay is long enough for comfortable typing while still responsive for games
    /*
     * How long a key must be HELD before the synthetic repeat starts.
     *
     * NOT shared by the two modes, and the sysop found out why: "doorman has
     * sound now but sometimes skips two in the menu", and the card lobby
     * "jumps 2 rows". Neither is the repeat RATE - it is this delay. A tap
     * that happens to last over 400ms is read as a hold, fires one repeat,
     * and the selection moves twice for one press. At the arcade rate that
     * was "two ore more entries"; at the menu rate it is exactly two, which
     * is what a single extra repeat looks like.
     *
     * An arcade door wants the old number: a held direction should engage
     * quickly, and a Sno-Bee that hesitates for half a second feels broken.
     * A MENU wants what an operating system uses - X11 defaults to 660ms,
     * Windows and macOS to about 500 - because there the cost of guessing
     * wrong is a row nobody asked for.
     *
     * This works WITH `mayAutoRepeat`, which decides WHICH keys may repeat at
     * all in application mode; this decides how long to wait before believing
     * one of them is held.
     */
    const GAME_REPEAT_DELAY = 400;         // arcade: engage quickly
    const APPLICATION_REPEAT_DELAY = 600;  // menu: a long tap is still a tap
    /*
     * TWO REPEAT MODES, chosen by the door - the sysop's distinction,
     * 2026-09-15: "game mode or application mode".
     *
     * Game mode (key-down/key-up edges) stays on for EVERY client door,
     * because doors that time their own input need the edges - grandmaster's
     * DAS/ARR is built on them. The synthetic repeat BETWEEN those edges is
     * the part that cannot be shared: 30ms is ~33 a second, right for an
     * arcade door and unusable in a menu. Doorman and the card lobby were
     * skipping two or more entries per press.
     *
     * The server sends `key-repeat-mode`. GAME IS THE DEFAULT, because it is
     * what every client door has always had: grandmaster's DAS/ARR is driven
     * BY these repeats, not around them, so a slow default detunes every
     * real-time door silently. A door whose screen is a LIST opts out with
     * `KEY_REPEAT=application` on its icon.
     */
    const GAME_REPEAT_RATE = 30;         // ~33/sec - arcade movement
    const APPLICATION_REPEAT_RATE = 120; // ~8/sec - a list you can steer

    const startKeyRepeat = (key: string, code: string) => {
      /*
       * WHICH KEYS MAY REPEAT is `mayAutoRepeat`'s decision, in
       * utils/key-overrides.ts beside `classifyKey` - a pure rule a test can
       * ask, rather than a set buried in an effect. In application mode only
       * the keys that STEER repeat; everything else is one press, one
       * delivery ("pressing v flicks back directly", sysop 2026-09-15).
       */
      if (!mayAutoRepeat(key)) {
        return;
      }
      // Physical identity: 'L'-down + 'l'-up (Shift released first) is one
      // key, and tracking by character strands the timer on the down-case.
      const id = trackKeyId({ key, code });

      // Clear any existing timer for this key
      if (keyRepeatTimers.current[id]) {
        clearTimeout(keyRepeatTimers.current[id]);
      }

      const repeatKey = () => {
        // An orphaned timer (missed keyup, blur race, mode toggle) stops
        // itself: a held key keeps producing OS auto-repeats, so silence
        // means nobody is holding anything.
        if (!repeatAlive(keyLastSeen.current[id] ?? 0, Date.now())) {
          delete keyRepeatTimers.current[id];
          return;
        }
        const canRepeat = keyState.current[id] && gameMode.current && socketRef.current?.connected;
        if (canRepeat) {
          socketRef.current!.emit('key-down', { key: keyNames.current[id] ?? key, code, repeat: true, src: 'repeat' });
          keyRepeatTimers.current[id] = setTimeout(repeatKey, keyRepeatRateRef.current);
        }
      };

      // Start repeat after initial delay (allows single character typing)
      keyRepeatTimers.current[id] = setTimeout(repeatKey, keyRepeatDelayRef.current);
    };

    const stopKeyRepeat = (key: string) => {
      const id = trackKeyId({ key, code: key });
      if (keyRepeatTimers.current[id]) {
        clearTimeout(keyRepeatTimers.current[id]);
        delete keyRepeatTimers.current[id];
      }
      delete keyLastSeen.current[id];
    };

    // Cursor, text selection and xterm pointer events, in one place so the
    // game-mode handler and door:load-client cannot drift apart.
    const applyPointerCapture = (capture: boolean) => {
      const xtermEl = terminalRef.current?.querySelector('.xterm') as HTMLElement | null;
      if (xtermEl) {
        xtermEl.style.pointerEvents = capture ? 'none' : '';
      }
      if (terminalRef.current) {
        terminalRef.current.style.cursor = capture ? 'none' : '';
        terminalRef.current.style.userSelect = capture ? 'none' : '';
        (terminalRef.current.style as any).webkitUserSelect = capture ? 'none' : '';
      }
    };

    // Single entry point for a game-mode key press. Both the window keydown
    // listener and the on-screen game controls (via the imperative ref) call
    // this, so a touch press is indistinguishable from a physical one.
    /**
     * WHO PRESSED IT - for the board's `[DOOR-INPUT]` trace only.
     *
     * A PETSCII caller's keystroke reached LiveChat twice and both
     * deliveries said `route=key-down`, which names the socket event and not
     * the caller: `pressGameKey` is reached from the window listener, from
     * the shared input path (canvas and on-screen keyboard) and from the
     * mobile game pads. Labelling the press is what tells those apart.
     */
    const pressGameKey = (key: string, code: string, mods?: { alt?: boolean; ctrl?: boolean; shift?: boolean }) => {
      if (!gameMode.current || !socketRef.current?.connected) return;
      // Physical identity (see trackKeyId): 'L'-down and 'l'-up are one key.
      const id = trackKeyId({ key, code });
      // Only send if key wasn't already pressed (prevents duplicate downs)
      if (keyState.current[id]) return;
      keyState.current[id] = true;
      keyNames.current[id] = key;
      keyLastSeen.current[id] = Date.now();
      // The MODIFIERS travel with the key. Without them a door in game mode
      // received Alt+Enter as a bare Enter - which in GRANDMASTER's menu is
      // "select" - so the size toggle could not work there however well the
      // door was wired (2026-09-02).
      socketRef.current.emit('key-down', { key, code, ...mods, src: pressSource.current });
      startKeyRepeat(key, code);
    };

    const releaseGameKey = (key: string, code: string) => {
      // Physical identity, like the press: a Shift-released 'l'-up releases
      // the 'L'-down. And unconditional: a release with no tracked press
      // still stops the timer and tells the backend, so a desync heals
      // instead of typing for ever.
      const id = trackKeyId({ key, code });
      stopKeyRepeat(id);
      delete keyState.current[id];
      delete keyNames.current[id];
      if (!socketRef.current?.connected) return;
      socketRef.current.emit('key-up', { key, code });
    };

    gameKeyPressRef.current = pressGameKey;
    gameKeyReleaseRef.current = releaseGameKey;

    const handleGameKeyDown = (ev: KeyboardEvent) => {
      // Handle transfer cancel
      if (transferState.current.direction && ev.key === 'Escape') {
        ev.preventDefault();
        cancelTransfer();
        return;
      }

      // Ctrl+C while door/game is active: terminate the door
      if (ev.ctrlKey && ev.key === 'c' && (doorActive.current || gameMode.current) && socketRef.current?.connected) {
        ev.preventDefault();
        console.log('[BBSTerminal] Ctrl+C pressed in game mode - sending door:terminate');
        writeTermRef.current('\r\n\x1b[33m[Aborting door...]\x1b[0m\r\n');
        socketRef.current.emit('door:terminate');
        return;
      }

      // Game mode: send raw keydown events with custom key repeat
      if (gameMode.current && socketRef.current?.connected) {
        // Browser auto-repeat is the heartbeat, not input: it proves the
        // key is still down (see repeatAlive), so stamp it and swallow it.
        if (ev.repeat) {
          keyLastSeen.current[trackKeyId(ev)] = Date.now();
          ev.preventDefault();
          return;
        }

        pressSource.current = 'window';
        pressGameKey(ev.key, ev.code, { alt: ev.altKey, ctrl: ev.ctrlKey, shift: ev.shiftKey });
        ev.preventDefault();
      }
    };

    const handleGameKeyUp = (ev: KeyboardEvent) => {
      // Game mode: send raw keyup events and stop repeat
      if (gameMode.current && socketRef.current?.connected) {
        releaseGameKey(ev.key, ev.code);
        ev.preventDefault();
      }
    };

    window.addEventListener('keydown', handleGameKeyDown);
    window.addEventListener('keyup', handleGameKeyUp);

    // Clear all key state and repeat timers (used on blur/visibility loss)
    const clearAllKeyState = () => {
      // Game mode: send key-up for all held keys so backend knows they're released
      if (gameMode.current) {
        for (const id of Object.keys(keyState.current)) {
          if (keyState.current[id] && socketRef.current?.connected) {
            socketRef.current.emit('key-up', { key: keyNames.current[id] ?? id, code: '' });
          }
          stopKeyRepeat(id);
        }
        keyState.current = {};
        keyNames.current = {};
      }
      // Normal mode: clear tracked keys to prevent stale repeat detection
      normalPressedKeys.clear();
    };

    /**
     * Reconnect the moment the world changes, instead of waiting out a
     * backoff that was measured for a server that had not come back yet.
     *
     * This is the half the sysop actually feels: bringing Chrome to the
     * front is the signal that somebody wants to type RIGHT NOW.
     */
    const wakeSocket = () => {
      const live = socketRef.current;
      if (!live) return;
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      const online = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (!shouldReconnectNow(live.connected, visible, online)) return;
      console.log('[Terminal] Tab is back and the socket is not - reconnecting now');
      live.connect();
    };

    // Prevent stuck keys: clear state when window loses focus or tab becomes hidden
    const handleWindowBlur = () => clearAllKeyState();
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearAllKeyState();
        return;
      }
      wakeSocket();
    };
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', wakeSocket);
    window.addEventListener('online', wakeSocket);
    // Restored from the back/forward cache: the page never ran a line of
    // code while it was frozen, so nothing noticed the socket dying.
    window.addEventListener('pageshow', wakeSocket);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Connect to BBS backend
    // WebSocket first everywhere, with polling kept as an automatic
    // fallback. Production used to START on long-polling to wake sleeping
    // free-tier servers, which meant every keystroke rode an HTTP request
    // until the upgrade completed - unusable for an action game. socket.io
    // falls back on its own if the WebSocket handshake fails.
    const socket = io(finalBackendUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      upgrade: true,
      rememberUpgrade: true,
      // Retry until it works or the tab closes - see reconnect-policy.ts.
      // This used to stop after 5 attempts on localhost, about eleven
      // seconds, which is shorter than a dev backend takes to restart.
      ...reconnectPolicy(isDevelopment),
    });
    socketRef.current = socket;

    // Publish which browser-side door is running so the host page can swap in
    // door-specific UI. The backend never emits door:unload-client, so the
    // authoritative "door ended" signal is game-mode=false (client-door-bridge
    // emits it from endSession).
    const setActiveClientDoor = (doorId: string | null, reason: string) => {
      if (activeClientDoorId.current === doorId) return;
      // Which door the page thinks is running decides which on-screen controls
      // it shows, and losing it mid-door drops the player back to the generic
      // BBS keyboard with no way to swipe ("i cant swipe in gmaster on the
      // select mode dialog and it shows the normal osd keyboard"). The only
      // "door ended" signal this client has is game-mode going false, which a
      // door ALSO does when it puts a menu up - so when this goes wrong, the
      // reason is the thing worth knowing.
      console.log(
        `[BBSTerminal] active door ${activeClientDoorId.current ?? 'none'}`
        + ` -> ${doorId ?? 'none'} (${reason})`,
      );
      activeClientDoorId.current = doorId;
      onDoorChangeRef.current?.(doorId);
    };

    // Initialize media handler for audio/video streaming
    const mediaHandler = new MediaHandler(socket);
    mediaHandlerRef.current = mediaHandler;

    // Socket media event handlers
    socket.on('audio:start-streaming', async (options, callback) => {
      try {
        await mediaHandler.startMicrophone(options);
        callback({ success: true, streamId: `audio-${socket.id}` });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('audio:stop-streaming', (callback) => {
      mediaHandler.stopMicrophone();
      if (typeof callback === 'function') callback();
    });

    socket.on('audio:mute', (data: { muted: boolean }) => {
      mediaHandler.setMuted(data.muted);
    });

    socket.on('audio:volume', (data: { volume: number }) => {
      mediaHandler.setVolume(data.volume);
    });

    // Background music handlers (for doors like GRANDMASTER)
    socket.on('audio:music', (data: { track: string; loop: boolean; volume: number; file: string }) => {
      // Skip if a client door bundle is loaded - the door handles its own audio
      if (doorActive.current) return;

      // Stop any existing music
      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        musicPlayerRef.current.src = '';
      }

      // Create new audio element
      const audio = new Audio(data.file);
      audio.loop = data.loop;
      audio.volume = Math.max(0, Math.min(1, data.volume));

      audio.play().catch((err) => {
        console.error('[BBSTerminal] Music playback failed:', err);
      });

      musicPlayerRef.current = audio;
      console.log(`[BBSTerminal] Started playing music: ${data.track} (loop: ${data.loop}, volume: ${data.volume})`);
    });

    socket.on('audio:music:stop', () => {
      // Skip if a client door bundle is loaded - the door handles its own audio
      if (doorActive.current) return;

      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        musicPlayerRef.current.src = '';
        musicPlayerRef.current = null;
        console.log('[BBSTerminal] Stopped music');
      }
    });

    socket.on('video:start-stream', async (data, callback) => {
      try {
        const { options } = data;
        await mediaHandler.startVideo(options?.width, options?.height, options?.fps, options?.mode);
        if (typeof callback === 'function') callback({ success: true, streamId: `video-${socket.id}` });
      } catch (err: any) {
        console.error('[MediaHandler] video:start-stream error:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    socket.on('video:stop-stream', (_data, callback) => {
      mediaHandler.stopVideo();
      if (typeof callback === 'function') callback({ success: true });
    });

    // Socket event handlers
    socket.on('connect', () => {
      console.log('[Terminal] Connected to BBS backend');
      stopGuruAnimation();

      // Re-enable auto-reconnection if it was disabled by a previous forced disconnect
      if (socket.io.opts.reconnection === false) {
        socket.io.opts.reconnection = true;
        console.log('[CONNECT] Auto-reconnection re-enabled after manual connection');
      }

      // CRITICAL: Reset game mode on new connection to prevent stuck input state
      gameMode.current = false;
      setActiveClientDoor(null, 'socket connected');
      keyState.current = {};
      // Clear key repeat timers
      Object.keys(keyRepeatTimers.current).forEach(key => {
        clearTimeout(keyRepeatTimers.current[key]);
      });
      keyRepeatTimers.current = {};

      // Try session restoration first (if we have a saved session).
      // Do NOT flip loginState to 'logging-in' here — if the server decides
      // the restore can't happen (e.g. after a backend restart), it will
      // emit `session-restore-failed` AFTER already starting its fresh
      // welcome/ANSI-prompt sequence. Any keypress during that window
      // would be dropped by onData's logging-in guard. Stay in 'waiting'
      // until we've actually submitted credentials; session-restored will
      // jump us straight to 'loggedin' on success.
      const savedSession = getStoredSessionState();
      if (savedSession && reconnectPending.current) {
        console.log('[Session Persistence] Attempting session restoration for user:', savedSession.username);
        socket.emit('restore-session', savedSession);
      } else if (reconnectPending.current) {
        reconnectPending.current = false;
        attemptTokenLogin();
      }

      // The reconnect re-login that stood here replayed a password the
      // BROWSER had buffered. Nothing buffers one any more (TP-9b): the
      // server owns the prompt, and a reconnect meets it again like any
      // other caller, or restores through the token above.

      // Send initial terminal size to backend (80x25 in fixed mode)
      const { cols, rows } = term;
      socket.emit('terminal-size', { cols, rows });
      console.log(`[Terminal] Sent initial size: ${cols}x${rows}`);

      // Initialize gamepad support
      if (!gamepadManagerRef.current) {
        gamepadManagerRef.current = new GamepadManager({
          onEvent: (event: AnyGamepadEvent) => {
            if (socket.connected) {
              socket.emit('gamepad-event', event);
            }
          },
          config: {
            deadzone: 0.15,
            pollRate: 16,  // 60fps
          },
        });
        gamepadManagerRef.current.start();
        console.log('[Gamepad] Gamepad support initialized');
      }

      onConnect?.();
      focusTerminal();
    });

    socket.on('connect_error', (error: any) => {
      console.error('[Terminal] Connection error:', error.message);
      startGuruAnimation();

      onConnectionError?.(error);
    });

    // Belt and braces. The policy retries forever, so this should never
    // fire - but if it ever does, a terminal that has quietly stopped
    // reconnecting looks exactly like a BBS that has hung, and the only way
    // out is a reload. Start over instead.
    socket.io.on('reconnect_failed', () => {
      console.warn('[Terminal] Reconnection gave up - starting over rather than sitting dead');
      // "Starting over" means the eventual reconnect either restores the
      // old session (a continuation, which legitimately keeps its surface)
      // or - if that fails, or there was nothing to restore - runs the
      // fresh-session path (session-restore-failed / attemptTokenLogin,
      // both of which also reset the surface). Resetting here too, right
      // where "starting over" is decided, means the canvas is never left
      // showing a dead session through whatever gap exists before that
      // eventual 'connect'/'session-restore-failed' fires.
      clearPetsciiSession();
      socket.connect();
    });

    socket.on('transfer-raw:init', (payload: any) => {
      const direction = (payload?.direction || 'download') as 'upload' | 'download';
      const paths: string[] = payload?.paths || [];
      // Upload path: pop the OS file picker BEFORE arming the Sentry
      // (and therefore before the backend spawns rz). Once a file is
      // chosen, handleFileInputChange arms the Sentry and emits
      // transfer-raw:start, which fires the backend handshake and
      // spawns rz. Result: ZRQINIT/ZRINIT/ZSINIT/ZACK/ZFILE all flow
      // in one tight burst with no user-pick stall.
      if (direction === 'upload' && pendingUploadFiles.current.length === 0) {
        pendingZmodemInit.current = { direction, paths };
        console.log('[ZMODEM] deferring beginZmodem; opening file picker first');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
          fileInputRef.current.click();
        } else {
          // Fallback: arm immediately and let detection click the picker.
          pendingZmodemInit.current = null;
          beginZmodem(direction, paths);
        }
        return;
      }
      beginZmodem(direction, paths);
    });

    socket.on('transfer-raw:data', (data: ArrayBuffer | Uint8Array) => {
      if (!zmodemSentry.current) {
        // The arrival-without-Sentry log STAYS unconditional — it
        // surfaces "Sentry not armed yet" timing regressions that
        // would otherwise silently drop bytes.
        console.warn('[ZMODEM] transfer-raw:data arrived but no Sentry armed; dropping', data);
        return;
      }
      const view =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : data instanceof Uint8Array
            ? data
            : new Uint8Array(data as any);
      if ((window as any).__ZMODEM_DEBUG__) {
        console.log(
          `[ZMODEM] consume ${view.length}B: ${Array.from(view.slice(0, 16)).map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`,
        );
      }
      try {
        zmodemSentry.current.consume(view);
      } catch (err) {
        console.error('[ZMODEM] consume threw:', err);
      }
    });

    socket.on('transfer-raw:complete', () => {
      resetZmodem();
    });

    socket.on('transfer-raw:cancelled', () => {
      resetZmodem();
    });

    // Track pending files for batch upload - send one at a time
    let legacyBatchQueue: File[] = [];
    let currentUploadOptions: { accept?: string; maxSize?: number; multiple?: boolean; uploadUrl?: string; fieldName?: string } | null = null;

    // Helper to upload the next file in the queue.
    //
    // Uploads go via HTTP multipart POST to /api/upload (multer endpoint,
    // see web/backend/src/server/file-routes.ts). Multer saves the file
    // to playpen and returns {filename, path, size}; we then emit a small
    // 'file-upload-ready' socket event with that metadata so the backend
    // runs processFileUpload on the already-saved file.
    //
    // Why not socket.emit the binary directly? socket.io serializes the
    // payload as JSON, so each byte becomes a 1-3 char number plus a comma
    // — average ~3x inflation. A 10MB upload became ~30MB on the wire and
    // tripped maxHttpBufferSize (#11). The HTTP route stays binary the
    // whole way.
    const uploadNextFile = async () => {
      if (legacyBatchQueue.length === 0) {
        console.log('[BBSTerminal] No more files to upload, signaling batch complete');
        socket.emit('upload-batch-complete');
        return;
      }

      const file = legacyBatchQueue.shift()!;
      console.log(`[BBSTerminal] Uploading file: ${file.name} (${legacyBatchQueue.length} remaining)`);

      if (currentUploadOptions?.maxSize && file.size > currentUploadOptions.maxSize) {
        socket.emit('ansi-output', `\r\n\x1b[31mFile ${file.name} exceeds maximum size of ${currentUploadOptions.maxSize} bytes\x1b[0m\r\n`);
        uploadNextFile();
        return;
      }

      const uploadStartTime = Date.now();
      const uploadUrl = currentUploadOptions?.uploadUrl || '/api/upload';
      const fieldName = currentUploadOptions?.fieldName || 'file';

      const form = new FormData();
      form.append(fieldName, file, file.name);

      try {
        const res = await fetch(uploadUrl, { method: 'POST', body: form });
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          socket.emit('ansi-output', `\r\n\x1b[31mUpload failed (${res.status}): ${text}\x1b[0m\r\n`);
          // Move on so we don't wedge the queue
          uploadNextFile();
          return;
        }
        const result: { filename: string; originalname: string; size: number; path: string } = await res.json();
        socket.emit('file-upload-ready', {
          filename: result.filename,
          originalname: result.originalname,
          size: result.size,
          path: result.path,
          uploadStartTime,
        });
        // Backend processes the file then emits 'show-file-upload' for the next
        // file in the batch (or 'upload-batch-complete' is signaled when empty).
      } catch (err: any) {
        socket.emit('ansi-output', `\r\n\x1b[31mUpload error: ${err?.message || err}\x1b[0m\r\n`);
        uploadNextFile();
      }
    };

    // Handle file upload request from backend
    socket.on('show-file-upload', (options: { accept?: string; maxSize?: number; multiple?: boolean; batchContinue?: boolean }) => {
      console.log('[BBSTerminal] show-file-upload event received:', options);

      // If we have pending files from a batch selection, upload the next one
      if (legacyBatchQueue.length > 0) {
        console.log(`[BBSTerminal] Uploading next file from queue (${legacyBatchQueue.length} remaining)`);
        uploadNextFile();
        return;
      }

      // If backend signals batchContinue but we have no pending files, batch is complete
      if (options.batchContinue) {
        console.log('[BBSTerminal] Batch continue received but no pending files, signaling batch complete');
        socket.emit('upload-batch-complete');
        return;
      }

      // Store options for batch uploads
      currentUploadOptions = options;

      // Create a hidden file input element
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = options.accept || '*/*';
      fileInput.multiple = options.multiple || false;
      fileInput.style.display = 'none';

      fileInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;

        if (!files || files.length === 0) {
          console.log('[BBSTerminal] No files selected');
          socket.emit('upload-cancelled');
          return;
        }

        console.log('[BBSTerminal] Files selected:', files.length);

        // Queue all files for upload
        legacyBatchQueue = Array.from(files);

        // Start uploading the first file
        uploadNextFile();

        // Clean up
        document.body.removeChild(fileInput);
      });

      fileInput.addEventListener('cancel', () => {
        console.log('[BBSTerminal] File selection cancelled');
        socket.emit('upload-cancelled');
        document.body.removeChild(fileInput);
      });

      // Add to DOM and trigger click
      document.body.appendChild(fileInput);
      fileInput.click();
    });

    // Handle file download request from backend
    socket.on('download-file', async (fileInfo: { filename: string; size: number; url: string; path?: string }) => {
      console.log('[BBSTerminal] download-file event received:', fileInfo);

      // Track download start time for CPS calculation
      const downloadStartTime = Date.now();

      // Notify backend that download started
      socket.emit('file-download-started', {
        filename: fileInfo.filename,
        startTime: downloadStartTime
      });

      try {
        // Use fetch to download so we can track completion time
        const response = await fetch(fileInfo.url);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.statusText}`);
        }

        const blob = await response.blob();
        const downloadEndTime = Date.now();
        const durationMs = downloadEndTime - downloadStartTime;

        // Calculate CPS (characters per second)
        const durationSec = durationMs / 1000;
        const cps = durationSec > 0 ? Math.floor(fileInfo.size / durationSec) : 0;

        console.log(`[BBSTerminal] Download complete: ${fileInfo.filename}, ${fileInfo.size} bytes in ${durationMs}ms (${cps} CPS)`);

        // Create download link for the blob
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileInfo.filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);

        // Send completion stats to backend for CPS tracking
        socket.emit('file-download-complete', {
          filename: fileInfo.filename,
          size: fileInfo.size,
          durationMs,
          cps,
          path: fileInfo.path
        });
      } catch (error) {
        console.error('[BBSTerminal] Download error:', error);
        // Fallback to anchor download (won't track CPS)
        const link = document.createElement('a');
        link.href = fileInfo.url;
        link.download = fileInfo.filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });

    // Server-initiated disconnect (e.g., user logged off with G command)
    socket.on('force-disconnect', (data?: { reason?: string }) => {
      console.log('[FORCE-DISCONNECT] Server initiated disconnect:', data?.reason || 'unknown');
      forcedDisconnectRef.current = true;
      // Disable auto-reconnection for this disconnect
      socket.io.opts.reconnection = false;
      console.log('[FORCE-DISCONNECT] Auto-reconnection disabled');
    });

    socket.on('disconnect', (reason: string) => {
      console.log('[DISCONNECT] Client disconnected, reason:', reason);
      // A teletext session ends with its socket: drop the mode flag so a
      // later font-preference on this terminal is honoured, and give the
      // terminal its previous palette, geometry and face back (the face
      // follows via the server's font-preference on the next login).
      if (texttvModeRef.current) {
        texttvModeRef.current = false;
        if (texttvPrevThemeRef.current !== null) {
          try { term.options.theme = texttvPrevThemeRef.current; } catch { /* terminal may be disposed */ }
          texttvPrevThemeRef.current = null;
        }
        if (texttvPrevColsRef.current !== null) {
          try { term.resize(texttvPrevColsRef.current, texttvPrevRowsRef.current ?? 24); } catch { /* disposed */ }
          texttvPrevColsRef.current = null;
          texttvPrevRowsRef.current = null;
        }
        if (terminalRef.current && texttvPrevOverflowRef.current !== null) {
          try { terminalRef.current.style.overflow = texttvPrevOverflowRef.current; } catch { /* disposed */ }
          texttvPrevOverflowRef.current = null;
        }
      }

      // Log disconnect event for debugging
      console.log('[DISCONNECT] Disconnect details:', {
        reason,
        socketId: socket.id,
        loginState: loginState.current,
        forcedDisconnect: forcedDisconnectRef.current,
        timestamp: new Date().toISOString(),
      });

      // Check if this was a server-initiated forced disconnect (logoff)
      if (forcedDisconnectRef.current) {
        console.log('[DISCONNECT] Forced disconnect (logoff) - clearing session state and preventing reconnect');
        localStorage.removeItem('bbs_auth_token');
        clearSessionState();
        reconnectPending.current = false;
        forcedDisconnectRef.current = false;  // Reset flag
        // Auto-reconnection already disabled in force-disconnect handler
      } else if (reason === 'io client disconnect') {
        // User intentionally disconnected - clear everything
        console.log('[DISCONNECT] User-initiated disconnect - clearing session state');
        localStorage.removeItem('bbs_auth_token');
        clearSessionState();
        reconnectPending.current = false;
      } else {
        // Network issue or transport close - preserve session state for restoration
        console.log('[DISCONNECT] Network disconnect - preserving session state for reconnection');
        reconnectPending.current = true;
        loginState.current = 'server-driven';
        tokenLoginPending.current = false;
        // DO NOT clear session state - it will be used on reconnect
      }
      onDisconnect?.(reason);
    });

    const dispatchDoorMessage = (sessionId: string, message: any) => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent('bbs:door:message', {
        detail: { sessionId, message }
      }));
    };

    const flushDoorMessages = (sessionId: string) => {
      const pending = doorMessageBuffer.current[sessionId];
      if (!pending?.length) {
        return;
      }
      pending.forEach((message) => dispatchDoorMessage(sessionId, message));
      doorMessageBuffer.current[sessionId] = [];
    };

    const handleDoorMessageEvent = (eventName: string, ...args: any[]) => {
      if (!eventName.startsWith('door:message:')) {
        return;
      }
      const sessionId = eventName.replace('door:message:', '');
      const message = args[0];

      if (doorReadyMap.current[sessionId]) {
        dispatchDoorMessage(sessionId, message);
        return;
      }

      if (!doorMessageBuffer.current[sessionId]) {
        doorMessageBuffer.current[sessionId] = [];
      }
      doorMessageBuffer.current[sessionId].push(message);
    };

    socket.onAny(handleDoorMessageEvent);

    // ANSI output handler.
    //
    // `meta.prePaced` is the wire attribute the server sets on output it
    // has ALREADY paced (web/backend/src/utils/output-pacing.ts) - today
    // the screen-wipe frames, an animation paced by frame delays and
    // emitted one write per frame. Such a payload keeps its place in the
    // ModemEmulator's FIFO but is not metered a second time; without it a
    // 625 ms wipe took 2.9 s at 14400 and 17.4 s at 2400, each frame
    // drip-fed a fraction at a time.
    socket.on('ansi-output', (data: string, meta?: { prePaced?: boolean }) => {
      const prePaced = meta?.prePaced === true;
      // DEBUG: Log first 20 chars of any incoming data to help identify why RIP mode isn't triggering
      if (data.includes('[1!') || data.includes('!|')) {
        console.log(`[Terminal] Incoming possible RIP data (len ${data.length}): ${JSON.stringify(data.slice(0, 50))}`);
      }

      // 1. First, combine with buffers for any OSC sequences from previous chunks
      const overlayPrefix = '\x1b]9999;overlay;';
      let overlayPayload = overlayBufferRef.current + data;
      overlayBufferRef.current = '';

      // Check for web transparency overlay OSC sequences
      const overlayRegex = /\x1b\]9999;overlay;({[^}]*})\x07/g;
      let overlayMatch;
      while ((overlayMatch = overlayRegex.exec(overlayPayload)) !== null) {
        try {
          const overlayData = JSON.parse(overlayMatch[1]);
          setOverlays(prev => {
            const next = new Map(prev);
            if (overlayData.show) {
              next.set(overlayData.id, {
                opacity: overlayData.opacity || 0.5,
                show: true,
                x: overlayData.x,
                y: overlayData.y,
                width: overlayData.width,
                height: overlayData.height,
                exclude: overlayData.exclude,
              });
            } else {
              next.delete(overlayData.id);
            }
            return next;
          });
        } catch (e) {
          console.error('[Overlay] Failed to parse overlay data:', e);
        }
      }
      overlayPayload = overlayPayload.replace(overlayRegex, '');

      // Preserve any incomplete overlay sequence
      const incompleteIndex = overlayPayload.lastIndexOf(overlayPrefix);
      if (incompleteIndex !== -1 && overlayPayload.indexOf('\x07', incompleteIndex) === -1) {
        overlayBufferRef.current = overlayPayload.slice(incompleteIndex);
        overlayPayload = overlayPayload.slice(0, incompleteIndex);
      }

      data = overlayPayload;

      const sfxPrefix = '\x1b]9999;sfx;';
      let sfxPayload = sfxBufferRef.current + data;
      sfxBufferRef.current = '';

      const sfxRegex = /\x1b\]9999;sfx;({[^}]*})\x07/g;
      sfxPayload = sfxPayload.replace(sfxRegex, '');
      const sfxIncompleteIndex = sfxPayload.lastIndexOf(sfxPrefix);
      if (sfxIncompleteIndex !== -1 && sfxPayload.indexOf('\x07', sfxIncompleteIndex) === -1) {
        sfxBufferRef.current = sfxPayload.slice(sfxIncompleteIndex);
        sfxPayload = sfxPayload.slice(0, sfxIncompleteIndex);
      }

      data = sfxPayload;

      // 2. RIP mode detection
      if (data.includes('\x1b[1!') || data.includes('\u001b[1!')) {
        const parts = data.split(/\x1b\[1!|\u001b\[1!/);
        const textBefore = parts[0];
        if (textBefore) {
          // The modem emulator writes straight into xterm, so it is only the
          // right pipe while xterm is the surface (writeTerm covers both).
          if (surfaceRef.current !== 'canvas' && modemEmulatorRef.current) modemEmulatorRef.current.write(textBefore, { prePaced });
          else writeTerm(textBefore);
        }

        console.log('[RIP] Entering RIP graphics mode');
        // A new picture while the last one lingers: the linger's dismiss
        // key must not close the incoming picture.
        if (ripLinger.current) {
          ripLinger.current = false;
          ripLingerHandle.current?.disarm();
          ripLingerHandle.current = null;
        }
        ripModeRef.current = true;
        setRipMode(true);
        ripBuffer.current = '';
        ripDrawn.current = 0;   // the mount effect resets the renderer
        
        const ripContent = parts.slice(1).join('\x1b[1!');
        if (ripContent) {
          if (ripContent.includes('\x1b[2!') || ripContent.includes('\u001b[2!')) {
            const ripParts = ripContent.split(/\x1b\[2!|\u001b\[2!/);
            ripBuffer.current += ripParts[0];
            console.log('[RIP] Exiting RIP graphics mode (within same chunk)');
            ripModeRef.current = false;
            // Draw BEFORE clearing the flag's render, and keep the canvas up
            // for a beat: the buffer is the whole picture, and dropping out
            // of rip mode without painting it is what used to happen.
            drawRipBuffer(true);
            finishRipPictureRef.current();
            data = ripParts[1] || '';
          } else {
            ripBuffer.current += ripContent;
            return;
          }
        } else {
          return;
        }
      }
      
      if (ripModeRef.current) {
        if (data.includes('\x1b[2!') || data.includes('\u001b[2!')) {
          const parts = data.split(/\x1b\[2!|\u001b\[2!/);
          ripBuffer.current += parts[0];
          console.log('[RIP] Exiting RIP graphics mode');
          ripModeRef.current = false;
          drawRipBuffer(true);
          finishRipPictureRef.current();
          data = parts[1] || '';
          if (!data) return;
        } else {
          ripBuffer.current += data;
          drawRipBuffer();
          return;
        }
      }

      // Strip mouse enable sequences when user has toggled mouse tracking off
      // This prevents blessed screen.render() from re-enabling mouse capture
      let output = data;
      if (mouseTrackingDisabledRef.current) {
        output = output.replace(/\x1b\[\?(1000|1002|1003|1006)h/g, '');
      }

      if (surfaceRef.current === 'canvas') {
        // Simulated C64: the whole session renders on the canvas; xterm
        // stays hidden. Unpaced on purpose - the server already threw this
        // screen at the session's baud rate (see enqueuePetscii).
        //
        // NOT flushed per message on purpose: flush() DROPS a partially
        // parsed escape sequence (ansi-to-petscii.ts:129-135), and
        // ansi-output chunks do split mid-sequence - the overlay/sfx OSC
        // buffers a few lines above exist for exactly that. Held state is
        // resolved on the next chunk, or by the flush in processInputKeyRef
        // when the user types (the case that matters: nothing of the BBS's
        // may sit under the login echo).
        enqueuePetscii(petsciiTransducerRef.current!.transduce(output));
        return;
      }
      /*
       * DECDHL, which xterm.js does not have (teletext-double-height.ts).
       * A teletext session's headline rows arrive as ESC#3 / ESC#4 - the
       * escapes a VT100 would understand - and become the private-use
       * codepoints the face carries the halves in. Every other session sees
       * its bytes untouched: the filter returns the string it was given when
       * no attribute is set and none arrives.
       */
      const painted = texttvModeRef.current
        ? doubleHeightRef.current.write(output)
        : output;

      // Use modem emulator for client-side speed throttling
      if (modemEmulatorRef.current) {
        modemEmulatorRef.current.write(painted, { prePaced });
      } else {
        term.write(painted);
      }
      term.refresh(0, term.rows - 1);
    });

    // Legacy PUA text (command.handler's C64 prompts, BBSApi.writePetsciiLine).
    // This event does NOT select the canvas: screen.handler emits it as the
    // SAFE degrade for a session that is not a C64 (and BBSApi.writePetscii
    // (string) emits it ungated), so flipping the surface here would drag an
    // ordinary ANSI session onto a 40x25 canvas it never asked for. Only
    // 'petscii-bytes' and the 40x25 'terminal-resize' choose the surface;
    // this renders on whichever one is already live.
    socket.on('petscii-output', (data: string) => {
      if (surfaceRef.current === 'canvas') {
        // The transducer decodes U+E000-E1FF back to the PETSCII bytes the
        // glyphs stand for, so PUA text and raw .seq bytes end up in the
        // same machine through the same queue.
        enqueuePetscii(petsciiTransducerRef.current!.transduce(data));
        return;
      }
      // xterm: the PUA string goes out exactly like ansi-output does. Its
      // legibility depends on the session's font covering U+E000-E1FF -
      // xterm is never switched to PetMe64 any more (that gate belonged to
      // the hybrid overlay and is retired); a real PETSCII session renders
      // on the canvas from the character ROM instead.
      if (modemEmulatorRef.current) {
        modemEmulatorRef.current.write(data);
      } else {
        term.write(data);
      }
      term.refresh(0, term.rows - 1);
    });

    // Raw .seq bytes (screen.handler emitPetsciiScreen, BBSApi.writePetscii(Buffer)).
    socket.on('petscii-bytes', (b64: string) => {
      ensurePetsciiSession();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      petsciiTransducerRef.current!.observe(bytes); // the oracle must see what the screen now shows
      enqueuePetscii(bytes);
    });

    // Modem speed emulation handler.
    // NB: bps === 0 used to mean "disable throttling entirely", which let
    // xterm.js paint a full 80×25 screen in a single ~16ms frame and made
    // transient screens flash past unreadably. ModemEmulator.enable() now
    // soft-caps bps=0 to MAX_SOFT_CAP_BPS (230400) so MAX still feels
    // snappy but full-screen updates paint over ~87ms instead of 16ms.
    // Always route through enable() to get that behaviour.
    socket.on('modem-speed', (bps: number) => {
      console.log(`[ModemEmulator] Speed changed to ${bps} bps`);
      if (modemEmulatorRef.current) {
        modemEmulatorRef.current.enable(bps);
      }
      // Persist to cookie so the next session starts at the right speed
      // before the server responds with the user's saved preference.
      writeCookieModemSpeed(bps);
      // Nothing to mirror for the canvas: the C64 surface is not paced
      // client-side at all (see enqueuePetscii). Its "modem feel" comes
      // from the server, which throttles the same bytes for both surfaces.
    });

    /**
     * The PETSCII screen's SHAPE (petscii80 phase 3).
     *
     * The mode signal used to BE the geometry: the 40x25 in the resize
     * below was what mounted the canvas, so an 80-column PETSCII screen
     * could not be asked for without pretending to be 40 wide. This event
     * carries the shape, and the resize below stays exactly as it was so a
     * session that started before this deploy keeps its screen.
     */
    socket.on('petscii-palette', (data: { palette?: string }) => {
      // The caller's own choice, applied live: the canvas repaints from the
      // machine it already has, so a palette change costs no session state.
      console.log('[Terminal] PETSCII palette:', data?.palette);
      setPetsciiPalette(data?.palette === 'vic' ? 'vic' : 'vdc');
    });

    /*
     * THE OTHER DIRECTION, and the canvas needs it as much as it needs the
     * mount.
     *
     * Canvas mode was a one-way door: `petscii-mode` put the session on the
     * canvas and only a FRESH session took it off again (token login, a
     * failed restore, a reconnect that gave up). A RESTORED session is a
     * continuation and keeps its surface - which is right for a PETSCII
     * caller whose socket blinked, and wrong the moment the board asks the
     * graphics prompt again and the caller answers anything else. The board
     * then sends ANSI and the canvas paints it as Commodore glyphs.
     *
     * The sysop, 2026-09-15, after a deploy restarted the board under him:
     * "i pressed aq in the ansi prompt and got broken petscii now after a
     * petscii session". The server's own log for that session says PETSCII
     * NO and names the .txt file it served; only the browser had not been
     * told.
     *
     * `clearPetsciiSession` is the same teardown the fresh-session paths
     * use. The xterm surface keeps whatever the board draws next - the
     * prompt, the title screen - so there is nothing to repaint here.
     */

    socket.on('petscii-off', () => {
      if (surfaceRef.current !== 'canvas') return;
      console.log('[Terminal] PETSCII mode off - back to the xterm surface');
      clearPetsciiSession();
      term.reset();
      fitTerminal();
    });
    socket.on('petscii-mode', (shape: { cols: number; rows: number; palette?: string }) => {
      console.log('[Terminal] PETSCII mode:', shape.cols, 'x', shape.rows, shape.palette ?? '');
      // The colours travel with the shape: a C64 is a VIC-II, and the wide
      // screen is a C128's VDC unless the caller has said otherwise.
      setPetsciiPalette(shape.palette === 'vic' ? 'vic' : shape.cols === 80 ? 'vdc' : 'vic');
      ensurePetsciiSession(shape.cols === 80 ? 80 : 40);
    });

    // Teletext session mode (T answer at the graphics prompt). Stays on the
    // xterm surface - unlike PETSCII there is no canvas, only a face, a
    // palette and a SIZE. Classic teletext is 40x25 at 12x10 cells; the
    // terminal models 80x24, so the mode doubles the calibrated cell: 40
    // teletext columns fill the width exactly, double-height rows take
    // two, and the box scrolls (its CSS clips). The face applies uncached
    // (session-font.ts: TELETEXT_FONT is outside BBS_FONTS and
    // cacheFont=false) so the next connect's pre-login window never
    // opens in it.
    /**
     * A door asking for a real framebuffer.
     *
     * Only ever a same-origin PATH. A door names something the board itself
     * serves - `/beeb/...` - and never an outside URL: this puts a frame
     * with `allow-same-origin` over the caller's session, so pointing it
     * anywhere but at this board would hand that session to whoever owns
     * the other end.
     */
    socket.on('emulator:open', (data: { url?: string; title?: string; machine?: string }) => {
      const url = data?.url ?? '';
      if (!url.startsWith('/') || url.startsWith('//')) {
        console.warn('[Terminal] emulator:open refused - not a same-origin path:', url);
        return;
      }
      console.log(`[Terminal] Emulator surface open: ${url}`);
      setEmulator({ url, title: data?.title ?? '', machine: data?.machine });
    });

    // The door taking it back - a caller who quit the door from elsewhere,
    // or a session ending.
    socket.on('emulator:close', () => setEmulator(null));

    socket.on('texttv-mode', (data: { enabled: boolean }) => {
      if (data?.enabled) {
        console.log('[Terminal] Teletext mode on - TDAText face at 2x, teletext palette');
        texttvModeRef.current = true;
        if (texttvPrevThemeRef.current === null) texttvPrevThemeRef.current = term.options.theme;
        term.options.theme = XTERM_CONFIG.teletextTheme;
        if (texttvPrevColsRef.current === null) {
          texttvPrevColsRef.current = term.cols;
          texttvPrevRowsRef.current = term.rows;
          texttvPrevFontSizeRef.current = term.options.fontSize ?? null;
        }
        /*
         * Clear before the grid changes, screen AND scrollback.
         *
         * The pre-login window was painted at EIGHTY columns, and xterm
         * reflows what it holds when the column count changes: the board's
         * frontend art came back as two ragged rows above the teletext
         * title and a second copy of the first row below it (sysop,
         * localhost, 2026-09-13). None of it belongs to a teletext screen -
         * the board repaints for the new grid straight after this event -
         * so the buffer starts empty. reset() also drops the pen the old
         * screen left in force, which is why it is not just clear().
         */
        term.reset();
        doubleHeightRef.current.reset();

        // True 40x25 grid (same geometry PETSCII sessions use): the board
        // draws 40 columns for this session, so the terminal shows 40.
        // Direct resize, never the 'terminal-resize' socket event - that
        // means "mount the C64 canvas" to this component.
        term.resize(40, 25);
        if (terminalRef.current && texttvPrevOverflowRef.current === null) {
          texttvPrevOverflowRef.current = terminalRef.current.style.overflow || '';
          terminalRef.current.style.overflow = 'auto';
        }
        // Double the calibrated cell as a FIRST GUESS only. The page fits
        // the 40x25 grid for real once the face has loaded (TerminalPage
        // refit, teletext branch): TDAText is not the board face at 2x, and
        // guessing put the right of every row outside the window.
        // Through seamlessTeletextSize even for the GUESS: the calibrated
        // 80-column size is usually fractional and doubling keeps the
        // fraction, which seams every mosaic cell boundary (sysop,
        // 2026-09-14). The page's fit rounds what it settles on the same
        // way; this covers the window before that lands.
        void applyFont(term, TELETEXT_FONT, seamlessTeletextSize(fontSizeRef.current * 2), false)
          .then(() => announceTexttvMode(true)).then(resyncFocus);
      } else {
        console.log('[Terminal] Teletext mode off - restoring session face');
        texttvModeRef.current = false;
        if (texttvPrevThemeRef.current !== null) {
          term.options.theme = texttvPrevThemeRef.current;
          texttvPrevThemeRef.current = null;
        }
        if (texttvPrevColsRef.current !== null) {
          // The same clear on the way out: forty-column rows reflowed into
          // eighty are the same mess in the other direction.
          term.reset();
          doubleHeightRef.current.reset();
          term.resize(texttvPrevColsRef.current, texttvPrevRowsRef.current ?? 24);
          texttvPrevColsRef.current = null;
          texttvPrevRowsRef.current = null;
        }
        if (terminalRef.current && texttvPrevOverflowRef.current !== null) {
          terminalRef.current.style.overflow = texttvPrevOverflowRef.current;
          texttvPrevOverflowRef.current = null;
        }
        // The size the session had before the fit, not the teletext one the
        // page measured for forty columns.
        void applyFont(
          term,
          readCachedFont() ?? DEFAULT_BBS_FONT,
          texttvPrevFontSizeRef.current ?? fontSizeRef.current,
        ).then(() => announceTexttvMode(false));
        texttvPrevFontSizeRef.current = null;
      }
    });

    // Terminal resize handler (PETSCII mode uses 40x25)
    socket.on('terminal-resize', (size: { cols: number; rows: number }) => {
      console.log('[Terminal] Resize request:', size.cols, 'x', size.rows);
      if (size.cols === 40 && size.rows === 25) {
        // The 'P' answer (pre-login.ts applyGraphicsAnswer): the session is a
        // C64 from here on. xterm is not resized - it stays 80x24, hidden,
        // ready for the next non-PETSCII session on this component.
        ensurePetsciiSession();
        return;
      }
      term.resize(size.cols, size.rows);
    });

    // Cursor style for mouse hover feedback (CSS cursor property)
    // A server-rendered door telling us which touch scheme the player needs.
    // Re-dispatched as the same DOM event client doors use, so the page has
    // one listener regardless of where the door runs.
    socket.on('door:input-mode', (mode: string) => {
      if (mode !== 'menu' && mode !== 'game') return;
      window.dispatchEvent(new CustomEvent('bbs:input-mode', { detail: mode }));
    });

    socket.on('cursor-style', (style: string) => {
      if (terminalRef.current) {
        terminalRef.current.style.cursor = style;
      }
    });

    // Terminal mode switching: 'fixed' = 80 cols, 'wide' = responsive
    socket.on('terminal-mode', (mode: 'fixed' | 'wide') => {
      // forcedModeRef overrides server command (e.g. mobile forces 'wide')
      const effectiveMode = forcedModeRef.current ?? mode;
      console.log(`[BBSTerminal] *** TERMINAL MODE SWITCH *** server: ${mode}, effective: ${effectiveMode}`);
      console.log(`[BBSTerminal] Container size before: ${terminalRef.current?.clientWidth}x${terminalRef.current?.clientHeight}px`);
      console.log(`[BBSTerminal] Terminal size before: ${term.cols}x${term.rows}`);

      // Update both local variable and state (state triggers re-render to update container CSS)
      terminalMode = effectiveMode;
      setTerminalMode(effectiveMode);
      onTerminalModeChangeRef.current?.(effectiveMode);

      if (effectiveMode === 'fixed') {
        // Switching to fixed mode - resize to 80x25 immediately
        term.resize(80, 25);
        if (socketRef.current?.connected) {
          socketRef.current.emit('terminal-size', { cols: 80, rows: 25 });
        }
        console.log(`[BBSTerminal] Switched to fixed mode: 80x25`);
        console.log(`[BBSTerminal] Terminal size after: ${term.cols}x${term.rows}`);
      } else {
        // Switching to wide mode - wait for browser to resize container
        // Use longer delay (500ms) to ensure container finishes resizing
        console.log(`[BBSTerminal] Switched to wide mode - waiting 500ms for container resize...`);
        setTimeout(() => {
          console.log(`[BBSTerminal] Container size after delay: ${terminalRef.current?.clientWidth}x${terminalRef.current?.clientHeight}px`);
          fitTerminal();
          console.log(`[BBSTerminal] Terminal size after: ${term.cols}x${term.rows}`);
        }, 500);
      }
    });

    // RIP mode handler (RIPscrip v1.54 graphics protocol)
    socket.on('rip-mode', (info: { enabled: boolean; width?: number; height?: number }) => {
      console.log('[RIP] Mode changed:', info.enabled ? 'ENABLED' : 'DISABLED');
      setRipMode(info.enabled);
      if (info.enabled) {
        // Initialize RIP canvas when entering RIP mode
        ripBuffer.current = '';
        console.log('[RIP] RIP graphics mode initialized:', info.width || RIP_WIDTH, 'x', info.height || RIP_HEIGHT);
      }
    });

    // The credential-replay auto-login that used to live here was dead:
    // nothing called it. Auto-login runs through attemptTokenLogin (the
    // saved JWT), and the saved username/password are only used to seed
    // that token on a fresh registration.

    /**
     * The server's cue that its login prompt is on screen (it fires this from
     * seven sites, on every transport). It used to hand the line to the
     * browser's own editor; now it only records that this session is not past
     * login, because the prompt itself - and its echo - is the server's.
     */
    socket.on('prompt-login', () => {
      loginState.current = 'server-driven';
      tokenLoginPending.current = false;
    });

    socket.on('login-success', (data: any) => {
      console.log('Login successful:', data);
      loginState.current = 'loggedin';
      reconnectPending.current = false;

      if (data && data.token) {
        // Write to sessionStorage so this tab always reconnects as this user,
        // even if another tab logs in as someone else and overwrites localStorage.
        sessionStorage.setItem(BBS_AUTH_TOKEN_KEY, data.token);
        sessionStorage.setItem(SHARED_AUTH_TOKEN_KEY, data.token);

        // Only publish the token to the shared (cross-tab) store when the
        // user asked for auto-login. Writing it unconditionally is what let
        // one login leak into every other tab and window; when the
        // preference is off we actively clear any token a previous session
        // left behind, so stale credentials cannot resurrect it.
        const shareAcrossTabs = localStorage.getItem('bbs_auto_login_enabled') === 'true';
        if (shareAcrossTabs) {
          localStorage.setItem(BBS_AUTH_TOKEN_KEY, data.token);
          localStorage.setItem(SHARED_AUTH_TOKEN_KEY, data.token);
          window.dispatchEvent(
            new StorageEvent('storage', {
              key: SHARED_AUTH_TOKEN_KEY,
              newValue: data.token,
              oldValue: null,
            })
          );
        } else {
          localStorage.removeItem(BBS_AUTH_TOKEN_KEY);
          localStorage.removeItem(SHARED_AUTH_TOKEN_KEY);
        }
      }

      /*
       * REMEMBER THE THEME FOR THE SCREENS BEFORE THE NEXT LOGIN.
       *
       * The board draws its title screen before it knows who is calling, so
       * it cannot ask this caller's stored preference - it reads this cookie
       * off the handshake instead ("we save cookies so it should remember the
       * theme", sysop 2026-09-18). The slug is the one the BOARD resolved,
       * not the raw preference, so a theme the caller may no longer wear is
       * never the one their browser asks for.
       */
      if (typeof data?.screenTheme === 'string' && data.screenTheme) {
        writeCookieScreenTheme(data.screenTheme);
      }

      // Save session state for reconnection persistence
      saveSessionState({
        userId: data.userId || data.user?.id || data.user?.userId,
        username: data.username || data.user?.username,
        nodeId: data.nodeId,
        socketId: socket.id,
        currentConf: data.currentConf,
      });

      /**
       * The "Quick Connect" credential save that stood here is gone with the
       * browser's login buffers (TP-9b), and it cost nothing: NOTHING read
       * `bbs_saved_username` / `bbs_saved_password` back. Auto-login is the
       * saved JWT (`attemptTokenLogin`), as the comment above the connect
       * handler already recorded. What it did do was keep a base64 password
       * in localStorage; the two `removeItem` calls in the failure path stay,
       * so a browser that has one loses it on the next failed login.
       */

      socket.emit('get-font-preference');
      // ...and the palette he reads PETSCII with, for the same reason: it is
      // a stored preference, and until login there is nobody to have one.
      socket.emit('get-petscii-palette');
      focusSurface();
    });

    socket.on('session-restored', (data: any) => {
      console.log('[Session Persistence] Session restored successfully:', data);
      loginState.current = 'loggedin';
      reconnectPending.current = false;

      // Update session state with new socket ID
      saveSessionState({
        userId: data.userId || data.user?.id || data.user?.userId,
        username: data.username || data.user?.username,
        nodeId: data.nodeId,
        socketId: socket.id,
        currentConf: data.currentConf,
      });

      writeTerm('\r\n\x1b[32m[Session Restored] Welcome back!\x1b[0m\r\n');
      // A restored session is a logged-in session: pull the saved font the
      // same way login-success does. Without this the restore ran the whole
      // session in whatever font the terminal was constructed with.
      socket.emit('get-font-preference');
      socket.emit('get-petscii-palette');
      focusSurface();
    });

    socket.on('session-restore-failed', (reason: string) => {
      console.log('[Session Persistence] Session restoration failed:', reason);
      // The restore failed, so the backend is about to start a genuinely
      // fresh session (a new graphics prompt, or the token-login fallback
      // below) - not a continuation of whatever session (PETSCII or not)
      // this component was previously showing. Reset the surface explicitly
      // here, before that fresh sequence begins, rather than relying solely
      // on attemptTokenLogin's own reset (it already does this too,
      // belt-and-suspenders, since it also runs when there's no token to
      // fall back on).
      clearPetsciiSession();
      clearSessionState();
      reconnectPending.current = false;
      // Fall back to token login
      loginState.current = 'server-driven';
      tokenLoginPending.current = false;
      attemptTokenLogin();
    });

    socket.on('login-failed', (data: string | { reason: string; retryFrom?: 'username' | 'password' }) => {
      // Handle both old string format and new object format
      const reason = typeof data === 'string' ? data : data.reason;
      const retryFrom = typeof data === 'object' ? data.retryFrom : 'username';

      console.log('Login failed:', reason, 'retryFrom:', retryFrom);
      localStorage.removeItem('bbs_auth_token');
      clearSessionState();
      const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
      if (autoLoginEnabled) {
        localStorage.removeItem('bbs_saved_username');
        localStorage.removeItem('bbs_saved_password');
        writeTerm('\r\n\x1b[33m[Quick Connect] Saved credentials cleared due to login failure\x1b[0m\r\n');
      }

      // Where the caller goes next is the SERVER's decision and it has
      // already sent the prompt; `retryFrom` is read only for the log.
      console.log('[Login] server is re-prompting from:', retryFrom);
      loginState.current = 'server-driven';
      tokenLoginPending.current = false;
    });

    /**
     * SIX LISTENERS RETIRED HERE (TP-9b): `user-not-found`, `retry-login`,
     * `prompt-password`, `password-mode`, `prompt-password-reset` and
     * `prompt-forced-pwd-change`.
     *
     * Each existed to move the browser's login editor into a new mode, and
     * there is no editor to move: the server prints every one of those
     * prompts as ordinary output and reads the answer as ordinary `command`
     * input, on every transport (TP-9a).
     *
     * `password-mode` and `mask-input` go with them, and that is a small
     * deviation from the plan, which kept them re-pointed at "suppress local
     * echo". Nothing in this component echoes locally: `writeTerm` is fed by
     * the SERVER's output alone, and the only local echo that ever existed
     * was the retired editor's. A listener that gates nothing is not a
     * re-pointing, it is a comment with a socket attached - so the masking
     * lives where the echo does, on the server (`session.maskInput`).
     */
    // KEPT: a UI state signal, not a line-editor mode. The server says the
    // forced change is done and the BBS session is continuing.
    socket.on('forced-pwd-change-complete', () => {
      console.log('[ForcedPwdChange] Password changed successfully, resuming BBS session');
      loginState.current = 'loggedin';
    });

    socket.on('door-active', (active: boolean) => {
      console.log('[BBSTerminal] door-active received:', active);
      doorActive.current = active;
      setDoorOwnsScreen(active);
      // Skip the modem soft-cap while a door is running — door output
      // should feel instant. The pacing is for BBS navigation only.
      modemEmulatorRef.current?.setDoorActive(active);
      // The canvas needs no equivalent: it is never paced (enqueuePetscii).
    });

    // Game mode: bypass OS key repeat for real-time game controls
    // Game-mode pointer tracking lives on WINDOW, not the terminal div:
    // slipping off the canvas mid-game must not drop paddle control. With
    // the pointer lock held, movementX/Y accumulate into a virtual
    // position; without it, page-wide coordinates clamp into the grid.
    const gameWindowMouseMove = (event: MouseEvent) => {
      if (!gameMode.current) return;

      if (document.pointerLockElement) {
        const rect = terminalRef.current?.getBoundingClientRect();
        const virtual = lockedPointer.current ?? {
          x: rect ? rect.left + rect.width / 2 : event.clientX,
          y: rect ? rect.top + rect.height / 2 : event.clientY,
        };
        virtual.x += event.movementX;
        virtual.y += event.movementY;
        // Keep the virtual pointer inside the terminal so full mouse travel
        // maps onto full paddle travel without unbounded overshoot.
        if (rect) {
          virtual.x = Math.max(rect.left, Math.min(rect.right - 1, virtual.x));
          virtual.y = Math.max(rect.top, Math.min(rect.bottom - 1, virtual.y));
        }
        lockedPointer.current = virtual;
        emitPointerMove(virtual.x, virtual.y, {
          buttons: event.buttons,
          shift: event.shiftKey,
          ctrl: event.ctrlKey,
          alt: event.altKey
        });
        return;
      }

      // Unlocked: track anywhere over the page. The container's own React
      // handler also fires when the pointer is over the terminal, but the
      // shared hover throttle collapses the duplicate.
      emitPointerMove(event.clientX, event.clientY, {
        buttons: event.buttons,
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey
      });
    };
    window.addEventListener('mousemove', gameWindowMouseMove);

    // A reconnect into a restored session: the door never stopped, but this
    // client cleared its id when the socket came up. No bundle, no second
    // instance - just the id back, so the pad and the gestures return.
    socket.on('door:active-client', (data: { doorId?: string }) => {
      if (data?.doorId) setActiveClientDoor(data.doorId, 'session restored');
    });

    /*
     * The door says which repeat it wants. Unknown or missing keeps the
     * ARCADE rate, so a door that declares nothing behaves exactly as it did
     * before this existed.
     */
    socket.on('key-repeat-mode', (mode: string) => {
      const game = mode !== 'application';
      keyRepeatModeRef.current = game ? 'game' : 'application';
      keyRepeatRateRef.current = game ? GAME_REPEAT_RATE : APPLICATION_REPEAT_RATE;
      keyRepeatDelayRef.current = game ? GAME_REPEAT_DELAY : APPLICATION_REPEAT_DELAY;
      console.log(
        '[BBSTerminal] key repeat mode:', keyRepeatModeRef.current,
        `${keyRepeatDelayRef.current}ms then ${keyRepeatRateRef.current}ms`,
      );
    });


    socket.on('game-mode', (enabled: boolean) => {
      gameMode.current = enabled;
      if (!enabled) {
        // This is the authoritative "door ended" signal - the backend does
        // not emit door:unload-client - so it is where a client door has to
        // be told to stop. Without it the door's timers and camera captures
        // outlive the door itself.
        window.dispatchEvent(new CustomEvent('bbs:door-unload', {
          detail: { doorId: activeClientDoorId.current },
        }));
        setActiveClientDoor(null, 'game mode off');
      }
      // Clear key states and repeat timers when switching modes
      keyState.current = {};
      // Stop all key repeat timers
      Object.keys(keyRepeatTimers.current).forEach(key => {
        clearTimeout(keyRepeatTimers.current[key]);
      });
      keyRepeatTimers.current = {};

      // Pointer capture follows the DOOR's declaration, not game mode.
      //
      // Game mode means "send raw key-down/key-up", and executeClientDoor
      // switches it on for EVERY client door - so tying the pointer to it
      // took the cursor, the clicks and text selection away from LiveChat,
      // a client door whose whole UI is mouse-driven (reported live
      // 2026-08-25). Only doors that set capturePointer in their manifest
      // own the pointer; leaving game mode always gives it back.
      // Entering game mode does NOT hide the pointer. The pointer belongs to
      // whichever door is running, and only its manifest says so - which
      // arrives moments later on door:load-client. Applying the REMEMBERED
      // value here meant a door that never declares capture (LiveChat) had
      // the pointer taken away by whatever ran before it, because game-mode
      // fires first and carries no manifest. That is the "still no mouse
      // pointer in LiveChat" that survived two earlier fixes: both addressed
      // ways the flag was left set, and this is the line that USED it.
      if (enabled) {
        capturePointer.current = false;
        applyPointerCapture(false);
        term.clearSelection();
      } else {
        capturePointer.current = false;
        lockedPointer.current = null;
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
      }
    });

    socket.on('door:load-client', async (data: { doorId: string; sessionId: string; bundleUrl: string; manifest: any }) => {
      // Stop whatever is already running before starting another copy.
      // Re-entering a door used to leave the previous instance alive, and
      // LiveChat's video showed it plainly: two capture loops feeding one
      // tile at different sizes, flipping between them.
      window.dispatchEvent(new CustomEvent('bbs:door-unload', {
        detail: { doorId: data.doorId },
      }));

      // Real-time games declare this; TUI doors like LiveChat do not, and
      // keep their cursor, their clicks and text selection.
      capturePointer.current = data.manifest?.capturePointer === true;
      applyPointerCapture(capturePointer.current);
      console.log(`[ClientDoor] Loading door: ${data.doorId}`);

      // NOTHING IS WRITTEN TO THE SCREEN HERE.
      //
      // "Loading <door>..." and "[OK] Door bundle loaded" below were the
      // terminal narrating a load the DOOR now draws properly: the SDK's
      // preloader covers the screen and shows a real progress bar from the
      // moment the door's screen exists. Two lines of chatter above it left
      // the board's menu prompt and these notices on screen underneath, and
      // the sysop asked for them to go once the bar worked (2026-09-14).
      // The console.log lines stay - they are for whoever is debugging,
      // not for the caller.
      doorActive.current = true;
      setActiveClientDoor(data.doorId, 'door:load-client');
      doorReadyMap.current[data.sessionId] = false;
      if (!doorMessageBuffer.current[data.sessionId]) {
        doorMessageBuffer.current[data.sessionId] = [];
      }

      // Expose BBS connection to client doors
      (window as any).__BBS__ = {
        socket,
        sessionId: data.sessionId,
        backendUrl: finalBackendUrl
      };

      // Ensure we do not keep stale scripts around
      const scriptId = `door-${data.doorId}`;
      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        existingScript.remove();
      }

      const script = document.createElement('script');
      script.id = scriptId;
      script.src = data.bundleUrl.startsWith('http')
        ? data.bundleUrl
        : `${finalBackendUrl}${data.bundleUrl}`;
      // Bundles are built with esbuild --format=esm. As a classic script
      // that only works while the bundle avoids module-only syntax; the
      // SDK TrackerEngine's chiptune3 player uses import.meta.url (to find
      // its AudioWorklet next to the bundle), which is a SyntaxError
      // outside a module. Module scripts still fire onload/onerror.
      script.type = 'module';

      script.onload = () => {
        console.log(`[ClientDoor] Bundle loaded successfully: ${data.doorId}`);
        doorReadyMap.current[data.sessionId] = true;
        flushDoorMessages(data.sessionId);
      };

      script.onerror = (error) => {
        console.error(`[ClientDoor] Failed to load bundle:`, error);
        writeTerm('\r\n\x1b[31mError loading door bundle\x1b[0m\r\n');
        doorActive.current = false;
        setActiveClientDoor(null, 'client bundle failed to load');
        // A door that failed to load must not leave the pointer captured.
        capturePointer.current = false;
        applyPointerCapture(false);
        delete (window as any).__BBS__;
        const failedScript = document.getElementById(scriptId);
        if (failedScript && failedScript.parentNode) {
          failedScript.parentNode.removeChild(failedScript);
        }
        delete doorScripts.current[data.sessionId];
        delete doorReadyMap.current[data.sessionId];
        delete doorMessageBuffer.current[data.sessionId];
      };

      doorScripts.current[data.sessionId] = script;
      document.body.appendChild(script);
    });

    socket.on('door:unload-client', (data: { doorId: string; sessionId?: string }) => {
      // TELL the door first. Removing its <script> does not stop the code it
      // started - timers, camera captures and sockets all carry on - so a
      // re-entered door left its previous copy running. LiveChat ended up
      // with several capture loops sending frames at different sizes into
      // one tile, and it got worse the more times the door was opened.
      window.dispatchEvent(new CustomEvent('bbs:door-unload', {
        detail: { doorId: data.doorId, sessionId: data.sessionId },
      }));

      const scriptId = `door-${data.doorId}`;
      const script = document.getElementById(scriptId) || doorScripts.current[data.sessionId || ''] || null;
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (data.sessionId) {
        delete doorScripts.current[data.sessionId];
        delete doorReadyMap.current[data.sessionId];
        delete doorMessageBuffer.current[data.sessionId];
      }
      if ((window as any).__BBS__?.sessionId === data.sessionId) {
        delete (window as any).__BBS__;
      }
      doorActive.current = false;
      setActiveClientDoor(null, 'door session ended');
      // Give the pointer back. A game declares capturePointer and hides the
      // cursor; if it unloads without game mode being switched off first,
      // the hidden cursor outlived it and every later door inherited it -
      // which is why LiveChat, which never asks for the pointer, still had
      // no mouse (reported repeatedly, 2026-08-25).
      capturePointer.current = false;
      lockedPointer.current = null;
      applyPointerCapture(false);
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      writeTerm(`\r\n\x1b[32mDoor closed\x1b[0m\r\n`);
    });

    socket.on('set-font', (fontName: string) => {
      console.log('[Font] Received set-font event:', fontName);
      // A teletext session owns its face (TDAText + palette, `texttv-mode`
      // above) - an explicit pick waits until the mode ends with it.
      if (texttvModeRef.current) return;
      // One owner: utils/session-font.ts holds the stack, the line-height
      // map and the cache. xterm never shows a PETSCII session any more
      // (the canvas does), so the pick goes straight to xterm. The
      // calibrated size (fontSizeRef) is passed through — never the
      // hardcoded desktop 16 on mobile.
      void applyFont(term, fontName, fontSizeRef.current).then(resyncFocus);
    });

    // Handle font preference loaded from database on login
    socket.on('font-preference', (data: { font: string }) => {
      console.log('[Font Preference] Received saved preference:', data.font);
      // A teletext session owns its face - the server preference applies
      // once the mode ends (or never, if the caller stays in T all night).
      if (texttvModeRef.current) return;
      // The server preference is the owner of the session font; this
      // arrives after login-success AND after session-restored (both emit
      // get-font-preference). It applies to xterm only - a 'P' session
      // renders on the PetsciiCanvas, whose glyphs come from the
      // character-ROM atlas, not from a CSS font - so a saved Amiga font
      // can no longer clobber a C64 session's look.
      void applyFont(term, data.font, fontSizeRef.current).then(resyncFocus);
    });

    // Post-login input to the server (was the tail of term.onData).
    const sendInput = (data: string) => {
      if (!socket.connected) { console.error('[Terminal] Socket not connected, cannot send data'); return; }
      if (gameMode.current) return; // keydown/keyup are sent separately in game mode
      if (data === '\x03' && doorActive.current) {
        console.log('[BBSTerminal] Ctrl+C pressed while door active - sending door:terminate');
        writeTerm('\r\n\x1b[33m[Aborting door...]\x1b[0m\r\n');
        socket.emit('door:terminate');
        return;
      }
      socket.emit('command', data);
    };
    /**
     * The one input path for the on-screen keyboard and the canvas: straight
     * to the server. It used to ask the browser's login machine first, and
     * its answer differed from `term.onKey`'s at the new-user prompt - the
     * same question answered two ways depending on which keyboard the caller
     * used. Both paths are one path now.
     */
    processInputKeyRef.current = (key: string) => {
      // Anything the transducer is still holding belongs to the BBS's own
      // output and must land BEFORE this keystroke's echo, not under it.
      if (surfaceRef.current === 'canvas' && petsciiTransducerRef.current) {
        enqueuePetscii(petsciiTransducerRef.current.flush());
      }

      /*
       * IN GAME MODE, PRESS THE KEY INSTEAD OF TYPING IT.
       *
       * `sendInput` drops characters while game mode is on, because a physical
       * keyboard is already sending the key-down/key-up EDGES and the
       * character would arrive twice. An on-screen keyboard produces no edges
       * at all - so on a phone this path dropped every keystroke and the door
       * received nothing. The sysop, 2026-09-14, on the tip door: "the osd
       * keyboard doesnt seem to reach it q does nothing".
       *
       * The press and the release go through the same functions the mobile
       * game pads use, so a tapped key and a held one are the same thing to
       * the door. `null` is a paste or a terminal report - not a keystroke -
       * and falls through to the ordinary path.
       */
      if (gameMode.current) {
        const event = injectedKeyEvent(key);
        if (event) {
          pressSource.current = 'input-path';
          gameKeyPressRef.current?.(event.key, event.code);
          gameKeyReleaseRef.current?.(event.key, event.code);
          return;
        }
      }

      sendInput(key);
    };

    /**
     * ONE xterm callback, not two. `term.onKey` existed only to run the login
     * machine, and `term.onData` had to skip whatever that machine had
     * consumed - so a key at the login prompt travelled one way and every
     * other key another. `onData` alone now carries both, and it is also the
     * one that delivers PASTES, which never reached `onKey` at all.
     */
    term.onData((data: string) => {
      sendInput(data);
    });

    // Focus terminal on mount
    term.focus();

    // Cleanup
    return () => {
      window.removeEventListener('focus', resyncFocus);
      document.removeEventListener('visibilitychange', resyncFocus);
      mediaHandlerRef.current?.destroy();
      if (gamepadManagerRef.current) {
        gamepadManagerRef.current.stop();
        gamepadManagerRef.current = null;
      }
      socket.disconnect();
      socket.offAny(handleDoorMessageEvent);
      term.dispose();
      terminalInstance.current = null;
      socketRef.current = null;
      doorReadyMap.current = {};
      doorMessageBuffer.current = {};
      doorScripts.current = {};
      transferState.current = { direction: null, paths: [] };
      gameMode.current = false;
      keyState.current = {};
      // Clear all key repeat timers
      Object.keys(keyRepeatTimers.current).forEach(key => {
        clearTimeout(keyRepeatTimers.current[key]);
      });
      keyRepeatTimers.current = {};
      window.removeEventListener('keydown', handleGameKeyDown);
      window.removeEventListener('keyup', handleGameKeyUp);
      window.removeEventListener('mousemove', gameWindowMouseMove);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', wakeSocket);
      window.removeEventListener('online', wakeSocket);
      window.removeEventListener('pageshow', wakeSocket);
      // Clean up wheel handler
      if (terminalRef.current) {
        const handler = (terminalRef.current as any)._wheelHandler;
        const element = (terminalRef.current as any)._wheelElement;
        if (handler && element) {
          element.removeEventListener('wheel', handler);
        }
      }
      // Clean up resize handlers
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', mouseToggleHandler, true);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      // Clear resize throttle timers
      if (resizeThrottleTimer) {
        clearTimeout(resizeThrottleTimer);
      }
      if (resizeTrailingTimer) {
        clearTimeout(resizeTrailingTimer);
      }
      if (transferTimeout.current) {
        clearTimeout(transferTimeout.current);
        transferTimeout.current = null;
      }
      stopGuruAnimation();
    };
  // fontSize intentionally omitted from deps — live changes are handled by the
  // separate fontSize useEffect below, so font size updates never trigger reinit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, showConnectionError, onConnectionError, onConnect, onDisconnect]);

  // Handle cell-size changes - the fit, the viewer's override, or both.
  //
  // The page hands the effective size down and nothing here multiplies it, so
  // there is one PRODUCER of a cell size. Not one WRITER of
  // `options.fontSize`: the page's own fit probes real sizes onto the live
  // terminal (TerminalPage's refit -> measure), which is the whole reason it
  // ends the search by applying the size the terminal will KEEP.
  //
  // Except in teletext mode: the session owns its doubled cell, and this
  // effect firing after it (recalibration, zoom fraction, any parent
  // re-render with a new size) wrote the calibrated size straight back -
  // the mode applied, then un-applied itself (2026-09-10).
  useEffect(() => {
    if (terminalInstance.current && !texttvModeRef.current) {
      terminalInstance.current.options.fontSize = fontSize;
    }
  }, [fontSize]);

  // Tell the page the fraction is fit-to-window (once, on mount - no
  // gesture can change it any more).
  useEffect(() => {
    onZoomChangeRef.current?.(FIT_TO_WINDOW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // REMOVED (sysop, 2026-09-12): the three zoom inputs (wheel/pinch,
  // corner drag, bezel double-click). The browser window alone decides
  // the size now. The door's own wheel forwarder (`mouse-wheel` on
  // `.xterm-screen`) is untouched - doors still get their scroll.


  // Focus the terminal when clicking anywhere in the window. This ensures
  // keyboard input always goes to the live surface - xterm's textarea for
  // an ANSI session, the PetsciiCanvas for a 'P' session (whose xterm is
  // display:none and cannot hold focus at all).
  useEffect(() => {
    const handleWindowClick = () => {
      focusSurfaceRef.current();
    };

    window.addEventListener('click', handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

  // Focus the live surface when clicked
  const handleClick = () => {
    focusSurfaceRef.current();
    // Audio is now handled by MediaHandler (initialized on audio:play-sfx socket event)
  };

  // A fresh session reset the surface back to xterm (clearPetsciiSession):
  // xterm has just come back from display:none, so re-measure it and give
  // it the keyboard again. Only on a real canvas -> xterm transition: the
  // mount-time 'xterm' value must not trigger a fit (the terminal
  // deliberately does not auto-fit on mount - see fitTerminal's callers).
  // The host page needs the surface: on mobile the on-screen keyboard is the
  // only way to type on a canvas session, in any orientation.
  useEffect(() => { onSurfaceChange?.(surface); }, [surface, onSurfaceChange]);

  /**
   * TAB BELONGS TO THE BOARD, not to the browser's focus ring.
   *
   * A C64 keyboard has no Tab, so the canvas keymap never emitted one and the
   * browser was free to move focus to the address bar. It emits one now - a
   * lobby's panes are walked with it - but the canvas only sees the key while
   * it HOLDS focus, and a door's own lobby turns game mode off (which is what
   * otherwise swallows the key at the window). One click anywhere and Tab
   * left the session: "tab switches to the browser url line it doesnt seem to
   * be trapped by petscii mode at all".
   *
   * Capture phase, on window, for the life of the canvas surface: refuse the
   * browser's default and put the byte on the wire ourselves. Modified
   * chords (Ctrl+Tab, Alt+Tab, Cmd+Tab) are the OS's and are left alone.
   */
  useEffect(() => {
    if (surface !== 'canvas') return;
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      processInputKeyRef.current('\t');
    };
    window.addEventListener('keydown', trapTab, true);
    return () => window.removeEventListener('keydown', trapTab, true);
  }, [surface]);

  const wasCanvasRef = useRef<boolean>(false);
  useEffect(() => {
    if (surface === 'canvas') { wasCanvasRef.current = true; return; }
    if (!wasCanvasRef.current) return;
    wasCanvasRef.current = false;
    fitTerminalRef.current();
    terminalInstance.current?.focus();
  }, [surface]);

  // Calculate terminal cell coordinates from mouse event
  const getTerminalCoordsFromPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const term = terminalInstance.current;
    if (!term || !terminalRef.current) return null;

    // Get the viewport element (where cells are rendered)
    const viewport = terminalRef.current.querySelector('.xterm-screen');
    if (!viewport) return null;

    const rect = viewport.getBoundingClientRect();
    const cellWidth = rect.width / term.cols;
    const cellHeight = rect.height / term.rows;

    // Calculate cell position (0-indexed)
    const x = Math.floor((clientX - rect.left) / cellWidth);
    const y = Math.floor((clientY - rect.top) / cellHeight);

    // Clamp to valid range
    return {
      x: Math.max(0, Math.min(term.cols - 1, x)),
      y: Math.max(0, Math.min(term.rows - 1, y))
    };
  };

  const getTerminalCoords = (event: React.MouseEvent): { x: number; y: number } | null =>
    getTerminalCoordsFromPoint(event.clientX, event.clientY);

  // Mouse event handlers for game mode / doors
  const handleMouseDown = (event: React.MouseEvent) => {
    // Only send mouse events when door is active or in game mode
    if (!doorActive.current && !gameMode.current) return;

    if (!socketRef.current?.connected) return;

    // With the pointer lock held the event's clientX/Y are frozen at the
    // lock point - the virtual pointer is where the player actually is.
    const point = document.pointerLockElement && lockedPointer.current
      ? lockedPointer.current
      : { x: event.clientX, y: event.clientY };
    const coords = getTerminalCoordsFromPoint(point.x, point.y);
    if (!coords) return;

    mouseButtonDown.current = true;

    // The click is the game input - it goes out FIRST, unconditionally.
    // The pointer lock below is an enhancement, and requestPointerLock can
    // throw synchronously (permissions policy, unsupported) or reject as a
    // promise; when it sat above this emit, a failed lock swallowed every
    // menu click.
    emitMouseCell('mouse-click', coords, {
      button: event.button,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey
    });

    // Lock the pointer to the terminal on the first click - but ONLY for a
    // door that asked for the pointer.
    //
    // This was gated on game mode, which is on for EVERY client door, so
    // clicking LiveChat locked the pointer: the cursor vanished and the
    // browser announced "press Esc to show your cursor". THAT is what the
    // missing mouse pointer has been all along - not the CSS cursor at all,
    // which is why three fixes aimed at `cursor: none` changed nothing
    // (reported 2026-08-26, finally with the browser's own dialog quoted).
    //
    // Locked, the mouse cannot stray off the playfield mid-game; that is
    // worth it for Arkanoid and worthless for a chat window.
    if (capturePointer.current && !document.pointerLockElement && terminalRef.current) {
      lockedPointer.current = { x: event.clientX, y: event.clientY };
      try {
        const result: any = terminalRef.current.requestPointerLock?.();
        // Newer Chrome returns a promise; a rejection (e.g. the browser
        // refuses re-lock too soon after an Esc exit) must not surface as
        // an unhandled error.
        result?.catch?.(() => { lockedPointer.current = null; });
      } catch {
        lockedPointer.current = null;
      }
    }
  };

  const handleMouseUp = (event: React.MouseEvent) => {
    if (!mouseButtonDown.current) return;

    mouseButtonDown.current = false;

    if (!socketRef.current?.connected) return;

    // Same substitution as handleMouseDown: locked events carry clientX/Y
    // frozen at the lock origin. Doors move on mouse-up too (arkanoid
    // steers the paddle on every event type), so a release at the left
    // edge must not teleport the paddle to wherever the lock began.
    const point = document.pointerLockElement && lockedPointer.current
      ? lockedPointer.current
      : { x: event.clientX, y: event.clientY };
    const coords = getTerminalCoordsFromPoint(point.x, point.y);
    if (!coords) return;

    emitMouseCell('mouse-up', coords, {
      button: event.button,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey
    });
  };

  /**
   * Shared pointer-move emitter for both event paths: the container's React
   * handler and the game-mode window listener. getTerminalCoordsFromPoint
   * clamps into the grid, so a pointer anywhere on the page still steers.
   */
  const emitPointerMove = (
    clientX: number,
    clientY: number,
    modifiers: { buttons: number; shift: boolean; ctrl: boolean; alt: boolean }
  ) => {
    const coords = getTerminalCoordsFromPoint(clientX, clientY);
    if (!coords) return;

    if (mouseButtonDown.current) {
      if ((window as any).__MOUSE_DEBUG__) {
        console.log('[BBSTerminal] Emitting mouse-drag');
      }
      emitMouseCell('mouse-drag', coords, {
        button: modifiers.buttons === 1 ? 0 : modifiers.buttons === 2 ? 2 : modifiers.buttons === 4 ? 1 : 0,
        shift: modifiers.shift,
        ctrl: modifiers.ctrl,
        alt: modifiers.alt
      });
    } else {
      // Hovering - throttle to ~60fps (16ms) to avoid flooding
      const now = Date.now();
      if (now - lastMouseHoverTime.current < 16) return;
      lastMouseHoverTime.current = now;

      emitMouseCell('mouse-hover', coords, {
        shift: modifiers.shift,
        ctrl: modifiers.ctrl,
        alt: modifiers.alt
      });
    }
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    // Only send mouse events when door is active or in game mode
    if (!doorActive.current && !gameMode.current) return;

    // While the pointer lock holds, the window-level game listener owns
    // movement; the frozen clientX/Y here would fight the virtual pointer.
    if (document.pointerLockElement) return;

    const coords = getTerminalCoords(event);
    if (!coords) return;

    // Mouse-move logging sits on the hot path: a door game gets one of these
    // per pointer sample (60+/s) and each console.log is real main-thread work
    // competing with the terminal renderer. Opt in with
    // `window.__MOUSE_DEBUG__ = true` when tracing pointer plumbing.
    if ((window as any).__MOUSE_DEBUG__) {
      console.log('[BBSTerminal] mousemove: mouseButtonDown=', mouseButtonDown.current, 'event.buttons=', event.buttons);
    }

    emitPointerMove(event.clientX, event.clientY, {
      buttons: event.buttons,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey
    });
  };

  // Wheel events are handled by the NATIVE listener installed on
  // .xterm-screen in the mount effect - React's onWheel never sees them,
  // because xterm stops the event before it bubbles to the React tree.
  // The React handler that used to live here was dead for that reason.

  // Prevent browser context menu when door is active (allows app to use right-click)
  const handleContextMenu = (event: React.MouseEvent) => {
    if (doorActive.current || gameMode.current) {
      event.preventDefault();
    }
  };

  /**
   * Paint whatever RIP commands have arrived so far.
   *
   * The renderer keeps its own state, so feeding it the WHOLE buffer each
   * time would re-run every command and redraw from scratch. Only the part
   * that has not been drawn yet is handed over.
   */
  const ripDrawn = useRef<number>(0);
  const drawRipBuffer = useCallback((final = false) => {
    const renderer = ripRendererRef.current;
    // Not mounted yet - the canvas appears on the render after ripMode is
    // set. Nothing is consumed, so this content is drawn by the next call.
    if (!renderer) return;

    let pending = ripBuffer.current.slice(ripDrawn.current);
    if (!pending) return;

    // Socket chunks fall wherever the network puts them, which is happily
    // in the middle of a command. Every RIP command ends in a newline, so a
    // buffer that ends in one is whole and can go over as it is; otherwise
    // everything from the last '!|' onwards may be half a command and waits
    // for the rest, rather than being parsed as garbage and skipped.
    if (!final && !/\r?\n$/.test(pending)) {
      const lastStart = pending.lastIndexOf('!|');
      if (lastStart <= 0) return;
      pending = pending.slice(0, lastStart);
    }

    ripDrawn.current += pending.length;
    try {
      renderer.render(pending);
    } catch (err) {
      // A malformed script must not take the terminal down with it - the
      // door is still streaming and the session has to survive.
      console.warn('[RIP] render failed:', err);
    }
  }, []);

  // Linger machinery, as function refs: the socket handler that calls them
  // is registered once at mount and must not capture stale closures. The
  // armed key listener itself lives in armRipLinger() as ONE stable
  // instance - a per-render ref here once left the armed copy installed
  // forever, swallowing every keystroke after dismissal.
  const ripLingerHandle = useRef<RipLinger | null>(null);
  const closeRipOverlayRef = useRef<() => void>(() => {});
  const finishRipPictureRef = useRef<() => void>(() => {});
  closeRipOverlayRef.current = () => {
    ripLinger.current = false;
    ripLingerHandle.current?.disarm();
    ripLingerHandle.current = null;
    setRipMode(false);
    // Typing continues at the prompt the picture was covering.
    focusSurfaceRef.current();
  };
  finishRipPictureRef.current = () => {
    if (doorActive.current) {
      // The door already waited for the user's key before sending [2! -
      // lingering here would demand a second keypress.
      setRipMode(false);
      return;
    }
    // A screen picture (BBSTITLE and friends): the backend moves straight
    // on to the next text prompt, which replaced the picture before the
    // eye caught it ("i tried R but saw no rip title"). Keep the canvas up
    // until the user's first key or click; the prompt is drawn underneath
    // in the meantime.
    ripLinger.current = true;
    ripLingerHandle.current?.disarm();
    ripLingerHandle.current = armRipLinger(window, () => closeRipOverlayRef.current());
  };

  // Draw once the renderer has actually mounted.
  //
  // The door sends ESC[1! and the WHOLE file in one emit. The socket handler
  // sets ripMode and calls drawRipBuffer in the same tick - but the
  // <RIPRenderer> only mounts on React's next render, so the ref was still
  // null, nothing was consumed, and nothing called draw again until the
  // ESC[2! arrived on the user's keypress. That drew everything and
  // unmounted in the same breath: a black box while open, the picture for
  // one frame on the way out. Reported as "rip graphics they dont display".
  //
  // Effects run after commit, when the ref is populated, so this is the
  // first moment the buffered content can reach a canvas.
  useEffect(() => {
    if (!ripMode) return;
    try { ripRendererRef.current?.reset(); } catch { /* fresh canvas anyway */ }
    ripDrawn.current = 0;
    drawRipBuffer();
  }, [ripMode, drawRipBuffer]);

  return (
    <div
      className={className}
      style={{
        // Fixed 80x25 mode: the PAGE owns the ground (the host paints its
        // --bbs-page-bg, black since 5841a1171, around the terminal box); the
        // black belongs to the terminal box below. Wide/fullscreen still
        // paints black edge to edge - there is no page around a fullscreen
        // door. With fit-to-window the ground is barely visible anyway: the
        // box ends flush against the window on the constraining axis.
        backgroundColor: terminalMode === 'fixed' ? 'transparent' : '#000000',
        overflow: 'hidden', // Prevent scrollbars
        // Explicit height for flex centering. fillParent hosts (the mobile BBS
        // page, which reserves a strip for the on-screen keyboard) size us from
        // their own content box instead of the raw viewport.
        height: fillParent ? '100%' : '100vh',
        // In wide mode: use absolute positioning to break out of parent flex centering
        // In fixed mode: relative positioning for normal layout
        position: terminalMode === 'wide' ? 'absolute' : 'relative',
        // Fixed mode centres the terminal box (below) in whatever space the
        // host gives it. This used to be `flex items-center justify-center` in
        // the className above - Tailwind utilities that web/frontend, the only
        // consumer of this package, does not ship. Nothing defined them, so the
        // box was pinned to the top-left corner. An xterm session hid that
        // (the PAGE centres it: TerminalPage shrink-wraps a fit-content frame
        // around xterm's intrinsic width), but a PETSCII session - whose canvas
        // is space-filling and so cannot be shrink-wrapped - sat in the corner
        // with the page ground down one side ("the petscii mode is not centered
        // like the normal term", sysop, 2026-09-03). Inline, so the centring
        // cannot go missing with a stylesheet again. `centerInHost` is the
        // host's veto: a handheld page keeps its terminal at the top of the
        // strip the on-screen keyboard leaves it.
        /*
         * WHERE THE GRID SITS IN THE BAND IT IS GIVEN.
         *
         * A desktop centres it. A handheld puts it at the BOTTOM, against the
         * on-screen keyboard - and that is not a taste: iOS draws its address
         * bar OVER the top of the page and reports nothing a layout can read
         * (`visualViewport.offsetTop` stays 0), so anything at the top of the
         * band is under the bar. The sysop, 2026-09-14, with screenshots:
         * "the bbs draws under the adress bar".
         *
         * The grid is ~200px of a ~580px band on a phone, so the slack goes
         * above it where the browser's chrome already is, instead of below it
         * where nothing is. A terminal above a keyboard is also where a
         * phone puts text anyway.
         *
         * Horizontal centring applies either way: an 80-column grid is
         * narrower than the screen at every size the fit picks, and it used
         * to sit against the left edge on a phone.
         */
        ...(terminalMode === 'fixed' && {
          display: 'flex',
          alignItems: centerInHost ? 'center' : 'flex-end',
          justifyContent: 'center',
        }),
        ...(terminalMode === 'wide' && {
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
        }),
      }}
    >
      {/* The terminal box and the RIP overlay share this wrapper so that
          "absolute, inset 0" means THE TERMINAL, not the viewport - a RIP
          picture used to fill the whole browser instead of matching the
          terminal ("the images fill the entire browser"). The fixed-mode
          max-width moves up here so the overlay is bounded by it too. */}
      <div
        ref={zoomBoxRef}
        style={{
          position: 'relative',
          width: '100%',
          // The terminal box is the black thing on the page (see the outer
          // wrapper): in fixed mode it carries the background so the page
          // ground shows only around it.
          ...(terminalMode === 'fixed'
            ? {
                // NO width cap. There used to be a 960px one, to stop the
                // black box stretching across an ultrawide viewport while the
                // cell size was a constant. The cell size is now the FIT - the
                // largest at which the grid plus its bezel fits the window -
                // so the box is exactly as wide as the screen it holds, and a
                // cap could only clip it ("it needs to scale flush - it has
                // padding now", sysop, 2026-09-03).
                backgroundColor: '#000000',
                // A canvas session is space-filling: it has no intrinsic
                // width to shrink-wrap, so the viewer's fraction scales the
                // BOX and PetsciiCanvas fits its 40x25 screen inside. At
                // fit-to-window that is the whole host box, edge to edge.
                ...(surface === 'canvas'
                  ? { width: `${zoomFraction * 100}%`, height: `${zoomFraction * 100}%` }
                  : {}),
                // The bezel: a black border around the screen with rounded
                // corners, so the terminal reads as a screen sitting on the
                // page ground (sysop, 2026-09-02). Tokens owned by the host
                // page; the fallbacks keep the package self-contained.
                padding: 'var(--bbs-terminal-bezel, 16px)',
                // border-box: the bezel lives INSIDE the 100% width, otherwise the
                // box is 32px wider than its parent and the outer wrapper's
                // overflow clips its right edge square (sysop, 2026-09-02).
                boxSizing: 'border-box',
                borderRadius: 'var(--bbs-terminal-radius, 12px)',
                overflow: 'hidden',
                // REMOVED (sysop, 2026-09-12): the corner-resize cursor went
                // with the corner drag. The box carries no visible chrome.
              }
            : { height: '100%' }),
        }}
      >
      <div
        ref={terminalRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { mouseButtonDown.current = false; }}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        style={{
          overflow: 'hidden',
          position: 'relative',
          outline: 'none',
          width: '100%',
          // In wide mode: 100% height to fill screen (the wrapper carries
          // the fixed-mode max-width)
          ...(terminalMode === 'fixed' ? {} : { height: '100%' }),
          // A 'P' session is a C64: the canvas below is the surface and xterm
          // is hidden (kept mounted - RIP, ZMODEM and the modem emulator hold
          // the instance). Nothing reads xterm's screen while hidden.
          ...(surface === 'canvas' ? { display: 'none' } : {}),
        }}
      />
      {surface === 'canvas' && petsciiMachine && (
        <div
          style={{
            width: '100%',
            // The canvas fits ITSELF to this box on both axes: it measures
            // the container and keeps its own screen's aspect with
            // max-width/max-height, so the box just hands it the space the
            // fraction allows. That aspect is 352x232 for a C64 screen and
            // 672x232 for an 80-column one (PETSCII_UNIT_FOOTPRINT), which
            // is why no aspect is named here - a fixed one would fight the
            // canvas and re-introduce a gap on the other axis.
            height: '100%',
            backgroundColor: '#000',
          }}
        >
          <PetsciiCanvas
            ref={petsciiCanvasRef}
            machine={petsciiMachine}
            palette={petsciiPaletteFor(petsciiPalette)}
            cursorVisible={doorOwnsScreen ? false : undefined}
            focusable
            focusOnMount
            onData={(bytes) => {
              // keymap.ts bytes -> the same ASCII/ANSI the server reads from
              // xterm, via the SDK's shared PETSCII input map (cursor and
              // function keys included), then the one input path.
              const text = petsciiInputToAscii(bytes);
              if (text) processInputKeyRef.current(text);
            }}
            highlight={petsciiSelection ? [{ ...petsciiSelection, tone: 'brush' as const }] : undefined}
            onCellPointer={(event) => {
              const held = (event.buttons & 1) !== 0;
              if (event.type === 'down') {
                if (!held) return;
                petsciiSelectAnchor.current = { x: event.x, y: event.y };
                showPetsciiSelection(rectFromCorners(petsciiSelectAnchor.current, petsciiSelectAnchor.current));
                return;
              }
              const anchor = petsciiSelectAnchor.current;
              if (!anchor) return;
              if (event.type === 'move') {
                if (held) showPetsciiSelection(rectFromCorners(anchor, { x: event.x, y: event.y }));
                return;
              }
              // 'up': the drag is over.
              const rect = rectFromCorners(anchor, { x: event.x, y: event.y });
              petsciiSelectAnchor.current = null;
              // A click is a click - it focuses the canvas and must not put a
              // single character on the clipboard or leave a box on screen.
              if (rect.w === 1 && rect.h === 1) {
                showPetsciiSelection(null);
                return;
              }
              const machine = petsciiMachineRef.current;
              if (!machine) {
                showPetsciiSelection(null);
                return;
              }
              showPetsciiSelection(rect);
              const selected = screenTextInRect(machine.state, rect);
              if (!selected.trim()) return;
              // mouseup is a user gesture, which is what the clipboard needs.
              // A refusal (insecure origin, denied permission) must not break
              // the session - the caller simply keeps their old clipboard.
              navigator.clipboard?.writeText(selected).catch((err) => {
                console.warn('[PETSCII] copy refused by the browser', err);
              });
            }}
          />
        </div>
      )}
      {ripMode && (
        // Flush over the terminal box, no frame, no badge: the picture
        // reads as the BBS drawing it inside the terminal, not as a dialog
        // parked on top. The sysop asked for exactly this.
        <div
          style={{
            position: 'absolute',
            inset: terminalMode === 'fixed' ? 'var(--bbs-terminal-bezel, 16px)' : 0,
            zIndex: 10,
            backgroundColor: '#000',
            // Centre the proportionally-scaled canvas; the leftover strips
            // are this div's black, so the picture sits letterboxed in the
            // terminal box rather than stretched across it.
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          // The canvas is not focusable; without this, clicking the picture
          // moves focus off xterm's textarea and every later keypress dies
          // in the page instead of reaching the BBS ("i cant close images
          // with mouse or keys").
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            // A lingering screen picture closes locally - the backend has
            // already moved on to the next prompt underneath it.
            if (ripLinger.current) {
              closeRipOverlayRef.current();
              return;
            }
            // RIPtermJS's own mouseup handler has already run: a button hit
            // fired onCommand below. A click that produced no command hit
            // plain picture - deliver it as the any-key the door waits for.
            if (shouldDismissRipClick(ripCommandAt.current, Date.now())) {
              socketRef.current?.emit('command', '\r');
            }
          }}
        >
          <RIPRenderer
            ref={ripRendererRef}
            width={RIP_WIDTH}
            height={RIP_HEIGHT}
            onCommand={(command: string) => {
              // A RIP button or mouse region sends its command back as if
              // the user had typed it. 'terminal-input' is the channel the
              // backend's AmigaGuideViewer listens on for RIP buttons.
              ripCommandAt.current = Date.now();
              socketRef.current?.emit('terminal-input', command);
            }}
            onExitRipMode={() => {
              ripModeRef.current = false;
              setRipMode(false);
            }}
          />
        </div>
      )}
      {/* REMOVED (sysop, 2026-09-12): the corner-resize marks went with the
          corner drag - brackets that do nothing are worse than none. */}
      </div>
      {/* Web Transparency Overlays - CSS-based overlays for web connections */}
      {Array.from(overlays.entries()).map(([id, overlay]) => {
        // Calculate pixel position from terminal cell coordinates
        const terminalEl = terminalRef.current;
        const xtermScreen = terminalEl?.querySelector('.xterm-screen');
        const rect = xtermScreen?.getBoundingClientRect();
        const termRect = terminalEl?.getBoundingClientRect();

        // Calculate cell dimensions
        const cols = 80;
        const rows = 24;
        const cellWidth = rect ? rect.width / cols : 0;
        const cellHeight = rect ? rect.height / rows : 0;

        // Calculate offset from terminal container to xterm-screen
        const offsetLeft = rect && termRect ? rect.left - termRect.left : 0;
        const offsetTop = rect && termRect ? rect.top - termRect.top : 0;

        // Determine overlay position and size (default to full screen if not specified)
        const hasPosition = overlay.x !== undefined && overlay.y !== undefined &&
                           overlay.width !== undefined && overlay.height !== undefined;

        const bg = `rgba(0, 0, 0, ${overlay.opacity})`;
        const base: React.CSSProperties = { position: 'absolute', backgroundColor: bg, pointerEvents: 'none', zIndex: 100 };

        // If a modal cutout is specified, render 4 strips around it instead of one
        // full-screen div so the modal terminal content is not dimmed by CSS.
        if (overlay.exclude && cellWidth > 0 && cellHeight > 0) {
          const ex = overlay.exclude;
          const ox = offsetLeft + ((overlay.x ?? 0) * cellWidth);
          const oy = offsetTop  + ((overlay.y ?? 0) * cellHeight);
          const ow = (overlay.width  ?? cols) * cellWidth;
          const oh = (overlay.height ?? rows) * cellHeight;
          const mx = offsetLeft + (ex.x * cellWidth);
          const my = offsetTop  + (ex.y * cellHeight);
          const mw = ex.width  * cellWidth;
          const mh = ex.height * cellHeight;
          return (
            <React.Fragment key={id}>
              {/* Top strip */}
              <div style={{ ...base, left: ox, top: oy, width: ow, height: my - oy }} />
              {/* Bottom strip */}
              <div style={{ ...base, left: ox, top: my + mh, width: ow, height: (oy + oh) - (my + mh) }} />
              {/* Left strip (beside modal) */}
              <div style={{ ...base, left: ox, top: my, width: mx - ox, height: mh }} />
              {/* Right strip (beside modal) */}
              <div style={{ ...base, left: mx + mw, top: my, width: (ox + ow) - (mx + mw), height: mh }} />
            </React.Fragment>
          );
        }

        const style: React.CSSProperties = hasPosition ? {
          ...base,
          left: offsetLeft + (overlay.x! * cellWidth),
          top: offsetTop + (overlay.y! * cellHeight),
          width: overlay.width! * cellWidth,
          height: overlay.height! * cellHeight,
        } : {
          ...base,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        };

        return (
          <div
            key={id}
            style={style}
          />
        );
      })}
      {emulator && (
        <EmulatorOverlay
          url={emulator.url}
          title={emulator.title}
          machine={emulator.machine}
          onClose={() => {
            setEmulator(null);
            // Tell the door the caller is back, so it can carry on instead
            // of waiting for something that has already happened.
            socketRef.current?.emit('emulator:closed');
          }}
        />
      )}
      {/* RIP Graphics Canvas Overlay */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
    </div>
  );
});

// Add display name for debugging
BBSTerminal.displayName = 'BBSTerminal';
