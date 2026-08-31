/**
 * Two users starting a 1v1 versus game must end up in the same lobby.
 *
 * Reported live on 2026-08-31: two users, two browsers, both in the
 * GRANDMASTER 1v1 versus lobby, neither seeing the other.
 *
 * The broker's own matching rule is already pinned
 * (sdk/tests/unit/lobby-broker-matchmaking.test.ts) and is correct. This
 * exercises the layer above it - the door's GrandmasterNetworkManager, which
 * is what a real session actually drives: its own NetworkEngine, its own
 * BrokerClient, its own idea of who the local player is. Two of them in one
 * process is exactly what two users on one BBS are.
 */
import * as path from 'path';

const DOOR = path.resolve(__dirname, '../../../../Doors/grandmaster');

/** The shape GrandmasterNetworkManager reads out of a door session. */
function fakeSession(userId: number | string, username: string, node: number) {
  return {
    user: { id: userId, username },
    bbsSession: { nodeNumber: node },
    nodeNumber: node,
  };
}

describe('two users in the 1v1 versus lobby', () => {
  let Manager: any;

  beforeAll(() => {
    // The door is compiled to dist/ and that is what the BBS runs.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Manager = require(path.join(DOOR, 'dist/network/network-manager')).GrandmasterNetworkManager;
  });

  beforeEach(() => {
    // The broker is a globalThis singleton by design; each test needs a
    // clean one or lobbies leak between them.
    delete (globalThis as any)[Symbol.for('aex-lobby-broker')];
  });

  it('land in the same lobby, each seeing the other', async () => {
    const alice = new Manager(fakeSession(101, 'alice', 1));
    const bob = new Manager(fakeSession(102, 'bob', 2));

    await alice.joinQueue('versus_1v1');
    await bob.joinQueue('versus_1v1');

    const aliceState = alice.getMatchState();
    const bobState = bob.getMatchState();

    expect(bobState?.matchId).toBe(aliceState?.matchId);
    expect(bobState?.players?.length).toBe(2);
    // The one who arrived FIRST is the half that reported seeing nobody.
    expect(aliceState?.players?.length).toBe(2);
  });

  it('does not put two users in separate lobbies when the mode matches', async () => {
    const alice = new Manager(fakeSession(201, 'alice', 1));
    const bob = new Manager(fakeSession(202, 'bob', 2));

    await alice.joinQueue('versus_1v1');
    await bob.joinQueue('versus_1v1');

    expect(alice.getMatchState()?.matchId).toBeTruthy();
    expect(bob.getMatchState()?.matchId).toBe(alice.getMatchState()?.matchId);
  });

  it('gives each user a distinct player id', async () => {
    const alice = new Manager(fakeSession(301, 'alice', 1));
    const bob = new Manager(fakeSession(302, 'bob', 2));

    expect(alice.getLocalPlayerId()).not.toBe(bob.getLocalPlayerId());
  });

  it('treats two browsers of ONE account as two players', async () => {
    // The case that was reported, and the one anybody testing multiplayer
    // reaches for first. A player is a SESSION: the same login on two nodes
    // is two seats at two keyboards, and they must be able to play each
    // other. Identity used to be the account alone, so these two came out
    // as the same person and the broker kept them apart on purpose.
    const windowOne = new Manager(fakeSession(500, 'spot', 1));
    const windowTwo = new Manager(fakeSession(500, 'spot', 2));

    expect(windowOne.getLocalPlayerId()).not.toBe(windowTwo.getLocalPlayerId());

    await windowOne.joinQueue('versus_1v1');
    await windowTwo.joinQueue('versus_1v1');

    expect(windowTwo.getMatchState()?.matchId).toBe(windowOne.getMatchState()?.matchId);
    expect(windowOne.getMatchState()?.players?.length).toBe(2);
  });

  it('TELLS the waiting player that somebody joined', async () => {
    // The half that matters for the report. The first player's state being
    // correct is not enough - their screen only redraws when the manager
    // emits, and the lobby widget listens for exactly this event through
    // the adapter. Correct data behind a screen that never repaints looks
    // identical to "they cannot see each other".
    const alice = new Manager(fakeSession(401, 'alice', 1));
    const bob = new Manager(fakeSession(402, 'bob', 2));

    await alice.joinQueue('versus_1v1');

    const seen: any[] = [];
    alice.on('player:joined', (p: any) => seen.push(p));

    await bob.joinQueue('versus_1v1');
    // The broker answers on process.nextTick; let it drain.
    await new Promise((r) => setTimeout(r, 50));

    expect(seen.length).toBeGreaterThan(0);
  });
});
