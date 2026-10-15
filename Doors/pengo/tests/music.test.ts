/**
 * The music: two user-supplied MODs, chosen by screen.
 *
 * Same suite shape as Super Qix's: the pure mapping, the server answering
 * from it, the assets actually shipped, and the client wiring asserted in
 * source - a music path that quietly plays nothing is the failure mode,
 * and none of these can hear anything, so they check everything that can
 * be checked without ears.
 */

import assert from 'assert';
import { existsSync, readFileSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { trackForState, IN_GAME_TRACK, TITLE_TRACK } from '../music-select';
import { rpcHandlers, setMusicState } from '../server';
import { GameState } from '../game/types';

export async function theRoundAndItsInterludesKeepTheGameTrack(): Promise<void> {
  for (const state of ['playing', 'dying', 'levelComplete', 'paused'] as GameState[]) {
    assert.strictEqual(trackForState(state), IN_GAME_TRACK, state);
  }
}

export async function everyOtherScreenPlaysTheTitleTrack(): Promise<void> {
  for (const state of ['menu', 'gameover', 'highscores', 'enterName', 'help'] as GameState[]) {
    assert.strictEqual(trackForState(state), TITLE_TRACK, state);
  }
}

export async function theServerAnswersFromTheScreenItWasTold(): Promise<void> {
  setMusicState('menu');
  assert.strictEqual((await rpcHandlers.getMusicTrack()).track, TITLE_TRACK);
  setMusicState('playing');
  assert.strictEqual((await rpcHandlers.getMusicTrack()).track, IN_GAME_TRACK);
  setMusicState('menu'); // leave it where a fresh door starts
}

export async function bothModulesAreShippedAndAreRealProtrackerMods(): Promise<void> {
  for (const name of [IN_GAME_TRACK, TITLE_TRACK]) {
    const path = join(__dirname, '..', 'assets', name);
    assert.ok(existsSync(path), `${name} missing from assets/`);
    // A ProTracker MOD carries its magic at byte 1080; a truncated or
    // mis-copied file would play as silence.
    const fd = openSync(path, 'r');
    const magic = Buffer.alloc(4);
    readSync(fd, magic, 0, 4, 1080);
    closeSync(fd);
    assert.strictEqual(magic.toString('latin1'), 'M.K.', `${name} magic`);
  }
}

export async function theClientAsksAndTearsDown(): Promise<void> {
  const client = readFileSync(join(__dirname, '..', 'client.ts'), 'utf8');
  assert.ok(/door\.rpc\("getMusicTrack"/.test(client), 'the client polls the door');
  assert.ok(/\/api\/doors\/PENGO\/assets\//.test(client), 'and fetches this door\'s assets');
  assert.ok(/stopMusic\(\);/.test(client), 'and stops the music on teardown');
}

export async function theDoorSyncsFromBothChokepoints(): Promise<void> {
  const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
  const calls = (index.match(/syncMusicState\(\);/g) || []).length;
  assert.ok(calls >= 2,
    'state must sync from the input handler AND the game loop - transitions ' +
    'happen in both, and covering them one by one is how one gets missed');
}
