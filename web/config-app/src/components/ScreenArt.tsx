import { useEffect, useState } from 'react';
import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { AnsiCanvas } from './AnsiCanvas';
import { screenToCanvas } from '../pages/screen-bytes';

/**
 * A screen's art, rendered read-only.
 *
 * The same code the editor draws with - the SDK's CP437 loader and the canvas
 * renderer - so a viewer and an editor cannot disagree about what a file looks
 * like. Asked for as "let me view the files as well in a read only ansi
 * display, use the ansi editor code for this".
 *
 * `scale` shrinks the cells for a thumbnail; at 1 it is the caller's own view.
 */
export interface ScreenArtProps {
  /** The file's bytes, base64 as the API sends them. */
  content: string;
  scale?: number;
  className?: string;
  /** Passed to the canvas, so a thumbnail is distinguishable from the editor. */
  testId?: string;
  /**
   * Draw at most this many rows.
   *
   * A screen is 25 rows by convention and the loader stopped capping at 25 on
   * purpose - codes live BELOW the art and truncating deleted them. But this
   * board keeps ordinary text under its screen directories too: BBSHelp.txt is
   * 430 lines and a vendored changelog is 3,019. A preview of one of those
   * asks for a canvas 96,608 pixels tall, past every browser's maximum, and
   * the page stops responding. A thumbnail wants the first screenful anyway.
   *
   * Absent means all of it, which is what the EDITOR needs.
   */
  maxRows?: number;
}

export function ScreenArt({ content, scale = 1, className, testId, maxRows }: ScreenArtProps) {
  const [canvas, setCanvas] = useState<Cell[][] | null>(null);
  const [failed, setFailed] = useState(false);

  // The SDK hands back a blank 80x25 canvas for an empty file, so emptiness is
  // a fact about the BYTES - a blank canvas and a blank screen look identical
  // and mean different things.
  const isEmpty = content.length === 0;

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    // maxRows reaches the PARSER, not just the canvas: `content` is base64,
    // so the truncation has to happen on the decoded bytes.
    screenToCanvas(content, maxRows)
      .then(next => { if (!cancelled) setCanvas(next); })
      // A file that will not parse is a fact about the file, not a crash.
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [content, maxRows]);

  if (failed) {
    return <p className="text-sm text-status-warn">This file could not be read as ANSI art.</p>;
  }
  if (isEmpty) {
    return <p className="text-sm text-status-warn">Empty - this screen draws nothing.</p>;
  }
  if (!canvas) return null;

  // Sliced AFTER parsing, so the rows a preview does not show cost pixels
  // rather than a canvas the browser refuses to allocate.
  const shown = maxRows && canvas.length > maxRows ? canvas.slice(0, maxRows) : canvas;

  /*
   * The scale goes to the CANVAS, not to a CSS transform around it.
   *
   * `transform: scale(0.28)` shrank what a thumbnail looked like and left it
   * allocating a full 1280x800 retina canvas - 4.1 MB a card, on a board with
   * 872 screens, never released once drawn. That is what froze the gallery.
   */
  return (
    <div
      className={`overflow-auto bg-black p-2 ${className ?? ''}`}
      style={scale === 1 ? undefined : { width: 'fit-content' }}
    >
      <AnsiCanvas canvas={shown} scale={scale} testId={testId} />
    </div>
  );
}
