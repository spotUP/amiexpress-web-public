/**
 * A fresh pengo game, in the state the door starts it in.
 *
 * Lifted out of index.ts so the tests can build a real game without
 * importing the door - importing index.ts constructs a blessed Screen and
 * a Door, neither of which belongs in a unit test. One definition, two
 * callers.
 */

import { PengoData } from './types';
import {
  DEFAULT_HIGHSCORES,
  INITIAL_TIME,
  STARTING_LIVES,
} from './constants';

export function createInitialGameData(): PengoData {
  return {
    state: "menu",
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    timeRemaining: INITIAL_TIME,

    pengo: {
      x: 7,
      y: 6,
      direction: "up",
      isPushing: false,
      pushFrame: 0,
      isDead: false,
      deathFrame: 0,
    },
    enemies: [],
    grid: [],
    eggs: [],
    slidingBlocks: [],

    diamondsAligned: false,
    enemyIdCounter: 0,

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: "",

    lastUpdateTime: Date.now(),
    frameCount: 0,
  };
}
