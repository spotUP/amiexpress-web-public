import { useRef, useState, useEffect, useCallback, type CSSProperties } from 'react';
import { BBSTerminal, type BBSTerminalRef, type TerminalMouseEventType } from '@amiexpress/terminal';
import { MobileBBSKeyboard } from '../components/mobile/MobileBBSKeyboard';
import { visibleHeight, visibleTop } from '../components/mobile/terminal-fit';
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
import {
  FIT_TO_WINDOW,
  TERMINAL_BEZEL_PX,
  isFollowingWindow,
  zoomedFontSize,
} from '@amiexpress/terminal';
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

/**
 * Shortest gap between paddle positions sent to the door, in ms.
 *
 * The door renders at 20fps, so more than about thirty updates a second is
 * work nobody can see - and every extra one is a message the paddle has to
 * catch up through.
 */
const SPINNER_SEND_MS = 30;

export function TerminalPage(): JSX.Element {
  const terminalRef = useRef<BBSTerminalRef>(null);
  const [isMobile, setIsMobile] = useState<boolean>(isPortraitMobile);
  /**
   * Which surface the terminal renders on. A PETSCII ('P') session draws on
   * a <canvas> and xterm's textarea is display:none - and a focused canvas
   * cannot raise a mobile soft keyboard - so the on-screen keyboard is the
   * only way to type on one, landscape included.
   */
  const [surface, setSurface] = useState<'xterm' | 'canvas'>('xterm');
  /**
   * Desktop, non-touch, at the standard 80x25 grid: the one case that gets
   * letterboxed against the lighter page ground instead of filling the
   * viewport. Handheld devices scale their font to fill the screen (see
   * refit()) and a door's wide/fullscreen mode breaks out of this layout
   * entirely (BBSTerminal switches to position: absolute) - both must keep
   * filling the viewport, so this flag stays false for them.
   */
  const [isHandheldMode, setIsHandheldMode] = useState<boolean>(isHandheld);
  /**
   * The FIT: the largest cell size at which the whole 80x25 grid plus its
   * bezel still fits the space the page can give it. This is the default the
   * board runs at - "it makes more sense if it follows the browser window"
   * (sysop, 2026-09-03) - and it is recomputed by refit() on every viewport
   * change, on both a desktop and a handheld, through the ONE fit function.
   * The initial value is only a seed for the first search.
   */
  const [fitSize, setFitSize] = useState<number>(() =>
    isHandheld() ? seedFontSize(window.innerWidth) : DESKTOP_FONT_SIZE
  );
  const fitSizeRef = useRef(fitSize);
  fitSizeRef.current = fitSize;
  /**
   * The viewer's override, as a fraction of the fit (1 = follow the window).
   * BBSTerminal owns the gestures and reports the fraction here; the page
   * does the one multiply, so there is a single producer of a cell size.
   */
  const [zoomFraction, setZoomFraction] = useState<number>(FIT_TO_WINDOW);
  const zoomFractionRef = useRef(zoomFraction);
  zoomFractionRef.current = zoomFraction;
  /**
   * Which mode the terminal is in. A wide/fullscreen door owns its own
   * geometry and its column count comes from the cell size, so it keeps the
   * size it always had rather than inheriting the fit.
   */
  const [terminalMode, setTerminalMode] = useState<'fixed' | 'wide'>('fixed');
  /**
   * The bezel, in px, with the fit's leftover absorbed into it.
   *
   * xterm rounds each cell down to a whole DEVICE pixel, so even the largest
   * fitting size leaves a few px of slack against the window - which read as
   * "it has padding now" (sysop, 2026-09-03). Splitting that slack between
   * the two sides of the bezel makes the BOX exactly the size of the space it
   * was fitted into on the constraining axis: flush, with a slightly thicker
   * black frame instead of a grey gap. Only while the viewer is following the
   * window; a deliberately scaled-down screen is meant to have room around it.
   */
  const [bezelPx, setBezelPx] = useState<number>(TERMINAL_BEZEL_PX);
  const [activeDoorId, setActiveDoorId] = useState<string | null>(null);

  /** The one produced cell size: the fit, scaled by the viewer's fraction. */
  const fontSize = !isHandheldMode && terminalMode === 'wide'
    ? DESKTOP_FONT_SIZE
    : zoomedFontSize(fitSize, zoomFraction);
  /** The page's own box - the honest content area the fit measures against. */
  const pageRef = useRef<HTMLDivElement>(null);
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

    // A door that took the terminal out of the standard 80-column grid (wide
    // mode, or a server-driven resize) owns its own sizing — leave it alone.
    if (term.cols !== BBS_COLS) return;

    const screen = element.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screen) return;

    const measure = (candidate: number) => {
      term.options.fontSize = candidate;
      return { width: screen.offsetWidth, height: screen.offsetHeight };
    };

    let available: { width: number; height: number };
    if (isHandheld()) {
      // UNCHANGED handheld path. The host width already excludes the
      // safe-area padding the page applies, and the height is the VISIBLE
      // viewport, not the layout one: on iOS the layout viewport runs
      // underneath Safari's floating address bar, so sizing against it hid
      // the top rows behind the bar.
      const host = element.parentElement;
      if (!host) return;
      available = {
        width: host.clientWidth || window.innerWidth,
        // Minus the band the browser's own chrome sits over, where a
        // browser overlays rather than insets - see visibleTop.
        height: visibleHeight(window)
          - visibleTop(window)
          - (isMobileRef.current ? ONSCREEN_INPUT_HEIGHT : 0),
      };
    } else {
      // Desktop fit-to-window. The PAGE's content box, not the terminal's
      // own host: `.terminal-page__frame` is `width: fit-content`, so
      // measuring it would hand the fit its own previous output and the
      // screen could never grow. Minus exactly the bezel, which is the only
      // thing between the grid and the window edge - the page carries no
      // padding of its own on a desktop (env() safe-area insets are 0) and
      // the box has no width cap any more.
      const page = pageRef.current;
      if (!page) return;
      available = {
        width: page.clientWidth - 2 * TERMINAL_BEZEL_PX,
        height: page.clientHeight - 2 * TERMINAL_BEZEL_PX,
      };
    }

    const fitted = fitFontSize(fitSizeRef.current, available, measure);
    if (fitted !== fitSizeRef.current) {
      fitSizeRef.current = fitted;
      setFitSize(fitted);
    }

    // Leave the terminal at the size it will KEEP, not at the fit the search
    // ended on. Two reasons: the viewer's override may scale it down, and a
    // net size change here would wake the grid observer that called us and
    // start the search over.
    const effective = zoomedFontSize(fitted, zoomFractionRef.current);
    const grid = measure(effective);
    // A hidden xterm host (a web P session: display none) measures 0x0.
    // fitFontSize returned its seed unmeasured; the slack below must not read
    // "no grid" as "the whole window is free" - that put a 400px bezel around
    // no screen at all. Nothing to absorb, nothing to change.

    if (!(grid.width > 0) || !(grid.height > 0)) return;

    // Absorb the leftover into the bezel so the box reads flush (see bezelPx).
    const following = isFollowingWindow(zoomFractionRef.current) && !isHandheld();
    const slack = Math.min(available.width - grid.width, available.height - grid.height);
    const bezel = following && slack > 0
      ? TERMINAL_BEZEL_PX + slack / 2
      : TERMINAL_BEZEL_PX;
    setBezelPx((previous) => (Math.abs(previous - bezel) < 0.5 ? previous : bezel));
  }, []);

  useEffect(() => {
    const handleViewportChange = () => {
      setIsMobile(isPortraitMobile());
      setIsHandheldMode(isHandheld());
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

  // A new override changes the effective size and the leftover the bezel has
  // to absorb; the FIT itself is unchanged, so this settles in one pass.
  //
  // `terminalMode` is here for the way BACK from a door's wide/fullscreen
  // mode: refit() refuses to touch a terminal that is not on the 80-column
  // grid, so the fit that matters is the one taken the moment the door hands
  // the screen back. Without it the grid observer eventually notices and the
  // screen snaps a frame late.
  useEffect(() => { refit(); }, [zoomFraction, terminalMode, refit]);

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
  /**
   * The last column actually sent to the door, so a stream of touchmoves
   * that all land in the same column costs one message instead of sixty.
   */
  const lastSpinnerSent = useRef<number | null>(null);
  const spinnerPending = useRef<{ x: number; y: number } | null>(null);
  const spinnerSendTimer = useRef<number | null>(null);

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

    // Start and end go immediately: a tap must land, and a stroke must end
    // where the thumb left it.
    if (type !== 'mouse-drag') {
      if (spinnerSendTimer.current !== null) {
        clearTimeout(spinnerSendTimer.current);
        spinnerSendTimer.current = null;
      }
      lastSpinnerSent.current = type === 'mouse-up' ? null : x;
      terminalRef.current?.sendMouse(type, { x, y });
      return;
    }

    // A drag sends the NEWEST position, at most every SPINNER_SEND_MS.
    //
    // touchmove fires about sixty times a second and every one of those used
    // to become a socket message, a door render and a frame back. The door
    // only cares which COLUMN the paddle is in, and only the latest one -
    // every older position in the queue is a place the thumb has already
    // left. Sending them all is how the paddle ended up "half a screen or
    // more behind my finger": it was working through a backlog.
    //
    // Nothing is lost by dropping the intermediate ones. The column is
    // accumulated from the whole gesture before this point, so the newest
    // value already contains every delta.
    if (x === lastSpinnerSent.current) return;
    spinnerPending.current = { x, y };

    if (spinnerSendTimer.current !== null) return;

    const flush = () => {
      spinnerSendTimer.current = null;
      const pending = spinnerPending.current;
      if (!pending) return;
      spinnerPending.current = null;
      if (pending.x === lastSpinnerSent.current) return;
      lastSpinnerSent.current = pending.x;
      terminalRef.current?.sendMouse('mouse-drag', pending);
      // Keep the window open while the thumb is still moving, so the last
      // position of a sweep is not left sitting in the buffer.
      spinnerSendTimer.current = window.setTimeout(flush, SPINNER_SEND_MS);
    };
    flush();
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

  // Portrait mobile always gets it; a canvas session gets it in any
  // orientation, because there is no other keyboard to reach.
  const showOnscreenInput = isMobile || (isHandheld() && surface === 'canvas');

  // The page's frame is a SHRINK-WRAP: `terminal-page--framed` centres a
  // fit-content host (TerminalPage.css), which only has something to wrap when
  // the terminal's content has an intrinsic width - xterm's 80 columns do.
  //
  // A PETSCII session does not. Its canvas is sized FROM the box it is given
  // (PetsciiCanvas measures its container and picks a scale), so a fit-content
  // frame around it is a fixed point: measured in a 1280x800 page, the frame
  // wrapped the canvas's CURRENT 704x464 backing store into a 736x496 box and
  // the canvas could never grow into the 960x644 there was room for. A canvas
  // session is centred by BBSTerminal's own fixed-mode wrapper instead - the
  // same wrapper that carries the bezel - so both surfaces end up as the same
  // centred, bezelled screen on the page ground. (Until 2026-09-03 that
  // wrapper's centring was Tailwind classes this app does not ship, and the
  // PETSCII screen sat pinned in the top-left corner: "the petscii mode is not
  // centered like the normal term".)
  //
  // A handheld session stays unframed too: it needs the terminal sized to the
  // raw viewport for refit()'s measurements to stay stable - wrapping it here
  // would make the frame's own fit-content size depend on the very font size
  // refit() is trying to compute.
  const showFrame = !isHandheldMode && surface === 'xterm';
  const terminal = (
    <BBSTerminal
      ref={terminalRef}
      fontSize={fontSize}
      keepFocused
      fillParent
      onConnect={handleConnect}
      onDoorChange={setActiveDoorId}
      onSurfaceChange={setSurface}
      onTerminalModeChange={setTerminalMode}
      /*
       * The zoom gestures are a DESKTOP override on top of the fit. A
       * handheld is already fitted to its screen, has no pointer to put on a
       * bezel corner, and - if it were allowed to write the override - would
       * erase the fraction the same viewer chose at their desk.
       */
      zoomEnabled={!isHandheldMode}
      onZoomChange={setZoomFraction}
      /*
       * Desktop centres the terminal box inside the terminal's own wrapper -
       * that is what puts a canvas session on the page ground instead of in
       * the corner. A handheld session must NOT: the on-screen keyboard
       * reserves the bottom of the viewport (terminal-page--with-input) and
       * the terminal belongs at the top of what is left. Measured on a
       * 390x844 phone with the 260px strip reserved: centring drops the box
       * 166px (xterm) / 158px (canvas) into the middle of that area.
       */
      centerInHost={!isHandheldMode}
    />
  );

  return (
    <div
      ref={pageRef}
      className={`terminal-page${showOnscreenInput ? ' terminal-page--with-input' : ''}${showFrame ? ' terminal-page--framed' : ''}`}
      /*
       * The bezel token, with the fit's leftover absorbed into it, so the
       * terminal box ends flush against the window on the constraining axis.
       * Written here rather than inside the terminal because the fit - which
       * is what knows the leftover - lives here; BBSTerminal keeps reading the
       * same `var(--bbs-terminal-bezel)` it always did.
       */
      style={{ ['--bbs-terminal-bezel' as string]: `${bezelPx}px` } as CSSProperties}
    >
      {/* ONE host element for the life of the page. The frame is a class,
          never a structural wrapper: moving BBSTerminal between parents
          remounts it, and its mount effect owns the socket - the P answer
          (surface -> canvas) took the whole board down that way. */}
      <div className={`terminal-page__host${showFrame ? ' terminal-page__frame' : ''}`}>
        {terminal}
      </div>
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
