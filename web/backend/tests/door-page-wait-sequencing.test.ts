/**
 * Regression: task 18 (interactive sysop page-wait), round 2 (post-review).
 *
 * FAME/FIM doors (5D_Page) request a sysop page mid-door via
 * CF_InternalCmd "C", which sets session.sysopPagePending (chat.handler.ts's
 * notifySysopPage) WITHOUT running any pager UI — the door still owns the
 * screen.
 *
 * executeAmigaDoor's post-exit path must:
 *   1. Consume (clear) sysopPagePending IMMEDIATELY after flushOutput(),
 *      BEFORE the CHAIN/RETURNCOMMAND/exitState-merge block that can throw
 *      — otherwise an exception there hits the outer catch with the flag
 *      still set, and the STALE flag fires the page-wait on the NEXT,
 *      unrelated door's exit (round-2 review finding #2).
 *   2. Only actually START the wait (runSysopPageWait) AFTER that same
 *      CHAIN/RETURNCOMMAND block, and only using the ALREADY-consumed chat
 *      session — never re-reading session.sysopPagePending at that point.
 *   3. Never call startSysopPage / consumePendingSysopPage a second time
 *      from the trigger site (no recursive PowerPager launch; no double
 *      consumption).
 *   4. The outer catch block must ALSO clear sysopPagePending /
 *      sysopPageChatSessionId as a belt-and-braces measure, for the case
 *      where a crash happens BEFORE flushOutput() ever runs (so step 1
 *      never executed).
 *
 * Same grep-style approach as door-chain-menu-leak.test.ts because
 * door.handler.ts can't be exercised end-to-end under jest (drags in the
 * BBS subsystem + 68K emulator) — this pins the source-level sequencing
 * instead so a future refactor can't silently reintroduce the stale-flag
 * bug or a mid-door page-wait or a recursive PowerPager launch.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('executeAmigaDoor sysop page-wait sequencing (task 18, round 2)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'door.handler.ts'),
    'utf8'
  );

  function executeAmigaDoorBody(): string {
    const start = src.indexOf('async function executeAmigaDoor(');
    expect(start).toBeGreaterThan(-1);
    // Next top-level "async function " after this one marks the end of
    // executeAmigaDoor's body (good enough for a structural pin — the file
    // has several sibling executeXDoor functions in sequence).
    const next = src.indexOf('\nasync function ', start + 1);
    return next > -1 ? src.slice(start, next) : src.slice(start);
  }

  function flushToReturnToMenuBlock(body: string): string {
    const flushIdx = body.indexOf('flushOutput(socket)');
    const menuIdx = body.indexOf('// Return to menu');
    expect(flushIdx).toBeGreaterThan(-1);
    expect(menuIdx).toBeGreaterThan(flushIdx);
    return body.slice(flushIdx, menuIdx);
  }

  test('consumePendingSysopPage runs immediately after flushOutput(socket), before getExitState (the risky CHAIN/RETURNCOMMAND region)', () => {
    const window = flushToReturnToMenuBlock(executeAmigaDoorBody());
    const consumeIdx = window.indexOf('consumePendingSysopPage');
    const exitStateIdx = window.indexOf('getExitState');
    expect(consumeIdx).toBeGreaterThan(-1);
    expect(exitStateIdx).toBeGreaterThan(-1);
    expect(consumeIdx).toBeLessThan(exitStateIdx);
  });

  test('the page-wait trigger runs after flushOutput(socket), before the "Return to menu" block', () => {
    const window = flushToReturnToMenuBlock(executeAmigaDoorBody());
    expect(window).toMatch(/pendingSysopPageChatSession/);
    expect(window).toMatch(/runSysopPageWait/);
  });

  test('the page-wait trigger happens strictly after amigaSession.start() resolves (door has exited)', () => {
    const body = executeAmigaDoorBody();
    const startIdx = body.indexOf('await amigaSession.start()');
    const triggerIdx = body.indexOf('if (pendingSysopPageChatSession)');
    expect(startIdx).toBeGreaterThan(-1);
    expect(triggerIdx).toBeGreaterThan(-1);
    expect(triggerIdx).toBeGreaterThan(startIdx);
  });

  test('the trigger does not re-consume the flag or call startSysopPage (no double-consume, no recursive PowerPager launch)', () => {
    const window = flushToReturnToMenuBlock(executeAmigaDoorBody());
    const triggerStart = window.indexOf('if (pendingSysopPageChatSession)');
    expect(triggerStart).toBeGreaterThan(-1);
    const block = window.slice(triggerStart);
    expect(block).not.toMatch(/consumePendingSysopPage/);
    // Match an actual call/import, not an explanatory comment that
    // deliberately names startSysopPage to explain why it's NOT used.
    expect(block).not.toMatch(/[^A-Za-z](startSysopPage\(|\{\s*startSysopPage\s*[,}])/);
  });

  test('awaits the page-wait trigger before falling through to applyPostDoorMenuAction', () => {
    // Important 4 (DD final-review wave, 2026-08-16): the inline
    // postDoorMenuAction(session) decision block was extracted into
    // applyPostDoorMenuAction(socket, session) so the inChat-skip branch
    // is behaviorally testable (see post-door-menu-action.test.ts and
    // apply-post-door-menu-action.test.ts) — this pin follows that rename.
    const body = executeAmigaDoorBody();
    const triggerIdx = body.indexOf('if (pendingSysopPageChatSession)');
    const postActionIdx = body.indexOf('applyPostDoorMenuAction(socket, session)');
    expect(triggerIdx).toBeGreaterThan(-1);
    expect(postActionIdx).toBeGreaterThan(triggerIdx);
    const block = body.slice(triggerIdx, postActionIdx);
    expect(block).toMatch(/await new Promise/);
  });

  test('the outer catch block also clears sysopPagePending/sysopPageChatSessionId (crash-before-flushOutput fallback)', () => {
    const body = executeAmigaDoorBody();
    const catchIdx = body.indexOf('} catch (error) {');
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBlock = body.slice(catchIdx);
    expect(catchBlock).toMatch(/sysopPagePending\s*=\s*false/);
    expect(catchBlock).toMatch(/delete\s+session\.sysopPageChatSessionId/);
  });
});
