/**
 * Arkanoid plays effects, not jingles.
 *
 * Reported: "the generated jingles clash with the music, so remove those."
 *
 * The SDK's `powerup`, `gameover` and `coin` sounds are little MELODIES in
 * fixed keys - C4-E4-G4-C5, E4-D4-C4-B3, E5-A5. Over a tracker module in a
 * different key they clash with the song. `hit` and `explosion` are noise
 * synths with no pitch at all, so they sit under any music and stay.
 *
 * Level-complete and life-lost also SWITCH TRACK, so the jingle was doubling
 * up on a cue the music already gave.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const client = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'Doors', 'arkanoid', 'client.ts'),
  'utf8'
);

const MELODIC = ['powerup', 'gameover', 'coin', 'levelComplete', 'level-up', 'victory'];

describe('the game', () => {
  it('plays no melodic sound at all', () => {
    const played = MELODIC.filter(name => client.includes(`playSound('${name}'`));

    expect(played).toEqual([]);
  });

  it('keeps the unpitched effects', () => {
    // Removing the jingles must not take the brick hits with them.
    expect(client).toMatch(/playSound\('hit'\)/);
    expect(client).toMatch(/playSound\('explosion'\)/);
  });

  it('will not compile a jingle back in by accident', () => {
    // The signature is the guard: a call to playSound('powerup') is now a
    // type error rather than a sound that clashes.
    expect(client).toMatch(/private async playSound\(type: 'hit' \| 'explosion'\)/);
  });
});

describe('the music still marks the moments', () => {
  it('changes track by game state', () => {
    // What the level-complete and game-over jingles were for.
    expect(client).toMatch(/trackForState/);
  });
});
