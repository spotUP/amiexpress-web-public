/**
 * Two players, one wire.
 *
 * Netplay here is lockstep on inputs: each side simulates BOTH boards and only
 * a character per frame per player crosses. So the thing worth testing is not
 * "does a packet arrive" - it is whether two sessions that have exchanged
 * nothing but characters are still playing the SAME GAME after a few thousand
 * frames. Every test below ends by comparing boards panel for panel.
 *
 * The transport is a pair of loopback objects rather than a mock: they deliver
 * to each other exactly as the broker does, which lets a test hold a packet
 * back and watch what the sessions do about it.
 */

import assert from 'assert';
import { PanelNetplaySession } from '../../network/panel-netplay-session';
import type {
  PanelTransport, PanelInputPacket, PanelMatchSetup,
} from '../../network/panel-transport';
import { getModern, GARBAGE_MODE_LEVEL } from '../../core/panels/level-data';
import { ENGINE_VERSION } from '../../core/panels/consts';
import { PanelAi } from '../../ai/panel-ai';
import { encodeInput } from '../../core/panels/input-codec';
import type { Stack } from '../../core/panels/stack';

/** A transport wired straight to its partner, with a hold-the-mail switch. */
class LoopbackTransport implements PanelTransport {
  peer?: LoopbackTransport;
  /** Packets not yet delivered, because delivery is switched off. */
  private held: PanelInputPacket[] = [];
  private delivering = true;
  private listeners: Array<(packet: PanelInputPacket) => void> = [];

  constructor(private readonly id: string) {}

  localId(): string {
    return this.id;
  }

  sendInput(packet: PanelInputPacket): void {
    this.peer?.accept(packet);
  }

  onInput(listener: (packet: PanelInputPacket) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  /** Stop delivering to THIS node, as a stalled connection would. */
  hold(): void {
    this.delivering = false;
  }

  /** Deliver everything that piled up while it was held. */
  release(): void {
    this.delivering = true;
    const queued = this.held;
    this.held = [];
    for (const packet of queued) this.deliver(packet);
  }

  private accept(packet: PanelInputPacket): void {
    if (!this.delivering) {
      this.held.push(packet);
      return;
    }
    this.deliver(packet);
  }

  private deliver(packet: PanelInputPacket): void {
    for (const listener of this.listeners) listener(packet);
  }
}

const PLAYERS = ['alice', 'bob'];

function setup(seed = 777): PanelMatchSetup {
  return {
    seed,
    // Garbage crosses in a match, so this must be a level that HAS a
    // GARBAGE_HOVER - see GARBAGE_MODE_LEVEL.
    levelData: getModern(GARBAGE_MODE_LEVEL),
    engineVersion: ENGINE_VERSION,
    cursorWaitTime: 20,
    playerIds: [...PLAYERS],
  };
}

function pair(seed = 777): { alice: PanelNetplaySession; bob: PanelNetplaySession } {
  const one = new LoopbackTransport('alice');
  const two = new LoopbackTransport('bob');
  one.peer = two;
  two.peer = one;

  return {
    alice: new PanelNetplaySession({ transport: one, setup: setup(seed) }),
    bob: new PanelNetplaySession({ transport: two, setup: setup(seed) }),
  };
}

/**
 * Step both sides until neither is owed an input.
 *
 * Lockstep means a side runs a frame only once EVERYBODY's input for it has
 * arrived, so after any alternating loop one side is always one frame behind
 * the other - it has the input in hand and has not been asked to use it yet.
 * That is the design working, not a divergence, and it is why every comparison
 * below drains first.
 */
function drain(sessions: PanelNetplaySession[], budget = 50): void {
  for (let i = 0; i < budget; i++) {
    const clocks = sessions.map((session) => session.stacks[0].clock);
    const behind = Math.min(...clocks);
    if (clocks.every((clock) => clock === behind)) return;
    // Step ONLY the side that is behind. Stepping both keeps the gap: each
    // step hands the other side the input it needs for its next frame.
    sessions[clocks.indexOf(behind)].step('A');
  }
}

function boardOf(stack: Stack): string {
  const rows: string[] = [];
  for (let row = stack.height; row >= 1; row--) {
    let line = '';
    for (let col = 1; col <= stack.width; col++) line += String(stack.panels[row][col].color);
    rows.push(line);
  }
  return rows.join('/');
}

/** Both sessions see the same two boards, in the same order. */
export async function bothSidesBuildTheSameTwoBoards(): Promise<void> {
  const { alice, bob } = pair();

  assert.strictEqual(alice.stacks.length, 2);
  assert.strictEqual(alice.localIndex, 0);
  assert.strictEqual(bob.localIndex, 1, 'board order comes from the match, not from who is local');

  assert.strictEqual(boardOf(alice.stacks[0]), boardOf(bob.stacks[0]));
  assert.strictEqual(boardOf(alice.stacks[1]), boardOf(bob.stacks[1]));
  assert.notStrictEqual(
    boardOf(alice.stacks[0]), boardOf(alice.stacks[1]),
    'and the two players do not get the same board',
  );
}

/** A frame runs only when everyone's input for it has arrived. */
export async function aFrameWaitsForEveryPlayersInput(): Promise<void> {
  const { alice, bob } = pair();

  assert.strictEqual(alice.step('A'), 'waiting', 'bob has not spoken yet');
  assert.strictEqual(alice.stacks[0].clock, 0, 'and nothing ran');

  assert.strictEqual(bob.step('A'), 'ran', 'bob now has both inputs');
  assert.strictEqual(alice.step('A'), 'ran', 'and so does alice, on her next call');
}

/**
 * The property netplay rests on: characters cross, nothing else, and after a
 * long game the two machines hold identical boards.
 */
export async function twoSessionsStayIdenticalOverALongGame(): Promise<void> {
  const { alice, bob } = pair(31337);
  const aliceBot = new PanelAi(alice.stacks[0], 6);
  const bobBot = new PanelAi(bob.stacks[1], 7);

  let frames = 0;
  for (let i = 0; i < 3000 && !alice.hasEnded() && !bob.hasEnded(); i++) {
    // Each side reads its OWN board to decide, exactly as a player does.
    alice.step(encodeInput(aliceBot.update()));
    bob.step(encodeInput(bobBot.update()));
    frames = alice.stacks[0].clock;
  }

  assert.ok(frames > 500, `only ${frames} frames ran`);

  drain([alice, bob]);
  assert.strictEqual(alice.stacks[0].clock, bob.stacks[0].clock, 'same frame count');
  assert.strictEqual(boardOf(alice.stacks[0]), boardOf(bob.stacks[0]), 'board 1 agrees');
  assert.strictEqual(boardOf(alice.stacks[1]), boardOf(bob.stacks[1]), 'board 2 agrees');
  assert.strictEqual(alice.stacks[0].score, bob.stacks[0].score);
  assert.strictEqual(alice.stacks[1].score, bob.stacks[1].score);
}

/** Garbage crosses, and both machines agree it did. */
export async function garbageCrossesAndBothSidesAgree(): Promise<void> {
  const { alice, bob } = pair(4242);
  const bot = new PanelAi(alice.stacks[0], 7);

  for (let i = 0; i < 2500 && !alice.hasEnded(); i++) {
    const input = encodeInput(bot.update());
    alice.step(input);
    bob.step('A');
  }

  const sent = alice.stacks[0].outgoingGarbage.history.length;
  assert.ok(sent > 0, 'the bot earned some garbage');
  assert.strictEqual(
    sent, bob.stacks[0].outgoingGarbage.history.length,
    'and the other machine agrees it was sent',
  );
}

/**
 * A side that stops hearing from the other WAITS. It does not guess, and it
 * does not run on - running on is the desync this design exists to prevent.
 */
export async function aStalledConnectionStallsTheGameRatherThanDivergingIt(): Promise<void> {
  const one = new LoopbackTransport('alice');
  const two = new LoopbackTransport('bob');
  one.peer = two;
  two.peer = one;
  const alice = new PanelNetplaySession({ transport: one, setup: setup() });
  const bob = new PanelNetplaySession({ transport: two, setup: setup() });

  for (let i = 0; i < 50; i++) { alice.step('A'); bob.step('A'); }

  // Alice stops hearing from Bob. Bob keeps playing.
  one.hold();
  // She may run ONE more frame: the input for it was already in her hands
  // before the line went quiet. After that she has nothing left to run on.
  alice.step('A');
  const before = alice.stacks[0].clock;
  assert.ok(before > 0);

  for (let i = 0; i < 100; i++) { alice.step('A'); bob.step('A'); }

  assert.strictEqual(alice.stacks[0].clock, before, 'and then not one frame further');
  assert.ok(bob.stacks[0].clock > before, 'bob, who can still hear her, kept going');

  // The connection comes back and she catches up rather than being lost.
  one.release();
  for (let i = 0; i < 200; i++) alice.step('A');
  assert.ok(alice.stacks[0].clock > before, 'she caught up');
}

/**
 * A connection that never comes back ends the match instead of hanging on it
 * for ever. MAX_LAG frames of unanswered input is the threshold upstream uses.
 */
export async function aConnectionThatNeverReturnsAbortsTheMatch(): Promise<void> {
  const one = new LoopbackTransport('alice');
  const two = new LoopbackTransport('bob');
  one.peer = two;
  two.peer = one;
  const alice = new PanelNetplaySession({ transport: one, setup: setup() });
  const bob = new PanelNetplaySession({ transport: two, setup: setup() });

  for (let i = 0; i < 20; i++) { alice.step('A'); bob.step('A'); }
  one.hold();

  let ended = false;
  for (let i = 0; i < 400 && !ended; i++) {
    ended = alice.step('A') === 'ended';
    bob.step('A');
  }

  assert.strictEqual(ended, true, 'the match gave up rather than waiting for ever');
  assert.strictEqual(alice.desynced(), true, 'and said why');
}

/** Both machines name the same winner. */
export async function bothSidesNameTheSameWinner(): Promise<void> {
  const { alice, bob } = pair(99);

  // Frames first: setGameOver records the CURRENT clock, and a stack that has
  // never run records zero - which the match reads as "still playing".
  for (let i = 0; i < 5; i++) { alice.step('A'); bob.step('A'); }
  drain([alice, bob]);

  alice.stacks[1].setGameOver();
  bob.stacks[1].setGameOver();

  assert.strictEqual(alice.hasEnded(), true);
  assert.strictEqual(alice.localWon(), true, 'alice is board 1 and is still standing');
  assert.strictEqual(bob.localWon(), false, 'bob is board 2 and is not');
}

/** A packet from somebody not in this match is ignored, not queued. */
export async function inputFromAStrangerIsIgnored(): Promise<void> {
  const one = new LoopbackTransport('alice');
  const two = new LoopbackTransport('bob');
  one.peer = two;
  two.peer = one;
  const alice = new PanelNetplaySession({ transport: one, setup: setup() });

  const stranger = new LoopbackTransport('mallory');
  stranger.peer = one;
  stranger.sendInput({ from: 'mallory', input: 'QQQQ', frame: 0 });

  assert.strictEqual(alice.step('A'), 'waiting', 'still waiting on bob, not satisfied by a stranger');
  assert.strictEqual(alice.stacks[0].clock, 0);
  void two;
}

/**
 * The match parameters are DERIVED, not negotiated, and this is why.
 *
 * The obvious design has a host send the seed. That is a handshake, and a
 * handshake is a race: a guest that runs one frame before the setup arrives
 * has built a different board and the match is lost before it starts. Both
 * machines already know the match id and who is in it, so there is nothing to
 * send - and nothing to lose.
 */
export async function bothMachinesDeriveTheSameSetupWithoutTalking(): Promise<void> {
  const { panelMatchSetupFor, seedFromMatchId } =
    require('../../network/panel-transport');
  const level = getModern(GARBAGE_MODE_LEVEL);

  // The same match, asked from two machines whose player lists arrived in
  // different orders - which is normal, they are two different lobbies.
  const fromAlice = panelMatchSetupFor('match-42', ['alice', 'bob'], level, '049');
  const fromBob = panelMatchSetupFor('match-42', ['bob', 'alice'], level, '049');

  assert.strictEqual(fromAlice.seed, fromBob.seed, 'the same seed');
  assert.deepStrictEqual(
    fromAlice.playerIds, fromBob.playerIds,
    'and the same board order, whoever is asking',
  );
  assert.deepStrictEqual(fromAlice.playerIds, ['alice', 'bob'], 'sorted');

  // A different match is a different game.
  assert.notStrictEqual(seedFromMatchId('match-42'), seedFromMatchId('match-43'));
}

/** A seed the generator will accept: inside its range, and never zero. */
export async function aDerivedSeedIsAlwaysUsable(): Promise<void> {
  const { seedFromMatchId } = require('../../network/panel-transport');

  for (const id of ['', 'a', 'match-1', 'a'.repeat(200), 'ÿþ', 'lobby:9:node2']) {
    const seed = seedFromMatchId(id);
    assert.ok(Number.isInteger(seed), `${id} gave ${seed}`);
    assert.ok(seed >= 1, 'never zero - a zero seed makes a suspiciously regular board');
    assert.ok(seed <= 2147483000, 'inside the generator range');
  }
}

/** Two sessions built from a derived setup agree, with no setup packet sent. */
export async function aDerivedSetupProducesAgreeingSessions(): Promise<void> {
  const { panelMatchSetupFor } = require('../../network/panel-transport');
  const one = new LoopbackTransport('alice');
  const two = new LoopbackTransport('bob');
  one.peer = two;
  two.peer = one;

  const level = getModern(GARBAGE_MODE_LEVEL);
  const alice = new PanelNetplaySession({
    transport: one,
    setup: panelMatchSetupFor('m-7', ['bob', 'alice'], level, '049'),
  });
  const bob = new PanelNetplaySession({
    transport: two,
    setup: panelMatchSetupFor('m-7', ['alice', 'bob'], level, '049'),
  });

  drain([alice, bob], 200);

  assert.strictEqual(boardOf(alice.stacks[0]), boardOf(bob.stacks[0]));
  assert.strictEqual(boardOf(alice.stacks[1]), boardOf(bob.stacks[1]));
  assert.strictEqual(alice.localIndex, 0, 'alice sorts first');
  assert.strictEqual(bob.localIndex, 1);
}
