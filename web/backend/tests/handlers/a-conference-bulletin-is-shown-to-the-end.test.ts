/**
 * Everything after a bulletin's `~SP` must still be shown.
 *
 * A conference bulletin split by `~SP` becomes SEGMENTS: displayScreen renders
 * the first one, parks the rest on `session.screenSegments`, and deliberately
 * sets `lastScreenHadPause = false` because "pauseDisplayFlow will handle the
 * pause" (screen.handler.ts:2322).
 *
 * Nothing handled it. The DISPLAY_CONF_BULL branch advanced straight to
 * AUTO_REJOIN, so the pause was never armed and every segment after the first
 * was dropped.
 *
 * That is not a cosmetic loss. This board's conference bulletins end:
 *
 *     ...art...
 *     ~SP
 *     ~f
 *     ~CC_ctop
 *
 * so the `~CC_ctop` that runs Conftop on every join lives in the SECOND
 * segment and had been silently dead. The live log said it without ambiguity
 * on 2026-09-14: "SETUP: 2 segments", "Processing segment 0/2", then
 * "advance state=display_menu queued=0" - segment 1 never processed, no pause,
 * no command.
 *
 * It went unnoticed because nothing fails: the art draws, the caller reaches
 * the menu, and the only symptom is a door that quietly never runs.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

const HANDLER = path.join(__dirname, '..', '..', 'src', 'handlers', 'command.handler.ts');
const SOURCE = fs.readFileSync(HANDLER, 'utf8');

/** The DISPLAY_CONF_BULL branch, isolated from the rest of the flow. */
const BRANCH = SOURCE.slice(
  SOURCE.indexOf('if (session.subState === LoggedOnSubState.DISPLAY_CONF_BULL)'),
  SOURCE.indexOf('if (session.subState === LoggedOnSubState.AUTO_REJOIN)')
);

describe('a conference bulletin with a ~SP in it', () => {
  it('has a DISPLAY_CONF_BULL branch to check at all', () => {
    expect(BRANCH.length).toBeGreaterThan(0);
  });

  it('does not advance while segments are still waiting', () => {
    // The whole bug: this branch used to set AUTO_REJOIN unconditionally, and
    // session.screenSegments was left holding content nobody would ever draw.
    expect(BRANCH).toMatch(/session\.screenSegments/);
    expect(BRANCH).toMatch(/segments\.length\s*>\s*0/);
  });

  it('arms the pause and RETURNS, rather than falling through', () => {
    // Returning is what hands control to the keypress path, which completes
    // the pagination and then drains the remaining segments
    // (screen.handler.ts:3160-3170). Falling through would advance the flow
    // and lose them exactly as before.
    // Comments stripped first: the block above this guard EXPLAINS the old
    // behaviour and names AUTO_REJOIN, so a raw search finds the prose and
    // measures the wrong distance.
    const code = BRANCH.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const guard = code.slice(code.indexOf('session.screenSegments'));

    expect(guard).toMatch(/pauseDisplayFlow\(socket, session\)/);
    expect(guard.slice(0, guard.indexOf('AUTO_REJOIN'))).toMatch(/return;/);
  });

  it('still advances when there is nothing left to show', () => {
    // A bulletin with no ~SP has no segments, and must reach the menu exactly
    // as it always did - the guard is a detour, not a new gate.
    expect(BRANCH).toMatch(/session\.subState = LoggedOnSubState\.AUTO_REJOIN;/);
  });
});

describe('the segment machinery it depends on', () => {
  const SCREEN = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'handlers', 'screen.handler.ts'), 'utf8'
  );

  it('still parks later segments on the session for someone to drain', () => {
    // If displayScreen ever stops deferring, the guard above becomes dead
    // code rather than silently wrong - so it is pinned here.
    expect(SCREEN).toMatch(/session\.screenSegments = \{/);
    expect(SCREEN).toMatch(/segments: segments\.slice\(1\)/);
  });

  it('still drains them when a pagination completes', () => {
    // The other half of the route. Without this the armed pause would hold a
    // key and then show nothing.
    expect(SCREEN).toMatch(/await processNextScreenSegment\(socket, session\)/);
  });
});
