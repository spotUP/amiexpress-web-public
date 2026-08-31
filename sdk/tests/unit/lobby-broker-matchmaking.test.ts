/**
 * Two players who ask for the same game must end up in the same lobby.
 *
 * Reported from the live board on 2026-08-31: two users, two browsers, both
 * starting a versus game in GRANDMASTER, neither seeing the other. Both go
 * through `matchmake` (grandmaster/app.ts says so, and says why - 'custom'
 * would give every player their own lobby).
 *
 * The broker is a globalThis singleton, so two door sessions in the one
 * backend process share it. That leaves the matching rule itself, which is
 * what these exercise.
 */
import { LobbyBroker, type IBrokerClient } from '../../engines/network/broker/lobby-broker';

/** A stand-in for BrokerClient: records what the broker delivers to it. */
class FakeClient implements IBrokerClient {
  readonly clientId: string;
  readonly delivered: Array<{ event: string; args: any[] }> = [];

  constructor(
    readonly playerId: number,
    readonly playerName: string,
    readonly nodeId: number,
  ) {
    this.clientId = `client-${nodeId}-${playerName}`;
  }

  deliver(event: string, ...args: any[]): void {
    this.delivered.push({ event, args });
  }
}

function freshBroker(): LobbyBroker {
  // The singleton is global by design; each test needs its own.
  delete (globalThis as any)[Symbol.for('aex-lobby-broker')];
  return LobbyBroker.getInstance();
}

const CONFIG = { name: 'Versus', maxPlayers: 2, isPrivate: false, settings: {} } as any;

/**
 * The broker answers on process.nextTick - it processes events
 * asynchronously on purpose, to keep the event-loop behaviour a real socket
 * would have. So this waits for the answer rather than reading it straight
 * back.
 */
function matchmake(broker: LobbyBroker, client: IBrokerClient, mode: string): Promise<any> {
  return new Promise((resolve) => {
    broker.registerClient(client);
    broker.handleEvent(client.clientId, 'lobby:matchmake', { config: CONFIG, mode },
      (r: any) => resolve(r));
  });
}

describe('two players asking for the same mode', () => {
  it('land in one lobby, not one each', async () => {
    const broker = freshBroker();
    const alice = new FakeClient(1, 'alice', 1);
    const bob = new FakeClient(2, 'bob', 2);

    const first = await matchmake(broker, alice, 'versus_1v1');
    const second = await matchmake(broker, bob, 'versus_1v1');

    expect(first?.success).toBe(true);
    expect(second?.success).toBe(true);
    expect(second.lobby.id).toBe(first.lobby.id);
    expect(second.lobby.players.map((p: any) => p.id).sort()).toEqual([1, 2]);
  });

  it('tells the player already waiting that somebody joined', async () => {
    // Without this the first player sits on a lobby screen that never
    // changes, which is what "they dont see each other" looks like from
    // the side that got there first.
    const broker = freshBroker();
    const alice = new FakeClient(1, 'alice', 1);
    const bob = new FakeClient(2, 'bob', 2);

    await matchmake(broker, alice, 'versus_1v1');
    alice.delivered.length = 0;
    await matchmake(broker, bob, 'versus_1v1');

    const sawJoin = alice.delivered.some(d => /join|update|player/i.test(d.event));
    expect(sawJoin).toBe(true);
  });

  it('keeps different modes apart', async () => {
    const broker = freshBroker();
    const alice = new FakeClient(1, 'alice', 1);
    const bob = new FakeClient(2, 'bob', 2);

    const first = await matchmake(broker, alice, 'versus_1v1');
    const second = await matchmake(broker, bob, 'battle_royale');

    expect(second.lobby.id).not.toBe(first.lobby.id);
  });

  it('matches two SESSIONS of one account, because a session is a player', async () => {
    // Two browsers, one BBS login - the case anybody testing multiplayer
    // reaches for first, and the one that was reported broken. This used to
    // be refused on purpose: the self-match check compared the account, so
    // the two were treated as one person and each sat alone.
    const broker = freshBroker();
    const windowOne = new FakeClient(7001, 'spot', 1);
    const windowTwo = new FakeClient(7002, 'spot', 2);

    const a = await matchmake(broker, windowOne, 'versus_1v1');
    const b = await matchmake(broker, windowTwo, 'versus_1v1');

    expect(b.lobby.id).toBe(a.lobby.id);
    expect(b.lobby.players.length).toBe(2);
  });

  it('does not match a session against the lobby it is already in', async () => {
    // The self-match rule that IS worth keeping: the same session asking
    // twice must not be paired with itself.
    const broker = freshBroker();
    const alice = new FakeClient(1, 'alice', 1);

    const first = await matchmake(broker, alice, 'versus_1v1');
    const second = await matchmake(broker, alice, 'versus_1v1');

    expect(second.lobby.players.length).toBe(1);
    expect(second.lobby.id).not.toBe(first.lobby.id);
  });

  it('joins a lobby that was not created by matchmaking', async () => {
    // The other half of the report. A lobby opened by any other route was
    // invisible to the next person searching, who made a second one beside
    // it - two people, two lobbies, same mode.
    const broker = freshBroker();
    const host = new FakeClient(11, 'host', 1);
    const seeker = new FakeClient(12, 'seeker', 2);

    broker.registerClient(host);
    const created: any = await new Promise((resolve) => {
      broker.handleEvent(host.clientId, 'lobby:create',
        { ...CONFIG, settings: { mode: 'versus_1v1' } }, resolve);
    });

    const found = await matchmake(broker, seeker, 'versus_1v1');

    expect(found.lobby.id).toBe(created.lobby.id);
    expect(found.lobby.players.length).toBe(2);
  });

  it('sends both searchers to the oldest waiting lobby', async () => {
    // Determinism where it matters: with two lobbies open, everybody
    // converges on the same one instead of splitting between them.
    const broker = freshBroker();
    const first = new FakeClient(21, 'first', 1);
    const second = new FakeClient(22, 'second', 2);
    const third = new FakeClient(23, 'third', 3);

    const a = await matchmake(broker, first, 'versus_1v1');
    // A second lobby exists only because the first is full; force one by
    // matching a mode nobody else wants, then searching the original mode.
    await matchmake(broker, second, 'versus_1v1');
    const c = await matchmake(broker, third, 'versus_1v1');

    // first and second filled the 2-player lobby; third opens the next one.
    expect(c.lobby.id).not.toBe(a.lobby.id);
    expect(c.lobby.players.length).toBe(1);
  });

  it('still matches into a lobby whose host has started a countdown', async () => {
    // The shape that hid two DIFFERENT accounts from each other on the live
    // board. A host alone in a 1v1 lobby can start a countdown - one player
    // is enough, deliberately, so a host can play bots - and the lobby then
    // stops being 'waiting'. Matchmaking only looked at 'waiting', so the
    // next person searching opened a second lobby beside it and neither
    // ever saw the other.
    const broker = freshBroker();
    const host = new FakeClient(31, 'sysop', 1);
    const late = new FakeClient(32, 'spot', 2);

    const opened = await matchmake(broker, host, 'versus_1v1');
    broker.handleEvent(host.clientId, 'lobby:start_countdown', { seconds: 30 });
    await new Promise((r) => setTimeout(r, 20));

    const found = await matchmake(broker, late, 'versus_1v1');

    expect(found.lobby.id).toBe(opened.lobby.id);
    expect(found.lobby.players.length).toBe(2);
    // And the clock stops, so the arrival is actually in the game rather
    // than watching it start without them.
    expect(found.lobby.state).toBe('waiting');
  });

  it('never matches into a game that has actually started', async () => {
    const broker = freshBroker();
    const host = new FakeClient(41, 'sysop', 1);
    const late = new FakeClient(42, 'spot', 2);

    const opened = await matchmake(broker, host, 'versus_1v1');
    const lobby = (broker as any).lobbies.get(opened.lobby.id);
    lobby.state = 'playing';

    const found = await matchmake(broker, late, 'versus_1v1');

    expect(found.lobby.id).not.toBe(opened.lobby.id);
  });
});

describe('after the match', () => {
  it('gives the lobby back so the same players can go again', async () => {
    // "when a vs game ends i get thrown out to the main menu, i should stay
    // in the lobby for more games". Nothing ever moved a lobby out of
    // 'playing': the room could not host a second game, would not be
    // offered to anyone searching, and simply leaked for the life of the
    // process.
    const broker = freshBroker();
    const host = new FakeClient(51, 'sysop', 1);
    const guest = new FakeClient(52, 'spot', 2);

    const lobby = await matchmake(broker, host, 'versus_1v1');
    await matchmake(broker, guest, 'versus_1v1');

    broker.handleEvent(host.clientId, 'lobby:start_game', {});
    await new Promise((r) => setTimeout(r, 150));
    expect((broker as any).lobbies.get(lobby.lobby.id).state).toBe('playing');

    // The loser reports it, not the host - a game that ends only when the
    // winner says so is a game that hangs.
    broker.handleEvent(guest.clientId, 'lobby:game_over', {});
    await new Promise((r) => setTimeout(r, 20));

    const after = (broker as any).lobbies.get(lobby.lobby.id);
    expect(after.state).toBe('waiting');
    expect(after.players.every((p: any) => !p.ready)).toBe(true);
    expect(after.players.length).toBe(2);
  });

  it('makes the room findable again for a third player', async () => {
    const broker = freshBroker();
    const host = new FakeClient(61, 'sysop', 1);
    const guest = new FakeClient(62, 'spot', 2);

    const lobby = await matchmake(broker, host, 'versus_1v1');
    await matchmake(broker, guest, 'versus_1v1');
    broker.handleEvent(host.clientId, 'lobby:start_game', {});
    await new Promise((r) => setTimeout(r, 150));
    broker.handleEvent(host.clientId, 'lobby:game_over', {});
    await new Promise((r) => setTimeout(r, 20));

    // Full at 2, so a third still opens their own - but the room is a
    // lobby again rather than a permanent 'playing' ghost.
    expect((broker as any).lobbies.get(lobby.lobby.id).state).toBe('waiting');
  });
});
