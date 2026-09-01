import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

interface ScreenPreviewProps {
  /** The screen's bytes, decoded latin1 - one character per byte, as the board sends them. */
  content: string;
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
export function ScreenPreview({ content }: ScreenPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const terminal = new Terminal({
      cols: 80,
      rows: 25,
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      fontFamily: 'IBM VGA, Consolas, monospace',
      fontSize: 14,
      theme: { background: '#000000' },
    });

    terminal.open(hostRef.current);
    termRef.current = terminal;

    return () => {
      terminal.dispose();
      termRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = termRef.current;
    if (!terminal) return;
    terminal.reset();
    terminal.write(content);
  }, [content]);

  return <div ref={hostRef} className="bg-black p-2 rounded" data-testid="screen-preview" />;
}
