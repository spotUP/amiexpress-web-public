/**
 * A game in a known state, shared by the test files.
 */

import { FroggerData } from '../game/types';
import { FroggerGame } from '../game/frogger-game';
import {
  GRID_WIDTH, GRID_HEIGHT, STARTING_LIVES, INITIAL_TIME,
  DEFAULT_HIGHSCORES,
} from '../game/constants';

export function createData(): FroggerData {
  return {
    state: 'menu',
    score: 0,
    lives: STARTING_LIVES,
    startingLives: STARTING_LIVES,
    level: 1,
    timeRemaining: INITIAL_TIME,
    frog: {
      x: Math.floor(GRID_WIDTH / 2),
      y: GRID_HEIGHT - 1,
      direction: 'up',
      isJumping: false,
      jumpProgress: 0,
      isDead: false,
      deathType: null,
      deathFrame: 0,
      onObject: null,
    },
    lanes: [],
    homes: [],
    homesCompleted: 0,
    vehicleIdCounter: 0,
    riverObjectIdCounter: 0,
    flyTimer: 0,
    alligatorTimer: 0,
    ladyFrogTimer: 0,
    otterTimer: 0,
    snakes: [],
    snakeIdCounter: 0,
    carryingLadyFrog: false,
    furthestRow: GRID_HEIGHT - 1,
    hopPointsThisHome: 0,
    extraLifeAwarded: false,
    frogStartTime: Date.now(),
    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: '',
    lastUpdateTime: Date.now(),
    frameCount: 0,
  };
}

/** A started level with no display attached. */
export function startedLevel(level = 1): { game: FroggerGame; data: FroggerData } {
  const data = createData();
  data.level = level;
  const game = new FroggerGame(data, () => { /* no display in tests */ });
  game.initLevel();
  data.state = 'playing';
  return { game, data };
}

/** The lane carrying the FAQ's road or water lane `n`. */
export function laneOf(data: FroggerData, type: 'road' | 'water', n: number) {
  const lane = data.lanes.find(l => l.type === type && l.lane === n);
  if (!lane) throw new Error(`no ${type} lane ${n}`);
  return lane;
}
