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

/**
 * The advanceDisplayFlow loop, which is where BOTH routes into a conference
 * meet - the login display flow and the `J` command.
 *
 * The guard lived in the DISPLAY_CONF_BULL branch first and that was wrong:
 * only the login route passes through that state, so joining with `J` still
 * lost the segment. The live log showed it failing identically with the fix
 * in place (2026-09-14, subState=process_command).
 */
const LOOP = SOURCE.slice(
  SOURCE.indexOf('export async function advanceDisplayFlow'),
  SOURCE.indexOf("if (session.queuedScreenCommands && session.queuedScreenCommands.length > 0) {")
);

describe('a screen with a ~SP left half-shown', () => {
  it('has the loop to check at all', () => {
    expect(LOOP.length).toBeGreaterThan(0);
  });

  it('does not advance while segments are still waiting', () => {
    expect(LOOP).toMatch(/session\.screenSegments/);
    expect(LOOP).toMatch(/segments\.length\s*>\s*0/);
  });

  it('arms the pause and RETURNS, rather than falling through', () => {
    // Returning hands control to the keypress path, which completes the
    // pagination and then drains the remaining segments
    // (screen.handler.ts:3160-3170). Falling through advances the flow and
    // loses them exactly as before.
    const code = LOOP.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const guard = code.slice(code.indexOf('session.screenSegments'));

    expect(guard).toMatch(/pauseDisplayFlow\(socket, session\)/);
    expect(guard.slice(0, guard.indexOf('}'))).toMatch(/return;/);
  });

  it('does not re-arm over a pause that is already up', () => {
    // Without this it would install a second pause on top of a paginated
    // screen that is already waiting for a key.
    expect(LOOP).toMatch(/!session\.paginatedScreen/);
  });

  it('guards in the loop, NOT in the login-only branch', () => {
    // The bug that made the first fix useless. DISPLAY_CONF_BULL is reached
    // by the login flow alone; `J` never goes near it.
    const branch = SOURCE.slice(
      SOURCE.indexOf('if (session.subState === LoggedOnSubState.DISPLAY_CONF_BULL)'),
      SOURCE.indexOf('if (session.subState === LoggedOnSubState.AUTO_REJOIN)')
    );
    expect(branch).not.toMatch(/session\.screenSegments/);
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
