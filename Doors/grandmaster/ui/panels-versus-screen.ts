/**
 * TETRIS ATTACK with an opponent: Vs CPU and Challenge Mode.
 *
 * The same loop as the solo screen - a fixed-timestep 60Hz engine, throttled
 * repaint, one input character per frame - with a second board beside it and a
 * PanelMatch moving garbage between them.
 *
 * ONE SCREEN SERVES BOTH MODES because the two opponents differ only in what
 * they are, not in how they are driven:
 *
 *   VS CPU     a real Stack, played by PanelAi through the input path. Its
 *              board is drawn, because it has one.
 *   CHALLENGE  a SimulatedStack: an attack script and a health model with no
 *              board at all. Its slot draws a danger bar, which is what
 *              panel-attack draws too.
 */

import { createBox } from '@amiexpress/bbs-door-sdk';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Sprite, bufferToTags } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { Stack } from '../core/panels/stack';
import { SimulatedStack } from '../core/panels/simulated-stack';
import { PanelMatch } from '../core/panels/match';
import { PanelAi } from '../ai/panel-ai';
import { buildBoard, boardSize, BoardVariant } from './panels/board-view';
import { versusLayout, versusCentreLines, dangerBarRows, VersusPanelLayout } from './panels/versus-layout';
import { encodeInput, inputStateToMask } from '../core/panels/input-codec';
import type { HeldInput } from './panels-screen';
import type { SoundEngine } from '../audio/sounds';

const FRAME_TIME = 1000 / 60;
const MAX_CATCHUP_FRAMES = 8;
const RENDER_INTERVAL = 50;
const TICK_INTERVAL = 16;

export interface PanelsVersusOptions {
  screen: Screen;
  /** The board the player is on. */
  player: Stack;
  /** A real board played by the CPU, or a boardless Challenge opponent. */
  opponent: Stack | SimulatedStack;
  /** Present when the opponent is a real board being played by the bot. */
  cpu?: PanelAi;
  sheet: Record<string, Sprite>;
  sounds?: SoundEngine;
  readInput: () => HeldInput;
  variant?: BoardVariant;
}

export interface VersusResult {
  playerWon: boolean;
  score: number;
  frames: number;
}

export class PanelsVersusScreen {
  private readonly screen: Screen;
  private readonly player: Stack;
  private readonly opponent: Stack | SimulatedStack;
  private readonly cpu?: PanelAi;
  private readonly sheet: Record<string, Sprite>;
  private readonly readInput: () => HeldInput;
  private readonly variant: BoardVariant;
  private readonly match: PanelMatch;

  private layout?: VersusPanelLayout;
  private playerBox?: ReturnType<typeof createBox>;
  private centreBox?: ReturnType<typeof createBox>;
  private opponentBox?: ReturnType<typeof createBox>;
  private loop?: ReturnType<typeof setInterval>;
  private lastTick = 0;
  private frameAccumulator = 0;
  private lastRender = 0;
  private quitting = false;

  constructor(options: PanelsVersusOptions) {
    this.screen = options.screen;
    this.player = options.player;
    this.opponent = options.opponent;
    this.cpu = options.cpu;
    this.sheet = options.sheet;
    this.readInput = options.readInput;
    this.variant = options.variant ?? (this.screen.width < 80 ? 'c64' : 'wide');
    this.match = new PanelMatch({ stacks: [this.player, this.opponent] });
  }

  /** Does the opponent have a board to draw, or only a health bar? */
  private get opponentHasBoard(): boolean {
    return this.opponent instanceof Stack;
  }

  private setupUI(): void {
    const { cols, rows } = boardSize(this.player);
    const layout = versusLayout(this.screen.width, this.screen.height, cols, rows);
    this.layout = layout;

    const box = (slot: { top: number; left: number; width: number; height: number }) =>
      createBox({
        parent: this.screen,
        top: slot.top,
        left: slot.left,
        width: slot.width,
        height: slot.height,
        border: undefined,
        tags: true,
        style: { fg: 'white', bg: 'black' },
      });

    this.playerBox = box(layout.player);
    this.centreBox = box(layout.centre);
    this.opponentBox = box(layout.opponent);
  }

  private renderOpponent(): void {
    if (!this.opponentBox || !this.layout) return;

    if (this.opponentHasBoard) {
      const board = buildBoard(this.opponent as Stack, this.sheet, this.player.clock, {
        variant: this.variant,
        // Never draw a cursor on someone else's board.
        showCursor: false,
      });
      this.opponentBox.setContent(bufferToTags(board).join('\n'));
      return;
    }

    // No board to show: a rising danger bar is genuinely all there is.
    const percentage = (this.opponent as SimulatedStack).getTopOutPercentage();
    this.opponentBox.setContent(dangerBarRows(this.layout, percentage).join('\n'));
  }

  private repaint(): void {
    if (!this.layout) return;

    if (this.playerBox) {
      const board = buildBoard(this.player, this.sheet, this.player.clock, {
        variant: this.variant,
      });
      this.playerBox.setContent(bufferToTags(board).join('\n'));
    }

    if (this.centreBox) {
      const seconds = Math.floor(this.player.stopWatch / 60);
      const timeText = `${Math.floor(seconds / 60)}'${String(seconds % 60).padStart(2, '0')}`;
      this.centreBox.setContent(versusCentreLines(this.layout, {
        score: this.player.score,
        speed: this.player.speed,
        timeText,
        chain: this.player.chainCounter,
        stopped: this.player.stopTime > 0,
        incoming: this.player.incomingGarbage.len(),
      }).join('\n'));
    }

    this.renderOpponent();
    this.screen.render();
  }

  /** One engine frame for both boards. */
  private step(): void {
    this.player.receiveConfirmedInput(encodeInput(inputStateToMask(this.readInput())));
    if (this.cpu && this.opponent instanceof Stack) {
      this.opponent.receiveConfirmedInput(encodeInput(this.cpu.update()));
    }
    this.match.run();
  }

  run(): Promise<VersusResult> {
    this.setupUI();
    this.repaint();
    this.lastTick = Date.now();
    this.lastRender = 0;

    return new Promise<VersusResult>((resolve) => {
      const finish = () => {
        this.cleanup();
        resolve({
          // Surviving the opponent is the win condition; quitting is not a win.
          playerWon: !this.quitting && !this.player.gameEnded(),
          score: this.player.score,
          frames: this.player.stopWatch,
        });
      };

      this.loop = setInterval(() => {
        const now = Date.now();
        const delta = now - this.lastTick;
        this.lastTick = now;

        this.frameAccumulator = Math.min(
          this.frameAccumulator + delta,
          FRAME_TIME * MAX_CATCHUP_FRAMES,
        );

        while (this.frameAccumulator >= FRAME_TIME) {
          this.frameAccumulator -= FRAME_TIME;
          this.step();
        }

        if (this.match.hasEnded() || this.quitting) {
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

  quit(): void {
    this.quitting = true;
  }

  cleanup(): void {
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = undefined;
    }
    this.playerBox?.destroy();
    this.centreBox?.destroy();
    this.opponentBox?.destroy();
    this.playerBox = undefined;
    this.centreBox = undefined;
    this.opponentBox = undefined;
    this.screen.render();
  }
}
