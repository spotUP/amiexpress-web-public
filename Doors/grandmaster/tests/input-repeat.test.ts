/**
 * Movement repeat while the game is fast.
 *
 * Reported 2026-08-31: "as the game speeds up a lot in master mode it starts
 * getting very hard to control".
 *
 * At high levels a player holds SOFT DROP more or less permanently and steers
 * with left/right on top of it. That combination is what these pin, because
 * it was the combination that broke:
 *
 *  - one `arrTimer` served BOTH the sideways auto-repeat and the soft-drop
 *    repeat. Held together, each reset the other's clock, so the piece
 *    stuttered sideways and dropped at half rate - exactly the symptom, and
 *    only while holding down, which is why it appears "as the game speeds
 *    up".
 *  - a repeat fired at most ONCE per update() no matter how much time had
 *    passed, so the effective repeat rate was capped by the loop rate. The
 *    game loop renders on the same interval it polls input on (game-screen
 *    run()), and a blessed repaint pushed over a socket does not fit in
 *    16 ms - so under load the repeats the player asked for were dropped
 *    rather than delivered late.
 */

import assert from 'assert';
import { TIMING } from '../input/config';

interface Harness {
  handler: any;
  press(key: string): void;
  release(key: string): void;
  advance(ms: number, step?: number): void;
  counts: Record<string, number>;
  restore(): void;
}

/**
 * An InputHandler on a fake clock, driven through the same browser key
 * events the client sends in game mode.
 */
async function harness(): Promise<Harness> {
  const { InputHandler } = await import('../input/handler');

  let clock = 1_000_000;
  const realNow = Date.now;
  (Date as any).now = () => clock;

  let down: ((key: string) => void) | null = null;
  let up: ((key: string) => void) | null = null;

  const screen: any = { on: () => {}, removeListener: () => {} };
  const session: any = {
    bbs: {
      onKeyDown: (cb: (key: string) => void) => { down = cb; },
      onKeyUp: (cb: (key: string) => void) => { up = cb; },
    },
  };

  const handler: any = new InputHandler(screen, session);
  const counts: Record<string, number> = { left: 0, right: 0, soft_drop: 0 };
  for (const action of Object.keys(counts)) {
    handler.on(action, () => { counts[action]++; });
  }

  // First update only seeds lastUpdate.
  handler.update(0);

  return {
    handler,
    counts,
    press: (key: string) => down?.(key),
    release: (key: string) => up?.(key),
    advance(ms: number, step = 16) {
      for (let elapsed = 0; elapsed < ms; elapsed += step) {
        clock += step;
        handler.update(step);
      }
    },
    restore: () => { (Date as any).now = realNow; },
  };
}

export async function softDropDoesNotStealTheSidewaysRepeat(): Promise<void> {
  const h = await harness();
  try {
    h.press('ArrowLeft');
    h.press('ArrowDown');

    // A full second of holding both, which is what playing at 20G looks like.
    h.advance(1000);

    // DAS has to charge before the repeat starts; everything after is one
    // cell per ARR.
    const expectedLeft = Math.floor((1000 - TIMING.DAS_DELAY) / TIMING.ARR_RATE);
    const expectedDrops = Math.floor(1000 / TIMING.SOFT_DROP_RATE);

    // Generous margins - this is about the repeat running at ALL, not about
    // a cell either way.
    assert.ok(
      h.counts.left >= expectedLeft - 2,
      `sideways repeat while soft dropping: got ${h.counts.left} moves, expected about ${expectedLeft}`
    );
    assert.ok(
      h.counts.soft_drop >= expectedDrops - 2,
      `soft drop while steering: got ${h.counts.soft_drop} drops, expected about ${expectedDrops}`
    );
  } finally {
    h.restore();
  }
}

export async function sidewaysRepeatIsTheSameWithAndWithoutSoftDrop(): Promise<void> {
  // The clearest statement of the bug: holding a key that has nothing to do
  // with horizontal movement must not change how the piece moves sideways.
  const alone = await harness();
  let steeringAlone = 0;
  try {
    alone.press('ArrowLeft');
    alone.advance(1000);
    steeringAlone = alone.counts.left;
  } finally {
    alone.restore();
  }

  const dropping = await harness();
  try {
    dropping.press('ArrowLeft');
    dropping.press('ArrowDown');
    dropping.advance(1000);

    assert.ok(
      Math.abs(dropping.counts.left - steeringAlone) <= 1,
      `${steeringAlone} moves when only steering, ${dropping.counts.left} while also soft dropping`
    );
  } finally {
    dropping.restore();
  }
}

export async function repeatsSurviveASlowGameLoop(): Promise<void> {
  // The loop polls input and repaints the board on the same interval, so a
  // repaint that overruns delays the poll. The repeat rate the player
  // configured is a rate in MILLISECONDS and must not silently become
  // "once per loop iteration".
  const h = await harness();
  try {
    h.press('ArrowLeft');
    // 100 ms per iteration: two ARR periods at the 50 ms default.
    h.advance(1000, 100);

    const expected = Math.floor((1000 - TIMING.DAS_DELAY) / TIMING.ARR_RATE);
    assert.ok(
      h.counts.left >= expected - 2,
      `at 10 polls a second: got ${h.counts.left} moves, expected about ${expected}`
    );
  } finally {
    h.restore();
  }
}

export async function aStalledLoopDoesNotFireABurst(): Promise<void> {
  // The other half of catching up: a second-long stall (a garbage collection,
  // a slow socket) must not empty a whole second of repeats into one frame
  // and throw the piece across the board.
  const h = await harness();
  try {
    h.press('ArrowLeft');
    h.advance(400); // charge DAS
    const before = h.counts.left;

    h.advance(1000, 1000); // one enormous frame

    assert.ok(
      h.counts.left - before <= 6,
      `one 1000ms frame produced ${h.counts.left - before} moves in a single tick`
    );
  } finally {
    h.restore();
  }
}

export async function releasingSoftDropLeavesTheSidewaysChargeAlone(): Promise<void> {
  // DAS is charged by holding a direction. Letting go of soft drop is not a
  // horizontal event and must not reset it - at 20G a lost charge is a piece
  // that will not reach the wall before it locks.
  const h = await harness();
  try {
    h.press('ArrowLeft');
    h.advance(600);
    const charged = h.counts.left;

    h.press('ArrowDown');
    h.release('ArrowDown');
    h.advance(200);

    const expected = Math.floor(200 / TIMING.ARR_RATE);
    assert.ok(
      h.counts.left - charged >= expected - 1,
      `after touching soft drop the sideways repeat produced ${h.counts.left - charged} of about ${expected} moves`
    );
  } finally {
    h.restore();
  }
}

export async function aStalledFrameDoesNotRunTheGameForwardWithoutInput(): Promise<void> {
  // The same rule on the engine side. The game loop repaints the board and
  // polls the keyboard on the interval it also steps the game on, so a slow
  // repaint delays every one of them. Catching up an unbounded number of
  // frames at once means gravity, lock delay and ARE all advance with no
  // input sampled anywhere inside - at 20G that is the piece locking
  // somewhere the player never chose.
  const { GameEngine } = await import('../core/game');

  const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
  const settings: any = {
    rotationSystem: 'ARS', das: 267, arr: 50, softDropSpeed: 20,
    ghostPiece: true, lockDelay: 500, previewCount: 3,
    musicVolume: 0, sfxVolume: 0, keyBindings: {},
    blockGlow: false, glowIntensity: 0,
  };

  const engine: any = new GameEngine('master', settings, sounds);
  engine.start();

  let frames = 0;
  const realUpdateFrame = engine.updateFrame.bind(engine);
  engine.updateFrame = () => { frames++; realUpdateFrame(); };

  engine.update(1000); // one second-long hitch

  assert.ok(
    frames > 0 && frames <= 10,
    `a 1000ms frame ran ${frames} game frames back to back with no input between them`
  );
}

export async function telnetKeepsTheKeypressPathAlive(): Promise<void> {
  // "key input are still not working via telnet in gmaster" (sysop,
  // 2026-09-02, on a live telnet session).
  //
  // setupKeyStateHandlers turned key-state mode on because bbs.onKeyDown and
  // bbs.onKeyUp EXIST - they do on every session, browser or not - and the
  // keypress handler returns early in key-state mode. Over telnet the events
  // never arrive, so nothing was left to read the characters that do.
  const { InputHandler } = await import('../input/handler');

  const build = (connectionType?: string) => {
    const keypressHandlers: Array<(ch: string | undefined, key: any) => void> = [];
    const screen: any = {
      on: (event: string, handler: any) => { if (event === 'keypress') keypressHandlers.push(handler); },
      removeListener: () => {},
    };
    const bbs: any = {
      onKeyDown: () => {}, onKeyUp: () => {},
      ...(connectionType ? { connectionType } : {}),
    };
    const handler: any = new InputHandler(screen, { bbs } as any);
    let moves = 0;
    handler.on('left', () => { moves++; });
    return {
      handler,
      press: (name: string) => keypressHandlers.forEach((fn) => fn(undefined, { name, full: name })),
      moves: () => moves,
    };
  };

  const telnet = build('telnet');
  telnet.press('left');
  assert.ok(telnet.moves() > 0, 'a telnet keypress has to move the piece - nothing else will');

  const web = build('web');
  web.press('left');
  assert.strictEqual(web.moves(), 0,
    'a browser keeps key-state mode: acting on characters too would move twice per press');
}
