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
 * LOADING RUNS AT TURBO, PLAYING RUNS AT 2MHz.
 *
 * A BBC Micro takes its own sweet time to boot, type in a command and pull
 * a program off a disc, and none of that is the bit anyone came for.
 * jsbeeb has a fast-as-possible mode for exactly this, bound to Alt-T, and
 * the frame is same-origin so it can be handed that key.
 *
 * It is turned ON when the frame loads and OFF again THE MOMENT THE DISC
 * STOPS BEING READ. The emulator lights a drive LED while it is loading
 * and puts it out when it finishes, so the machine says when it is done
 * and nothing has to be guessed.
 *
 * The first cut ended the boost at the caller's first keystroke, on the
 * theory that pressing something meant the program was up. It does not: a
 * game started by CHAIN begins on its own while the player just watches,
 * so nothing ended the boost and the game ran at warp until the cap - "they
 * play super fast now" (sysop, 2026-09-17). A keystroke still ends it, and
 * so does a timer, but both are now backstops rather than the signal.
 *
 * The speed must NOT stay up during play: these are 1982 action games
 * timed against a 2MHz 6502, and Snake at fast-as-possible is not Snake.
 *
 * The door can also take it away at any time (`emulator:close`).
 *
 * Inline styles throughout: this package ships no Tailwind (the utilities
 * in `className` here would be dead), and a surface that loses its layout
 * to a missing stylesheet is a surface that covers the terminal with
 * nothing.
 */
import React, { useEffect, useRef } from 'react';

/**
 * jsbeeb's turbo toggle.
 *
 * Its keyboard matches on `event.code` (`keyCode(e){return e.code}`) and
 * registers shortcuts under `alt:<code>`, so this is the whole contract.
 */
const TURBO_KEY: KeyboardEventInit = {
  code: 'KeyT',
  key: 't',
  altKey: true,
  bubbles: true,
};

/**
 * How long a load may run fast when nobody presses anything.
 *
 * Generous: a disc load plus a title screen. It only matters for software
 * that wants no input at all, which would otherwise play at warp speed
 * forever.
 */
const BOOST_CAP_MS = 12000;

/** Keys that are not the caller starting to play. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/**
 * The emulator's drive lights, and the class it lights them with.
 *
 * `<span class="led disc" id="drive0">` gains `on` while that drive is
 * being read (jsbeeb's own stylesheet: `.led.on`).
 */
const DRIVE_LIGHTS = ['drive0', 'drive1'];
const LIT = 'on';

/** How often to look at the drive lights. */
const WATCH_MS = 120;

/**
 * How long the drive must stay dark before the load counts as finished.
 *
 * DFS reads in bursts with the light out between them, so ending the boost
 * at the first dark frame would drop to 2MHz in the middle of loading.
 */
const SETTLED_MS = 700;

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
  /** Whether the machine is currently running fast. */
  const boosting = useRef(false);
  /** Set while this component is the one pressing a key, so it ignores its own. */
  const pressing = useRef(false);
  const capTimer = useRef<number | null>(null);
  const watcher = useRef<number | null>(null);

  /**
   * Press Alt-T inside the machine.
   *
   * Built from the frame's OWN window, so the event is of the class that
   * document's listeners expect.
   */
  const pressTurbo = React.useCallback((): boolean => {
    try {
      const inner = frameRef.current?.contentDocument;
      const view = inner?.defaultView;
      if (!inner || !view) return false;
      pressing.current = true;
      inner.dispatchEvent(new view.KeyboardEvent('keydown', TURBO_KEY));
      return true;
    } catch {
      return false;
    } finally {
      pressing.current = false;
    }
  }, []);

  const stopBoost = React.useCallback(() => {
    if (capTimer.current !== null) {
      window.clearTimeout(capTimer.current);
      capTimer.current = null;
    }
    if (watcher.current !== null) {
      window.clearInterval(watcher.current);
      watcher.current = null;
    }
    if (!boosting.current) return;
    if (pressTurbo()) boosting.current = false;
  }, [pressTurbo]);

  /**
   * Watch the machine load, and drop back the moment it stops.
   *
   * Only after the drive has actually been seen to run: a caller who asked
   * for a bare machine with no disc never lights it at all, and must not
   * be held at 2MHz-plus-nothing waiting for a light that will not come.
   */
  const watchTheDrive = React.useCallback(() => {
    if (watcher.current !== null) window.clearInterval(watcher.current);
    let everRan = false;
    let darkSince: number | null = null;

    watcher.current = window.setInterval(() => {
      let lit = false;
      try {
        const inner = frameRef.current?.contentDocument;
        if (!inner) return;
        for (const id of DRIVE_LIGHTS) {
          if (inner.getElementById(id)?.classList.contains(LIT)) lit = true;
        }
      } catch {
        return;
      }

      if (lit) {
        everRan = true;
        darkSince = null;
        return;
      }
      if (!everRan) return;
      if (darkSince === null) darkSince = Date.now();
      else if (Date.now() - darkSince >= SETTLED_MS) stopBoost();
    }, WATCH_MS);
  }, [stopBoost]);

  const startBoost = React.useCallback(() => {
    if (boosting.current) return;
    if (!pressTurbo()) return;
    boosting.current = true;
    watchTheDrive();
    capTimer.current = window.setTimeout(stopBoost, BOOST_CAP_MS);
  }, [pressTurbo, stopBoost, watchTheDrive]);

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
      // Never react to the Alt-T this component just sent itself.
      if (pressing.current) return;

      // The caller is playing now, so the machine goes back to 2MHz.
      if (!MODIFIERS.has(event.key)) stopBoost();

      if (event.key !== 'Escape' || !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    },
    [onClose, stopBoost],
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
    // Boot, type and load at full tilt; the first keystroke ends it.
    startBoost();
  }, [onKeyDown, takeKeyboard, startBoost]);

  useEffect(() => {
    // Once on arrival, in case the frame is already loaded from cache.
    const focus = window.setTimeout(listenInside, 50);
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.clearTimeout(focus);
      if (capTimer.current !== null) window.clearTimeout(capTimer.current);
      if (watcher.current !== null) window.clearInterval(watcher.current);
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
