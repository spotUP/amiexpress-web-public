/**
 * A full-surface frame over the terminal, for a door that needs pixels.
 *
 * The board's doors draw in character cells, which is most of the point of
 * a BBS - but a BBC Micro in MODE 1 is a 320x256 bitmap, and no arrangement
 * of character cells is that. So a door can ask the browser for a real
 * surface, and this is it.
 *
 * NOTHING IS DRAWN OVER IT. No strip, no title, no button, not even one
 * that hides itself. A BBC Micro in MODE 7 is teletext, and anything of
 * ours on top turns a teletext screen into a web page with a computer in
 * it. The machine gets the whole surface.
 *
 * GETTING OUT IS SHIFT+ESCAPE, and it is heard wherever the keyboard is.
 *
 * It used to be plain Escape, heard only when the frame did NOT have
 * focus - the idea being that the caller would click off the machine, onto
 * the black around it, and get their keyboard back. There is no such black:
 * the frame is the whole surface, so every click lands inside it, focus
 * never comes back, and the way out could not be reached at all. "esc does
 * nothing" (sysop, 2026-09-17), and it never could have.
 *
 * Plain Escape still belongs to the BBC, which is the reason for the
 * modifier rather than politeness: ESCAPE is a real key on that machine -
 * it is how a BASIC program is stopped, and games read it. A surface that
 * swallowed it would make some software unusable. SHIFT+ESCAPE means
 * nothing to a Beeb, so it is free to mean something here.
 *
 * Heard on this document AND on the frame's own, which is allowed because
 * the frame is same-origin - and in the CAPTURE phase, so the emulator
 * cannot eat it first.
 *
 * The door can also take it away at any time (`emulator:close`).
 *
 * Inline styles throughout: this package ships no Tailwind (the utilities
 * in `className` here would be dead), and a surface that loses its layout
 * to a missing stylesheet is a surface that covers the terminal with
 * nothing.
 */
import React, { useEffect, useRef } from 'react';

export interface EmulatorOverlayProps {
  /** Same-origin URL to host. */
  url: string;
  /** Used as the frame's accessible name; never drawn. */
  title: string;
  /** What the caller is looking at, e.g. "BBC MICRO". Never drawn. */
  machine?: string;
  onClose(): void;
}

export const EmulatorOverlay: React.FC<EmulatorOverlayProps> = ({
  url,
  title,
  machine = 'EMULATOR',
  onClose,
}) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  /**
   * Put the keyboard in the machine.
   *
   * Focusing the iframe ELEMENT is not enough on its own: what has to end
   * up focused is the document inside it, which is where the emulator
   * listens. Same-origin, so its window can simply be told.
   */
  const takeKeyboard = React.useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // Whatever holds it now - xterm's hidden textarea, usually - has to let
    // go first, or the browser keeps handing keys back to it.
    (document.activeElement as HTMLElement | null)?.blur?.();
    frame.focus();
    try {
      frame.contentWindow?.focus();
    } catch {
      // Cross-origin one day: the element focus above still applies.
    }
  }, []);

  /**
   * The way out, wherever the keyboard happens to be.
   *
   * Shift is what separates this from the machine's own Escape key, so a
   * bare Escape is deliberately ignored here and left to the BBC.
   */
  const onKeyDown = React.useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    },
    [onClose],
  );

  /**
   * Listen inside the frame as well as outside it.
   *
   * A focused frame's keys never reach this document, and the frame is the
   * whole surface - so without this there is no key the caller can press.
   * Capture phase, because the emulator handles keydown itself and would
   * otherwise consume it.
   */
  const listenInside = React.useCallback(() => {
    takeKeyboard();
    try {
      const inner = frameRef.current?.contentDocument;
      if (!inner) return;
      inner.removeEventListener('keydown', onKeyDown, true);
      inner.addEventListener('keydown', onKeyDown, true);
    } catch {
      // Cross-origin one day: the outer listener is all there is.
    }
  }, [onKeyDown, takeKeyboard]);

  useEffect(() => {
    // Once on arrival, in case the frame is already loaded from cache.
    const focus = window.setTimeout(listenInside, 50);
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.clearTimeout(focus);
      window.removeEventListener('keydown', onKeyDown, true);
      try {
        frameRef.current?.contentDocument?.removeEventListener('keydown', onKeyDown, true);
      } catch {
        // Nothing to take off.
      }
    };
  }, [onKeyDown, listenInside]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        backgroundColor: '#000000',
        overflow: 'hidden',
      }}
      data-testid="emulator-overlay"
      data-machine={machine}
      // A click anywhere on the surface means the caller wants the machine.
      onMouseDown={takeKeyboard}
    >
      <iframe
        ref={frameRef}
        src={url}
        title={title}
        // The frame is usually still loading when the effect above runs.
        onLoad={listenInside}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          border: 'none',
          backgroundColor: '#000000',
        }}
        /*
         * NO sandbox attribute, deliberately.
         *
         * The emulator needs `allow-scripts` to run at all and
         * `allow-same-origin` to fetch the ROMs and disc images this board
         * serves it. A sandbox granting both is not a sandbox - the frame
         * can reach out and remove its own sandboxing - and the browser
         * says so in the console. Claiming an isolation that does not
         * exist is worse than not claiming it.
         *
         * What this means honestly: /beeb/ is third-party GPL code running
         * on the board's own origin, with the access that implies. Real
         * isolation would mean serving it from a separate origin and
         * opening CORS for the ROMs - a bigger change, and the right one if
         * this is ever exposed to callers who are not trusted.
         */
        allow="autoplay; gamepad; fullscreen"
      />
    </div>
  );
};

EmulatorOverlay.displayName = 'EmulatorOverlay';
