/**
 * Gesture control surface for pad-style games (GMASTER).
 *
 * A transparent layer over the playfield: the thumb moves the piece by
 * dragging, taps rotate, and flicks hard-drop or hold. See gesture-scheme.ts
 * for the rules and the reasoning - this file is only the plumbing between
 * touches and the terminal's key path.
 *
 * Keys go through the same pressGameKey/releaseGameKey the physical keyboard
 * and the button pad use, so nothing downstream can tell the difference.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  beginStroke,
  trackMove,
  endStroke,
  type GestureKey,
  type GestureStroke,
} from './gesture-scheme';
import './MobileGameGestures.css';

export interface MobileGameGesturesProps {
  /** Fires a key as a press followed immediately by a release. */
  onKey: (key: string, code: string) => void;
  /** Switch back to the button pad. */
  onUseButtons: () => void;
  /** Door name, shown on the hint strip. */
  title: string;
}

export function MobileGameGestures({ onKey, onUseButtons, title }: MobileGameGesturesProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const strokeRef = useRef<GestureStroke | null>(null);
  /** Identifier of the thumb that owns the stroke; a second finger is ignored. */
  const touchIdRef = useRef<number | null>(null);

  const fire = useCallback((keys: GestureKey[]) => {
    for (const k of keys) onKey(k.key, k.code);
  }, [onKey]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    const handleStart = (event: TouchEvent) => {
      if (touchIdRef.current !== null) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      event.preventDefault();
      touchIdRef.current = touch.identifier;
      strokeRef.current = beginStroke({ x: touch.clientX, y: touch.clientY, t: event.timeStamp });
    };

    const findTouch = (event: TouchEvent): Touch | null => {
      if (touchIdRef.current === null) return null;
      for (let i = 0; i < event.changedTouches.length; i++) {
        const touch = event.changedTouches[i];
        if (touch.identifier === touchIdRef.current) return touch;
      }
      return null;
    };

    const handleMove = (event: TouchEvent) => {
      const touch = findTouch(event);
      const stroke = strokeRef.current;
      if (!touch || !stroke) return;
      event.preventDefault();
      fire(trackMove(stroke, { x: touch.clientX, y: touch.clientY, t: event.timeStamp }));
    };

    const handleEnd = (event: TouchEvent) => {
      const touch = findTouch(event);
      const stroke = strokeRef.current;
      if (!touch || !stroke) return;
      event.preventDefault();

      const key = endStroke(stroke, { x: touch.clientX, y: touch.clientY, t: event.timeStamp });
      if (key) onKey(key.key, key.code);

      strokeRef.current = null;
      touchIdRef.current = null;
    };

    // Non-passive: the surface owns the gesture, so the page must not scroll
    // or rubber-band under the thumb.
    el.addEventListener('touchstart', handleStart, { passive: false });
    el.addEventListener('touchmove', handleMove, { passive: false });
    el.addEventListener('touchend', handleEnd, { passive: false });
    el.addEventListener('touchcancel', handleEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleStart);
      el.removeEventListener('touchmove', handleMove);
      el.removeEventListener('touchend', handleEnd);
      el.removeEventListener('touchcancel', handleEnd);
      strokeRef.current = null;
      touchIdRef.current = null;
    };
  }, [fire, onKey]);

  return (
    <div className="mobile-game-gestures" data-testid="mobile-game-gestures">
      <div
        ref={surfaceRef}
        className="mobile-game-gestures__surface"
        data-testid="mobile-game-gestures-surface"
        role="application"
        aria-label={`${title} gesture controls`}
      />
      <div className="mobile-game-gestures__hint">
        <span>Drag to move</span>
        <span>Tap to rotate</span>
        <span>Flick down to drop</span>
        <span>Flick up to hold</span>
        <button
          type="button"
          className="mobile-game-gestures__switch"
          onClick={onUseButtons}
        >
          Buttons
        </button>
      </div>
    </div>
  );
}
