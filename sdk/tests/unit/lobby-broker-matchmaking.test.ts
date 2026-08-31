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

  it('does not match a player against themselves', async () => {
    // The same user opening the door twice - two sessions, one BBS account.
    const broker = freshBroker();
    const first = new FakeClient(7, 'spot', 1);
    const again = new FakeClient(7, 'spot', 2);

    const a = await matchmake(broker, first, 'versus_1v1');
    const b = await matchmake(broker, again, 'versus_1v1');

    expect(b.lobby.id).not.toBe(a.lobby.id);
  });
});
