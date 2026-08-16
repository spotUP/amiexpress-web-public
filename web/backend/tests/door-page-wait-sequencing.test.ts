/**
 * Regression: task 18 (interactive sysop page-wait).
 *
 * FAME/FIM doors (5D_Page) request a sysop page mid-door via
 * CF_InternalCmd "C", which sets session.sysopPagePending (chat.handler.ts's
 * notifySysopPage) WITHOUT running any pager UI — the door still owns the
 * screen. executeAmigaDoor's post-exit path must only start the page-wait
 * (runPendingSysopPageWait) AFTER the door has exited and its output was
 * flushed, and it must never launch PowerPager recursively (startSysopPage
 * would try that via executePagerDoor).
 *
 * Same grep-style approach as door-chain-menu-leak.test.ts because
 * door.handler.ts can't be exercised end-to-end under jest (drags in the
 * BBS subsystem + 68K emulator) — this pins the source-level sequencing
 * instead so a future refactor can't silently move the page-wait back to
 * mid-door or reintroduce a recursive PowerPager launch.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('executeAmigaDoor sysop page-wait sequencing (task 18)', () => {
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

  test('the page-wait check runs after flushOutput(socket), before the "Return to menu" block', () => {
    const window = flushToReturnToMenuBlock(executeAmigaDoorBody());
    expect(window).toMatch(/sysopPagePending/);
    expect(window).toMatch(/runPendingSysopPageWait/);
  });

  test('the page-wait check happens strictly after amigaSession.start() resolves (door has exited)', () => {
    const body = executeAmigaDoorBody();
    const startIdx = body.indexOf('await amigaSession.start()');
    const pendingIdx = body.indexOf('sysopPagePending');
    expect(startIdx).toBeGreaterThan(-1);
    expect(pendingIdx).toBeGreaterThan(startIdx);
  });

  test('does not call startSysopPage from the page-wait block (no recursive PowerPager launch)', () => {
    // The window already ends at "// Return to menu", so slicing from the
    // flag check isolates exactly the if(sysopPagePending) block.
    const window = flushToReturnToMenuBlock(executeAmigaDoorBody());
    const pendingBlockStart = window.indexOf('sysopPagePending');
    expect(pendingBlockStart).toBeGreaterThan(-1);
    const block = window.slice(pendingBlockStart);
    // Match an actual call/import, not the explanatory comment that
    // deliberately names startSysopPage to explain why it's NOT used.
    expect(block).not.toMatch(/[^A-Za-z](startSysopPage\(|\{\s*startSysopPage\s*[,}])/);
  });

  test('awaits the page-wait before falling through to postDoorMenuAction', () => {
    const body = executeAmigaDoorBody();
    const pendingIdx = body.indexOf('sysopPagePending');
    const postActionIdx = body.indexOf('postDoorMenuAction(session)');
    expect(pendingIdx).toBeGreaterThan(-1);
    expect(postActionIdx).toBeGreaterThan(pendingIdx);
    // The pending block must be inside an awaited Promise so the function
    // doesn't race past the animation/timeout before resuming.
    const block = body.slice(pendingIdx, postActionIdx);
    expect(block).toMatch(/await new Promise/);
  });
});
