import { useCallback, useEffect, useRef } from 'react';
import type { GameControlSpinner } from './game-controls';
import { beginStroke, menuGesture } from './gesture-scheme';
import { useHeldButtons } from './use-held-buttons';
import './MobileArkanoidControls.css';

/** Phase of a thumb stroke across the strip. */
export type TrackpadPhase = 'start' | 'move' | 'end';

interface MobileArkanoidControlsProps {
  layout: GameControlSpinner;
  /**
   * Thumb position across the strip: 0 at the left edge, 1 at the right.
   * Absolute, not a delta - the paddle goes where the thumb is.
   */
  onSpinner: (phase: TrackpadPhase, fraction: number) => void;
  /** Launch button: sends the door a click, which launches a waiting ball. */
  onLaunch: () => void;
  /** Press: must emit a game-mode key-down. */
  onPress: (key: string, code: string) => void;
  /** Release: must emit the matching key-up. */
  onRelease: (key: string, code: string) => void;
  /**
   * True while the door is showing a menu. A spinner cannot work a menu -
   * there are no arrow keys on this pad at all - so the strip becomes a
   * swipe/tap surface until play resumes.
   */
  menuMode?: boolean;
  /** Fires a menu key as a press and release. */
  onMenuKey?: (key: string, code: string) => void;
}

const ACTIVE_CLASS = 'mobile-arkanoid-controls__button--active';

/**
 * The Launch button is not in the layout's key table because it does not send
 * a key at all - it sends a mouse click, exactly as clicking the playfield
 * does on the desktop (Doors/arkanoid/client.ts launches a waiting ball on
 * `mouse-click`).
 */
interface ArkanoidButton {
  id: string;
  label: string;
  ariaLabel?: string;
  key?: string;
  code?: string;
}

const LAUNCH_BUTTON: ArkanoidButton = { id: 'launch', label: 'Launch' };

/**
 * ARKANOID's on-screen controls: a TRACKPAD, not a button pad.
 *
 * Arkanoid is a spinner game. The door sets `paddle.x = mouseX - width/2` on
 * every pointer event, so the paddle follows the pointer's X absolutely; its
 * arrow keys only nudge it one step per press, which loses the feel the whole
 * game is built around. So the strip below maps the thumb's X across its own
 * width onto the terminal's columns and reports it as a fraction - the host
 * turns that into a column and drives the SAME socket path the desktop mouse
 * uses (BBSTerminalRef.sendMouse).
 */
export function MobileArkanoidControls({
  layout,
  onSpinner,
  onLaunch,
  onPress,
  onRelease,
  menuMode = false,
  onMenuKey,
}: MobileArkanoidControlsProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  /**
   * The WHOLE screen steers the paddle, not just the strip at the bottom.
   *
   * The strip was a 260px bar, which is a small target for a game about
   * sweeping the paddle across the board - "it's better to let touch
   * controls work on the entire screen instead of the small area we have
   * now". This surface covers everything above the button bar; the strip
   * stays as the visible hint, and both report the same thing.
   */
  const surfaceRef = useRef<HTMLDivElement>(null);
  const menuSurfaceRef = useRef<HTMLDivElement>(null);

  const buttons: ArkanoidButton[] = [LAUNCH_BUTTON, ...layout.keys];
  const buttonsRef = useRef<ArkanoidButton[]>(buttons);
  buttonsRef.current = buttons;

  const onSpinnerRef = useRef(onSpinner);
  onSpinnerRef.current = onSpinner;

  const resolve = useCallback((target: EventTarget | null): ArkanoidButton | null => {
    const button = (target as HTMLElement | null)?.closest?.<HTMLButtonElement>('button[data-control-id]');
    if (!button) return null;
    return buttonsRef.current.find(b => b.id === button.dataset.controlId) ?? null;
  }, []);

  const handlePress = useCallback((control: ArkanoidButton) => {
    if (control.key !== undefined && control.code !== undefined) {
      onPress(control.key, control.code);
      return;
    }
    if (control.id === LAUNCH_BUTTON.id) onLaunch();
  }, [onPress, onLaunch]);

  const handleRelease = useCallback((control: ArkanoidButton) => {
    // Launch has no key-up: the click already happened on press.
    if (control.key !== undefined && control.code !== undefined) onRelease(control.key, control.code);
  }, [onRelease]);

  useHeldButtons(containerRef, {
    resolve,
    onPress: handlePress,
    onRelease: handleRelease,
    activeClass: ACTIVE_CLASS,
  });

  useEffect(() => {
    // The full-screen surface when it is up, the strip otherwise - the
    // mapping is the element's own width either way.
    // BOTH surfaces steer: the full-screen layer and the visible strip.
    // Binding only the big one would leave the strip - the thing that says
    // "slide here" - doing nothing at all.
    const surfaces = [surfaceRef.current, stripRef.current].filter(
      (el): el is HTMLDivElement => el !== null
    );
    if (surfaces.length === 0) return;

    // Each surface maps the thumb across ITS OWN width, which is what makes
    // a sweep of the strip and a sweep of the screen mean the same thing.
    const strip = surfaces[0];

    // Which finger owns the strip. A second finger (reaching for Launch)
    // must not hijack the paddle mid-stroke.
    let activeTouch: number | null = null;
    let mouseDragging = false;

    /**
     * The strip's own geometry is the mapping - it sits outside the terminal
     * element, so the terminal's own point-to-cell helper cannot be used here.
     */
    const fractionFor = (clientX: number, target?: EventTarget | null): number => {
      // Measure the surface the finger is actually on. Both span the full
      // width so in practice they agree, but the element under the touch is
      // the honest answer - and it is the only one with a size in a test.
      const on = surfaces.find(el => el === target || (target instanceof Node && el.contains(target)));
      const rect = (on ?? strip).getBoundingClientRect();
      if (!rect.width) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    const touchById = (list: TouchList, id: number): Touch | null =>
      Array.from(list).find(t => t.identifier === id) ?? null;

    // Non-passive so preventDefault() can block scrolling and double-tap zoom
    // while the thumb sweeps the strip.
    const handleTouchStart = (e: TouchEvent) => {
      if (activeTouch !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      e.preventDefault();
      activeTouch = touch.identifier;
      onSpinnerRef.current('start', fractionFor(touch.clientX, e.target));
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (activeTouch === null) return;
      const touch = touchById(e.changedTouches, activeTouch);
      if (!touch) return;
      e.preventDefault();
      onSpinnerRef.current('move', fractionFor(touch.clientX, e.target));
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (activeTouch === null) return;
      const touch = touchById(e.changedTouches, activeTouch);
      if (!touch) return;
      e.preventDefault();
      activeTouch = null;
      onSpinnerRef.current('end', fractionFor(touch.clientX, e.target));
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      mouseDragging = true;
      onSpinnerRef.current('start', fractionFor(e.clientX, e.target));
    };

    // On window: a stroke that leaves the strip must keep steering, and must
    // still end when the button comes up somewhere else.
    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseDragging) return;
      onSpinnerRef.current('move', fractionFor(e.clientX, e.target));
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!mouseDragging) return;
      mouseDragging = false;
      onSpinnerRef.current('end', fractionFor(e.clientX, e.target));
    };

    for (const el of surfaces) {
      el.addEventListener('touchstart', handleTouchStart, { passive: false });
      el.addEventListener('touchmove', handleTouchMove, { passive: false });
      el.addEventListener('touchend', handleTouchEnd, { passive: false });
      el.addEventListener('touchcancel', handleTouchEnd, { passive: false });
      el.addEventListener('mousedown', handleMouseDown);
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      for (const el of surfaces) {
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('touchend', handleTouchEnd);
        el.removeEventListener('touchcancel', handleTouchEnd);
        el.removeEventListener('mousedown', handleMouseDown);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const el = menuSurfaceRef.current;
    if (!menuMode || !el || !onMenuKey) return;

    let stroke: ReturnType<typeof beginStroke> | null = null;

    const start = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch) return;
      event.preventDefault();
      stroke = beginStroke({ x: touch.clientX, y: touch.clientY, t: event.timeStamp });
    };

    const end = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch || !stroke) return;
      event.preventDefault();
      const key = menuGesture(stroke, { x: touch.clientX, y: touch.clientY, t: event.timeStamp });
      if (key) onMenuKey(key.key, key.code);
      stroke = null;
    };

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [menuMode, onMenuKey]);

  return (
    <>
      {/* Everything above the buttons steers the paddle. Transparent, and
          under the button bar in z-order so Launch still wins a tap. */}
      {!menuMode && (
        <div
          className="mobile-arkanoid-controls__surface"
          ref={surfaceRef}
          // No role and hidden from assistive tech: the labelled Paddle
          // control is the visible strip. This layer is the same control
          // with a bigger target, and announcing a second "Paddle" slider
          // would be a lie to a screen reader.
          aria-hidden="true"
        />
      )}
    <div className="mobile-arkanoid-controls" ref={containerRef}>
      <div className="mobile-arkanoid-controls__title">{layout.title}</div>
      {menuMode ? (
        <div
          className="mobile-arkanoid-controls__strip"
          ref={menuSurfaceRef}
          role="application"
          aria-label="Menu"
        >
          <span className="mobile-arkanoid-controls__hint">Swipe to move, tap to choose</span>
        </div>
      ) : (
        <div
          className="mobile-arkanoid-controls__strip"
          ref={stripRef}
          role="slider"
          aria-label="Paddle"
          aria-orientation="horizontal"
        >
          <span className="mobile-arkanoid-controls__hint">Slide anywhere to move the paddle</span>
        </div>
      )}
      <div className="mobile-arkanoid-controls__buttons">
        {buttons.map(control => (
          <button
            key={control.id}
            type="button"
            className="mobile-arkanoid-controls__button"
            data-control-id={control.id}
            aria-label={control.ariaLabel ?? control.label}
          >
            {control.label}
          </button>
        ))}
      </div>
    </div>
    </>
  );
}
