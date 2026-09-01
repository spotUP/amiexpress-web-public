/**
 * Regression test for A-3 logoff clear (express.e:8213).
 *
 * After a user logs off, the per-node reservation must be cleared so the
 * next caller isn't blocked by a stale reservation pointing at the user
 * who just left. express.e does this in writeLogoff at line 8213
 * (StrCopy(reservedName,'')).
 *
 * Pinning at handleGoodbyeCommand level: when called with a session that
 * carries a nodeId AND that node has a reservation, the reservation is
 * removed from the per-node service before the disconnect emit.
 *
 * Same grep-style structural test as the other audit closures —
 * system-commands.handler.ts pulls in the entire BBS subsystem and
 * can't be unit-loaded cleanly under jest.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('handleGoodbyeCommand clears node reservation on logoff (A-3, express.e:8213)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'handlers', 'commands', 'system-commands.handler.ts'),
    'utf8'
  );

  test('imports clearNodeReservation from node-reservation.service', () => {
    expect(src).toMatch(
      /clearNodeReservation[\s\S]{0,80}?from\s*['"][^'"]*node-reservation\.service['"]|require\(['"][^'"]*node-reservation\.service['"]\)[\s\S]{0,80}?clearNodeReservation/
    );
  });

  /**
   * The source of handleGoodbyeCommand, from its signature to the next
   * top-level declaration.
   *
   * This used to be a regex with a hard `{0,8000}` cap, which is a trap: the
   * function grew to 8101 characters and the match silently became null, so
   * both tests below failed reporting "expected not null" - saying nothing
   * about clearNodeReservation, which was still there and still correct.
   * Slicing to the next declaration cannot go stale that way.
   */
  function goodbyeBody(): string {
    const start = src.indexOf('export async function handleGoodbyeCommand');
    expect(start).toBeGreaterThan(-1);
    const after = src.slice(start + 10);
    const next = after.search(/\nexport |\nfunction |\nclass /);
    return next === -1 ? after : after.slice(0, next);
  }

  test('handleGoodbyeCommand body calls clearNodeReservation(session.nodeId)', () => {
    const block = [goodbyeBody()];
    expect(block[0].length).toBeGreaterThan(0);
    expect(block[0]).toMatch(
      /clearNodeReservation\(\s*session\.nodeId[^)]*\)/
    );
  });

  test('cites express.e:8213 for the clear call', () => {
    expect(goodbyeBody()).toMatch(/express\.e:8213/);
  });
});
