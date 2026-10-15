import { decideAdminSocket, SYSOP_SECURITY_LEVEL } from '../../src/server/admin-socket';

/**
 * The admin dashboard holds a socket open for as long as it is on screen. If
 * that socket is treated as a caller it is handed a real BBS node and the
 * welcome sequence, which is what happened to every visit to Operator Chat:
 * a node consumed and a phantom user in node status.
 */
describe('admin dashboard sockets', () => {
  const sysop = { id: 1, username: 'SPOT', secLevel: SYSOP_SECURITY_LEVEL };

  it('serves a sysop asking for a dashboard socket without a node', () => {
    const decision = decideAdminSocket({ adminOnly: 'true' }, sysop);

    expect(decision.serveAsAdmin).toBe(true);
    expect(decision.refusedReason).toBeUndefined();
  });

  it('joins the admin room, which import progress has always been emitted to', () => {
    const decision = decideAdminSocket({ adminOnly: 'true' }, sysop);

    expect(decision.rooms).toContain('admin');
    expect(decision.rooms).toContain('user:1');
  });

  it('refuses a caller who passes the flag without sysop level', () => {
    // The query string is a request; the level decides. A refused socket
    // continues as an ordinary BBS connection rather than getting a silent
    // privileged one.
    const decision = decideAdminSocket({ adminOnly: 'true' }, { id: 7, username: 'GUEST', secLevel: 20 });

    expect(decision.serveAsAdmin).toBe(false);
    expect(decision.rooms).toEqual([]);
    expect(decision.refusedReason).toContain('20');
  });

  it('refuses a socket with no session at all', () => {
    const decision = decideAdminSocket({ adminOnly: 'true' }, undefined);

    expect(decision.serveAsAdmin).toBe(false);
    expect(decision.refusedReason).toContain('none');
  });

  it('leaves every other connection alone', () => {
    expect(decideAdminSocket(undefined, sysop).serveAsAdmin).toBe(false);
    expect(decideAdminSocket({}, sysop).serveAsAdmin).toBe(false);
    expect(decideAdminSocket({ chatOnly: 'true' }, sysop).serveAsAdmin).toBe(false);
    // No refusal is logged for a connection that never asked.
    expect(decideAdminSocket({}, sysop).refusedReason).toBeUndefined();
  });

  it('does not accept a truthy-looking value that is not the flag', () => {
    expect(decideAdminSocket({ adminOnly: '1' }, sysop).serveAsAdmin).toBe(false);
    expect(decideAdminSocket({ adminOnly: true }, sysop).serveAsAdmin).toBe(false);
  });
});
