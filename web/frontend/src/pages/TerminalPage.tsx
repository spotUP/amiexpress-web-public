import { useRef, useState, useEffect, useCallback } from 'react';
import { BBSTerminal, type BBSTerminalRef, type TerminalMouseEventType } from '@amiexpress/terminal';
import { MobileBBSKeyboard } from '../components/mobile/MobileBBSKeyboard';
import { visibleHeight } from '../components/mobile/terminal-fit';
import { MobileGameControls } from '../components/mobile/MobileGameControls';
import { MobileGameGestures } from '../components/mobile/MobileGameGestures';
import {
  readTouchScheme,
  writeTouchScheme,
  type TouchScheme,
} from '../components/mobile/gesture-scheme';
import { MobileArkanoidControls, type TrackpadPhase } from '../components/mobile/MobileArkanoidControls';
import { findGameControlLayout, trackpadColumn, trackpadStep } from '../components/mobile/game-controls';
import { fitFontSize } from '../components/mobile/terminal-fit';
import './TerminalPage.css';

// Seed only — the real size comes from measuring the rendered grid. mOsOul and
// the Topaz faces are half-width bitmaps, so this lands close and the fit
// search finishes in a couple of probes.
const CHAR_ASPECT = 0.5;
const BBS_COLS = 80;
const DESKTOP_FONT_SIZE = 16;
/** Must match --bbs-onscreen-input-height in TerminalPage.css. */
const ONSCREEN_INPUT_HEIGHT = 260;
const PORTRAIT_MOBILE_MAX_WIDTH = 600;

function isPortraitMobile(): boolean {
  return window.innerWidth < PORTRAIT_MOBILE_MAX_WIDTH && window.innerHeight > window.innerWidth;
}

/**
 * A phone or tablet in any orientation. Portrait drives the on-screen keyboard;
 * this drives the font fit, because a landscape phone needs scaling just as
 * much as a portrait one.
 */
function isHandheld(): boolean {
  if (isPortraitMobile()) return true;
  // Landscape: a narrow desktop window is not a phone, so require a touch
  // screen before rescaling the font there.
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  return coarsePointer && Math.min(window.innerWidth, window.innerHeight) < PORTRAIT_MOBILE_MAX_WIDTH;
}

function seedFontSize(containerWidth: number): number {
  return Math.max(4, Math.floor(containerWidth / BBS_COLS / CHAR_ASPECT));
}

export function TerminalPage(): JSX.Element {
  const terminalRef = useRef<BBSTerminalRef>(null);
  const [isMobile, setIsMobile] = useState<boolean>(isPortraitMobile);
  const [fontSize, setFontSize] = useState<number>(() =>
    isHandheld() ? seedFontSize(window.innerWidth) : DESKTOP_FONT_SIZE
  );
  const [activeDoorId, setActiveDoorId] = useState<string | null>(null);

  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  const gridObserver = useRef<ResizeObserver | null>(null);

  const gameControls = findGameControlLayout(activeDoorId);

  /**
   * Terminal row the trackpad reports its Y at, or null when the running door
   * has no trackpad. Kept in a ref so the pointer callbacks stay stable while
   * still seeing the current door.
   */
  const spinnerRow = useRef<number | null>(null);
  spinnerRow.current = gameControls?.kind === 'spinner' ? gameControls.row : null;

  /**
   * Scale the 80x25 grid to the space the page can give it.
   *
   * xterm's own measurement is authoritative: `.xterm-screen` is exactly
   * cols * cellWidth wide, so the fit probes real font sizes and keeps the
   * largest one that still fits instead of guessing a font aspect ratio.
   * The whole search is synchronous — setting `options.fontSize` re-measures
   * the char size and restyles the screen element before it returns.
   */
  const refit = useCallback(() => {
    const term = terminalRef.current?.getTerminal();
    const element = term?.element;
    if (!term || !element) return;

    if (!isHandheld()) {
      if (fontSizeRef.current !== DESKTOP_FONT_SIZE) setFontSize(DESKTOP_FONT_SIZE);
      return;
    }

    // A door that took the terminal out of the standard 80-column grid (wide
    // mode, or a server-driven resize) owns its own sizing — leave it alone.
    if (term.cols !== BBS_COLS) return;

    const screen = element.querySelector('.xterm-screen') as HTMLElement | null;
    const host = element.parentElement;
    if (!screen || !host) return;

    // Host width already excludes the safe-area padding the page applies.
    const availableWidth = host.clientWidth || window.innerWidth;
    // The VISIBLE viewport, not the layout one: on iOS the layout viewport
    // runs underneath Safari's floating address bar, so sizing against it
    // hid the top rows behind the bar.
    const availableHeight = visibleHeight(window) - (isMobileRef.current ? ONSCREEN_INPUT_HEIGHT : 0);

    const fitted = fitFontSize(
      fontSizeRef.current,
      { width: availableWidth, height: availableHeight },
      (candidate) => {
        term.options.fontSize = candidate;
        return { width: screen.offsetWidth, height: screen.offsetHeight };
      },
    );

    if (fitted !== fontSizeRef.current) setFontSize(fitted);
  }, []);

  useEffect(() => {
    const handleViewportChange = () => {
      setIsMobile(isPortraitMobile());
      refit();
    };
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    // iOS reports the browser chrome collapsing here and nowhere else.
    window.visualViewport?.addEventListener('resize', handleViewportChange);

    const refocusOnClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'A')) return;
      terminalRef.current?.focus();
    };
    document.addEventListener('click', refocusOnClick, { capture: true });

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('click', refocusOnClick, { capture: true });
      gridObserver.current?.disconnect();
      gridObserver.current = null;
    };
  }, [refit]);

  // Showing or hiding the on-screen input changes how much height the grid has.
  useEffect(() => { refit(); }, [isMobile, refit]);

  // Suppress iOS native keyboard on portrait mobile; restore on landscape.
  useEffect(() => {
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile && isMobileDevice) {
      const timer = setTimeout(() => {
        const textarea = terminalRef.current?.getTerminal()?.textarea;
        if (textarea) {
          textarea.removeAttribute('inputmode');
          textarea.blur();
        }
      }, 800);
      return () => clearTimeout(timer);
    }
    if (isMobile) {
      const timer = setTimeout(() => {
        const ta = terminalRef.current?.getTerminal()?.textarea;
        if (ta) ta.setAttribute('inputmode', 'none');
      }, 600);
      return () => clearTimeout(timer);
    }
    terminalRef.current?.focus();
  }, [isMobile]);

  // The grid only exists once the terminal is up, so the first fit runs here.
  const handleConnect = useCallback(() => {
    requestAnimationFrame(() => {
      refit();

      // The Amiga bitmap faces decide the cell width, so a fit measured
      // against a fallback face is wrong. Re-fit once they are in.
      document.fonts?.ready.then(refit).catch(() => undefined);

      // Anything else that changes the cell size - the font picker in the
      // settings panel, a container resize - shows up as a size change on the
      // grid itself. Re-fitting is idempotent, so settling ends the cascade.
      const screen = terminalRef.current?.getTerminal()?.element
        ?.querySelector('.xterm-screen') as HTMLElement | null;
      if (screen && typeof ResizeObserver !== 'undefined') {
        gridObserver.current?.disconnect();
        gridObserver.current = new ResizeObserver(() => refit());
        gridObserver.current.observe(screen);
      }
    });
  }, [refit]);

  const handleKey = useCallback((data: string) => {
    terminalRef.current?.injectInput(data);
    terminalRef.current?.focus();
  }, []);

  const handleGamePress = useCallback((key: string, code: string) => {
    terminalRef.current?.pressGameKey(key, code);
  }, []);

  const handleGameRelease = useCallback((key: string, code: string) => {
    terminalRef.current?.releaseGameKey(key, code);
  }, []);

  /**
   * Where the trackpad last put the paddle, so the Launch button clicks there
   * instead of teleporting the paddle back to the middle.
   */
  const spinnerColumn = useRef<number | null>(null);

  /** Live column count - a door may have taken the terminal off 80 columns. */
  const terminalColumns = useCallback(
    (): number => terminalRef.current?.getTerminal()?.cols ?? BBS_COLS,
    [],
  );

  /**
   * Trackpad stroke -> the terminal's own mouse path. Mirrors the desktop
   * mouse exactly: press emits mouse-click (which both places the paddle and
   * launches a waiting ball), movement emits mouse-drag, release emits
   * mouse-up. The door treats all three the same for paddle position.
   */
  /** Where on the strip the thumb was when it last moved the paddle. */
  const spinnerFraction = useRef<number>(0.5);

  const handleSpinner = useCallback((phase: TrackpadPhase, fraction: number) => {
    const y = spinnerRow.current;
    if (y === null) return;

    const cols = terminalColumns();

    // Relative and geared, like a spinner. Planting the thumb does NOT move
    // the paddle - it only marks where the stroke starts - so the paddle
    // never teleports, and a short sweep crosses the board (the absolute
    // mapping needed a full-width sweep, which is a long reach on a phone).
    if (phase === 'start') {
      spinnerFraction.current = fraction;
      if (spinnerColumn.current === null) {
        spinnerColumn.current = trackpadColumn(0.5, cols);
      }
    } else {
      spinnerColumn.current = trackpadStep(
        spinnerColumn.current ?? trackpadColumn(0.5, cols),
        spinnerFraction.current,
        fraction,
        cols,
      );
      spinnerFraction.current = fraction;
    }

    const x = spinnerColumn.current ?? trackpadColumn(0.5, cols);
    const type: TerminalMouseEventType =
      phase === 'start' ? 'mouse-click' : phase === 'move' ? 'mouse-drag' : 'mouse-up';
    terminalRef.current?.sendMouse(type, { x, y });
  }, [terminalColumns]);

  const handleLaunch = useCallback(() => {
    const y = spinnerRow.current;
    if (y === null) return;
    const x = spinnerColumn.current ?? trackpadColumn(0.5, terminalColumns());
    terminalRef.current?.sendMouse('mouse-click', { x, y });
  }, [terminalColumns]);

  /**
   * Which control scheme a pad-style game uses. Gestures are opt-in and
   * remembered: the pad stays the default because it is discoverable, and a
   * player who prefers the thumb-only scheme should not have to re-choose it
   * every session.
   */
  const [touchScheme, setTouchScheme] = useState<TouchScheme>(
    () => readTouchScheme(window.localStorage),
  );

  /**
   * Whether the running door is showing a menu or a playfield. Only the door
   * knows, so it says so: client doors run in this same page and dispatch
   * `bbs:input-mode` (see sdk/client/input-mode.ts). Without it a tap cannot
   * mean "rotate" in play and "Enter" on a menu, and a phone player cannot
   * get past a door's title screen.
   */
  const [inputMode, setInputMode] = useState<'game' | 'menu'>('game');

  useEffect(() => {
    const onMode = (event: Event) => {
      const mode = (event as CustomEvent).detail;
      if (mode === 'menu' || mode === 'game') setInputMode(mode);
    };
    window.addEventListener('bbs:input-mode', onMode);
    return () => window.removeEventListener('bbs:input-mode', onMode);
  }, []);

  // A door that never declares a mode gets the game scheme, and every door
  // starts fresh rather than inheriting the last one's menu state.
  useEffect(() => { setInputMode('game'); }, [activeDoorId]);

  const chooseScheme = useCallback((scheme: TouchScheme) => {
    writeTouchScheme(window.localStorage, scheme);
    setTouchScheme(scheme);
  }, []);

  /** A gesture fires as a press immediately followed by a release. */
  const handleGestureKey = useCallback((key: string, code: string) => {
    handleGamePress(key, code);
    handleGameRelease(key, code);
  }, [handleGamePress, handleGameRelease]);

  const showOnscreenInput = isMobile;

  return (
    <div className={`terminal-page${showOnscreenInput ? ' terminal-page--with-input' : ''}`}>
      <BBSTerminal
        ref={terminalRef}
        fontSize={fontSize}
        keepFocused
        fillParent
        onConnect={handleConnect}
        onDoorChange={setActiveDoorId}
      />
      {showOnscreenInput && (
        gameControls === null
          ? <MobileBBSKeyboard onKey={handleKey} />
          : gameControls.kind === 'spinner'
            ? (
              <MobileArkanoidControls
                layout={gameControls}
                menuMode={inputMode === 'menu'}
                onMenuKey={handleGestureKey}
                onSpinner={handleSpinner}
                onLaunch={handleLaunch}
                onPress={handleGamePress}
                onRelease={handleGameRelease}
              />
            )
            : touchScheme === 'gestures'
              ? (
                <MobileGameGestures
                  title={gameControls.title}
                  mode={inputMode}
                  onKey={handleGestureKey}
                  onUseButtons={() => chooseScheme('buttons')}
                />
              )
              : (
                <MobileGameControls
                  layout={gameControls}
                  onPress={handleGamePress}
                  onRelease={handleGameRelease}
                  onUseGestures={() => chooseScheme('gestures')}
                />
              )
      )}
    </div>
  );
}
