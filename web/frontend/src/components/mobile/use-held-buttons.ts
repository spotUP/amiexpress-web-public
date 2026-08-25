import { useEffect, useRef, type RefObject } from 'react';

export interface HeldButtonsConfig<T extends { id: string }> {
  /** Resolve the pressable control under a pointer; null for anything else. */
  resolve: (target: EventTarget | null) => T | null;
  onPress: (control: T) => void;
  onRelease: (control: T) => void;
  /** Class toggled on the pressed button while it is held down. */
  activeClass: string;
}

/**
 * Press/release bookkeeping for an on-screen button panel.
 *
 * Press and release are separate events on purpose: the doors read held-key
 * state (GRANDMASTER's DAS/ARR), so a tap-only control would make the panel
 * play worse than a keyboard. Touches are tracked per Touch.identifier so two
 * thumbs can hold two controls at once - holding Left while tapping Rotate is
 * normal play - and a still-held control is released on unmount, because a
 * key-down without its key-up leaves the door moving forever.
 *
 * Buttons opt in by carrying `data-control-id`; anything else inside the
 * container (the ARKANOID trackpad strip, labels) is ignored, so a panel can
 * mix buttons with other controls.
 */
export function useHeldButtons<T extends { id: string }>(
  containerRef: RefObject<HTMLElement>,
  config: HeldButtonsConfig<T>,
): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // identifier -> control. Mouse uses a reserved identifier so the same
    // press/release bookkeeping covers both input kinds.
    const MOUSE_POINTER = -1;
    const held = new Map<number, T>();

    const elementFor = (id: string): HTMLElement | null =>
      containerRef.current?.querySelector<HTMLElement>(`[data-control-id="${id}"]`) ?? null;

    const press = (pointer: number, control: T) => {
      if (held.has(pointer)) return;
      held.set(pointer, control);
      elementFor(control.id)?.classList.add(configRef.current.activeClass);
      configRef.current.onPress(control);
    };

    const release = (pointer: number) => {
      const control = held.get(pointer);
      if (!control) return;
      held.delete(pointer);
      // Another finger may still be holding the same control.
      const stillHeld = Array.from(held.values()).some(c => c.id === control.id);
      if (!stillHeld) {
        elementFor(control.id)?.classList.remove(configRef.current.activeClass);
        configRef.current.onRelease(control);
      }
    };

    // Non-passive so preventDefault() can block scrolling, double-tap zoom and
    // the focus steal that would pull the caret out of the terminal.
    const handleTouchStart = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        const control = configRef.current.resolve(touch.target);
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
      const control = configRef.current.resolve(e.target);
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
  }, [containerRef]);
}
