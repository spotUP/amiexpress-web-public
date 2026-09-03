/**
 * The TETRIS ATTACK screen: the board, the HUD, and the loop that drives them.
 *
 * Modelled on ui/tetrinet-screen.ts - a 16ms interval that advances the engine
 * and repaints at a slower rate - with one deliberate difference.
 *
 * THE ENGINE IS FED THE SAME WAY A REPLAY IS. Every frame this screen builds a
 * single input character from the held keys and hands it to the stack, exactly
 * as a recorded replay or a netplay opponent would. So the live game, a replay
 * and a networked game all run through one code path: the cursor's auto-repeat,
 * the every-other-frame swap rule and the raise gating are the engine's, not a
 * second implementation living in the UI that could drift from it.
 *
 * TIMING. The engine is frame-exact at 60Hz and the terminal is not. The two
 * are decoupled: a fixed-timestep accumulator runs whole engine frames, capped
 * at eight per tick so a slow repaint cannot run thirty frames back to back
 * with no input sampled between them, and the repaint is throttled separately.
 * That cap is the same one core/game.ts uses, for the same reason.
 */

import { createBox } from '@amiexpress/bbs-door-sdk';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  Sprite, bufferToTags,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { Stack } from '../core/panels/stack';
import { buildBoard, boardSize, BoardVariant } from './panels/board-view';
import { encodeInput, inputStateToMask, INPUT_CHARS } from '../core/panels/input-codec';
import type { SoundEngine } from '../audio/sounds';

/** The engine's frame rate. Not negotiable: every constant is in these frames. */
const FRAME_TIME = 1000 / 60;
/**
 * Most engine frames one tick may run. Eight is ~133ms - generous for a slow
 * repaint, and far short of letting a stall run a whole chain uninterrupted.
 */
const MAX_CATCHUP_FRAMES = 8;
/** How often the board is repainted. Twenty a second is plenty for panels. */
const RENDER_INTERVAL = 50;
/** How often the loop wakes. */
const TICK_INTERVAL = 16;

/** What the screen needs to know about which keys are down right now. */
export interface HeldInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  swap: boolean;
  raise: boolean;
}

export interface PanelsScreenOptions {
  screen: Screen;
  stack: Stack;
  sheet: Record<string, Sprite>;
  sounds?: SoundEngine;
  /** Read the currently held keys. Called once per engine frame. */
  readInput: () => HeldInput;
  /** Which sprite variant to draw. Defaults to the screen's width. */
  variant?: BoardVariant;
  /** Called when the player asks to leave. */
  onQuit?: () => void;
}

export interface PanelsResult {
  score: number;
  /** Frames of actual play. */
  frames: number;
  toppedOut: boolean;
}

export class PanelsScreen {
  private readonly screen: Screen;
  private readonly stack: Stack;
  private readonly sheet: Record<string, Sprite>;
  private readonly sounds?: SoundEngine;
  private readonly readInput: () => HeldInput;
  private readonly variant: BoardVariant;

  private boardBox?: ReturnType<typeof createBox>;
  private hudBox?: ReturnType<typeof createBox>;
  private loop?: ReturnType<typeof setInterval>;
  private lastTick = 0;
  private frameAccumulator = 0;
  private lastRender = 0;
  private quitting = false;

  constructor(options: PanelsScreenOptions) {
    this.screen = options.screen;
    this.stack = options.stack;
    this.sheet = options.sheet;
    this.sounds = options.sounds;
    this.readInput = options.readInput;
    // Below 80 columns is the compact screen, which uses the C64 sheet.
    this.variant = options.variant
      ?? (this.screen.width < 80 ? 'c64' : 'wide');
  }

  /** Lay the board and HUD out, centred in whatever room there is. */
  private setupUI(): void {
    const { cols, rows } = boardSize(this.stack);
    const left = Math.max(0, Math.floor((this.screen.width - cols) / 2) - 8);
    const top = Math.max(0, Math.floor((this.screen.height - rows) / 2));

    this.boardBox = createBox({
      parent: this.screen,
      top,
      left,
      width: cols,
      height: rows,
      border: undefined,
      tags: true,
      style: { bg: 'black' },
    });

    this.hudBox = createBox({
      parent: this.screen,
      top,
      left: left + cols + 2,
      width: 16,
      height: rows,
      border: undefined,
      tags: true,
      style: { fg: 'white', bg: 'black' },
    });
  }

  /** The single input character for this frame. */
  private inputCharacter(): string {
    const held = this.readInput();
    return encodeInput(inputStateToMask(held));
  }

  private renderHud(): void {
    if (!this.hudBox) return;
    const stack = this.stack;
    const seconds = Math.floor(stack.stopWatch / 60);
    const time = `${Math.floor(seconds / 60)}'${String(seconds % 60).padStart(2, '0')}`;

    const lines = [
      '{yellow-fg}POINT{/yellow-fg}',
      `  ${String(stack.score).padStart(5, ' ')}`,
      '',
      '{yellow-fg}LEVEL{/yellow-fg}',
      `  ${String(stack.speed).padStart(5, ' ')}`,
      '',
      '{yellow-fg}TIME{/yellow-fg}',
      `  ${time.padStart(5, ' ')}`,
      '',
      // The chain counter starts at 2; there is no chain 1.
      stack.chainCounter > 1 ? `{lightmagenta-fg}x${stack.chainCounter} CHAIN{/lightmagenta-fg}` : '',
      // Stop time is the reward for a match, and the original shows it.
      stack.stopTime > 0 ? '{lightcyan-fg}STOP{/lightcyan-fg}' : '',
    ];
    this.hudBox.setContent(lines.join('\n'));
  }

  private renderBoard(tick: number): void {
    if (!this.boardBox) return;
    const board = buildBoard(this.stack, this.sheet, tick, { variant: this.variant });
    // bufferToTags returns one string per row.
    this.boardBox.setContent(bufferToTags(board).join('\n'));
  }

  private repaint(): void {
    this.renderBoard(this.stack.clock);
    this.renderHud();
    this.screen.render();
  }

  /** Play until the stack tops out or the player leaves. */
  run(): Promise<PanelsResult> {
    this.setupUI();
    this.repaint();
    this.lastTick = Date.now();
    this.lastRender = 0;

    return new Promise<PanelsResult>((resolve) => {
      const finish = () => {
        this.cleanup();
        resolve({
          score: this.stack.score,
          frames: this.stack.stopWatch,
          toppedOut: this.stack.gameEnded(),
        });
      };

      this.loop = setInterval(() => {
        const now = Date.now();
        const delta = now - this.lastTick;
        this.lastTick = now;

        // Catch up, but only so far - see MAX_CATCHUP_FRAMES.
        this.frameAccumulator = Math.min(
          this.frameAccumulator + delta,
          FRAME_TIME * MAX_CATCHUP_FRAMES,
        );

        while (this.frameAccumulator >= FRAME_TIME) {
          this.frameAccumulator -= FRAME_TIME;
          this.stack.receiveConfirmedInput(this.inputCharacter());
          this.stack.run();
        }

        if (this.stack.gameEnded() || this.quitting) {
          finish();
          return;
        }

        if (now - this.lastRender >= RENDER_INTERVAL) {
          this.lastRender = now;
          this.repaint();
        }
      }, TICK_INTERVAL);
    });
  }

  /** Ask the loop to stop at the end of this frame. */
  quit(): void {
    this.quitting = true;
  }

  cleanup(): void {
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = undefined;
    }
    this.boardBox?.destroy();
    this.hudBox?.destroy();
    this.boardBox = undefined;
    this.hudBox = undefined;
    this.screen.render();
  }
}

/** No keys held; the idle input character is 'A'. */
export function noInput(): HeldInput {
  return { up: false, down: false, left: false, right: false, swap: false, raise: false };
}

export { INPUT_CHARS };
