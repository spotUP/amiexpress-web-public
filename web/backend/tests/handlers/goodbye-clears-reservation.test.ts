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

  test('handleGoodbyeCommand body calls clearNodeReservation(session.nodeId)', () => {
    // Find handleGoodbyeCommand body (until next export or end-of-function).
    const block = src.match(
      /export async function handleGoodbyeCommand[\s\S]{0,8000}?(?=\nexport |\nfunction |\nclass |$)/
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(
      /clearNodeReservation\(\s*session\.nodeId[^)]*\)/
    );
  });

  test('cites express.e:8213 for the clear call', () => {
    const block = src.match(
      /export async function handleGoodbyeCommand[\s\S]{0,8000}?(?=\nexport |\nfunction |\nclass |$)/
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/express\.e:8213/);
  });
});
