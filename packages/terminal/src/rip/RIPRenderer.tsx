/**
 * RIP graphics, drawn by RIPtermJS.
 *
 * This replaces a renderer of our own that drew 29 of RIPscrip's commands
 * with a monospace font and no fill patterns, and could not parse the icon
 * commands at all - which is how most RIP menus draw their buttons.
 * RIPtermJS (Carl Gorringe, MPL 2.0, vendored under ./vendor) covers every
 * command the board's 94 files use, with the real .CHR fonts, flood-fill
 * patterns and the icon set. See
 * thoughts/shared/research/2026-09-01_riptermjs-evaluation.md.
 *
 * The contract the terminal sees is unchanged: mount it, call render() with
 * whatever RIP text has arrived, reset() for a new picture. Internally the
 * text is pushed into a byte stream that RIPtermJS's own state machine
 * consumes, so multi-command lines, continuations and half-arrived
 * commands are its problem rather than ours.
 */
import React, { forwardRef, useEffect, useId, useImperativeHandle, useRef } from 'react';
import { RIPterm } from './vendor/ripterm.js';
import type { RIPState } from './RIPTypes';
import { createInitialState } from './RIPTypes';

export interface RIPRendererProps {
  /** Called with the text a RIP button or mouse region sends to the host. */
  onCommand?: (command: string) => void;
  /** Kept for the terminal's contract; RIP-mode exit is decided there. */
  onExitRipMode?: () => void;
  /** Canvas size. RIP's native resolution is 640x350. */
  width?: number;
  height?: number;
  /** Where the fonts and icons are served from. */
  fontsPath?: string;
  iconsPath?: string;
}

export interface RIPRendererRef {
  /** Feed RIP text. May be called with partial content as it streams. */
  render: (content: string) => void;
  /** Clear the picture. */
  clear: () => void;
  /** Forget everything and start a new picture. */
  reset: () => void;
  /** Kept for the contract. RIPtermJS owns the real state. */
  getState: () => RIPState;
}

const CREDIT = 'RIP graphics by RIPtermJS - https://github.com/cgorringe/RIPtermJS - Carl Gorringe';
let creditShown = false;

/**
 * Should a click on the RIP surface act as a dismiss key?
 *
 * RIPtermJS handles canvas clicks itself: a hit on a RIP button fires
 * onHostCommand synchronously from its own mouseup listener, which runs
 * before the host's React click handler. A click that produced no host
 * command within this window hit plain picture, and the natural reading of
 * that - "the sysop clicking the image to close it" - is a keypress.
 */
export const RIP_BUTTON_CLICK_WINDOW_MS = 150;
export function shouldDismissRipClick(lastHostCommandAt: number, now: number): boolean {
  return now - lastHostCommandAt > RIP_BUTTON_CLICK_WINDOW_MS;
}

/**
 * RIP text as bytes, one byte per character.
 *
 * TextEncoder would turn anything above 0x7F into UTF-8 pairs, and RIPtermJS
 * decodes what it reads as single bytes ("x-user-defined"), so a CP437
 * character in a text command would arrive as two wrong ones.
 */
function toBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i] = c < 256 ? c : 0x3f;
  }
  return out;
}

const RIPRenderer = forwardRef<RIPRendererRef, RIPRendererProps>(
  ({ onCommand, width = 640, height = 350, fontsPath = '/rip/fonts', iconsPath = '/rip/icons' }, ref) => {
    // RIPtermJS finds its canvas by DOM id, so each instance needs one.
    const canvasId = 'rip-canvas-' + useId().replace(/[^A-Za-z0-9]/g, '');

    const termRef = useRef<any>(null);
    const controllerRef = useRef<ReadableStreamDefaultController<Uint8Array> | null>(null);
    // Content that arrives before the fonts have loaded and the stream is
    // being read. The terminal's first render() lands in the same tick as
    // the mount, which is long before initFonts() resolves.
    const pendingRef = useRef<string[]>([]);
    const readyRef = useRef(false);
    const onCommandRef = useRef(onCommand);
    onCommandRef.current = onCommand;

    useEffect(() => {
      let cancelled = false;
      const term: any = new RIPterm({
        canvasId,
        fontsPath,
        iconsPath,
        logQuiet: true,
        modemSpeed: 0,
        refreshInterval: 20,
      });
      termRef.current = term;
      term.onHostCommand = (text: string) => onCommandRef.current?.(text);

      if (!creditShown) {
        creditShown = true;
        console.info(CREDIT);
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controllerRef.current = controller;
        },
      });

      (async () => {
        try {
          await term.initFonts();
          if (cancelled) return;
          await term.setupStream(stream);
          if (cancelled) return;
          // The session is run HERE, not by term.play(). Two halves, both
          // learned the hard way:
          // - BGI draws every command into an offscreen ImageData buffer;
          //   only refreshCanvas()'s self-rescheduling timer copies it to
          //   the visible canvas ("RIP shows black images" #1 - calling
          //   playStream() alone painted nothing).
          // - play() is RIPtermJS's file/url replay API: its first run
          //   calls reloadStream() -> releaseStream() -> stream.cancel()
          //   on the very stream this component enqueues into, so the
          //   flush below threw "Cannot enqueue a chunk into a closed
          //   readable stream" and the canvas stayed black ("the entire
          //   browser goes black" #2).
          // playStream() is not awaited: it IS the render loop, running
          // until the stream closes on unmount.
          term.isRunning = true;
          term.ripStopped = false;
          if (term.refTimer) { clearTimeout(term.refTimer); term.refTimer = null; }
          term.refreshCanvas();
          void term.playStream();
          readyRef.current = true;
          for (const text of pendingRef.current.splice(0)) {
            controllerRef.current?.enqueue(toBytes(text));
          }
        } catch (err) {
          console.warn('[RIP] RIPtermJS failed to start:', err);
        }
      })();

      return () => {
        cancelled = true;
        readyRef.current = false;
        try { controllerRef.current?.close(); } catch { /* already closed */ }
        try { term.stop(); } catch { /* leaving anyway */ }
        controllerRef.current = null;
        termRef.current = null;
      };
    }, [canvasId, fontsPath, iconsPath]);

    useImperativeHandle(ref, () => ({
      render: (content: string) => {
        if (!content) return;
        if (readyRef.current && controllerRef.current) {
          controllerRef.current.enqueue(toBytes(content));
        } else {
          pendingRef.current.push(content);
        }
      },
      clear: () => {
        try { termRef.current?.clear(); } catch { /* not started yet */ }
      },
      reset: () => {
        pendingRef.current = [];
        // A new picture, not a new session. The vendor's reset() stops the
        // refresh timer and the stream consumer (isRunning = false,
        // ripStopped = true), which starved every picture after the first.
        // RIPscrip's own reset command ('*') clears the screen and restores
        // defaults while the session keeps running.
        try { void termRef.current?.runRIPcmd('*', ''); } catch { /* not started yet */ }
      },
      getState: () => createInitialState(),
    }), []);

    return (
      <canvas
        id={canvasId}
        width={width}
        height={height}
        style={{
          // As large as the host allows WITHOUT changing shape: the canvas
          // is a replaced element with an intrinsic 640x350, so width 100%
          // plus height auto plus max-height 100% scales it proportionally
          // both ways ("it needs to scale proportionally" - the sysop). The
          // host centres it; keeping the element box equal to the bitmap
          // box is also what keeps RIPtermJS's own mouse math exact.
          width: '100%',
          height: 'auto',
          maxHeight: '100%',
          display: 'block',
          imageRendering: 'pixelated',
          backgroundColor: '#000',
        }}
      />
    );
  }
);

RIPRenderer.displayName = 'RIPRenderer';
export default RIPRenderer;
