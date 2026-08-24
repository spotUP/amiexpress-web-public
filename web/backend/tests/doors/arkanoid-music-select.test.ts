/**
 * Arkanoid music selection (Doors/arkanoid/music-select.ts).
 *
 * The Zabutom XM pack assignment: menu music on the menu and its help
 * screen, highscore music on the highscore board, 11 level
 * tracks cycling across the game's 20 levels, silence on the gameover and
 * victory screens. Every file named here must actually ship in the door's
 * assets/ directory - a typo'd name would fail silently at runtime (the
 * player just hears nothing), so the last test checks the disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  trackForState,
  MENU_TRACK,
  HIGHSCORE_TRACK,
  LEVEL_TRACKS,
} from '../../../../Doors/arkanoid/music-select';

const ASSETS_DIR = path.resolve(__dirname, '../../../../Doors/arkanoid/assets');

describe('arkanoid music selection', () => {
  it('plays the menu track on the menu and on the help screen', () => {
    expect(trackForState('menu', 1)).toBe(MENU_TRACK);
    expect(trackForState('help', 1)).toBe(MENU_TRACK);
  });

  it('plays the highscore track on the highscore board', () => {
    // Name entry no longer exists - scores submit automatically under the
    // BBS username, landing straight on the board.
    expect(trackForState('highscores', 1)).toBe(HIGHSCORE_TRACK);
  });

  it('gives each of the first 11 levels its own track, in pack order', () => {
    for (let level = 1; level <= 11; level++) {
      expect(trackForState('playing', level)).toBe(LEVEL_TRACKS[level - 1]);
    }
  });

  it('cycles the rotation for levels 12-20', () => {
    expect(trackForState('playing', 12)).toBe(LEVEL_TRACKS[0]);
    expect(trackForState('playing', 20)).toBe(LEVEL_TRACKS[8]);
  });

  it('keeps the level track through pause', () => {
    expect(trackForState('paused', 5)).toBe(trackForState('playing', 5));
  });

  it('is silent on gameover and victory', () => {
    expect(trackForState('gameover', 3)).toBeNull();
    expect(trackForState('victory', 20)).toBeNull();
  });

  it('does not crash on a nonsense level', () => {
    expect(trackForState('playing', 0)).toBe(LEVEL_TRACKS[0]);
    expect(trackForState('playing', -5)).toBe(LEVEL_TRACKS[0]);
  });

  it('every referenced track exists in the door assets directory, exact case', () => {
    const onDisk = new Set(fs.readdirSync(ASSETS_DIR));
    const referenced = [MENU_TRACK, HIGHSCORE_TRACK, ...LEVEL_TRACKS];

    for (const name of referenced) {
      expect(onDisk.has(name)).toBe(true);
    }
    // And the pack is fully used - no orphan modules shipped for nothing.
    expect(onDisk.size).toBe(referenced.length);
  });
});
