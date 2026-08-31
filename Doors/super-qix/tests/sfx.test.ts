/**
 * The sounds the game asks for.
 *
 * Separate from the music, which the client polls for: a track is a state
 * and can be asked about, an effect is an event and an event asked about a
 * second late has already gone.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The engine pushes
 * names into `engine.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * The rejoin multiplier is the one that matters most: it is worth 20x or
 * 30x, it is invisible on the board, and the sound is the only way a player
 * learns they managed one.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { QixEngine } from '../game/qix-engine';
import { SuperQixData, Direction } from '../game/types';
import {
  FIELD_WIDTH, FIELD_HEIGHT, STARTING_LIVES, EXTRA_LIFE_PERCENT,
} from '../game/constants';

function createData(): SuperQixData {
  return {
    state: 'menu', score: 0, lives: STARTING_LIVES, level: 1,
    claimedPercent: 0, targetPercent: 75, scoreMultiplier: 1,
    field: [], fieldWidth: FIELD_WIDTH, fieldHeight: FIELD_HEIGHT,
    marker: {
      x: 0, y: 0, isDrawing: false, drawSpeed: null,
      hasShield: false, speedBoost: false, speedBoostTimer: 0,
    },
    currentStix: null,
    qixList: [], sparxList: [], fuse: null, qixIdCounter: 0, sparxIdCounter: 0,
    powerUps: [], powerUpIdCounter: 0, collectedLetters: [], levelWord: '',
    activeEffects: [], borderPath: [], internalLines: [],
    highscores: [], menuSelection: 0, playerName: '', playerNameCursor: 0,
    lastUpdateTime: Date.now(), frameCount: 0, levelStartTime: Date.now(),
    stopTimer: 0, gremlinsCaptured: 0, timeMeter: 0, warp: null,
    transitionTimer: 0, transitionMessage: '',
  };
}

/** A level under way with nothing hunting the marker. */
function startedEngine(): { engine: QixEngine; data: SuperQixData } {
  const data = createData();
  const engine = new QixEngine(data, () => { /* no display in tests */ });
  engine.initLevel(1);
  data.state = 'playing';
  data.sparxList = [];
  data.qixList = [];
  data.powerUps = [];
  engine.cues.clear();
  return { engine, data };
}

/** Bypasses the move-rate throttle so a test can step deterministically. */
function move(engine: QixEngine, dir: Direction): void {
  (engine as any).lastMoveTime = 0;
  engine.handleDirection(dir);
}

/** Leaving the edge is the moment the player becomes vulnerable. */
export async function startingALineSounds(): Promise<void> {
  const { engine } = startedEngine();

  engine.handleDraw();

  assert.deepStrictEqual(engine.cues.drain(), ['switch']);
}

/** Asking to draw while already drawing changes nothing, and says nothing. */
export async function drawingWhileAlreadyDrawingIsSilent(): Promise<void> {
  const { engine } = startedEngine();
  engine.handleDraw();
  engine.cues.clear();

  engine.handleDraw();

  assert.deepStrictEqual(engine.cues.drain(), []);
}

/** Claiming ground is the sound the whole game is played for. */
export async function claimingGroundSounds(): Promise<void> {
  const { engine, data } = startedEngine();

  // Out from the bottom edge, across, and back to it: a closed area.
  engine.handleDraw();
  for (let i = 0; i < 4; i++) move(engine, 'up');
  for (let i = 0; i < 4; i++) move(engine, 'left');
  for (let i = 0; i < 4; i++) move(engine, 'down');

  assert.ok(data.claimedPercent > 0, 'ground was actually claimed');
  assert.ok(engine.cues.pending.includes('success'), 'and it was heard');
}

/**
 * A rejoin close to where the line started pays 20x, and it is invisible.
 * The sound is the only feedback the player gets.
 */
export async function aRejoinMultiplierSounds(): Promise<void> {
  const { engine, data } = startedEngine();

  engine.handleDraw();
  move(engine, 'up');
  move(engine, 'left');
  move(engine, 'down');

  // scoreMultiplier is spent on the claim that earned it and reset to 1,
  // so lastMultiplier is what records that one was earned at all.
  assert.ok(data.lastMultiplier > 1, 'the multiplier was actually earned');
  assert.ok(engine.cues.pending.includes('powerup'), 'and it announced itself');
}

/** Dying. */
export async function dyingSounds(): Promise<void> {
  const { engine } = startedEngine();

  (engine as any).handleDeath();

  assert.ok(engine.cues.pending.includes('death'));
}

/** Losing the last life ends the game audibly. */
export async function losingTheLastLifeSoundsGameOver(): Promise<void> {
  const { engine, data } = startedEngine();
  data.lives = 1;

  (engine as any).handleDeath();

  assert.strictEqual(data.state, 'gameover');
  assert.deepStrictEqual(engine.cues.drain(), ['death', 'gameover']);
}

/** Clearing the target, and the 98% bonus life on top of it. */
export async function finishingALevelSoundsAndPaysItsBonusLife(): Promise<void> {
  const plain = startedEngine();
  plain.data.claimedPercent = 80;
  (plain.engine as any).levelComplete();

  const perfect = startedEngine();
  perfect.data.claimedPercent = EXTRA_LIFE_PERCENT;
  (perfect.engine as any).levelComplete();

  const plainCues = plain.engine.cues.drain();
  const perfectCues = perfect.engine.cues.drain();

  assert.ok(plainCues.includes('level-up'), 'the level is finished');
  assert.ok(!plainCues.includes('1up'), 'but 80% earns no free marker');
  assert.ok(perfectCues.includes('1up'), '98% does');
}

/** A power-up the engine never sees is still heard: its cues are drained. */
export async function powerUpCuesReachTheEnginesQueue(): Promise<void> {
  const { engine } = startedEngine();
  const powerUps = (engine as any).powerUpSystem;

  powerUps.cues.push('powerup');
  engine.update();

  assert.ok(
    engine.cues.pending.includes('powerup'),
    'the engine drains the power-up system into its own queue'
  );
}

/** An undrained queue stays bounded, so attract mode neither sounds nor leaks. */
export async function anUndrainedQueueStaysBounded(): Promise<void> {
  const { engine, data } = startedEngine();

  for (let i = 0; i < 200; i++) {
    data.marker.isDrawing = false;
    data.currentStix = null;
    engine.handleDraw();
  }

  assert.ok(engine.cues.pending.length <= 32, 'the cue queue is capped');
}

/**
 * The effects are sent to a reverb AND an echo: wet, but short.
 *
 * Two corrections, in opposite directions, and this holds the band between
 * them.
 *
 * First pass was reported as needing "much more echo/reverb/wetness". Part
 * of why it was so dry is structural: the SDK builds ONE parallel send at
 * max(reverb.wet, echo.wet), and no echo was declared at all, so the send
 * carried nothing but the reverb wash. Hence the floor on both wets.
 *
 * Second pass was reported as "way too long tails". That is a DIFFERENT
 * knob - decay and feedback, not wet - so the ceiling here is on those, and
 * the wetness floor stays where it is. Anyone tuning this again should move
 * decay and feedback, and leave wet alone.
 */
export async function theEffectsAreSentWetToBothReverbAndEcho(): Promise<void> {
  const client = readFileSync(join(__dirname, '..', 'client.ts'), 'utf8');

  const reverbWet = /sfxReverb:\s*\{[^}]*wet:\s*([\d.]+)/.exec(client);
  const echoWet = /sfxEcho:\s*\{[^}]*wet:\s*([\d.]+)/.exec(client);
  const decay = /sfxReverb:\s*\{[^}]*decay:\s*([\d.]+)/.exec(client);
  const feedback = /sfxEcho:\s*\{[^}]*feedback:\s*([\d.]+)/.exec(client);

  assert.ok(reverbWet, 'the client should ask for a reverb send');
  assert.ok(echoWet, 'and an echo send - the send level is the max of the two');
  assert.ok(decay, 'the reverb needs a tail length');
  assert.ok(feedback, 'and the echo needs repeats');

  // Wet enough to hear.
  assert.ok(
    Number(reverbWet![1]) >= 0.7,
    `reverb send is ${reverbWet![1]}; below 0.7 it was reported as too dry`
  );
  assert.ok(
    Number(echoWet![1]) >= 0.7,
    `echo send is ${echoWet![1]}; below 0.7 it was reported as too dry`
  );

  // Short enough not to ring into the next event.
  assert.ok(
    Number(decay![1]) <= 2.5,
    `a ${decay![1]}s tail was reported as way too long`
  );
  assert.ok(
    Number(feedback![1]) > 0 && Number(feedback![1]) <= 0.3,
    `echo feedback ${feedback![1]} should give a couple of repeats, not a cloud`
  );
}
