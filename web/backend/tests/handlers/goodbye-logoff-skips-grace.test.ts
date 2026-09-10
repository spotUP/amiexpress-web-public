/**
 * Structural pins for the ghost-logoff wiring (ghostlogoff 2026-09-10).
 *
 * system-commands.handler.ts and login-post.service.ts pull in the whole
 * BBS subsystem and cannot be unit-loaded under jest (see
 * goodbye-clears-reservation.test.ts for the precedent), so these assert
 * on source shape. The behavior itself is pinned in
 * tests/server/disconnect-grace.test.ts (wantsImmediateTeardown +
 * reclaimGraceGhost) and tests/server/user-already-online-ghosts.test.ts
 * (the refusal).
 */
import * as fs from 'fs';
import * as path from 'path';

const syscmdSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'handlers', 'commands', 'system-commands.handler.ts'),
  'utf8',
);
const socketSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'server', 'socket-handlers.ts'),
  'utf8',
);
const loginSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'services', 'login-post.service.ts'),
  'utf8',
);

function goodbyeBody(): string {
  const start = syscmdSrc.indexOf('export async function handleGoodbyeCommand');
  expect(start).toBeGreaterThan(-1);
  const after = syscmdSrc.slice(start + 10);
  const next = after.search(/\nexport |\nfunction |\nclass /);
  return next === -1 ? after : after.slice(0, next);
}

describe('G marks a deliberate logoff', () => {
  test('the normal-logout path sets session.cleanLogoff', () => {
    expect(goodbyeBody()).toMatch(/session\.cleanLogoff\s*=\s*true/);
  });

  test('the relogon path does not (same socket keeps living)', () => {
    const body = goodbyeBody();
    const relogonAt = body.indexOf('if (session.relogon)');
    const flagAt = body.indexOf('session.cleanLogoff = true');
    expect(relogonAt).toBeGreaterThan(-1);
    expect(flagAt).toBeGreaterThan(-1);
    // The flag is set in the normal-logout fall-through, past the relogon
    // block - which returns early - not on a path that stays connected.
    expect(flagAt).toBeGreaterThan(relogonAt);
    expect(body.slice(relogonAt, flagAt)).toMatch(/return;/);
  });
});

describe('disconnects honor the flag at both grace periods', () => {
  test('the 3 s reconnect wait consults wantsImmediateTeardown', () => {
    expect(socketSrc).toMatch(/wantsImmediateTeardown\(sessionBeforeDelay\)/);
  });

  test('the 15 s disconnect grace consults wantsImmediateTeardown', () => {
    expect(socketSrc).toMatch(/wantsImmediateTeardown\(session\)/);
  });

  test('no raw sysopKicked-only gate remains on either path', () => {
    expect(socketSrc).not.toMatch(/!\s*sessionBeforeDelay\.sysopKicked/);
    expect(socketSrc).not.toMatch(/if\s*\(\s*session\.sysopKicked\s*\)/);
  });
});

describe('fresh login reclaims its own grace-ghost first', () => {
  test('login-post imports reclaimGraceGhost', () => {
    expect(loginSrc).toMatch(/reclaimGraceGhost/);
  });

  test('the reclaim runs before the already-on check', () => {
    const reclaimAt = loginSrc.indexOf('reclaimGraceGhost(userKey');
    const alreadyOnAt = loginSrc.indexOf('userAlreadyOnNode(');
    expect(reclaimAt).toBeGreaterThan(-1);
    expect(alreadyOnAt).toBeGreaterThan(-1);
    expect(reclaimAt).toBeLessThan(alreadyOnAt);
  });
});
