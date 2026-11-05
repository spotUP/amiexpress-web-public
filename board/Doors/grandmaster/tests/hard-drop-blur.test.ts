/**
 * Hard-drop motion blur.
 *
 * Reported live 2026-08-25: "the motion blur still freezes for a bit on hard
 * drops" - and it used to be fine.
 *
 * The board repaints only when its hash changes, or when particles,
 * animations or screen shake are running. A fading trail is none of those, so
 * the frame that locked the piece painted the streak once and every frame
 * after it was gated out: the piece is down, the hash stops changing, and the
 * streak sat frozen on screen until the next piece moved - then vanished in a
 * single step rather than fading. Expiry lived inside renderBoard(), which the
 * same gate skipped, so the trail could not even age.
 *
 * What these tests pin is the property that matters: while a trail is alive
 * the board keeps repainting, and the streak actually gets dimmer frame to
 * frame instead of standing still.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { GameScreen } from '../ui/game-screen';
import { GameEngine } from '../core/game';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
/** The app's own defaults, trimmed to what a render touches. */
const appState: any = {
  currentMode: 'marathon',
  playerName: 'sysop',
  settings: {
    rotationSystem: 'SRS',
    das: 133,
    arr: 10,
    softDropSpeed: 20,
    ghostPiece: true,
    lockDelay: 500,
    previewCount: 5,
    musicVolume: 0,
    sfxVolume: 0,
    keyBindings: {},
    blockGlow: false,
    glowIntensity: 0,
    clearStyle: 'instant',
    clearDirection: 'in',
    clearAnimationSpeed: 1.0,
    placementEffects: false,
    floatTextMode: 'off',
    b2bGlowEnabled: false,
    connectedBlocks: false,
  },
};

interface Harness {
  screen: any;
  gameScreen: any;
  /** Board content as it stands after the most recent render. */
  boardContent(): string;
  /** How many times the board has actually been repainted. */
  paints(): number;
  render(): void;
  destroy(): void;
}

function harness(): Harness {
  const screen: any = new Screen({ title: 'blur', width: 80, height: 30 });
  const engine: any = new GameEngine('marathon' as any, appState.settings, sounds);
  engine.start?.();

  const gameScreen: any = new GameScreen(screen, engine, null, sounds, appState, null);
  // run() would build the widgets and then block on the game loop; the UI
  // setup is the only part a render needs.
  gameScreen.setupUI();

  // Count real repaints. Asserting on the CONTENT cannot tell a fresh paint
  // from the last one still sitting there, which is exactly the bug.
  let paints = 0;
  let content = '';
  const box = gameScreen.boardBox;
  const setContent = box.setContent.bind(box);
  box.setContent = (value: string) => {
    paints += 1;
    content = value;
    return setContent(value);
  };

  return {
    screen,
    gameScreen,
    boardContent: () => content,
    paints: () => paints,
    render: () => gameScreen.render(),
    destroy: () => screen.destroy(),
  };
}

/** Push a streak by hand, the way a hard drop does. */
function addTrail(gameScreen: any, ageMs = 0): void {
  const now = Date.now() - ageMs;
  gameScreen.hardDropTrails.push(
    { x: 4, y: 10, color: 'red', strength: 1, createdAt: now },
    { x: 4, y: 11, color: 'red', strength: 1, createdAt: now },
  );
}

export async function aLiveTrailKeepsTheBoardRepainting(): Promise<void> {
  const h = harness();
  try {
    h.render();
    h.render();                       // settle: the hash is now stable
    const hashBefore = h.gameScreen.lastBoardHash;
    const paintsBefore = h.paints();

    addTrail(h.gameScreen);
    h.render();

    // Nothing about the BOARD changed - same piece, same lines - so the only
    // possible reason to repaint is the trail. Without it the gate blocks and
    // the streak sits frozen.
    assert.strictEqual(h.gameScreen.lastBoardHash, hashBefore, 'board hash should be unchanged');
    assert.ok(
      h.paints() > paintsBefore,
      'a live trail must keep the board repainting, or the streak freezes'
    );
  } finally {
    h.destroy();
  }
}

export async function theStreakFadesRatherThanStandingStill(): Promise<void> {
  const h = harness();
  try {
    addTrail(h.gameScreen);
    h.render();
    const fresh = h.boardContent();

    // Age the same trail past the middle of its life and render again.
    for (const trail of h.gameScreen.hardDropTrails) {
      trail.createdAt -= 100;
    }
    h.render();
    const faded = h.boardContent();

    assert.notStrictEqual(fresh, faded, 'the streak should look different as it ages');
  } finally {
    h.destroy();
  }
}

export async function trailsExpireEvenWhenTheBoardIsOtherwiseStill(): Promise<void> {
  const h = harness();
  try {
    addTrail(h.gameScreen);
    assert.strictEqual(h.gameScreen.hardDropTrails.length, 2);

    // Settle first, so the repaint gate is genuinely closed: that is the
    // state in which expiry used to be skipped, because it lived inside
    // renderBoard() and renderBoard only runs when the gate opens.
    h.render();
    h.render();

    for (const trail of h.gameScreen.hardDropTrails) {
      trail.createdAt -= 1000;
    }
    h.render();

    assert.strictEqual(
      h.gameScreen.hardDropTrails.length, 0,
      'an expired trail should be dropped even with nothing else moving'
    );
  } finally {
    h.destroy();
  }
}

export async function theBoardGoesQuietOnceTheStreakIsGone(): Promise<void> {
  // The flip side: trails must not pin the board into repainting forever, or
  // this trades a freeze for a permanent full-rate repaint.
  const h = harness();
  try {
    h.render();
    h.render();                       // settle
    addTrail(h.gameScreen);
    for (const trail of h.gameScreen.hardDropTrails) {
      trail.createdAt -= 1000;
    }
    h.render();                       // clears them, repaints once more
    const paintsAfterClear = h.paints();

    h.render();
    h.render();

    assert.strictEqual(h.gameScreen.hardDropTrails.length, 0);
    assert.strictEqual(
      h.paints(), paintsAfterClear,
      'with the streak gone and the board still, nothing more should repaint'
    );
  } finally {
    h.destroy();
  }
}
