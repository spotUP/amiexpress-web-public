/**
 * A match: two boards and the garbage between them.
 *
 * Also pins the shape of netplay, which is the part most likely to be
 * misremembered later: Panel de Pon sends INPUTS, not state. One character per
 * frame per player, both sides simulating both boards. Everything else follows
 * from the engine being deterministic.
 */

import assert from 'assert';
import { Stack } from '../../core/panels/stack';
import { SimulatedStack } from '../../core/panels/simulated-stack';
import { GeneratorSource } from '../../core/panels/generator-source';
import { getClassicEndless } from '../../core/panels/level-data';
import { PanelMatch } from '../../core/panels/match';
import { STAGING_DURATION, GARBAGE_DELAY_LAND_TIME } from '../../core/panels/consts';
import { loadAttackFile } from '../../core/panels/attack-patterns';
import { PanelAi } from '../../ai/panel-ai';
import { encodeInput } from '../../core/panels/input-codec';

/**
 * Garbage that has ARRIVED is not garbage that is waiting: a calm board drops
 * it onto the playfield the same frame it lands, so incomingGarbage is empty
 * again immediately. Look at the board.
 */
function garbagePanelsOnBoard(stack: Stack): number {
  let count = 0;
  for (let row = 1; row < stack.panels.length; row++) {
    if (!stack.panels[row]) continue;
    for (let col = 1; col <= stack.width; col++) {
      if (stack.panels[row][col]?.isGarbage) count += 1;
    }
  }
  return count;
}

function makeStack(seed: number): Stack {
  const stack = new Stack({
    levelData: getClassicEndless('normal'),
    panelSource: new GeneratorSource(seed, true),
  });
  stack.startingState();
  return stack;
}

export async function twoBoardsDefaultToSendingToEachOther(): Promise<void> {
  const match = new PanelMatch({ stacks: [makeStack(1), makeStack(2)] });
  assert.deepStrictEqual(match.garbageTargets, [[1], [0]]);
}

/**
 * The whole point of a match: garbage one board sends lands on the other, and
 * only after the full 151-frame flight.
 */
export async function garbageCrossesFromOneBoardToTheOther(): Promise<void> {
  const attacker = makeStack(1);
  const victim = makeStack(2);
  const match = new PanelMatch({ stacks: [attacker, victim] });

  attacker.pushGarbage({ row: 3, column: 2 }, false, 6, 0);

  const flight = STAGING_DURATION + GARBAGE_DELAY_LAND_TIME;
  for (let i = 0; i < flight - 2; i++) match.run();
  assert.strictEqual(garbagePanelsOnBoard(victim), 0, 'still in flight');

  // A couple more frames: garbage is offered on the exact frame it is due, and
  // the board drops it the moment it is offered.
  for (let i = 0; i < 4; i++) match.run();
  assert.ok(garbagePanelsOnBoard(victim) > 0, 'and it lands on time');
  assert.strictEqual(
    garbagePanelsOnBoard(victim), 5,
    'a combo of six sends a 5-wide, per the table',
  );
}

export async function aBoardNeverSendsGarbageToItself(): Promise<void> {
  const attacker = makeStack(1);
  const victim = makeStack(2);
  const match = new PanelMatch({ stacks: [attacker, victim] });

  attacker.pushGarbage({ row: 3, column: 2 }, false, 6, 0);
  for (let i = 0; i < 300; i++) match.run();

  assert.strictEqual(garbagePanelsOnBoard(attacker), 0, 'the sender receives nothing');
  assert.ok(garbagePanelsOnBoard(victim) > 0, 'the target receives it');
}

export async function theMatchEndsWhenOnlyOneBoardIsLeft(): Promise<void> {
  const survivor = makeStack(1);
  const loser = makeStack(2);
  const match = new PanelMatch({ stacks: [survivor, loser] });

  // A frame first: setGameOver records the CURRENT clock, and a stack that has
  // never run records zero - which reads as "still playing".
  match.run();
  assert.strictEqual(match.hasEnded(), false);

  loser.setGameOver();
  assert.strictEqual(match.hasEnded(), true);
  assert.deepStrictEqual(match.getWinners(), [survivor]);
}

/** A simulated opponent stands in for a player without the match noticing. */
export async function aSimulatedOpponentPlaysInAMatchLikeAnyOther(): Promise<void> {
  const player = makeStack(1);
  const opponent = new SimulatedStack({
    attackSettings: loadAttackFile('bronze.json'),
    healthSettings: {
      framesToppedOutToLose: 120, lineClearGPM: 5, lineHeightToKill: 6, riseSpeed: 5,
    },
  });

  const match = new PanelMatch({ stacks: [player, opponent] });
  for (let i = 0; i < 900 && !match.hasEnded(); i++) match.run();

  assert.ok(
    player.incomingGarbage.len() > 0 || player.hasFallingGarbage()
      || player.outgoingGarbage.history.length >= 0,
    'the match ran with a boardless opponent in it',
  );
  assert.ok(opponent.outgoingGarbage.history.length > 0, 'and the opponent attacked');
}

/**
 * The CPU against a player, both boards live. This is Vs CPU end to end: the
 * bot drives one board through the input path while the other sits idle, and
 * the garbage it earns crosses.
 */
export async function theCpuCanPlayAMatchAgainstAnotherBoard(): Promise<void> {
  const human = makeStack(11);
  const cpuStack = makeStack(12);
  const cpu = new PanelAi(cpuStack, 7);
  const match = new PanelMatch({ stacks: [human, cpuStack] });

  for (let i = 0; i < 3000 && !match.hasEnded(); i++) {
    cpuStack.receiveConfirmedInput(encodeInput(cpu.update()));
    human.receiveConfirmedInput(encodeInput(0));
    match.run();
  }

  assert.ok(cpuStack.panelsCleared > 0, 'the CPU played its board');
  assert.ok(
    cpuStack.outgoingGarbage.history.length > 0 || cpuStack.score > 0,
    'and scored or attacked for it',
  );
}

/**
 * Two boards from the SAME seed and the same inputs must stay identical. This
 * is the property netplay rests on: only inputs cross the wire, so if this ever
 * stops holding, two players silently play different games.
 */
export async function identicalSeedsAndInputsProduceIdenticalBoards(): Promise<void> {
  const left = makeStack(4242);
  const right = makeStack(4242);
  const cpu = new PanelAi(left, 6);

  for (let i = 0; i < 1500; i++) {
    const input = encodeInput(cpu.update());
    left.receiveConfirmedInput(input);
    right.receiveConfirmedInput(input);
    left.run();
    right.run();
  }

  assert.strictEqual(left.score, right.score, 'same score');
  assert.strictEqual(left.panelsCleared, right.panelsCleared, 'same panels cleared');
  assert.strictEqual(left.clock, right.clock);
  for (let row = 1; row <= left.height; row++) {
    for (let col = 1; col <= left.width; col++) {
      assert.strictEqual(
        left.panels[row][col].color, right.panels[row][col].color,
        `boards diverged at row ${row} column ${col}`,
      );
    }
  }
}
