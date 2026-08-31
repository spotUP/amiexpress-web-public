/**
 * A fresh zoo-keeper game, in the state the door starts it in.
 *
 * Lifted out of index.ts so the tests can build a real game without
 * importing the door - importing index.ts constructs a blessed Screen and
 * a Door, neither of which belongs in a unit test. One definition, two
 * callers.
 */

import { ZooKeeperData } from './types';
import {
  DEFAULT_HIGHSCORES,
  STARTING_LIVES,
} from './constants';

export function createInitialGameData(): ZooKeeperData {
  return {
    state: "menu",
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    round: 1,

    zeke: {
      x: 40,
      y: 10,
      direction: "right",
      hasNet: false,
      netTimer: 0,
      isJumping: false,
      jumpFrame: 0,
      isDead: false,
      deathFrame: 0,
    },

    zooStage: {
      wall: [],
      animals: [],
      bonusItems: [],
      timer: 60,
      fusePosition: 0,
      animalIdCounter: 0,
    },

    platformStage: {
      platforms: [],
      coconuts: [],
      zelda: { x: 40, y: 2 },
      monkey: { x: 60, y: 3 },
      monkeyThrowTimer: 0,
      zekelY: 18,
      zekelPlatformIndex: -1,
    },

    stampedeStage: {
      escalatorSpeed: 1,
      chargingAnimals: [],
      zekelY: 18,
      jumpedAnimals: 0,
    },

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: "",
    playerNameCursor: 0,

    lastUpdateTime: Date.now(),
    frameCount: 0,

    transitionTimer: 0,
    transitionMessage: "",
  };
}
