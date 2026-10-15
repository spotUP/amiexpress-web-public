import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

interface ScreenPreviewProps {
  /** The screen's bytes, decoded latin1 - one character per byte, as the board sends them. */
  content: string;
  /**
   * How wide the caller's terminal is.
   *
   * 80 is the board. 40 is a C64 that resolved to an ANSI file because the
   * theme carries no `.seq` - and the wrap that produces is exactly what the
   * preview is for, so it is shown rather than hidden.
   */
  cols?: number;
}

/**
 * A screen as a caller meets it.
 *
 * NOT SessionLogTerminal: that one strips cursor-movement sequences and keeps
 * only colour, which is right for replaying a log and wrong here. A BBS screen
 * PAINTS - it positions the cursor absolutely and draws - so stripping those
 * sequences would show the sysop something the board never displays. The whole
 * door-rendering bug of 2026-09-01 was a layer treating a paint as if it were
 * lines of text.
 *
 * 80 columns because that is what the board sends, and 25 rows because that is
 * what a screen is written for.
 */
export function ScreenPreview({ content, cols = 80 }: ScreenPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const terminal = new Terminal({
      cols,
      rows: 25,
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      /*
       * THE FACE THE CALLER ACTUALLY SEES. `IBM VGA` is a PC font and is not
       * shipped here at all, so this preview drew Amiga art in whatever
       * monospace the browser picked - which is not what the board sends and
       * not what the artist drew for.
       *
       * TopazPlus_a1200 is the board's default (`DEFAULT_BBS_FONT`,
       * packages/terminal/src/utils/session-font.ts:34); plain Topaz is the
       * fallback for the same metrics, and both are half-width cells.
       */
      fontFamily: "'TopazPlus_a1200', 'Topaz_a1200', monospace",
      fontSize: 14,
      theme: { background: '#000000' },
    });

    terminal.open(hostRef.current);
    termRef.current = terminal;

    return () => {
      terminal.dispose();
      termRef.current = null;
    };
  }, [cols]);

  useEffect(() => {
    const terminal = termRef.current;
    if (!terminal) return;
    terminal.reset();
    terminal.write(content);
  }, [content]);

  return <div ref={hostRef} className="bg-black p-2 rounded" data-testid="screen-preview" />;
}
