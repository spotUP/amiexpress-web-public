/**
 * Wait for a promise, but not for ever.
 *
 * Resolves `true` when `work` settled inside the grace, `false` when the grace
 * ran out first. The work is NOT cancelled - it carries on in the background
 * and its own error handling still applies; this only decides how long the
 * caller stands here waiting for it.
 *
 * Written for the `G` logoff: express.e:8191-8231 prints `Click...` and then
 * runs the LOGOFF and LOGOFF<n> sys-commands before the line drops, and on
 * this board those are the logoff batch - seven 68K doors with a 300 s budget
 * each. Awaiting them parked the caller at `Click...` with the session still
 * on the board, which is the shape of every "batch doors never exit" report
 * this board has had. The disconnect handler already decided this for the
 * carrier-drop case - "off the board first, then the paperwork" - and the
 * deliberate goodbye gets the same rule.
 */
export function settleWithin(work: Promise<unknown>, graceMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), graceMs);
  });
  const done = work.then(() => true, () => true);
  return Promise.race([done, grace]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
