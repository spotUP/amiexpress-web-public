/**
 * Which music plays where.
 *
 * Two tracks were chosen for this door: "the cruel king of vendelos" in the
 * round itself, and greensleevesFIN2 everywhere else. Kept pure and separate
 * from the client, like Arkanoid's music-select, so it can be tested without
 * a browser and cannot drift from what is on screen.
 */

import assert from 'assert';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { trackForState, IN_GAME_TRACK, EVERYWHERE_ELSE_TRACK } from '../music-select';
import { GameState } from '../game/types';

const ASSETS = join(__dirname, '..', 'assets');

/** The round itself gets the in-game track. */
export async function theRoundGetsTheInGameTrack(): Promise<void> {
  assert.strictEqual(trackForState('playing'), IN_GAME_TRACK);
}

/**
 * Pausing keeps it.
 *
 * A pause is a moment inside the round, not a departure from it. Swapping
 * tracks under a pause would make a two-second breather restart the music.
 */
export async function pausingKeepsTheInGameTrack(): Promise<void> {
  assert.strictEqual(trackForState('paused'), IN_GAME_TRACK);
}

/** Everything else gets the other one. */
export async function everywhereElseGetsTheOtherTrack(): Promise<void> {
  const elsewhere: GameState[] = [
    'menu', 'highscores', 'enterName', 'gameover',
    'levelTransition', 'levelComplete', 'remapKeys', 'attract',
  ];

  for (const state of elsewhere) {
    assert.strictEqual(
      trackForState(state), EVERYWHERE_ELSE_TRACK,
      `${state} should play the out-of-game track`
    );
  }
}

/** Every state the door can be in has music - there is no silent screen. */
export async function everyStateHasATrack(): Promise<void> {
  const states: GameState[] = [
    'menu', 'playing', 'paused', 'levelComplete', 'gameover',
    'highscores', 'enterName', 'remapKeys', 'attract', 'levelTransition',
  ];

  for (const state of states) {
    const track = trackForState(state);
    assert.ok(track, `${state} has no track`);
    assert.ok(
      track === IN_GAME_TRACK || track === EVERYWHERE_ELSE_TRACK,
      `${state} asked for ${track}, which is not one of the door's two tracks`
    );
  }
}

/**
 * The tracks are actually shipped, and are actually tracker modules.
 *
 * The client fetches these by name from the door's assets, so a missing or
 * truncated file is silence with no error anywhere the player can see.
 */
export async function bothTracksAreShippedAndPlayable(): Promise<void> {
  for (const name of [IN_GAME_TRACK, EVERYWHERE_ELSE_TRACK]) {
    const path = join(ASSETS, name);
    assert.ok(existsSync(path), `${name} is not in the door's assets`);

    const head = readFileSync(path).subarray(0, 17).toString('latin1');
    assert.strictEqual(
      head, 'Extended Module: ',
      `${name} does not start with an XM header - it is not a tracker module`
    );
  }
}

/** The two tracks are different files, not the same one twice. */
export async function theTwoTracksAreDifferent(): Promise<void> {
  assert.notStrictEqual(IN_GAME_TRACK, EVERYWHERE_ELSE_TRACK);

  const a = readFileSync(join(ASSETS, IN_GAME_TRACK));
  const b = readFileSync(join(ASSETS, EVERYWHERE_ELSE_TRACK));
  assert.ok(!a.equals(b), 'both names point at the same music');
}

/**
 * The door tells the server what is on screen, and the RPC answers with it.
 *
 * This is the transport, and it is the part that was missing: Arkanoid's
 * client drives its own music because Arkanoid's client IS the game. Super
 * Qix runs server-side and its client is a stub, so the client has to ask.
 */
export async function theRpcAnswersWithTheTrackForTheCurrentScreen(): Promise<void> {
  const { rpcHandlers, setMusicState } = await import('../server');

  setMusicState('menu');
  assert.strictEqual((await rpcHandlers.getMusicTrack()).track, EVERYWHERE_ELSE_TRACK);

  setMusicState('playing');
  assert.strictEqual((await rpcHandlers.getMusicTrack()).track, IN_GAME_TRACK);

  setMusicState('paused');
  assert.strictEqual(
    (await rpcHandlers.getMusicTrack()).track, IN_GAME_TRACK,
    'a pause is inside the round; the music must not restart'
  );

  setMusicState('attract');
  assert.strictEqual((await rpcHandlers.getMusicTrack()).track, EVERYWHERE_ELSE_TRACK);
}

/**
 * ...and the door actually reports its state.
 *
 * An RPC that always answers "menu" would play the wrong music forever, and
 * nothing about it would look broken. Asserted against the source, because
 * the alternative is standing up blessed and a door context.
 */
export async function theDoorReportsItsStateForTheMusic(): Promise<void> {
  const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');

  assert.ok(/setMusicState\(gameData\.state\)/.test(index),
    'the door should publish its live state, not a fixed one');
  assert.ok(/syncMusicState\(\);/.test(index), 'and call it');

  // Input alone is not enough: the level hand-over and game over happen on
  // the clock, with no keypress to hang a sync off.
  const loopSynced = /engine\?\.update\(\);\s*\n\s*syncMusicState\(\);/.test(index);
  assert.ok(loopSynced, 'the game loop must sync too, or a level clear keeps the wrong track');
}

/** The client asks for its music, and plays real modules. */
export async function theClientAsksForAndPlaysTheTrack(): Promise<void> {
  const client = readFileSync(join(__dirname, '..', 'client.ts'), 'utf8');

  assert.ok(/door\.rpc\("getMusicTrack"/.test(client), 'the client should ask what to play');
  assert.ok(/new TrackerEngine\(/.test(client), 'and play it with the tracker engine');
  assert.ok(/audioContext: trackerContext/.test(client),
    'TrackerEngine takes audioContext - "context" is silently ignored');
  assert.ok(
    /api\/doors\/SUPERQIX\/assets\//.test(client),
    'and fetch the module from the door assets endpoint'
  );
  assert.ok(/clearInterval\(musicPoll\)/.test(client),
    'the poll must stop with the door, or it outlives the session');
}
