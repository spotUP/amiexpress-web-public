/**
 * A fresh galaga game, in the state the door starts it in.
 *
 * Lifted out of index.ts so the tests can build a real game without
 * importing the door - importing index.ts constructs a blessed Screen and
 * a Door, neither of which belongs in a unit test. One definition, two
 * callers.
 */

import { GalagaData } from './types';
import {
  DEFAULT_HIGHSCORES,
  GAME_AREA_HEIGHT,
  GAME_AREA_WIDTH,
  STARTING_LIVES,
} from './constants';

export function createInitialGameData(): GalagaData {
  return {
    state: "menu",
    score: 0,
    lives: STARTING_LIVES,
    stage: 1,
    shotsHit: 0,
    shotsFired: 0,

    player: {
      x: GAME_AREA_WIDTH / 2,
      y: GAME_AREA_HEIGHT - 2,
      isDead: false,
      deathFrame: 0,
      hasDualFighter: false,
      isCaptured: false,
    },

    aliens: [],
    bullets: [],
    explosions: [],
    stars: [],

    formation: [],
    formationOffset: 0,
    formationDirection: 1,

    alienIdCounter: 0,
    bulletIdCounter: 0,
    explosionIdCounter: 0,
    spawnPhase: 0,
    aliensToSpawn: [],

    isChallengingStage: false,
    challengingKills: 0,
    challengingTotal: 40,

    capturedFighterAlienId: null,
    tractorBeamTimer: 0,

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: "",

    lastUpdateTime: Date.now(),
    frameCount: 0,
    stageIntroTimer: 0,
  };
}
