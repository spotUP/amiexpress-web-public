import { useRef, useState, useEffect, useCallback, type CSSProperties } from 'react';
import { BBSTerminal, type BBSTerminalRef, type TerminalMouseEventType } from '@amiexpress/terminal';
import { MobileBBSKeyboard } from '../components/mobile/MobileBBSKeyboard';
import {
  visibleHeight,
  visibleTop,
  handheldHeight,
  keptFontSize,
  gridSizeFor,
  DEFAULT_LINE_HEIGHT_RATIO,
} from '../components/mobile/terminal-fit';
import { refusePageZoom } from '../components/mobile/page-zoom';
import { MobileGameControls } from '../components/mobile/MobileGameControls';
import { MobileGameGestures } from '../components/mobile/MobileGameGestures';
import {
  readTouchScheme,
  writeTouchScheme,
  type TouchScheme,
} from '../components/mobile/gesture-scheme';
import { MobileArkanoidControls, type TrackpadPhase } from '../components/mobile/MobileArkanoidControls';
import { findGameControlLayout, trackpadColumn, trackpadStep } from '../components/mobile/game-controls';
import { fitFontSize, TELETEXT_FIT_LIMITS } from '../components/mobile/terminal-fit';
import { seamlessSize, seamlessTeletextSize, advanceRatioFor } from '@amiexpress/terminal';
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
/** ...and its rows, the other half of the board's grid. */
const BBS_ROWS = 25;
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
   * REMOVED (sysop, 2026-09-12): the viewer zoom override - the fraction is
   * always fit-to-window and the browser window alone decides the size.
   * Kept as a constant because the fit pipeline below reads it.
   */
  const zoomFraction = FIT_TO_WINDOW;
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
   * black frame instead of a grey gap. The viewer always follows the window
   * now (sysop, 2026-09-12 - the zoom override is gone), so the flush case
   * is the only case.
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

    /*
     * A teletext session is FITTED, not doubled.
     *
     * It used to own its cell: the mode set the calibrated size x2 and this
     * refused to touch it, because probing wrote the 80-column size straight
     * back and the mode un-applied itself (2026-09-10). Doubling only works
     * if the teletext face has the board face's advance ratio, and TDAText
     * does not - 40 of its columns at 2x are WIDER than 80 of the board's at
     * 1x, so the right of every row sat outside the window and the box grew
     * a horizontal scrollbar (sysop, 2026-09-13: "not scaled properly ...
     * some content is outside the visible area").
     *
     * So it is measured like every other grid. What the 2026-09-10 note was
     * really about is the CALIBRATION, and that is preserved below: a
     * teletext fit leaves fitSize alone, so the 80-column size the rest of
     * the app reads is still the 80-column size.
     */
    const teletext = terminalRef.current?.isTexttvMode?.() === true;

    // A door that took the terminal out of the standard 80-column grid (wide
    // mode, or a server-driven resize) owns its own sizing — leave it alone.
    // A teletext session's 40x25 is the BOARD's grid, not a door's.
    if (!teletext && term.cols !== BBS_COLS) return;

    const screen = element.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screen) return;

    /*
     * COMPUTED, NOT MEASURED - and it applies the size as it goes, because the
     * search leaves the terminal at the size it returns.
     *
     * Reading `.xterm-screen` back after setting a font size is what made this
     * fit unreliable: the DOM renderer relays its rows asynchronously, so the
     * read answered for the PREVIOUS candidate and the search converged
     * somewhere different every run - 358px, 338px, 298px of a 390px screen on
     * the same phone, reported three times as "not full width". gridSizeFor
     * has the model instead: a fixed advance per column, a whole-pixel row.
     */
    const family = String(term.options.fontFamily ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    const cols = term.cols || BBS_COLS;
    const rows = term.rows || BBS_ROWS;

    /*
     * The cell, from what the terminal already knows - not from reading the
     * DOM back after every probe, which is what made this fit unreliable.
     * See gridSizeFor.
     */
    const ratios = {
      width: advanceRatioFor(family),
      height: Number(term.options.lineHeight) || DEFAULT_LINE_HEIGHT_RATIO,
    };
    const measure = (candidate: number) => {
      term.options.fontSize = candidate;
      return gridSizeFor(candidate, cols, rows, ratios);
    };

    let available: { width: number; height: number };
    if (isHandheld()) {
      // UNCHANGED handheld path. The host width already excludes the
      // safe-area padding the page applies, and the height is the VISIBLE
      // viewport, not the layout one: on iOS the layout viewport runs
      // underneath Safari's floating address bar, so sizing against it hid
      // the top rows behind the bar.
      /*
       * THE PAGE'S OWN BAND, never the terminal's parent.
       *
       * `element.parentElement` is the terminal's BOX, and that box is sized
       * by the grid inside it - so measuring it hands the fit its own previous
       * output and the grid can never grow. That is why the same phone kept
       * settling at whatever it had last time: 358, 338, 298.
       *
       * `.terminal-page__host` is the row the page's flex column gives the
       * terminal, and the page is sized from the visible viewport, so this is
       * the band and nothing else. The fallbacks are for the game pads, which
       * are fixed overlays and leave the host at `display: contents` with no
       * box at all.
       */
      const page = pageRef.current;
      const band = page?.querySelector('.terminal-page__host') as HTMLElement | null;
      available = {
        width: band?.clientWidth || page?.clientWidth || window.innerWidth,
        height: band?.clientHeight
          // Minus the band the browser's own chrome sits over, where a
          // browser overlays rather than insets - see handheldHeight.
          || handheldHeight(window, isMobileRef.current ? ONSCREEN_INPUT_HEIGHT : 0),
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

    if (teletext) {
      /*
       * Half the columns, so the cell may be nearly twice as tall as the
       * 80-column cap allows; the seed is the doubled size the mode applies
       * as its first guess, and the search does the rest.
       *
       * fitSize is deliberately NOT written: it is the 80-column
       * calibration, and the terminal's own size is what the fit leaves
       * behind (fitFontSize measures the winner last).
       */
      const seed = zoomedFontSize(fitSizeRef.current, zoomFractionRef.current) * 2;
      const fitted = fitFontSize(seed, available, measure, TELETEXT_FIT_LIMITS);
      const size = seamlessTeletextSize(fitted);
      const box = measure(size);
      if (!(box.width > 0) || !(box.height > 0)) return;
      const teletextSlack = Math.min(available.width - box.width, available.height - box.height);
      const teletextBezel = !isHandheld() && teletextSlack > 0
        ? TERMINAL_BEZEL_PX + teletextSlack / 2
        : TERMINAL_BEZEL_PX;
      setBezelPx((previous) => (Math.abs(previous - teletextBezel) < 0.5 ? previous : teletextBezel));
      return;
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
    //
    // And on a whole CELL. The DOM renderer rounds per span, and every glyph
    // that fills its cell edge to edge - an underscore, any Amiga ASCII
    // stroke drawn to meet its neighbour - shows a one-pixel gap wherever a
    // fractional cell lands: "det ar liksom inte tillrackligt med plats, dom
    // overlappar" (an artist, via the sysop, 2026-09-14). seamlessSize is
    // the one owner of that rule; the face's advance decides the step.
    /*
     * THE SEAM SNAP IS A DESKTOP RULE, and on a phone it costs the screen.
     *
     * Flooring the cell to a whole CSS pixel throws away up to one pixel per
     * column. On a desktop that is nothing - the cell is 12 or 15 pixels wide
     * and the loss is a bezel's worth. On a 390px phone the cell is 4.47px, it
     * snaps to 4, and eighty columns lose 38px: about a tenth of the screen,
     * as a black margin down each side. The sysop, 2026-09-14: "it doesnt zoom
     * to the full width of my phone screen anymore".
     *
     * The seam it prevents is a one-pixel gap between glyphs that meet edge to
     * edge, reported by an artist looking closely at art on a desktop. That is
     * the case worth a tenth of a screen; a phone is not, and at three device
     * pixels per CSS pixel the seam is a third of what it costs to avoid.
     */
    const zoomed = zoomedFontSize(fitted, zoomFractionRef.current);
    const effective = keptFontSize(zoomed, family, isHandheld(), seamlessSize);
    const grid = measure(effective);
    // A hidden xterm host (a web P session: display none) measures 0x0.
    // fitFontSize returned its seed unmeasured; the slack below must not read
    // "no grid" as "the whole window is free" - that put a 400px bezel around
    // no screen at all. Nothing to absorb, nothing to change.

    if (!(grid.width > 0) || !(grid.height > 0)) return;

    // Absorb the leftover into the bezel so the box reads flush (see bezelPx).
    const following = isFollowingWindow(zoomFractionRef.current) && !isHandheld();
    const slack = Math.min(available.width - grid.width, available.height - grid.height);
    /*
     * NO BEZEL ON A PHONE. Sixteen pixels a side is a frame on a desktop and
     * eight per cent of the screen on a 390px handheld - and the grid is the
     * one thing a caller came for. The rounded corners it carries are a
     * desktop flourish; a phone has the browser's own frame around it already.
     */
    const bezel = isHandheld()
      ? 0
      : following && slack > 0
        ? TERMINAL_BEZEL_PX + slack / 2
        : TERMINAL_BEZEL_PX;
    setBezelPx((previous) => (Math.abs(previous - bezel) < 0.5 ? previous : bezel));
  }, []);

  /*
   * How far down the screen the visible area begins, when the browser OVERLAYS
   * its chrome instead of insetting it.
   *
   * `visibleTop` already told the FIT to stop counting that band as usable
   * height, and nothing moved the content out of it - so the rows were sized
   * to fit and then drawn underneath the bar anyway. This is the other half:
   * the page starts below it.
   *
   * Zero on every browser that insets its chrome, which is all of them on a
   * desktop, so it cannot move a session that already sits right.
   */
  const [viewportTop, setViewportTop] = useState<number>(() => visibleTop(window));

  /*
   * THE HEIGHT OF WHAT THE CALLER CAN ACTUALLY SEE.
   *
   * `100svh` in the stylesheet is the CSS floor and it is honest about
   * retractable chrome, but it is not honest about chrome that OVERLAYS - iOS
   * draws its floating toolbar on top of the small viewport, and the bottom of
   * a page sized to svh goes under it. The visual viewport is measured, not
   * assumed: `window.visualViewport.height` is the band that is genuinely
   * visible, whatever the browser is doing with its bars.
   *
   * Applied to the page's own box, so the flex column below - terminal, then
   * keyboard - divides the visible band rather than a taller one. Every
   * mismatch in this layout has come from a box that was taller than the
   * screen; this is the one place that decides.
   */
  const [viewportHeight, setViewportHeight] = useState<number>(() => visibleHeight(window));

  useEffect(() => {
    const handleViewportChange = () => {
      setIsMobile(isPortraitMobile());
      setIsHandheldMode(isHandheld());
      setViewportTop(visibleTop(window));
      setViewportHeight(visibleHeight(window));
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

  // Teletext starts and ends with a new grid AND a new face: the terminal
  // says when, the fit says how big (see the teletext branch in refit). Two
  // frames' grace so the face's metrics have reached xterm's measurement.
  useEffect(() => {
    const onTexttv = () => {
      refit();
      requestAnimationFrame(() => refit());
    };
    window.addEventListener('bbs:texttv-mode', onTexttv);
    return () => window.removeEventListener('bbs:texttv-mode', onTexttv);
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

  // The page does not zoom; the terminal does. See page-zoom.ts.
  useEffect(() => refusePageZoom(document), []);

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
       * REMOVED (sysop, 2026-09-12): zoomEnabled + onZoomChange (viewer zoom
       * override). The browser window alone decides the size now.
       */
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
      /*
       * Two ways to make room for the on-screen input, because they are two
       * different things. A game PAD is fixed to the viewport and overlays the
       * screen, so the page reserves its band as padding. The BBS KEYBOARD is
       * a row of this page: a fixed element anchors to iOS's layout viewport
       * while the page is sized from the small one, and the two disagreed by
       * exactly the height of Safari's bars - the strip landed over the last
       * rows of the grid.
       */
      className={[
        'terminal-page',
        showOnscreenInput && gameControls !== null ? 'terminal-page--with-input' : '',
        showOnscreenInput && gameControls === null ? 'terminal-page--with-keyboard' : '',
        showFrame ? 'terminal-page--framed' : '',
      ].filter(Boolean).join(' ')}
      /*
       * The bezel token, with the fit's leftover absorbed into it, so the
       * terminal box ends flush against the window on the constraining axis.
       * Written here rather than inside the terminal because the fit - which
       * is what knows the leftover - lives here; BBSTerminal keeps reading the
       * same `var(--bbs-terminal-bezel)` it always did.
       */
      style={{
        ['--bbs-terminal-bezel' as string]: `${bezelPx}px`,
        /*
         * The band the browser's own bar covers, ON TOP of the notch inset
         * the stylesheet applies. `calc` rather than a replacement: a phone
         * has both, and they are different bands.
         */
        ...(viewportTop > 0
          ? { paddingTop: `calc(env(safe-area-inset-top) + ${viewportTop}px)` }
          : {}),
        // The visible band, measured. See viewportHeight.
        ...(viewportHeight > 0 ? { height: `${viewportHeight}px` } : {}),
      } as CSSProperties}
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
