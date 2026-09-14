/**
 * Every teletext screen fits a teletext screen.
 *
 * A `.ttx` is shown to a caller on a 40x25 grid. A row wider than forty
 * columns wraps and pushes the page down; a page taller than twenty-five
 * scrolls the header off the top. Both were shipped tonight - the header's
 * clock overran because its padding was computed from the MCI TOKEN rather
 * than from what the token prints (sysop, 2026-09-14) - and neither is
 * visible in the source, where the escapes and the tokens hide the width.
 *
 * So the check is on what the board PRINTS: colour escapes and the mosaic
 * shift-out weigh nothing, `~DT|` and `~TM|` weigh what a date and a time
 * weigh, and a double-height row is still one row of columns.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
const COLUMNS = 40;
const ROWS = 25;

/** What the MCI tokens a teletext header uses print, at their widest. */
const TOKEN_WIDTHS: Record<string, string> = {
  '~DT|': '09-14-26',
  '~TM|': '01:38:36',
};

/** A line's width in COLUMNS, as the caller's screen counts them. */
function printedWidth(line: string): number {
  let text = line;
  for (const [token, printed] of Object.entries(TOKEN_WIDTHS)) {
    text = text.split(token).join(printed);
  }
  return text
    // SGR, the clear, the cursor home, and DECDHL: all weightless.
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*[HJ]/g, '')
    .replace(/\x1b#[0-9]/g, '')
    // SO/SI select the mosaic set; the bytes between them are one cell each.
    .replace(/[\x0e\x0f]/g, '')
    .length;
}

/** Lines that are only a token the board consumes print no row of their own. */
const CONSUMED = /^(~SMO\d+\||~SMC\||~CL\.|~BL\.|~SP|~WX|~f)$/;

function teletextScreens(): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 2) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (/^(node_modules|\.git|dist|web|sdk|dev|thoughts|Documentation)$/.test(e.name)) continue;
        walk(full, depth + 1);
      } else if (e.name.endsWith('.ttx')) {
        out.push(full);
      }
    }
  };
  walk(ROOT, 0);
  return out;
}

describe('a teletext screen fits the teletext grid', () => {
  const screens = teletextScreens();

  it('finds the board\'s teletext screens, so the check has something to check', () => {
    expect(screens.length).toBeGreaterThan(0);
  });

  it.each(screens.map((s) => [path.relative(ROOT, s), s]))(
    '%s is within 40 columns and 25 rows',
    (_name, file) => {
      const lines = fs.readFileSync(file, 'latin1').split('\n');
      // A trailing newline is not a row.
      while (lines.length && lines[lines.length - 1] === '') lines.pop();

      const over = lines
        .map((line, i) => ({ i, width: printedWidth(line), line }))
        .filter((row) => row.width > COLUMNS);
      expect(over.map((r) => `row ${r.i}: ${r.width} columns`)).toEqual([]);

      const printedRows = lines.filter((l) => !CONSUMED.test(l.trim())).length;
      expect(printedRows).toBeLessThanOrEqual(ROWS);
    },
  );
});
