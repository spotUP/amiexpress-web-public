import { useRef, useEffect, useCallback } from 'react';
import { layoutControls, type GameControlDef, type GameControlLayout } from './game-controls';
import './MobileGameControls.css';

interface MobileGameControlsProps {
  layout: GameControlLayout;
  /** Press: must emit a game-mode key-down. */
  onPress: (key: string, code: string) => void;
  /** Release: must emit the matching key-up. */
  onRelease: (key: string, code: string) => void;
}

const ACTIVE_CLASS = 'mobile-game-controls__key--active';

/**
 * Game-specific on-screen pad, shown instead of the generic BBS keyboard while
 * a door with a known layout is running.
 *
 * Press and release are separate events on purpose: the doors read held-key
 * state (GRANDMASTER's DAS/ARR, ARKANOID's paddle), so a tap-only control
 * would make the pad play worse than a keyboard. Touches are tracked per
 * Touch.identifier so two thumbs can hold two controls at once - holding Left
 * while tapping Rotate is normal play.
 */
export function MobileGameControls({ layout, onPress, onRelease }: MobileGameControlsProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;
  const controlsRef = useRef<GameControlDef[]>(layoutControls(layout));
  controlsRef.current = layoutControls(layout);

  const controlFor = useCallback((target: EventTarget | null): GameControlDef | null => {
    const button = (target as HTMLElement | null)?.closest?.<HTMLButtonElement>('button[data-control-id]');
    if (!button) return null;
    return controlsRef.current.find(c => c.id === button.dataset.controlId) ?? null;
  }, []);

  const buttonFor = useCallback((id: string): HTMLButtonElement | null =>
    containerRef.current?.querySelector<HTMLButtonElement>(`button[data-control-id="${id}"]`) ?? null,
  []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // identifier -> control. Mouse uses a reserved identifier so the same
    // press/release bookkeeping covers both input kinds.
    const MOUSE_POINTER = -1;
    const held = new Map<number, GameControlDef>();

    const press = (pointer: number, control: GameControlDef) => {
      if (held.has(pointer)) return;
      held.set(pointer, control);
      buttonFor(control.id)?.classList.add(ACTIVE_CLASS);
      onPressRef.current(control.key, control.code);
    };

    const release = (pointer: number) => {
      const control = held.get(pointer);
      if (!control) return;
      held.delete(pointer);
      // Another finger may still be holding the same control.
      const stillHeld = Array.from(held.values()).some(c => c.id === control.id);
      if (!stillHeld) {
        buttonFor(control.id)?.classList.remove(ACTIVE_CLASS);
        onReleaseRef.current(control.key, control.code);
      }
    };

    // Non-passive so preventDefault() can block scrolling, double-tap zoom and
    // the focus steal that would pull the caret out of the terminal.
    const handleTouchStart = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        const control = controlFor(touch.target);
        if (!control) continue;
        e.preventDefault();
        press(touch.identifier, control);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (!held.has(touch.identifier)) continue;
        e.preventDefault();
        release(touch.identifier);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const control = controlFor(e.target);
      if (!control) return;
      e.preventDefault();
      press(MOUSE_POINTER, control);
    };

    // On window: a drag that ends outside the button must still release.
    const handleMouseUp = () => release(MOUSE_POINTER);

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: false });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    el.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      el.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      // The door may be exiting with a control still down - never leave a
      // key-down without its key-up, or the door keeps moving forever.
      for (const pointer of Array.from(held.keys())) release(pointer);
    };
  }, [controlFor, buttonFor]);

  const renderKey = (control: GameControlDef) => (
    <button
      key={control.id}
      type="button"
      className="mobile-game-controls__key"
      data-control-id={control.id}
      aria-label={control.ariaLabel ?? control.label}
    >
      {control.label}
    </button>
  );

  return (
    <div className="mobile-game-controls" ref={containerRef}>
      <div className="mobile-game-controls__title">{layout.title}</div>
      <div className="mobile-game-controls__pads">
        <div className="mobile-game-controls__cluster mobile-game-controls__cluster--movement">
          {layout.movement.map(renderKey)}
        </div>
        <div className="mobile-game-controls__cluster mobile-game-controls__cluster--actions">
          {layout.actions.map(renderKey)}
        </div>
      </div>
    </div>
  );
}
