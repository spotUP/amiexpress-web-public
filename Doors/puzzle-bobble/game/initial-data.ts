/**
 * A fresh puzzle-bobble game, in the state the door starts it in.
 *
 * Lifted out of index.ts so the tests can build a real game without
 * importing the door - importing index.ts constructs a blessed Screen and
 * a Door, neither of which belongs in a unit test. One definition, two
 * callers.
 */

import { PuzzleBobbleData } from './types';
import {
  DEFAULT_HIGHSCORES,
  GRID_HEIGHT,
  GRID_WIDTH,
  SHOOTER_Y,
  getColorsForLevel,
} from './constants';

export function createInitialGameData(): PuzzleBobbleData {
  return {
    state: "menu",
    score: 0,
    level: 1,
    bubblesCleared: 0,

    grid: [],
    gridOffset: 0,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,

    shooter: {
      x: GRID_WIDTH / 2,
      y: SHOOTER_Y,
      angle: 90,
      currentBubble: "red",
      nextBubble: "blue",
    },
    shootingBubble: null,

    ceilingTimer: 0,
    ceilingInterval: 150,

    combo: 0,
    lastMatchTime: 0,

    colorsInPlay: getColorsForLevel(1),

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: "",

    lastUpdateTime: Date.now(),
    frameCount: 0,
  };
}
