/**
 * TetriNET Game Screen
 *
 * Main game screen for TetriNET mode combining:
 * - Main board (left side)
 * - Piece preview and hold
 * - Special inventory panel
 * - Target selector
 * - Opponent mini-boards
 * - Effect overlays
 * - Sudden death timer
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState } from '../core/types';
import type {
  TetriNetTransport,
  TetriNetFieldUpdate,
  TetriNetSpecialPacket,
  TetriNetGarbagePacket,
} from '../network/tetrinet-transport';
import { InventoryPanel } from './tetrinet/inventory-panel';
import { TargetSelector, type TargetInfo } from './tetrinet/target-selector';
import { OpponentBoards, type OpponentBoardData } from './tetrinet/opponent-boards';
import { EffectOverlay } from './tetrinet/effect-overlay';
import type { SpecialType } from '../core/tetrinet/specials';
import { SPECIALS } from '../core/tetrinet/specials';
import { HUMAN_TARGET_ID } from '../ai/tetrinet-ai';
import type { TetriNetBoard } from '../core/tetrinet/tetrinet-board';
import { cloneTetriNetBoard } from '../core/tetrinet/tetrinet-board';

/**
 * TetriNET Screen options
 */
export interface TetriNetScreenOptions {
  screen: Screen;
  engine: TetriNetEngine;
  inputHandler: InputHandler;
  sounds: SoundEngine;
  state: AppState;
  /**
   * Field/special transport. Two implementations: the external TetriNET
   * server adapter (fields only - the server routes specials itself) and
   * the in-process broker transport used for BBS-internal multiplayer.
   */
  network?: TetriNetTransport;
  playerName: string;
  aiController?: any;  // TetriNetAI controller - local bots this node owns
}

/**
 * TetriNET Game Screen
 */
export class TetriNetScreen {
  private screen: Screen;
  private engine: TetriNetEngine;
  private inputHandler: InputHandler;
  private sounds: SoundEngine;
  private state: AppState;
  private network: TetriNetTransport | null;
  private playerName: string;
  private aiController: any | null;  // AI controller for local mode

  // UI Elements
  private boardBox: any;
  private previewBox: any;
  private statsBox: any;
  private suddenDeathBox: any;

  // TetriNET-specific UI
  private inventoryPanel!: InventoryPanel;
  private targetSelector!: TargetSelector;
  private opponentBoards!: OpponentBoards;
  private effectOverlay!: EffectOverlay;

  private running: boolean = false;
  private unsubscribers: Array<() => void> = [];

  /** Participants on other BBS nodes, keyed by the id their packets carry. */
  private remotes: Map<string, {
    name: string;
    board: TetriNetBoard;
    level: number;
    alive: boolean;
    hasImmunity: boolean;
  }> = new Map();
  /** Whether any remote participant has ever been seen (victory needs this). */
  private sawRemote: boolean = false;

  constructor(options: TetriNetScreenOptions) {
    this.screen = options.screen;
    this.engine = options.engine;
    this.inputHandler = options.inputHandler;
    this.sounds = options.sounds;
    this.state = options.state;
    this.network = options.network || null;
    this.playerName = options.playerName;
    this.aiController = options.aiController || null;

    this.setupUI();
    this.setupEngineCallbacks();
    this.setupAttackRouting();
    if (this.network) {
      this.setupNetworkListeners();
    }
  }

  /**
   * The special/garbage ROUTER - the layer TetriNET never had.
   *
   * Both halves of the exchange were already written and correct: engines
   * SEND via onSpecialUsed/onLinesAdded and RECEIVE via
   * applyIncomingSpecial/addGarbage. Nothing connected them. Both receive
   * methods had exactly one caller repo-wide - the EXTERNAL TetriNET server
   * path in app.ts - so against local AI a special was popped off the
   * inventory, played a sound and vanished, and a classic-rules line clear
   * sent garbage to a `if (this.network)` branch whose body was the comment
   * "TODO: Send garbage to target via network". Local TetriNET was four
   * players practising alone in the same room.
   *
   * The router treats every participant the same, whether it is this node's
   * human, a bot this node owns, or a player on another BBS node: resolve
   * the id, then either apply the hit locally or put it on the wire.
   *
   * Games on an EXTERNAL TetriNET server are not routed here - that server
   * fans specials out itself, so doing it again locally would double every
   * hit.
   */
  private setupAttackRouting(): void {
    if (this.network && !this.routesOverNetwork()) return;
    if (!this.aiController && !this.network) return;

    this.engine.onSpecialUsed((special, targetId) => {
      this.routeSpecial(special, this.localId(), targetId);
    });
    this.engine.onLinesAdded((count) => {
      this.routeGarbage(count, this.localId());
    });

    for (const opponent of this.aiOpponents()) {
      opponent.engine.onSpecialUsed((special: SpecialType, targetId: string | null) => {
        this.routeSpecial(special, opponent.id, targetId);
      });
      opponent.engine.onLinesAdded((count: number) => {
        this.routeGarbage(count, opponent.id);
      });
    }

    if (this.routesOverNetwork()) {
      this.unsubscribers.push(this.network!.onSpecial!((packet) => this.receiveSpecial(packet)));
      this.unsubscribers.push(this.network!.onGarbage!((packet) => this.receiveGarbage(packet)));
    }
  }

  /** Id this node's human player answers to. */
  private localId(): string {
    return this.network?.localId?.() ?? HUMAN_TARGET_ID;
  }

  /** True when the transport carries specials and garbage itself. */
  private routesOverNetwork(): boolean {
    return !!(this.network?.sendSpecial && this.network?.sendGarbage);
  }

  private aiOpponents(): any[] {
    return this.aiController ? this.aiController.getOpponents() : [];
  }

  /**
   * Engine for a participant this node OWNS, or null - which also means
   * "not ours": a remote player's id resolves to null here and the hit goes
   * on the wire instead.
   */
  private participantEngine(id: string): TetriNetEngine | null {
    if (id === this.localId() || id === HUMAN_TARGET_ID) {
      const status = this.engine.getState().status;
      return status === 'gameover' || status === 'won' ? null : this.engine;
    }
    const opponent = this.aiOpponents().find(o => o.id === id);
    return opponent && opponent.alive ? opponent.engine : null;
  }

  private participantName(id: string): string {
    if (id === this.localId() || id === HUMAN_TARGET_ID) return this.playerName;
    const bot = this.aiOpponents().find(o => o.id === id);
    if (bot) return bot.name;
    return this.remotes.get(id)?.name ?? id;
  }

  /** Every id currently in the match, local and remote. */
  private participantIds(): string[] {
    return [
      this.localId(),
      ...this.aiOpponents().map(o => o.id),
      ...this.remotes.keys(),
    ];
  }

  /**
   * Deliver one special to its target, wherever that target lives.
   *
   * Self-only and self-applied continuous specials (Clear Line, Immunity)
   * are handled inside the sending engine, so they are not routed anywhere.
   *
   * NOTE: useSpecial() POPS the inventory before firing the callback, so the
   * special MUST be read from the callback argument - the inventory no
   * longer holds it by the time we get here.
   */
  private routeSpecial(special: SpecialType, sourceId: string, targetId: string | null): void {
    if (SPECIALS[special].selfOnly || special === 'immunity') return;

    const source = this.participantEngine(sourceId);
    if (!source) return;

    // A missing target means the sender had nobody selected; the human's
    // fallback is whatever the target selector currently points at.
    const resolvedId = targetId
      ?? (sourceId === this.localId() ? this.targetSelector.getSelectedTarget()?.id ?? null : null);
    if (!resolvedId || resolvedId === sourceId) return;

    const target = this.participantEngine(resolvedId);
    if (target) {
      this.applyLocalSpecial(special, target, resolvedId, this.participantName(sourceId), source.getBoard());
      return;
    }

    if (this.routesOverNetwork() && this.remotes.has(resolvedId)) {
      this.network!.sendSpecial!({
        from: sourceId,
        fromName: this.participantName(sourceId),
        to: resolvedId,
        special,
        // Switch Fields is the one special that needs the sender's board.
        sourceBoard: special === 'switch' ? source.getBoard() : undefined,
      });
    }
  }

  /** Apply a special to an engine on this node and give the human feedback. */
  private applyLocalSpecial(
    special: SpecialType,
    target: TetriNetEngine,
    targetId: string,
    senderName: string,
    sourceBoard?: TetriNetBoard
  ): void {
    const blocked = target.getEffectManager().hasImmunity();

    target.applyIncomingSpecial(
      special,
      senderName,
      special === 'switch' ? sourceBoard : undefined
    );

    if (targetId === this.localId() || targetId === HUMAN_TARGET_ID) {
      if (blocked) {
        this.effectOverlay.showImmunityBlocked();
      } else {
        this.sounds.playSfx('garbage');
        this.effectOverlay.showIncomingWarning(SPECIALS[special].name);
      }
    }
  }

  /**
   * Classic-rules garbage goes to EVERY other living player (the cs1/cs2/cs4
   * broadcast of the original protocol), not just the selected target.
   */
  private routeGarbage(lines: number, sourceId: string): void {
    if (lines <= 0) return;

    for (const id of [this.localId(), ...this.aiOpponents().map(o => o.id)]) {
      if (id === sourceId) continue;
      const target = this.participantEngine(id);
      if (!target) continue;
      target.addGarbage(lines, 'classic');
      if (id === this.localId()) {
        this.sounds.playSfx('garbage');
      }
    }

    if (this.routesOverNetwork() && this.remotes.size > 0) {
      this.network!.sendGarbage!({
        from: sourceId,
        fromName: this.participantName(sourceId),
        to: null,
        lines,
      });
    }
  }

  /** A special from another node, addressed to somebody this node owns. */
  private receiveSpecial(packet: TetriNetSpecialPacket): void {
    const target = this.participantEngine(packet.to);
    if (!target) return;  // not ours - another node will handle it

    const ownBoardBefore = packet.special === 'switch'
      ? cloneTetriNetBoard(target.getBoard())
      : undefined;

    this.applyLocalSpecial(
      packet.special,
      target,
      packet.to,
      packet.fromName,
      packet.sourceBoard
    );

    // Switch Fields is a SWAP: the sender must end up with the board this
    // player just gave away. Reply once, and never reply to a reply.
    if (packet.special === 'switch' && !packet.reply && ownBoardBefore && this.routesOverNetwork()) {
      this.network!.sendSpecial!({
        from: packet.to,
        fromName: this.participantName(packet.to),
        to: packet.from,
        special: 'switch',
        sourceBoard: ownBoardBefore,
        reply: true,
      });
    }
  }

  /** Garbage from another node. `to: null` is the classic broadcast. */
  private receiveGarbage(packet: TetriNetGarbagePacket): void {
    const targets = packet.to === null
      ? [this.localId(), ...this.aiOpponents().map(o => o.id)]
      : [packet.to];

    for (const id of targets) {
      if (id === packet.from) continue;
      const target = this.participantEngine(id);
      if (!target) continue;
      target.addGarbage(packet.lines, 'classic');
      if (id === this.localId()) {
        this.sounds.playSfx('garbage');
      }
    }
  }

  /**
   * Victory: outliving every other participant ends the match.
   * TetriNetAI.allDead() had zero callers, so a local TetriNET game could
   * only ever be LOST - the last player standing just kept stacking alone.
   */
  private checkVictory(): void {
    const hadOpponents = this.aiOpponents().length > 0 || this.sawRemote;
    if (!hadOpponents) return;

    const botsAlive = this.aiOpponents().some((o: any) => o.alive);
    const remotesAlive = Array.from(this.remotes.values()).some(r => r.alive);
    if (!botsAlive && !remotesAlive) {
      this.engine.win();
    }
  }

  /**
   * Repaint the opponent strip and target list from BOTH sources - the bots
   * this node owns and the players on other nodes.
   */
  private refreshOpponents(): void {
    const bots = this.aiOpponents().map((bot: any) => ({
      id: bot.id,
      name: bot.name,
      board: bot.engine.getBoard(),
      level: bot.engine.getState().level,
      alive: bot.alive,
      hasImmunity: bot.engine.getEffectManager().hasImmunity(),
    }));
    const remotes = Array.from(this.remotes.entries()).map(([id, remote]) => ({
      id,
      name: remote.name,
      board: remote.board,
      level: remote.level,
      alive: remote.alive,
      hasImmunity: remote.hasImmunity,
    }));

    this.updateOpponents([...bots, ...remotes]);

    // Bots aim at everyone in the match, not just the people on this node.
    this.aiController?.setExternalTargets?.([this.localId(), ...this.remotes.keys()]);
  }

  /** Publish this node's fields: the human, plus any bots it owns. */
  private publishFields(): void {
    if (!this.network) return;
    this.network.sendUpdate(this.engine.getState() as any);

    if (!this.network.sendField) return;
    for (const bot of this.aiOpponents()) {
      this.network.sendField({
        playerId: bot.id,
        name: bot.name,
        board: bot.engine.getBoard(),
        level: bot.engine.getState().level,
        alive: bot.alive,
        hasImmunity: bot.engine.getEffectManager().hasImmunity(),
      });
    }
  }

  /**
   * Setup UI layout
   */
  private setupUI(): void {
    // Clear screen
    this.screen.children.forEach(child => child.destroy());

    // Main board (left side)
    // Board: 12 columns x 2 chars = 24, plus 2 for borders = 26 width
    // Height: 22 rows + 2 for borders = 24
    this.boardBox = createBox({
      parent: this.screen,
      top: 1,
      left: 0,
      width: 26,
      height: 24,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'white' } },
      fixed: true,
    });

    // Preview box (right of board) - FIXED during gameplay, not dockable
    this.previewBox = createBox({
      parent: this.screen,
      top: 1,
      left: 26,
      width: 12,
      height: 6,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ' Next ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Inventory panel (below preview)
    this.inventoryPanel = new InventoryPanel({
      parent: this.screen,
      top: 7,
      left: 26,
      maxSlots: 10,
    });

    // Target selector (below inventory)
    this.targetSelector = new TargetSelector({
      parent: this.screen,
      top: 10,
      left: 26,
      width: 26,  // Fill columns 26-51 exactly (26 columns)
    });

    // Stats box (below board)
    this.statsBox = createBox({
      parent: this.screen,
      top: 25,  // Board ends at line 24, stats starts at 25
      left: 0,
      width: 38,
      height: 2,  // Reduced from 3 to fit in terminal
      content: '',
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Sudden death timer (shown when active, overlays bottom of board).
    //
    // Two bugs here, both visible during ordinary play: createBox() draws a
    // border by DEFAULT, and this box was created visible and never hidden.
    // Sitting at row 23 with setFront(), its border permanently covered the
    // board's LAST row - so the playfield looked one row short and pieces
    // resting on the floor appeared to sit level with, or below, the bottom
    // border. Borderless, and hidden until sudden death actually starts.
    this.suddenDeathBox = createBox({
      parent: this.screen,
      // Row 0, ABOVE the board (which starts at row 1), not on top of it.
      // Sudden death is armed from the start of a game and shows a running
      // countdown, so an overlay parked on the board's last row hid a
      // playable row for the entire match rather than just at the end.
      top: 0,
      left: 0,
      width: 26,  // Match board width
      height: 1,
      border: { type: 'none' },
      hidden: true,
      content: '',
      style: { bg: 'red', fg: 'white' },  // High visibility during sudden death
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Opponent boards (right side) - Fits 80 columns exactly
    this.opponentBoards = new OpponentBoards({
      parent: this.screen,
      top: 1,
      left: 52,
      width: 28,  // Columns 52-79 (28 cols) fits in 80 total
      maxOpponents: 5,
    });

    // Effect overlay
    this.effectOverlay = new EffectOverlay({
      parent: this.screen,
      boardTop: 1,
      boardLeft: 0,
      boardWidth: 26,
      boardHeight: 24,
    });

    // Ensure game board is always on top (can't be covered by dockable panels)
    this.boardBox.setFront();
    // Stats and sudden death should also be above dockable panels
    this.statsBox.setFront();
    this.suddenDeathBox.setFront();
  }

  /**
   * Setup engine event callbacks
   */
  private setupEngineCallbacks(): void {
    // Special used
    this.engine.onSpecialUsed((type, targetId) => {
      this.sounds.playSfx('attack');  // Attack sound for special usage
      this.inventoryPanel.showUseAnimation();

      if (targetId) {
        this.targetSelector.showAttackAnimation(targetId);
        this.opponentBoards.showAttackAnimation(targetId, 'attack');
      }
    });

    // Lines added (garbage to send)
    this.engine.onLinesAdded((count) => {
      if (count === 4) {
        this.sounds.playSfx('tetris');
      } else {
        this.sounds.playSfx('line_clear');
      }
      
      const state = this.engine.getState();
      if (state.combo > 1) {
        this.sounds.playSfx('combo');
      }

      // Outgoing garbage is the router's job (setupAttackRouting) - this
      // used to be an `if (this.network)` branch whose body was the comment
      // "TODO: Send garbage to target via network", which is precisely why
      // no garbage ever left this screen.
    });

    // Game over
    this.engine.onGameOver(() => {
      this.running = false;
      this.sounds.playSfx('game_over');
    });

    // Board update (for network sync)
    this.engine.onBoardUpdate((board) => {
      if (this.network) {
        this.network.sendUpdate({
          board: board as any,
          level: this.engine.getState().level,
          grade: 'S1',  // TetriNET doesn't use grades like TGM
        } as any);
      }
    });

    // Sudden death callbacks
    const suddenDeath = this.engine.getSuddenDeath();
    if (suddenDeath) {
      suddenDeath.onActivated(() => {
        this.sounds.playSfx('ready');  // Using existing sound
        this.effectOverlay.showSuddenDeathWarning();
      });

      suddenDeath.onLineAdded((totalLines) => {
        this.sounds.playSfx('garbage');
        this.effectOverlay.showSuddenDeathLine(totalLines);
      });
    }
  }

  /**
   * Track the participants living on other BBS nodes.
   *
   * The old version wrote straight into one opponent board with
   * `name: update.playerId  // Use ID as name for now`, `hasImmunity: false
   * // TODO` and a hardcoded opponent index of 0, so every remote player
   * overwrote the same slot and none of them had a name. Updates now land
   * in a keyed map and the whole strip is repainted from it alongside the
   * local bots.
   */
  private setupNetworkListeners(): void {
    if (!this.network) return;

    const unsubUpdate = this.network.onUpdate((update: TetriNetFieldUpdate) => {
      if (update.playerId === this.localId()) return;

      this.sawRemote = true;
      this.remotes.set(update.playerId, {
        name: update.name ?? update.playerId,
        board: update.board as TetriNetBoard,
        level: update.level,
        alive: update.alive,
        hasImmunity: update.hasImmunity,
      });

      this.targetSelector.updateOpponent(update.playerId, {
        level: update.level,
        alive: update.alive,
        hasImmunity: update.hasImmunity,
      });
    });
    this.unsubscribers.push(unsubUpdate);
  }

  /**
   * Run game loop
   */
  async run(): Promise<void> {
    this.running = true;

    // Setup input handlers
    this.setupInput();

    // Countdown
    await this.showCountdown();

    // Start game
    this.engine.start();

    // Main game loop
    return new Promise((resolve) => {
      let lastTime = Date.now();
      const updateInterval = setInterval(() => {
        if (!this.running) {
          clearInterval(updateInterval);
          resolve();
          return;
        }

        const now = Date.now();
        const deltaTime = now - lastTime;
        lastTime = now;

        // Update game
        this.engine.update(deltaTime);
        this.inputHandler.update(deltaTime);

        // Drive the bots this node owns (local play, or the host of a
        // networked match).
        if (this.aiController) {
          this.aiController.update(deltaTime);
        }

        if (now % 100 < deltaTime) {
          this.refreshOpponents();
          this.publishFields();
        }

        this.checkVictory();

        // Render
        this.render();

        // Check for game over
        const gameState = this.engine.getState();
        if (gameState.status === 'gameover' || gameState.status === 'won') {
          this.running = false;
          clearInterval(updateInterval);
          // Tell the other nodes we are out. Field updates stop with the
          // loop, so without this last publish the survivors keep seeing a
          // living opponent and nobody is ever declared the winner.
          this.publishFields();
          resolve();
        }
      }, 16);  // ~60 FPS
    });
  }

  /**
   * Setup input handlers
   */
  private setupInput(): void {
    // Movement - confusion reversal is handled by engine.
    // Sound effects match game-screen/versus-screen: these bindings used to
    // be bare engine calls, so movement, rotation, hard drop and hold were
    // all SILENT in TetriNET mode while the same actions were audible in
    // single player. (No IRS/IHS cues here - the TetriNET engine has no
    // initial-rotation/hold system.)
    this.inputHandler.on('left', () => {
      if (this.engine.move(-1)) this.sounds.playSfx('move');
    });
    this.inputHandler.on('right', () => {
      if (this.engine.move(1)) this.sounds.playSfx('move');
    });

    // Rotation
    this.inputHandler.on('rotate_cw', () => {
      if (this.engine.rotate(1)) this.sounds.playSfx('rotate');
    });
    this.inputHandler.on('rotate_ccw', () => {
      if (this.engine.rotate(-1)) this.sounds.playSfx('rotate');
    });

    // Drop
    this.inputHandler.on('soft_drop', () => this.engine.softDrop());
    this.inputHandler.on('hard_drop', () => {
      this.engine.hardDrop();
      this.sounds.playSfx('hard_drop');
    });

    // Hold
    this.inputHandler.on('hold', () => {
      if (this.engine.hold()) this.sounds.playSfx('hold');
    });

    // Pause
    this.inputHandler.on('pause', () => this.togglePause());

    // Special usage (spacebar) - use screen.key since it's TetriNET-specific
    this.screen.key(['space', 'enter'], () => {
      const target = this.targetSelector.getSelectedTarget();
      if (target) {
        this.engine.useSpecial(target.id);
      } else {
        // Self-targeting specials
        this.engine.useSpecial();
      }
    });

    // Target selection with tab
    this.screen.key(['tab'], () => this.targetSelector.selectNext());
    this.screen.key(['S-tab'], () => this.targetSelector.selectPrevious());

    // Number keys for quick target selection
    for (let i = 1; i <= 5; i++) {
      this.screen.key([`${i}`], () => this.targetSelector.selectByNumber(i));
    }
  }

  /**
   * Show countdown
   */
  private async showCountdown(): Promise<void> {
    this.sounds.playSfx('ready');
    await new Promise(resolve => setTimeout(resolve, 500));

    const countdown = ['3', '2', '1', 'GO!'];
    for (let i = 0; i < countdown.length; i++) {
      const text = countdown[i];

      if (text === 'GO!') {
        this.sounds.playSfx('go');
      } else {
        this.sounds.playSfx('countdown');
      }

      const box = createBox({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: 20,
        height: 5,
        content: `{yellow-fg}{bold}${text}{/bold}{/yellow-fg}`,
        focusable: false,
        mouse: false,
        clickable: false,
      });
      this.screen.render();
      await new Promise(resolve => setTimeout(resolve, 1000));
      box.destroy();
    }
  }

  /**
   * Render game state
   */
  private render(): void {
    const gameState = this.engine.getState();
    const effects = this.engine.getEffectManager();

    // Render board
    this.renderBoard(gameState);

    // Render preview (unless darkness)
    if (!effects.hasDarkness()) {
      this.renderPreview(gameState);
    } else {
      this.previewBox.setContent('{gray-fg}  ???{/gray-fg}');
    }

    // Update inventory
    this.inventoryPanel.updateFromArray(gameState.inventory || []);

    // Update effects overlay
    this.effectOverlay.update(effects);

    // Render stats
    this.statsBox.setContent(
      `Score: {yellow-fg}${gameState.score}{/yellow-fg}  ` +
      `Level: {cyan-fg}${gameState.level}{/cyan-fg}  ` +
      `Lines: {green-fg}${gameState.lines}{/green-fg}`
    );

    // Render sudden death status
    const suddenDeath = this.engine.getSuddenDeath();
    if (suddenDeath && suddenDeath.isEnabled()) {
      this.suddenDeathBox.setContent(suddenDeath.getDisplay());
      this.suddenDeathBox.hidden = false;
      this.suddenDeathBox.setFront();
    } else if (!this.suddenDeathBox.hidden) {
      // Give the board's bottom row back when sudden death is not running.
      this.suddenDeathBox.setContent('');
      this.suddenDeathBox.hidden = true;
    }

    this.screen.render();
  }

  /**
   * Render the game board
   */
  private renderBoard(state: any): void {
    const { board, currentPiece } = state;
    let content = '';

    // Get piece shape
    let pieceShape: number[][] | null = null;
    if (currentPiece) {
      pieceShape = this.engine.getPieceShape(currentPiece.type, currentPiece.rotation);
    }

    // Render each row (TetriNET 12x22 board)
    for (let y = 0; y < board.height; y++) {
      if (y > 0) content += '\n';

      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y]?.[x];
        let char = '  ';  // Empty cell

        // Check if current piece occupies this cell
        if (currentPiece && pieceShape) {
          const px = x - currentPiece.x;
          const py = y - currentPiece.y;
          if (py >= 0 && py < pieceShape.length &&
              px >= 0 && px < pieceShape[py].length &&
              pieceShape[py][px]) {
            char = this.getBlockChar(currentPiece.type);
          }
        }

        // Check if locked cell
        if (char === '  ' && cell?.filled) {
          // Check for special block
          if (cell.special) {
            char = this.getSpecialBlockChar(cell.special);
          } else {
            char = this.getBlockChar(cell.color);
          }
        }

        content += char;
      }
    }

    this.boardBox.setContent(content);
  }

  /**
   * Render piece preview
   */
  private renderPreview(state: any): void {
    const nextPieces = state.nextQueue || [];
    if (nextPieces.length === 0) {
      this.previewBox.setContent('');
      return;
    }

    const pieceType = nextPieces[0];
    const shape = this.engine.getPieceShape(pieceType, 0);
    let content = '';
    for (const row of shape) {
      for (const cell of row) {
        content += cell ? this.getBlockChar(pieceType) : '  ';
      }
      content += '\n';
    }

    this.previewBox.setContent(content);
  }

  /**
   * Update opponent list (external server adapter).
   */
  updateOpponents(opponents: OpponentBoardData[]): void {
    this.opponentBoards.updateBoards(opponents);
    const targets: TargetInfo[] = opponents.map(opponent => ({
      id: opponent.id,
      name: opponent.name,
      level: opponent.level,
      alive: opponent.alive,
      hasImmunity: opponent.hasImmunity,
    }));
    this.targetSelector.setOpponents(targets);
  }

  /**
   * Get colored block character for piece type
   */
  private getBlockChar(type: string): string {
    const colors: Record<string, string> = {
      I: '{cyan-fg}██{/cyan-fg}',
      O: '{yellow-fg}██{/yellow-fg}',
      T: '{magenta-fg}██{/magenta-fg}',
      S: '{green-fg}██{/green-fg}',
      Z: '{red-fg}██{/red-fg}',
      J: '{blue-fg}██{/blue-fg}',
      L: '{white-fg}██{/white-fg}',
    };
    return colors[type] || '{gray-fg}██{/gray-fg}';
  }

  /**
   * Get colored block character for special type
   */
  private getSpecialBlockChar(special: SpecialType): string {
    const chars: Record<SpecialType, string> = {
      add_line: '{red-fg}[A]{/red-fg}',
      clear_line: '{cyan-fg}[C]{/cyan-fg}',
      nuke: '{yellow-fg}[N]{/yellow-fg}',
      random_clear: '{green-fg}[R]{/green-fg}',
      switch: '{magenta-fg}[S]{/magenta-fg}',
      clear_specials: '{blue-fg}[B]{/blue-fg}',
      gravity: '{white-fg}[G]{/white-fg}',
      quake: '{yellow-fg}[Q]{/yellow-fg}',
      block_bomb: '{red-fg}[O]{/red-fg}',
      clear_column: '{cyan-fg}[V]{/cyan-fg}',
      immunity: '{white-fg}[I]{/white-fg}',
      darkness: '{gray-fg}[D]{/gray-fg}',
      confusion: '{magenta-fg}[F]{/magenta-fg}',
      mutation: '{green-fg}[M]{/green-fg}',
      zebra: '{white-fg}[Z]{/white-fg}',
      left_gravity: '{blue-fg}[L]{/blue-fg}',
    };
    return chars[special] || '{gray-fg}[?]{/gray-fg}';
  }

  /**
   * Toggle pause
   */
  private togglePause(): void {
    const gameState = this.engine.getState();
    if (gameState.status === 'playing') {
      this.engine.pause();
    } else if (gameState.status === 'paused') {
      this.engine.resume();
    }
  }

  /**
   * Stop the game
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.running = false;

    // Disable mouse tracking
    this.screen.program.disableMouse();

    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.inventoryPanel.destroy();
    this.targetSelector.destroy();
    this.opponentBoards.destroy();
    this.effectOverlay.destroy();
  }
}
