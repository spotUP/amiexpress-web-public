/**
 * One node, one caller, whichever transport hands the node out.
 *
 * Telnet and SSH number their nodes from the live session map
 * (getNextAvailableNodeId). The web takes its node from NodeManager, whose
 * table only ever heard about web callers. So with a telnet caller on node 1,
 * NodeManager still called node 1 free and gave it to the next browser - and
 * per-node routing then delivered the guest's graphics answer `a` into the
 * telnet caller's door and command loop, which ran A: "No file flags /
 * Filename(s) to flag" under the guest's prompt (the sysop, 2026-09-27).
 *
 * The reverse window is real too: a web caller's session reaches the map only
 * after the welcome delay, so a telnet caller arriving in between must see
 * the node NodeManager has already reserved.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});

jest.mock('../../src/database', () => ({
  db: { createNodeSession: jest.fn(async () => {}), updateNodeSession: jest.fn(async () => {}), deleteNodeSession: jest.fn(async () => {}) },
}));

import { nodeManager } from '../../src/services/node-manager.service';
import { getNextAvailableNodeId, sessions } from '../../src/server/session-manager';

describe('one node, one caller', () => {
  const reserved: string[] = [];

  beforeEach(() => sessions.clear());

  afterEach(async () => {
    for (const id of reserved.splice(0)) await nodeManager.releaseSession(id);
    sessions.clear();
  });

  it('does not give a web caller the node a telnet caller holds', async () => {
    const telnetNode = getNextAvailableNodeId();
    sessions.set(`telnet-${telnetNode}-1`, { nodeId: telnetNode } as any);

    const web = await nodeManager.assignSessionToNode('web-a', 'sock-a');
    reserved.push('web-a');

    expect(web.nodeId).not.toBe(telnetNode);
  });

  it('does not give a telnet caller the node a web caller has reserved', async () => {
    const web = await nodeManager.assignSessionToNode('web-b', 'sock-b');
    reserved.push('web-b');

    // The web session is not in the map yet - the welcome delay.
    expect(getNextAvailableNodeId()).not.toBe(web.nodeId);
  });

  it('still hands out node 1 when nobody holds anything', async () => {
    expect(getNextAvailableNodeId()).toBe(1);
  });
});
