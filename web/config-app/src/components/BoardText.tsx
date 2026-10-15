/**
 * Text as the board shows it: a FILE_ID.DIZ, a DIR description - Amiga art
 * drawn character by character in Topaz, which only lines up in Topaz.
 *
 * Shown the way the door server's DizView shows one (amiexpress-doorserver
 * web/src/components/DizView.tsx), which the sysop pointed at: a <pre> in
 * the board's face at 15px / 1.2, every line kept, nothing wrapped, a
 * horizontal scrollbar rather than a reflow. Colour codes are played through
 * the SDK's ANSI interpreter - the one the screen editor uses - into a cell
 * grid, so a code that moves the cursor lands where it was meant to.
 *
 * Topaz is the board's face, not the interface's (design-system-usage: "dont
 * use topaz for the ui only for the art"), so it lives here and nowhere on a
 * page.
 */
import { createCanvas, parseANSIToCanvas } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';
import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { paletteColor } from '../utils/ansi-palette';

export interface BoardTextProps {
  lines: string[];
  className?: string;
}

/** The board's plain pen: light grey on black. Drawn in the page's own colours. */
const PLAIN_FG = 7;
const PLAIN_BG = 0;

/** Runs of one pen along a row, so a line is a few spans, not eighty. */
function rowRuns(row: Cell[]): Array<{ text: string; fg: number; bg: number }> {
  const runs: Array<{ text: string; fg: number; bg: number }> = [];
  for (const cell of row) {
    const last = runs[runs.length - 1];
    if (last && last.fg === cell.fg && last.bg === cell.bg) last.text += cell.char;
    else runs.push({ text: cell.char, fg: cell.fg, bg: cell.bg });
  }
  return runs;
}

export function BoardText({ lines, className = '' }: BoardTextProps) {
  const text = lines.join('\n');
  const frame = `font-topaz text-[15px] leading-[1.2] whitespace-pre w-max text-content-primary ${className}`;

  if (!text.includes('\x1b')) {
    return (
      <div className="max-w-full overflow-x-auto">
        <pre className={frame}>{text}</pre>
      </div>
    );
  }

  const width = Math.max(80, ...lines.map((l) => l.length));
  const canvas = createCanvas(width, lines.length + 1);
  parseANSIToCanvas(canvas, lines.join('\r\n'));
  let rows = canvas.map((row) => rowRuns(row));
  while (rows.length > 0 && rows[rows.length - 1].every((r) => r.text.trim() === '' && r.bg === PLAIN_BG)) rows = rows.slice(0, -1);

  return (
    <div className="max-w-full overflow-x-auto">
      <pre className={frame}>
        {rows.map((runs, y) => (
          <span key={y}>
            {runs.map((run, i) => (
              <span
                key={i}
                style={{
                  color: run.fg === PLAIN_FG ? undefined : paletteColor(run.fg),
                  backgroundColor: run.bg === PLAIN_BG ? undefined : paletteColor(run.bg),
                }}
              >
                {y === rows.length - 1 ? run.text.replace(/\s+$/, '') : run.text}
              </span>
            ))}
            {y < rows.length - 1 ? '\n' : ''}
          </span>
        ))}
      </pre>
    </div>
  );
}
