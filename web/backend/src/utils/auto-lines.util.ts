/**
 * The screen height "Auto" resolves to - shared by the signup line test and
 * the runtime `W` command.
 *
 * "Auto" (0, or Enter at the line test / W prompt) must not be stored as 0 or
 * null: createUser turned a 0 into the board default 23 and the user-read
 * turned a null back into 23, so every "Auto" account ended one row short of
 * its terminal and the door's `(Pause)...More(y/n/ns)?` landed under the last
 * row of a bulletin built to fit (the sysop, 2026-09-16, Bulls door). A
 * concrete height also keeps a 0 out of the linesPerScreen field, which
 * several door paths read through `??` where a 0 would survive and paginate
 * after every single line.
 *
 * The height is what the session already measured - the web client's reported
 * rows, or the telnet screen height - minus the row the prompt sits on, which
 * is exactly the number the line test shows at the top (24 on a 25-row
 * terminal) and exactly what a typed answer would store. When nothing was
 * measured it falls back to the standard usable height.
 */
import { DEFAULT_PAUSE_LINES } from '../screens/screen-rows';

export function autoLinesFor(session: {
  wireHeight?: number;
  screenHeight?: number;
} | null | undefined): number {
  const measured = session?.wireHeight || session?.screenHeight || 0;
  return measured > 1 ? measured - 1 : DEFAULT_PAUSE_LINES;
}
