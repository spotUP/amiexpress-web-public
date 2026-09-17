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
 * Getting out is Escape, and which side hears it is decided by focus:
 *
 *  - While the caller is playing, the frame holds focus, and a focused
 *    frame's keys never reach this document. Escape goes to the BBC, where
 *    it is a real key - it is how you stop a BASIC program, and games use
 *    it. That is deliberate; a surface that swallowed Escape would make
 *    some software unusable.
 *  - Click off the machine, onto the black around it, and focus comes back
 *    here. Then Escape closes the surface.
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

  useEffect(() => {
    // Once on arrival, in case the frame is already loaded from cache.
    const focus = window.setTimeout(takeKeyboard, 50);

    // Only ever heard when the frame does NOT have focus. Not attached to
    // the frame's own document, though it is same-origin and could be:
    // doing that would take Escape away from the BBC, where it is a key
    // that software depends on.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focus);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, takeKeyboard]);

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
        onLoad={takeKeyboard}
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
