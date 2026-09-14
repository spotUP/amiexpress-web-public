/**
 * Answering `More(y/n/ns)?` must not erase the line above the prompt.
 *
 * "it pauses here and corrupts when it proceed" - the sysop, 2026-09-14,
 * against Bulletins/bull6.txt: the Super-AmiLog last-callers screen, 37 lines
 * of ANSI, and the first screen on this board tall enough to page since
 * screens began paginating.
 *
 * express.e:5193-5199 prints the prompt with NO leading newline and then calls
 * `lineInput`, so the caller's RETURN is what ends the line. By the time
 * `aePuts('[1A[K')` runs the cursor is at COLUMN 0 of the row below, the
 * cursor-up lands on the prompt's own row, and the erase clears it.
 *
 * This port diverges twice: the prompt is emitted after its own `\r\n`, and a
 * single keypress answers it with no RETURN echoed. So the cursor was still at
 * the END of the prompt text - about column 27 - and `[1A`, which PRESERVES
 * the column, landed one row up on the last CONTENT line. `[K` then erased it
 * from column 27 to the end, and page two began writing from that column.
 *
 * The prompt is on its own row here, so the row to erase is the one the cursor
 * is already on: `\r` to its start, `[K` to clear it.
 *
 * Driven through the real `startPagination` and `handlePaginatedScreenInput`,
 * because the fault is in the bytes those two put on the wire.
 */
process.env.SKIP_DB_INIT = '1';

import { startPagination, handlePaginatedScreenInput } from '../../src/handlers/screen.handler';

/**
 * A row of the callers table, coloured the way Super-AmiLog writes it, and
 * UNIQUE per row - a repeated row could not tell a lost line from a doubled
 * one.
 */
const row = (n: number) =>
  `\x1b[31m19.2 1\x1b[37m \x1b[32msysop  \x1b[33mServer Room  \x1b[34mrow${String(n).padStart(3, '0')}\x1b[0m`;

function paginate(lineCount: number, height = 25) {
  const lines = Array.from({ length: lineCount }, (_, i) => row(i));
  const session: any = { screenHeight: height, screenWidth: 80, nodeId: 1 };
  const wire: string[] = [];
  const socket: any = { emit: (_event: string, text: string) => wire.push(String(text ?? '')) };

  startPagination(socket, session, lines);
  const pageOne = wire.join('');
  wire.length = 0;
  return { session, socket, lines, pageOne, rest: () => wire.join('') };
}

describe('the page break', () => {
  test('does not move the cursor up onto the last line of the page', async () => {
    const run = paginate(37);

    await handlePaginatedScreenInput(run.socket, run.session, 'Y');
    const pageTwo = run.rest();

    // `[1A` here is the whole bug: it preserves the column, so it lands on the
    // last content row rather than on the prompt.
    expect(pageTwo).not.toContain('\x1b[1A');
    // The prompt has its own row, so its row is the one the cursor is on.
    expect(pageTwo.startsWith('\r\x1b[K')).toBe(true);
  });

  test('page two begins with a whole content line, not the tail of one', async () => {
    const run = paginate(37);
    const firstOfPageTwo = run.lines[run.session.paginatedScreen.nextIndex];

    await handlePaginatedScreenInput(run.socket, run.session, 'Y');

    const afterErase = run.rest().replace(/^\r\x1b\[K/, '');
    expect(afterErase.startsWith(firstOfPageTwo)).toBe(true);
  });

  test('every line of the screen is still delivered exactly once', async () => {
    const run = paginate(37);

    await handlePaginatedScreenInput(run.socket, run.session, 'Y');

    const delivered = run.pageOne + run.rest();
    for (const line of run.lines) {
      // Every row is distinct, so a lost or doubled line shows as 0 or 2.
      expect({ line, count: delivered.split(line).length - 1 }).toEqual({ line, count: 1 });
    }
  });

  test('NS - dump the rest - clears the prompt the same way', async () => {
    const run = paginate(37);

    await handlePaginatedScreenInput(run.socket, run.session, 'NS');

    expect(run.rest()).not.toContain('\x1b[1A');
  });

  test('the prompt row is erased once, not once per remaining line', async () => {
    const run = paginate(37);

    await handlePaginatedScreenInput(run.socket, run.session, 'Y');

    expect(run.rest().split('\x1b[K').length - 1).toBe(1);
  });
});
