/**
 * A fresh donkey-kong game, in the state the door starts it in.
 *
 * Lifted out of index.ts so the tests can build a real game without
 * importing the door - importing index.ts constructs a blessed Screen and
 * a Door, neither of which belongs in a unit test. One definition, two
 * callers.
 */

import { DonkeyKongData } from './types';
import {
  DEFAULT_HIGHSCORES,
  STARTING_LIVES,
} from './constants';

export function createInitialGameData(): DonkeyKongData {
  return {
    state: "menu",
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    stage: "barrels",
    stageIndex: 0,

    player: {
      x: 4,
      y: 19,
      vx: 0,
      vy: 0,
      direction: "right",
      isJumping: false,
      isOnGround: true,
      isClimbing: false,
      climbFrame: 0,
      walkFrame: 0,
      hasHammer: false,
      hammerTimer: 0,
      hammerFrame: 0,
      isAlive: true,
      respawnTimer: 0,
      invincibleTimer: 0,
    },
    barrels: [],
    fireBalls: [],
    springs: [],

    girders: [],
    ladders: [],
    rivets: [],
    hammers: [],
    elevators: [],
    conveyors: [],

    paulineX: 16,
    paulineY: 1,
    dkX: 4,
    dkY: 3,
    dkFrame: 0,
    dkThrowTimer: 120,

    barrelIdCounter: 0,
    fireballIdCounter: 0,
    springIdCounter: 0,
    bonusTimer: 5000,
    jumpScore: 0,

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: "",

    lastUpdateTime: Date.now(),
    frameCount: 0,
  };
}
