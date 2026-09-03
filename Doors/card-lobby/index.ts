/**
 * Card Lobby - Neo-Blessed Desktop UI
 *
 * Full-featured multi-window lobby for card games with PokerEngine support.
 */

import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/door-input-manager';
import { GamepadInputManager } from '@amiexpress/bbs-door-sdk/utils/gamepad-input-manager';
import { attachGamepadBindings } from './managers/GamepadBindings';
import { TableFlow } from './managers/TableFlow';
import { UnoEventBus } from './managers/UnoEventBus';
import { GameViews } from './managers/GameViews';
import {
  createTerminalModeSwitch,
  type TerminalModeSwitch,
} from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
import { themeById, themeStyles, type ThemeStyles } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { openThemeMenu } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { ChatManager } from './managers/ChatManager';
import { GamepadButton } from '@amiexpress/bbs-door-sdk/types/gamepad';
import type {
  Screen,
  Box,
  List,
  Button,
  Log,
  Listbar,
  Prompt,
  Question,
  ScrollableText,
  MouseEvent,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  createScreen,
  createBox,
  createList,
  createButton,
  createText,
  createLog
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { DoorLoader } from '@amiexpress/bbs-door-sdk/utils/DoorLoader';
import {
  CardEngine,
  PokerEngine,
  ActionType,
  pokerCardsToCards,
  Storage,
  CardGameAI,
  PokerAIStrategy,
  UnoAIStrategy,
} from '@amiexpress/bbs-door-sdk';
import type { Snapshot } from '@amiexpress/bbs-door-sdk';
import type { Colors } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/core/types';
import { UnoGameEngine, type UnoGameSnapshot } from './lib/uno-engine';
import {
  type DoorSession,
  type LobbyState,
  type LobbyTable,
  type LobbyFilters,
  type PlayerProfile,
  type TablePlayer,
  type TableHandState,
  type LastHandSummary,
  type LeaderboardMode,
  type GameDefinition,
  type GameStake,
  type UnoColor,
  type UnoActionType,
  UI_THEME,
  type ActionButtonKey,
  applyTheme,
  ACTION_BUTTON_STYLES,
  ACTION_BUTTON_ORDER,
  UNO_ACTION_BUTTON_STYLES,
  UNO_ACTION_BUTTON_ORDER,
  CHIP_NAME,
  STARTING_CHIPS,
  DAILY_BONUS,
  DAILY_COOLDOWN_MS,
  WEEK_MS,
  ENTRY_FEE_RATE,
  ACTIVITY_REWARD,
  WIN_REWARD,
  WEEKLY_BULLETIN_NUMBER,
  REFRESH_INTERVAL_MS,
  MAX_ACTIVITY_EVENTS,
  GAME_CATALOG,
  ACHIEVEMENTS,
  LOBBY_BULLETINS,
  LOBBY_KEY,
  PROFILES_KEY,
  PokerAction,
  initLobbyState,
  initProfile,
  initStatsBucket,
  safeNumber,
  pad,
  formatAge,
  formatChips,
  getGameById,
  isBotPlayer,
  isUnoTable,
  isBotId,
  buildBotId,
  buildBotName,
  calculateEntryFee,
  calculateRake,
  getCurrentBet,
  getPlayerBet,
  buildWeeklyBulletin,
  renderCardLines,
  mergeColumns,
  visibleWidth,
} from './lib';
import { buildActivityHints } from './lib/activity-hints';
import { emitLiveChatAnnouncement } from './lib/live-chat';
import { unlockAchievements, recordHandResult } from './lib/achievements';
import { hasRoomForEverything } from './lib/desktop-layout';
import { metadata as doorMetadata } from './lib/metadata';
import { UIManager, DialogManager, GameStateManager } from './managers';
import { createAnnouncer, type DoorAnnouncer } from '@amiexpress/bbs-door-sdk/core/announce';
export { metadata } from './lib/metadata';

/**
 * Main door class
 */
const door = new ServerDoor(doorMetadata);

door.onStart(async (ctx: DoorContext) => {
  const app = new CardLobbyApp(ctx as any);
  await app.run();
});

export default door;

export class CardLobbyApp {
  public session: DoorSession;
  public screen!: Screen;
  private desktop!: Box;
  private inputManager!: DoorInputManager;
  private gamepadManager: GamepadInputManager | null = null;

  // Managers
  public uiManager!: UIManager;
  private dialogManager!: DialogManager;
  private gameStateManager!: GameStateManager;
  public tableFlow!: TableFlow;
  private unoEvents!: UnoEventBus;
  private gameViews!: GameViews;
  private terminalMode!: TerminalModeSwitch;
  /** The board's theme, resolved once: tags, and the palette behind them. */
  private styles!: ThemeStyles;
  /** Resolves the promise onStart is waiting on - see run(). */
  private exitResolve: (() => void) | null = null;

  // UI elements (now accessed via uiManager)
  private get topBar() { return this.uiManager.topBar; }
  private get topInfoBar() { return this.uiManager.topInfoBar; }
  private get statusBar() { return this.uiManager.statusBar; }
  private get logWindow() { return this.uiManager.logWindow; }
  private get lobbyWindow() { return this.uiManager.lobbyWindow; }
  private get tableWindow() { return this.uiManager.tableWindow; }
  private get lobbyList() { return this.uiManager.lobbyList; }
  private get lobbyActions() { return this.uiManager.lobbyActions; }
  public get tableActions() { return this.uiManager.tableActions; }
  public get tableContent() { return this.uiManager.tableContent; }
  public get flopPanel() { return this.uiManager.flopPanel; }
  public get flopContent() { return this.uiManager.flopContent; }
  public get playersPanel() { return this.uiManager.playersPanel; }
  public get playersContent() { return this.uiManager.playersContent; }
  public get handPanel() { return this.uiManager.handPanel; }
  public get handContent() { return this.uiManager.handContent; }
  public get activityPanel() { return this.uiManager.activityPanel; }
  public get activityContent() { return this.uiManager.activityContent; }
  private get actionButtons() { return this.uiManager.actionButtons; }
  private get overlayShade() { return this.uiManager.overlayShade; }
  private get layout() { return this.uiManager.layout; }

  // Animation state and methods (delegated to UIManager)
  public get dealAnimationInProgress() { return this.uiManager.getDealAnimationInProgress(); }
  public runDealAnimation(boardCards: any[], playerHand: any[], flopCardSize: string, handCardSize: string) {
    // The sound effects travel with the animation; UIManager cannot reach the
    // door's own screen program to emit them.
    return this.uiManager.runDealAnimation(
      boardCards,
      playerHand,
      flopCardSize,
      handCardSize,
      (id: string) => this.emitSfx(id),
    );
  }
  public renderBoardAndHand(boardCards: any[], playerHand: any[], flopCardSize: string, handCardSize: string, hasActiveHand: boolean) {
    return this.uiManager.renderBoardAndHand(boardCards, playerHand, flopCardSize, handCardSize, hasActiveHand);
  }
  public layoutTablePanels() {
    return this.uiManager.layoutTablePanels();
  }
  private layoutActionButtons() {
    return this.uiManager.layoutActionButtons();
  }
  private applyActionButtonPalette(action: ActionButtonKey) {
    return this.uiManager.applyActionButtonPalette(action);
  }

  public viewMode: 'lobby' | 'table' = 'lobby';
  private autoDealInProgress = false;
  public lastAnimatedHandStartedAt: number | null = null;
  private actionInProgress = false;

  public lobby: LobbyState | null = null;
  public profiles: Record<string, PlayerProfile> = {};
  public currentProfile: PlayerProfile | null = null;
  private lobbyFilters: LobbyFilters = { gameId: null, openSeatsOnly: false };
  private notices: string[] = [];
  private tableListMap: number[] = [];
  public selectedTableId: number | null = null;
  public selectedUnoCardIndex: number | null = null;

  /** Announcements out to LiveChat and the sysop's webhooks. */
  private readonly announcer: DoorAnnouncer;

  constructor(session: DoorSession) {
    this.session = session;
    this.announcer = createAnnouncer((session as any).bbs);
  }

  async run(): Promise<void> {
    this.setupScreen();

    // Show loading screen while initializing
    const loader = new DoorLoader(this.screen, {
      overlay: true,
      overlayOpacity: 0.6,
      barColor: 'green',
    });

    loader.show('Initializing Card Lobby...');
    this.screen.render();

    await loader.delay(100);
    loader.update(20, 'Loading player profiles...');
    await this.reloadState();

    loader.update(50, 'Setting up game tables...');

    loader.update(70, 'Checking weekly bulletins...');
    // TODO: Re-enable weekly bulletins after testing
    // await this.writeWeeklyBulletinIfNeeded();

    loader.update(85, 'Saving state...');
    await this.persistState();

    loader.update(95, 'Finalizing lobby...');

    // Show simple lobby list (no browser mode)
    this.updateAllPanels();
    this.focusLobby();

    loader.update(100, 'Ready!');
    await loader.delay(500);
    loader.hide();
    loader.destroy();

    // The lobby polls the shared state so tables other nodes create appear,
    // and so a table that fills up deals itself. Nothing had ever started
    // that timer.
    this.unoEvents.startRefreshTimer();

    // The door is open until the player closes it. run() used to paint the
    // lobby, call cleanup() and RETURN, which resolves the promise onStart
    // awaits - so the SDK tore the door down the instant it was drawn and
    // the board's menu came back over a freshly rendered lobby ("cardlobby
    // renders the lobby and exits", 2026-09-02). Teardown belongs to
    // shutdown(), which every exit path already goes through.
    await new Promise<void>((resolve) => {
      this.exitResolve = resolve;
      this.screen.once('destroy', resolve);
    });
  }

  private setupScreen(): void {
    // The board's theme decides every colour this door draws, and it has to
    // be resolved BEFORE the first widget: they read UI_THEME as they are
    // built. A door that skips this looks the same in all seven themes.
    const theme = this.session.bbs?.getTheme ? this.session.bbs.getTheme() : themeById('classic');
    applyTheme(theme);
    this.styles = themeStyles(theme);

    const height = this.session.bbsSession?.screenHeight || 24;

    // Clear BBS output before creating blessed screen
    this.session.bbs.write('\x1b[2J\x1b[H');  // Clear screen and move cursor to home

    this.screen = createScreen(this.session.bbs, {
      height,
      smartCSR: true,
      dockBorders: false,  // Not needed for BBS environment
      fullUnicode: true,
      title: 'Card Lobby v2.0',
      fastCSR: false,      // Disable for stable rendering
      focusKeys: false,    // Prevent arrows from being swallowed
      ignoreLocked: ['mouse', 'keypress'],
      // NOTE: grabKeys is NOT a valid blessed constructor option
      // DoorInputManager.enable() sets screen.program.grabKeys = true (line 265)
    });

    // Clear terminal then flush blessed's internal buffer
    this.screen.program.write('\x1b[2J');
    this.screen.program.write('\x1b[H');
    this.screen.clearRegion(0, this.screen.width as number, 0, this.screen.height as number);
    this.screen.alloc();

    // Set up input management (enables mouse, keyboard routing)
    // DoorInputManager handles all the input routing automatically
    this.inputManager = new DoorInputManager(this.session, this.screen, {
      enableGameMode: false,  // Blessed UI mode, not ncurses game mode
      enableGrabKeys: true,   // Enable grabKeys for browser mode screen handlers
      enableMouse: true,      // Enable mouse events
      debug: true,            // Enable debug logging to diagnose input issues
      debugName: 'CardLobby'
    });
    this.inputManager.enable();

    // The pad's decision table lives in managers/GamepadBindings.ts.
    this.gamepadManager = attachGamepadBindings(this.session, this);

    // Reconnect handler for screen refresh
    if (this.session.bbsSession) {
      this.session.bbsSession.doorReconnectHandler = () => {
        this.screen.clear();
        this.screen.render();
      };
    }

    this.screen.key(['C-c'], () => {
      if (this.modalActive) return;
      this.exitDoor();
    });

    this.screen.key(['q'], () => {
      if (this.modalActive) return;
      this.exitDoor();
    });

    this.screen.key(['tab'], () => {
      if (this.modalActive) return;
      this.cycleFocus(1);
    });

    this.screen.key(['S-tab'], () => {
      if (this.modalActive) return;
      this.cycleFocus(-1);
    });

    this.screen.key(['f'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.triggerFold();
    });

    this.screen.key(['x'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.triggerCheck();
    });

    this.screen.key(['c'], () => {
      if (this.modalActive) return;
      if (this.viewMode === 'table') {
        this.triggerCall();
      } else if (this.viewMode === 'lobby') {
        this.runAction(() => this.tableFlow.createTableFlow());
      }
    });

    this.screen.key(['t'], () => {
      if (this.modalActive) return;
      this.runAction(() => this.saySomething());
    });

    this.screen.key(['r'], () => {
      if (this.modalActive) return;
      if (this.viewMode === 'table') {
        this.triggerRaise();
      } else if (this.viewMode === 'lobby') {
        this.runAction(() => this.manualRefresh());
      }
    });

    // J is NOT bound. The lobby list reads j/k as vi-style down/up, so a J
    // that also joined moved the cursor and joined whatever the cursor had
    // just left. ENTER joins, through the list's own 'select' event.


    this.screen.key(['o'], () => {
      if (this.modalActive || this.viewMode !== 'lobby') return;
      this.runAction(() => this.tableFlow.observeSelectedTable());
    });

    this.screen.key(['l'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.runAction(() => this.tableFlow.leaveCurrentTable());
    });

    this.screen.key(['d'], () => {
      if (this.modalActive) return;
      if (this.viewMode === 'table') {
        this.runAction(() => this.dealHand());
      } else if (this.viewMode === 'lobby') {
        this.runAction(() => this.tableFlow.deleteTableFlow());
      }
    });

    // UNO card selection keys (1-9, 0 for 10th card)
    for (let i = 1; i <= 9; i++) {
      this.screen.key([String(i)], () => {
        if (this.modalActive || this.viewMode !== 'table') return;
        const table = this.currentProfile?.currentTableId
          ? this.findTableById(this.currentProfile.currentTableId)
          : null;
        if (table && (isUnoTable(table))) {
          this.selectUnoCard(i - 1);  // Convert 1-based to 0-based index
        }
      });
    }
    this.screen.key(['0'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      const table = this.currentProfile?.currentTableId
        ? this.findTableById(this.currentProfile.currentTableId)
        : null;
      if (table && (isUnoTable(table))) {
        this.selectUnoCard(9);  // 0 key = 10th card (index 9)
      }
    });

    this.desktop = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      ch: ' ',
      focusable: false,
      mouse: false,
      clickable: false,
      // The desktop is the black ground the windows sit on, not a frame -
      // Panel would give it a white line border for want of the key.
      border: undefined,
      style: {
        bg: UI_THEME.windowBg,
      },
    });

    // Initialize managers
    this.uiManager = new UIManager(this.screen, this.desktop, this.session.bbsSession?.nodeId ?? 1);
    this.gameStateManager = new GameStateManager();
    this.tableFlow = new TableFlow(this);
    this.unoEvents = new UnoEventBus(this, REFRESH_INTERVAL_MS);
    this.gameViews = new GameViews(this);

    // Initialize AI system
    const ai = new CardGameAI();
    ai.registerStrategy(new PokerAIStrategy());
    ai.registerStrategy(new UnoAIStrategy());
    this.gameStateManager.setAI(ai);

    // Build overlay FIRST so overlayShade exists
    this.uiManager.buildOverlay();

    // Now create DialogManager with valid overlayShade
    this.dialogManager = new DialogManager(this.screen, this.uiManager.overlayShade);

    // 80x25 like the board, or the caller's whole terminal on Alt+Enter.
    // A door looks like the board it opened from until the caller asks for
    // more, so this starts FIXED; the panels are laid out from the screen's
    // own size, which makes following a resize a re-layout and a repaint
    // (sdk/utils/terminal-mode.ts).
    this.terminalMode = createTerminalModeSwitch({
      bbs: this.session.bbs,
      screen: this.screen,
      start: 'fixed',
      onRelayout: () => {
        // The windows carry absolute width/height, so following a resize is
        // a re-layout, not just a repaint. relayout() recomputes the SPLIT;
        // applyViewGeometry then puts the windows where the current view
        // wants them, which for a table is the whole screen.
        this.uiManager.relayout();
        this.applyViewGeometry();
        this.updateAllPanels();
        this.screen.render();
      },
    });

    // Build UI via manager
    this.uiManager.buildTopBar({
      focusLobby: this.focusLobby.bind(this),
      focusTable: this.focusTable.bind(this),
      showProfileWindow: () => this.dialogManager.showProfileWindow(this.currentProfile),
      showLeaderboardWindow: () => this.dialogManager.showLeaderboardWindow(this.profiles),
      showAchievementsWindow: () => this.dialogManager.showAchievementsWindow(this.currentProfile),
      showBulletinsWindow: () => this.dialogManager.showBulletinsWindow(this.session),
      showCardStyleWindow: () => this.chooseCardStyle(),
      showThemeWindow: () => this.chooseTheme(),
      saySomething: () => this.saySomething(),
      exitDoor: this.exitDoor.bind(this),
      runAction: this.runAction.bind(this),
    });
    this.uiManager.buildStatusBar();
    this.uiManager.buildWindows({
      onLobbySelect: (index) => {
        // The door owns the row -> table id mapping; updateLobbyPanel fills
        // it every time it sets the rows. UIManager used to pass its own
        // copy, which nothing ever wrote to, so joining always failed with
        // "Select a table first" (2026-09-02).
        this.selectedTableId = this.tableListMap[index] ?? null;
        this.updateTablePanel();
        this.screen.render();
      },
      createTableFlow: () => this.tableFlow.createTableFlow(),
      joinSelectedTable: this.joinSelectedTable.bind(this),
      observeSelectedTable: () => this.tableFlow.observeSelectedTable(),
      toggleFilters: this.toggleFilters.bind(this),
      manualRefresh: this.manualRefresh.bind(this),
      runAction: this.runAction.bind(this),
    });

    // Enter key to join table
    this.uiManager.lobbyList.key('enter', () => {
      if (!this.modalActive && this.selectedTableId) {
        this.runAction(() => this.tableFlow.joinSelectedTable());
      }
    });

    // Double-click to join table
    let lastClickTime = 0;
    const doubleClickThreshold = 500;
    this.uiManager.lobbyList.on('element click', () => {
      const now = Date.now();
      if (now - lastClickTime < doubleClickThreshold && this.selectedTableId) {
        this.runAction(() => this.tableFlow.joinSelectedTable());
      }
      lastClickTime = now;
    });

    // Wire up button press handlers
    this.actionButtons.fold.on('press', () => this.triggerFold());
    this.actionButtons.check.on('press', () => this.triggerCheck());
    this.actionButtons.call.on('press', () => this.triggerCall());
    this.actionButtons.raise.on('press', () => this.triggerRaise());
    this.actionButtons.quit.on('press', () => this.triggerQuit());
  }

  // Delegation methods
  private emitSfx(id: string, params?: Record<string, unknown>): void {
    if (!this.screen?.program) return;
    const payload = JSON.stringify({ id, params });
    this.screen.program.write(`\x1b]9999;sfx;${payload}\x07`);
  }

  public get modalActive(): boolean {
    return this.dialogManager.isModalActive();
  }

  public set modalActive(value: boolean) {
    this.dialogManager.setModalActive(value);
  }

  public runAction(action: () => void | Promise<void>): void {
    if (this.actionInProgress) {
      this.pushNotice('Please wait for current action to complete.');
      return;
    }

    this.actionInProgress = true;
    void (async () => {
      try {
        await action();
      } catch (error) {
        this.pushNotice(`Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.screen.render();
      } finally {
        this.actionInProgress = false;
      }
    })();
  }

  private exitDoor(): void {
    void this.shutdown();
  }

  private async shutdown(): Promise<void> {
    this.unoEvents.stopRefreshTimer();
    if (this.currentProfile?.currentTableId) {
      await this.tableFlow.leaveCurrentTable();
    }
    this.cleanup();

    // CRITICAL: Disable input manager FIRST (restores BBS input state)
    // This also handles grabKeys cleanup internally
    if (this.inputManager) {
      this.inputManager.disable();
    }

    this.screen.destroy();

    // Let run() return, and with it the door.
    const resolve = this.exitResolve;
    this.exitResolve = null;
    resolve?.();
  }

  private cleanup(): void {
    // Remove all event listeners to prevent memory leaks
    if (this.screen) {
      this.screen.removeAllListeners('destroy');
      this.screen.removeAllListeners('keypress');
    }

    if (this.lobbyList) {
      this.lobbyList.removeAllListeners('select');
    }

    if (this.actionButtons) {
      this.actionButtons.fold?.removeAllListeners('press');
      this.actionButtons.check?.removeAllListeners('press');
      this.actionButtons.call?.removeAllListeners('press');
      this.actionButtons.raise?.removeAllListeners('press');
      this.actionButtons.quit?.removeAllListeners('press');
    }

    // Cleanup gamepad manager
    if (this.gamepadManager) {
      this.gamepadManager.destroy();
      this.gamepadManager = null;
    }

    // DoorInputManager handles doorInputHandler cleanup
    if (this.session.bbsSession) {
      delete this.session.bbsSession.doorReconnectHandler;
    }

    // Before the screen goes: a chrome timer writing to a destroyed screen
    // takes the session with it, and stop() puts back any glitched row.
    this.uiManager?.stopChrome();

    // Put the caller's terminal back to 80x25 whatever the door was showing
    this.terminalMode?.dispose();
  }

  public async reloadState(): Promise<void> {
    const globalStore = new Storage({
      doorName: 'card_lobby',
      global: true,
    });

    const lobby = (await globalStore.load<LobbyState>(LOBBY_KEY)) ?? initLobbyState();
    const profiles = (await globalStore.load<Record<string, PlayerProfile>>(PROFILES_KEY)) ?? {};

    const userId = String(this.session.user.id);
    const profile = profiles[userId] ?? initProfile(this.session);
    profile.username = this.session.user.username;
    profiles[userId] = profile;

    this.lobby = lobby;
    this.profiles = profiles;
    this.currentProfile = profile;
    // The renderer draws cards the way this player asked for them.
    this.applyCardPreferences();

    let changed = false;
    lobby.tables.forEach((table) => {
      const updateResult = this.syncBotsForTable(table);
      if (updateResult) changed = true;
      this.updateTableStatus(table);
    });

    if (this.currentProfile.currentTableId) {
      const table = this.findTableById(this.currentProfile.currentTableId);
      const userId = this.currentProfile.userId;
      const stillSeated = table
        ? table.players.some((player) => player.userId === userId)
        : false;
      const stillObserving = table
        ? table.observers.some((observer) => observer.userId === userId)
        : false;
      if (!table || (!stillSeated && !stillObserving)) {
        this.currentProfile.currentTableId = undefined;
        this.currentProfile.status = 'lobby';
        changed = true;
      }
    }

    this.maybeResetBuckets();
    this.maybeGrantDailyBonus();

    if (changed) {
      await this.persistState();
    }
  }

  public async persistState(): Promise<void> {
    if (!this.lobby || !this.currentProfile) return;

    const globalStore = new Storage({
      doorName: 'card_lobby',
      global: true,
    });

    await globalStore.save(LOBBY_KEY, this.lobby);
    await globalStore.save(PROFILES_KEY, this.profiles);
  }

  public findTableById(tableId: number): LobbyTable | undefined {
    return this.lobby?.tables.find((table) => table.id === tableId);
  }

  public loadTableHand(table: LobbyTable): { engine: PokerEngine; beforeStacks: Record<string, number> } | null {
    if (!table.hand) return null;
    // An UNO table has no poker hand. Both games keep their state in
    // `table.hand.snapshot`, so this used to hand an UnoGameSnapshot to
    // PokerEngine.restore, which threw "cannot restore undefined" - and the
    // table screen calls this on every draw, so the notice appeared the
    // moment a game was dealt (reported live 2026-09-02). The guard lives
    // HERE rather than at the call sites: two of the twelve had already
    // forgotten it, and a thirteenth would have too.
    if (isUnoTable(table)) return null;
    try {
      const engine = PokerEngine.restore(table.hand.snapshot) as PokerEngine;
      return { engine, beforeStacks: table.hand.beforeStacks ?? {} };
    } catch (error) {
      this.pushNotice(`Failed to restore hand: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  private saveTableHand(
    table: LobbyTable,
    engine: PokerEngine,
    beforeStacks: Record<string, number>,
    startedAt?: number,
  ): void {
    // CRITICAL: Sanitize snapshot to prevent recursive nesting
    // The @pokertools/engine Snapshot includes `previousStates: Snapshot[]` which
    // creates O(n^2) storage growth as each snapshot contains all prior snapshots.
    // We strip previousStates (not needed for restore) and limit actionHistory.
    const rawSnapshot = engine.snapshot as Snapshot;
    const sanitizedSnapshot: Snapshot = {
      ...rawSnapshot,
      previousStates: [], // Clear recursive history - causes 481MB+ file bloat
      actionHistory: (rawSnapshot.actionHistory || []).slice(-100), // Keep last 100 actions max
    };

    table.hand = {
      snapshot: sanitizedSnapshot,
      beforeStacks,
      startedAt: startedAt ?? table.hand?.startedAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    table.updatedAt = Date.now();
  }

  private clearTableHand(table: LobbyTable): void {
    table.hand = undefined;
    table.updatedAt = Date.now();
  }

  // ============================================================================
  // UNO STATE MANAGEMENT
  // ============================================================================

  public loadUnoGameState(table: LobbyTable): { engine: UnoGameEngine; beforeStacks: Record<string, number> } | null {
    if (!table.hand) return null;
    try {
      const engine = UnoGameEngine.deserialize(table.hand.snapshot as unknown as UnoGameSnapshot);
      return { engine, beforeStacks: table.hand.beforeStacks ?? {} };
    } catch (error) {
      this.pushNotice(`Failed to restore UNO game: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  private saveUnoGameState(
    table: LobbyTable,
    engine: UnoGameEngine,
    beforeStacks: Record<string, number>,
    startedAt?: number,
  ): void {
    const snapshot = engine.serialize();

    table.hand = {
      snapshot: snapshot as any,  // UnoGameSnapshot stored as generic snapshot
      beforeStacks,
      startedAt: startedAt ?? table.hand?.startedAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    table.updatedAt = Date.now();
  }

  public getHumanPlayers(table: LobbyTable): TablePlayer[] {
    return table.players.filter((player) => player.role === 'player' && !isBotPlayer(player));
  }

  public getOpenHumanSeats(table: LobbyTable): number {
    const humans = this.getHumanPlayers(table).length;
    return Math.max(0, table.maxPlayers - humans);
  }

  public syncBotsForTable(table: LobbyTable): boolean {
    const humans = this.getHumanPlayers(table);
    const bustedBots = table.players.filter((player) => player.role === 'player' && isBotPlayer(player) && player.stack <= 0);
    if (bustedBots.length > 0) {
      const bustedIds = new Set(bustedBots.map((bot) => bot.userId));
      table.players = table.players.filter((player) => !bustedIds.has(player.userId));
    }

    const bots = table.players.filter((player) => player.role === 'player' && isBotPlayer(player));
    const targetBots = Math.max(0, table.maxPlayers - humans.length);

    let changed = false;

    if (bustedBots.length > 0) changed = true;

    if (bots.length > targetBots) {
      const removeCount = bots.length - targetBots;
      const botIds = bots.slice(-removeCount).map((bot) => bot.userId);
      table.players = table.players.filter((player) => !botIds.includes(player.userId));
      changed = true;
    }

    if (bots.length < targetBots) {
      const takenSeats = new Set(table.players.map((player) => player.seat));
      for (let seat = 0; seat < table.maxPlayers; seat += 1) {
        if (table.players.filter((p) => p.role === 'player' && isBotPlayer(p)).length >= targetBots) {
          break;
        }
        if (takenSeats.has(seat)) continue;

        const botId = buildBotId(table.id, seat);
        table.players.push({
          userId: botId,
          username: buildBotName(seat),
          seat,
          stack: table.buyIn,
          buyIn: table.buyIn,
          role: 'player',
          joinedAt: Date.now(),
          isBot: true,
        });
        takenSeats.add(seat);
        changed = true;
      }
    }

    return changed;
  }

  public updateTableStatus(table: LobbyTable): void {
    if (table.hand) {
      // Game is actually in progress
      table.status = 'in-progress';
      return;
    }
    // No hand in progress - table is open
    table.status = 'open';
  }

  private maybeGrantDailyBonus(): void {
    if (!this.currentProfile) return;
    const now = Date.now();
    if (now - this.currentProfile.wallet.lastDailyGrant < DAILY_COOLDOWN_MS) return;

    this.currentProfile.wallet.chips += DAILY_BONUS;
    this.currentProfile.wallet.lifetimeEarned += DAILY_BONUS;
    this.currentProfile.wallet.lastDailyGrant = now;
    this.pushNotice(`Daily bonus: +${DAILY_BONUS} ${CHIP_NAME}`);
  }

  private maybeResetBuckets(): void {
    if (!this.lobby) return;
    const now = Date.now();
    if (now - this.lobby.lastDailyReset >= DAILY_COOLDOWN_MS) {
      Object.values(this.profiles).forEach((profile) => {
        profile.stats.daily = initStatsBucket();
      });
      this.lobby.lastDailyReset = now;
    }

    if (now - this.lobby.lastWeeklyReset >= WEEK_MS) {
      Object.values(this.profiles).forEach((profile) => {
        profile.stats.weekly = initStatsBucket();
      });
      this.lobby.lastWeeklyReset = now;
    }
  }

  public pushNotice(message: string): void {
    this.notices.push(message);
    if (this.notices.length > 3) this.notices.shift();
    this.updateStatusBar();
  }

  /**
   * Tell the board something worth telling other people - a table open to
   * join, a game started, a winner. Reaches LiveChat and whatever Discord or
   * Slack webhooks the sysop has subscribed to `door_announcement`
   * (sdk/core/announce.ts).
   *
   * The door used to say these things only to the people already looking at
   * it: pushEvent writes the door's own activity panel, and emitLiveChat
   * reaches the board's chat. Neither leaves the building.
   */
  public get announce(): DoorAnnouncer {
    return this.announcer;
  }

  public pushEvent(message: string): void {
    if (!this.lobby) return;
    this.lobby.events.unshift({ message, createdAt: Date.now() });
    if (this.lobby.events.length > MAX_ACTIVITY_EVENTS) {
      this.lobby.events = this.lobby.events.slice(0, MAX_ACTIVITY_EVENTS);
    }
    this.logWindow.log(message);
    this.updateActivityPanel();
    this.chat.paint();
  }

  /**
   * Ask how this player wants cards drawn, remember it, and redraw.
   *
   * The preference lives on the profile, so it follows the player between
   * sessions and between games - the same choice covers a poker board and
   * an UNO discard pile.
   */
  /**
   * Change the door's theme without leaving the door.
   *
   * The panel previews as the highlight moves: openThemeMenu re-tints every
   * widget on screen, and `onApply` re-points UI_THEME so anything this door
   * builds AFTER the switch - a dialog, a repainted panel - is built in the
   * new colours rather than the old ones.
   */
  /**
   * The lobby's chat. The door is the host, the way it is for the UNO event
   * bus: the state, the dialogs and the panels all live here already.
   */
  private chat = new ChatManager(this);

  /** The table this player is sitting at, for tagging what they say. */
  public get currentTableId(): number | null {
    return this.currentProfile?.currentTableId ?? null;
  }

  public chatHasItsOwnPanel(): boolean {
    return this.uiManager.chatHasItsOwnPanel();
  }

  public setChatLines(lines: string[]): void {
    this.uiManager.setChatLines(lines);
  }

  public promptForLine(title: string, text: string): Promise<string | null> {
    return this.dialogManager.showPromptDialog(title, text, '');
  }

  public render(): void {
    this.screen.render();
  }

  /** T talks. The lobby had no way to say anything at all until now. */
  private async saySomething(): Promise<void> {
    await this.chat.saySomething();
  }

  private async chooseTheme(): Promise<void> {
    await openThemeMenu({
      screen: this.screen,
      bbs: this.session.bbs,
      parent: this.uiManager.overlayShade,
      onApply: (theme) => {
        applyTheme(theme);
        this.styles = themeStyles(theme);
      },
    });
    this.updateAllPanels();
    this.screen.render();
  }

  private async chooseCardStyle(): Promise<void> {
    const unicodeCapable =
      Boolean((this.session.bbs as { unicodeCapable?: boolean })?.unicodeCapable);

    // The panel stays open; every change lands on the profile and repaints
    // the table straight away, so a style is judged on real cards.
    const chosen = await this.dialogManager.showCardStyleWindow(
      this.currentProfile,
      unicodeCapable,
      (preferences) => {
        if (!this.currentProfile) return;
        this.currentProfile.cards = preferences;
        this.applyCardPreferences();
        this.updateAllPanels();
      },
    );
    if (!chosen || !this.currentProfile) return;

    this.currentProfile.cards = chosen;
    this.applyCardPreferences();
    await this.persistState();
    this.updateAllPanels();
  }

  /** Hand the renderer the player's card preferences and this terminal's reach. */
  public applyCardPreferences(): void {
    this.uiManager.cardPreferences = this.currentProfile?.cards;
    this.uiManager.unicodeCapable =
      Boolean((this.session.bbs as { unicodeCapable?: boolean })?.unicodeCapable);
  }

  public emitLiveChat(message: string): void {
    emitLiveChatAnnouncement(this.session as any, message);
  }

  private updateStatusBar(): void {
    if (!this.currentProfile) return;
    const statusLabel = this.currentProfile.currentTableId
      ? `Table #${this.currentProfile.currentTableId}`
      : this.currentProfile.status;
    // Each part is its own section: the bar owns the separator and the
    // widths, so a notice arriving does not rebuild the whole line.
    const bar = this.statusBar as unknown as {
      setSection?: (id: string, content: string) => void;
      setContent: (text: string) => void;
    };

    if (bar.setSection) {
      bar.setSection('user', this.currentProfile.username);
      bar.setSection('chips', `Chips: ${this.currentProfile.wallet.chips}`);
      bar.setSection('where', statusLabel);
      bar.setSection('notice', this.notices.join(' '));
    } else {
      const label = ` ${this.currentProfile.username} | Chips: ${this.currentProfile.wallet.chips} | ${statusLabel} `;
      bar.setContent(label.slice(0, 80));
    }
    this.screen.render();
  }

  /**
   * What the table strip says. PAINTING it belongs to UIManager, which owns
   * the widget and its width - this works out the two numbers the bar needs
   * from the engine and hands them over.
   */
  public updateTopInfoBar(): void {
    if (!this.currentProfile || !this.lobby) return;
    const tableId = this.currentProfile.currentTableId ?? this.selectedTableId;
    const table = tableId ? this.findTableById(tableId) : null;
    if (!table) {
      this.uiManager.renderTableInfoBar(null, 0, '');
      return;
    }

    const state = this.loadTableHand(table)?.engine.state;
    const seat = state?.actionTo;
    const actor = seat === null || seat === undefined ? undefined : state?.players[seat];
    const turnLabel = !actor?.name
      ? ''
      : actor.id === this.currentProfile.userId ? 'Your turn' : `Turn: ${actor.name}`;

    const pot = state ? state.pots.reduce((sum, potItem) => sum + potItem.amount, 0) : 0;
    this.uiManager.renderTableInfoBar(table, pot, turnLabel);
  }

  public updateActivityPanel(tableOverride?: LobbyTable | null, engineOverride?: PokerEngine | null): void {
    if (!this.lobby) return;

    let table: LobbyTable | null = tableOverride ?? null;
    if (!table && this.currentProfile?.currentTableId) {
      table = this.findTableById(this.currentProfile.currentTableId) ?? null;
    }

    const hintLines = buildActivityHints({
      viewMode: this.viewMode,
      table: table as any,
      isUno: table ? isUnoTable(table) : false,
      userId: this.currentProfile?.userId ?? null,
      engine: (engineOverride ?? (table ? this.loadTableHand(table)?.engine : null) ?? null) as any,
    });

    const eventLines = this.lobby.events.length > 0
      ? [...this.lobby.events].reverse().map((event) => event.message)
      : ['No activity yet.'];
    const lines = hintLines.length > 0 ? [...hintLines, '', ...eventLines] : eventLines;

    // One painter owns the panel: it wraps to the panel's own width and holds
    // the reader's scroll position (UIManager.paintActivity).
    this.uiManager.setActivityBody(lines);
  }

  public updateAllPanels(): void {
    if (this.viewMode === 'table' && !this.currentProfile?.currentTableId) {
      this.applyViewMode('lobby');
    } else if (this.viewMode === 'table') {
      this.syncViewMode();
    } else {
      this.applyViewMode('lobby');
    }
    this.updateLobbyPanel();
    this.updateTablePanel();
    this.updateStatusBar();
    this.updateTopInfoBar();
    this.updateActivityPanel();
    this.screen.render();
    void this.maybeAutoDealCurrentTable();
  }

  private async maybeAutoDealCurrentTable(): Promise<void> {
    if (!this.currentProfile || !this.lobby) return;
    if (!this.currentProfile.currentTableId) return;
    const table = this.findTableById(this.currentProfile.currentTableId);
    if (!table) return;
    await this.maybeAutoDeal(table);
  }

  private async maybeAutoDeal(table: LobbyTable): Promise<void> {
    if (this.autoDealInProgress || this.modalActive || !this.currentProfile) return;
    if (table.gameId !== 'holdem') return;
    if (this.tableFlow.isObserverForTable(table, this.currentProfile.userId)) return;
    const seatedPlayers = table.players.filter((player) => player.role === 'player' && player.stack > 0);
    if (seatedPlayers.length < table.minPlayers) return;
    if (table.hand) return;

    this.autoDealInProgress = true;
    try {
      await this.startHoldemHand(table);
    } finally {
      this.autoDealInProgress = false;
    }
  }

  public updateLobbyPanel(): void {
    if (!this.lobby) return;
    const filterName = this.lobbyFilters.gameId
      ? getGameById(this.lobbyFilters.gameId)?.name ?? 'Unknown'
      : 'All Games';

    // Short label that fits in 30% window width
    this.lobbyWindow.setLabel(` Lobby - ${filterName} `);

    const rows: string[][] = [];
    const map: number[] = [];

    const filtered = this.lobby.tables.filter((table) => {
      if (this.lobbyFilters.gameId && table.gameId !== this.lobbyFilters.gameId) return false;
      if (this.lobbyFilters.openSeatsOnly && this.getOpenHumanSeats(table) === 0) return false;
      return true;
    });

    filtered.forEach((table) => {
      const humanCount = this.getHumanPlayers(table).length;
      const seats = `${humanCount}/${table.maxPlayers}`;
      // ListTable uses array of arrays - each cell is a separate string
      rows.push([
        String(table.id),
        table.gameName,
        table.stakesLabel,
        seats,
        table.status.toUpperCase(),
      ]);
      map.push(table.id);
    });

    if (rows.length === 0) {
      rows.push(['-', 'No tables yet', '', '', '']);
    }

    this.tableListMap = map;
    this.uiManager.lobbyList.setRows(rows);

    if (map.length === 0) {
      this.selectedTableId = null;
    } else if (this.selectedTableId === null && map.length > 0) {
      this.selectedTableId = map[0];
      this.lobbyList.select(0);
    }
  }

  private updateTablePanel(): void {
    // The painting lives with the other table painting
    // (managers/GameViews.ts); this door is at the repo's line ceiling
    // and has been shaved four times already to stay under it.
    this.gameViews.updateTablePanel();
  }

  private getActionContext(): { table: LobbyTable | null; isObserver: boolean; canAct: boolean; toCall: number } {
    if (!this.currentProfile || !this.lobby) {
      return { table: null, isObserver: false, canAct: false, toCall: 0 };
    }

    const table = this.currentProfile.currentTableId ? this.findTableById(this.currentProfile.currentTableId) : null;
    if (!table) {
      return { table: null, isObserver: false, canAct: false, toCall: 0 };
    }

    const isObserver = this.tableFlow.isObserverForTable(table, this.currentProfile.userId);
    let toCall = 0;
    const handState = this.loadTableHand(table);
    let canAct = false;
    if (handState) {
      const actionSeat = handState.engine.state.actionTo;
      if (actionSeat !== null && actionSeat !== undefined) {
        const actor = handState.engine.state.players[actionSeat];
        if (actor?.id === this.currentProfile.userId) {
          const currentBet = getCurrentBet(handState.engine);
          const playerBet = getPlayerBet(handState.engine, actionSeat);
          toCall = Math.max(0, currentBet - playerBet);
          canAct = !isObserver;
        }
      }
    }

    return { table, isObserver, canAct, toCall };
  }

  public triggerFold(): void {
    if (this.modalActive) return;
    const { canAct } = this.getActionContext();
    if (!canAct) return;
    this.runAction(() => this.handlePlayerAction('fold'));
  }

  private triggerCheck(): void {
    if (this.modalActive) return;
    if (this.currentProfile?.currentTableId && this.lobby) {
      const table = this.findTableById(this.currentProfile.currentTableId);

      // Route to appropriate game handler
      if (table && (isUnoTable(table))) {
        const gameState = this.loadUnoGameState(table);
        if (!gameState) {
          this.runAction(() => this.dealHand());
          return;
        }
        // For UNO, CHECK button becomes PLAY CARD
        this.triggerUnoPlayCard();
        return;
      }

      const handState = table ? this.loadTableHand(table) : null;
      if (!handState) {
        this.runAction(() => this.dealHand());
        return;
      }
    }
    const { canAct, toCall } = this.getActionContext();
    if (!canAct) return;
    if (toCall > 0) {
      this.pushNotice(`Cannot check. Call ${toCall} or fold.`);
      return;
    }
    this.runAction(() => this.handlePlayerAction('call'));
  }

  public triggerCall(): void {
    if (this.modalActive) return;

    // Route to UNO handler if UNO game
    if (this.currentProfile?.currentTableId && this.lobby) {
      const table = this.findTableById(this.currentProfile.currentTableId);
      if (table && (isUnoTable(table))) {
        this.triggerUnoDrawCard();
        return;
      }
    }

    const { canAct } = this.getActionContext();
    if (!canAct) return;
    this.runAction(() => this.handlePlayerAction('call'));
  }

  public triggerRaise(): void {
    if (this.modalActive) return;

    // Route to UNO handler if UNO game
    if (this.currentProfile?.currentTableId && this.lobby) {
      const table = this.findTableById(this.currentProfile.currentTableId);
      if (table && (isUnoTable(table))) {
        this.triggerUnoCallUno();
        return;
      }
    }

    const { canAct } = this.getActionContext();
    if (!canAct) return;
    this.runAction(() => this.handlePlayerAction('bet'));
  }

  private triggerQuit(): void {
    if (this.modalActive) return;

    // Route to UNO handler if UNO game
    if (this.currentProfile?.currentTableId && this.lobby) {
      const table = this.findTableById(this.currentProfile.currentTableId);
      if (table && (isUnoTable(table))) {
        this.triggerUnoChallenge();
        return;
      }
    }

    this.exitDoor();
  }

  // ============================================================================
  // UNO ACTION TRIGGERS
  // ============================================================================

  private triggerUnoPlayCard(): void {
    if (this.modalActive || !this.currentProfile || !this.lobby) return;
    const table = this.currentProfile.currentTableId
      ? this.findTableById(this.currentProfile.currentTableId)
      : null;
    if (!table) return;

    const gameState = this.loadUnoGameState(table);
    if (!gameState) return;

    const state = gameState.engine.getGameState();
    const currentPlayer = state.players[state.currentPlayerIndex];

    // Check if it's the player's turn
    if (currentPlayer.id !== this.currentProfile.userId) {
      this.pushNotice('Not your turn.');
      return;
    }

    // Check if a card is selected
    if (this.selectedUnoCardIndex === null) {
      this.pushNotice('Select a card first (keys 1-9, 0).');
      return;
    }

    const card = currentPlayer.hand[this.selectedUnoCardIndex];
    if (!card) {
      this.pushNotice('Invalid card selection.');
      return;
    }

    // Check if card is playable
    if (!gameState.engine.canPlayCard(this.currentProfile.userId, card)) {
      this.pushNotice('Cannot play that card.');
      return;
    }

    // If wild card, we'll prompt for color in handleUnoAction
    this.runAction(async () => {
      await this.handleUnoAction('play-card', this.selectedUnoCardIndex ?? undefined);
      this.selectedUnoCardIndex = null;
    });
  }

  public triggerUnoDrawCard(): void {
    if (this.modalActive || !this.currentProfile || !this.lobby) return;
    const table = this.currentProfile.currentTableId
      ? this.findTableById(this.currentProfile.currentTableId)
      : null;
    if (!table) return;

    const gameState = this.loadUnoGameState(table);
    if (!gameState) return;

    const state = gameState.engine.getGameState();
    const currentPlayer = state.players[state.currentPlayerIndex];

    // Check if it's the player's turn
    if (currentPlayer.id !== this.currentProfile.userId) {
      this.pushNotice('Not your turn.');
      return;
    }

    this.runAction(() => this.handleUnoAction('draw-card'));
  }

  public triggerUnoCallUno(): void {
    if (this.modalActive || !this.currentProfile || !this.lobby) return;
    const table = this.currentProfile.currentTableId
      ? this.findTableById(this.currentProfile.currentTableId)
      : null;
    if (!table) return;

    const gameState = this.loadUnoGameState(table);
    if (!gameState) return;

    const player = gameState.engine.getPlayer(this.currentProfile.userId);
    if (!player) return;

    // Check if player has 1 card (can call UNO)
    if (player.hand.length !== 1) {
      this.pushNotice('You can only call UNO when you have 1 card left.');
      return;
    }

    if (player.calledUno) {
      this.pushNotice('You already called UNO.');
      return;
    }

    this.runAction(() => this.handleUnoAction('call-uno'));
  }

  private triggerUnoChallenge(): void {
    if (this.modalActive || !this.currentProfile || !this.lobby) return;
    const table = this.currentProfile.currentTableId
      ? this.findTableById(this.currentProfile.currentTableId)
      : null;
    if (!table) return;

    const gameState = this.loadUnoGameState(table);
    if (!gameState) return;

    const state = gameState.engine.getGameState();

    // Check if there's an active challenge window
    if (!state.challengeWindow) {
      this.pushNotice('No challenge available.');
      return;
    }

    // Check if player is eligible to challenge
    if (!state.challengeWindow.eligibleChallengers.includes(this.currentProfile.userId)) {
      this.pushNotice('You cannot challenge this action.');
      return;
    }

    // Determine challenge type
    const challengeType = state.challengeWindow.type === 'uno'
      ? 'challenge-uno'
      : 'challenge-wild-four';

    this.runAction(() => this.handleUnoAction(challengeType as UnoActionType));
  }

  public updateTableActions(): void {
    if (!this.currentProfile || !this.lobby) return;
    if (this.viewMode !== 'table' || !this.currentProfile.currentTableId) {
      this.tableActions.hide();
      return;
    }

    this.tableActions.show();

    const table = this.findTableById(this.currentProfile.currentTableId);

    // Detect game type and update button labels
    if (table && (isUnoTable(table))) {
      this.updateUnoActionButtons(table);
    } else {
      this.updatePokerActionButtons(table ?? null);
    }

    this.layoutActionButtons();
  }

  private updatePokerActionButtons(table: LobbyTable | null): void {
    this.actionButtons.fold.setContent('FOLD');
    const handState = table ? this.loadTableHand(table) : null;
    this.actionButtons.check.setContent(handState ? 'CHECK' : 'DEAL');
    this.actionButtons.call.setContent('CALL');
    this.actionButtons.raise.setContent('RAISE');
    this.actionButtons.quit.setContent('QUIT');

    this.applyActionButtonPalette('fold');
    this.applyActionButtonPalette('check');
    this.applyActionButtonPalette('call');
    this.applyActionButtonPalette('raise');
    this.applyActionButtonPalette('quit');
  }

  private updateUnoActionButtons(table: LobbyTable): void {
    const gameState = this.loadUnoGameState(table);
    const state = gameState?.engine.getGameState();

    // Fold button -> hidden (not used in UNO)
    this.actionButtons.fold.hide();

    // Check button -> PLAY CARD / DEAL
    if (!gameState) {
      this.actionButtons.check.setContent('DEAL');
    } else {
      this.actionButtons.check.setContent('PLAY');
    }

    // Call button -> DRAW
    this.actionButtons.call.setContent('DRAW');

    // Raise button -> UNO
    this.actionButtons.raise.setContent('UNO');

    // Quit button -> CHALLENGE (if window active) or QUIT
    if (state?.challengeWindow) {
      this.actionButtons.quit.setContent('CHALLENGE');
    } else {
      this.actionButtons.quit.setContent('QUIT');
    }

    // Apply UNO button styles
    this.applyUnoButtonPalette('check', 'play');
    this.applyUnoButtonPalette('call', 'draw');
    this.applyUnoButtonPalette('raise', 'uno');
    if (state?.challengeWindow) {
      this.applyUnoButtonPalette('quit', 'challenge');
    } else {
      this.applyUnoButtonPalette('quit', 'quit');
    }
  }

  private applyUnoButtonPalette(
    buttonKey: 'fold' | 'check' | 'call' | 'raise' | 'quit',
    unoKey: 'play' | 'draw' | 'uno' | 'challenge' | 'quit'
  ): void {
    const button = this.actionButtons[buttonKey];
    const styleSet = UNO_ACTION_BUTTON_STYLES[unoKey];
    if (!button || !styleSet) return;

    // Apply base style
    button.style.fg = styleSet.base.fg;
    button.style.bg = styleSet.base.bg;

    // Note: hover and focus styles would be applied by blessed's event handlers
    // For now, we just set the base style
  }

  public focusLobby(): void {
    this.applyViewMode('lobby');
    this.lobbyList.focus();
    this.screen.render();
  }

  public focusTable(): void {
    const wantsTable = Boolean(this.currentProfile?.currentTableId);
    this.applyViewMode(wantsTable ? 'table' : 'lobby');
    if (this.viewMode === 'table') {
      this.playersContent.focus();
    } else {
      this.tableContent.focus();
    }
    this.screen.render();
  }

  private cycleFocus(direction: 1 | -1): void {
    const focusOrder: Array<any> = this.viewMode === 'table'
      ? [
        this.playersContent,
        this.activityContent,
        this.actionButtons.fold,
        this.actionButtons.check,
        this.actionButtons.call,
        this.actionButtons.raise,
        this.actionButtons.quit,
      ]
      : [this.lobbyList, this.tableContent];

    // A ring may only contain widgets that can actually take focus. The
    // lobby's ring held two hint bars built `focusable: false`, so Tab moved
    // focus to something that refused it and the door looked dead - reported
    // as "tab does nothing" (2026-09-02).
    const ring = focusOrder.filter((item) =>
      item && !item.hidden && typeof item.focus === 'function' && item.options?.focusable !== false,
    );
    if (ring.length === 0) return;

    // getFocused() is the focused ELEMENT. `screen.focused` is the boolean
    // every Element carries for itself, so comparing widgets against it never
    // matched: Tab re-focused the first widget in the ring every time, which
    // is what "tab does nothing" looked like (2026-09-02).
    const current = this.screen.getFocused();
    const currentIndex = ring.findIndex((item) => item === current);
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + direction + ring.length) % ring.length;
    const next = ring[nextIndex];
    if (next?.focus) {
      next.focus();
      this.screen.render();
    }
  }

  private syncViewMode(): void {
    const wantsTable = Boolean(this.currentProfile?.currentTableId);
    this.applyViewMode(wantsTable ? 'table' : 'lobby');
  }

  public applyViewMode(mode: 'lobby' | 'table'): void {
    if (!this.layout) return;
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.applyViewGeometry();
    this.screen.render();
  }

  /**
   * Put the two windows where the CURRENT view wants them.
   *
   * This used to live inside applyViewMode, which returns early when the mode
   * has not changed - so a resize could not re-apply it, and UIManager's own
   * relayout() re-imposed the lobby/table SPLIT whatever was on screen. Alt+
   * Enter at a table therefore produced a table pinned to the right of a wide
   * terminal with a third of the screen black (reported 2026-09-02, with a
   * screenshot). Both callers come through here now.
   */
  public applyViewGeometry(): void {
    if (!this.layout) return;
    const { width, leftWidth, rightWidth, mainHeight, tableHeight } = this.layout;

    // LIVE properties, not `options`: that seeds a widget once and is never
    // read again, so writing it left the window as narrow as it was built.
    // A terminal with room for everything shows everything: the lobby and
    // its chat log stay where they are and the table takes the rest, rather
    // than the door hiding half of itself on a screen that could hold it
    // (lib/desktop-layout.ts).
    const roomForEverything = hasRoomForEverything(
      Number(this.screen.width) || 80,
      Number(this.screen.height) || 25,
    );

    if (this.viewMode === 'table' && !roomForEverything) {
      this.lobbyWindow.hide();
      this.tableWindow.show();
      this.tableWindow.left = 0;
      this.tableWindow.width = width;
      this.tableWindow.height = tableHeight;
      this.logWindow.hide();
      this.topBar.show();
      this.topInfoBar.hide();
    } else {
      this.lobbyWindow.show();
      this.lobbyWindow.left = 0;
      this.lobbyWindow.width = leftWidth;
      this.tableWindow.show();
      this.tableWindow.left = leftWidth;
      this.tableWindow.width = rightWidth;
      this.tableWindow.height = mainHeight;
      this.logWindow.show();
      this.topBar.show();
      this.topInfoBar.hide();
    }

    this.layoutTablePanels();
  }

  private toggleFilters(): void {
    if (this.modalActive) return;
    if (!this.lobbyFilters.gameId) {
      const firstGame = GAME_CATALOG.find((game) => game.enabled);
      this.lobbyFilters.gameId = firstGame?.id ?? null;
    } else if (!this.lobbyFilters.openSeatsOnly) {
      this.lobbyFilters.openSeatsOnly = true;
    } else {
      this.lobbyFilters.gameId = null;
      this.lobbyFilters.openSeatsOnly = false;
    }
    this.updateLobbyPanel();
    this.screen.render();
  }

  /** The pad and the key bindings ask the door; the door asks the flow. */
  public joinSelectedTable(): Promise<void> {
    return this.tableFlow.joinSelectedTable();
  }

  public leaveCurrentTable(): Promise<void> {
    return this.tableFlow.leaveCurrentTable();
  }

  public async manualRefresh(): Promise<void> {
    if (this.modalActive) return;
    await this.reloadState();
    this.updateAllPanels();
  }









  private async dealHand(): Promise<void> {
    if (this.modalActive || !this.currentProfile || !this.lobby) return;
    const tableId = this.currentProfile.currentTableId ?? this.selectedTableId;
    if (!tableId) {
      this.pushNotice('Select a table first.');
      return;
    }

    await this.reloadState();
    const table = this.findTableById(tableId);
    if (!table) {
      this.pushNotice('Table not found.');
      return;
    }

    const isObserver = this.tableFlow.isObserverForTable(table, this.currentProfile.userId);
    if (isObserver) {
      this.pushNotice('Observers cannot deal hands.');
      return;
    }

    if (table.hand) {
      this.pushNotice('Game already in progress.');
      return;
    }

    if (table.gameId === 'holdem') {
      await this.startHoldemHand(table);
    } else if (isUnoTable(table)) {
      await this.startUnoGame(table);
    } else {
      this.pushNotice(`${table.gameName} is not implemented yet.`);
      return;
    }

    this.updateAllPanels();
  }

  private handleAchievementUnlocks(profile: PlayerProfile): void {
    for (const unlocked of unlockAchievements(profile)) {
      this.pushNotice(`Achievement unlocked: ${unlocked.name} (+${unlocked.reward})`);
    }
  }

  private updateStatsAfterHand(profile: PlayerProfile, delta: number, pot: number): void {
    recordHandResult(profile, delta, pot);
  }

  // Game state delegation methods
  private async finalizeHoldemHand(table: LobbyTable, engine: PokerEngine, beforeStacks: Record<string, number>): Promise<void> {
    await this.gameStateManager.finalizeHoldemHand(table, engine, beforeStacks, this.lobby, this.profiles, this.currentProfile, {
      clearTableHand: this.clearTableHand.bind(this),
      updateTableStatus: this.updateTableStatus.bind(this),
      updateStatsAfterHand: this.updateStatsAfterHand.bind(this),
      handleAchievementUnlocks: this.handleAchievementUnlocks.bind(this),
      pushNotice: this.pushNotice.bind(this),
      pushEvent: this.pushEvent.bind(this),
      emitLiveChat: this.emitLiveChat.bind(this),
      writeWeeklyBulletinIfNeeded: () => this.dialogManager.writeWeeklyBulletinIfNeeded(this.lobby, this.profiles, this.session),
      persistState: this.persistState.bind(this),
    });
  }

  private async startHoldemHand(table: LobbyTable): Promise<void> {
    await this.gameStateManager.startHoldemHand(table, this.lobby, this.currentProfile, {
      reloadState: this.reloadState.bind(this),
      findTableById: this.findTableById.bind(this),
      saveTableHand: this.saveTableHand.bind(this),
      updateTableStatus: this.updateTableStatus.bind(this),
      clearTableHand: this.clearTableHand.bind(this),
      pushNotice: this.pushNotice.bind(this),
      pushEvent: this.pushEvent.bind(this),
      persistState: this.persistState.bind(this),
      advanceHoldemHand: this.advanceHoldemHand.bind(this),
    });
  }

  private async advanceHoldemHand(table: LobbyTable, engineOverride?: PokerEngine, beforeStacksOverride?: Record<string, number>): Promise<void> {
    await this.gameStateManager.advanceHoldemHand(table, engineOverride, beforeStacksOverride, this.lobby, this.currentProfile, {
      loadTableHand: this.loadTableHand.bind(this),
      saveTableHand: this.saveTableHand.bind(this),
      persistState: this.persistState.bind(this),
      updateTablePanel: this.updateTablePanel.bind(this),
      performBotAction: this.performBotAction.bind(this),
      finalizeHoldemHand: this.finalizeHoldemHand.bind(this),
      maybeAutoDeal: this.maybeAutoDeal.bind(this),
      pushNotice: this.pushNotice.bind(this),
    });
  }

  private async performBotAction(engine: PokerEngine, seat: number, playerId: string, table: LobbyTable): Promise<void> {
    await this.gameStateManager.performBotAction(engine, seat, playerId, this.pushEvent.bind(this), table);
  }

  private async handlePlayerAction(action: 'call' | 'bet' | 'fold'): Promise<void> {
    await this.gameStateManager.handlePlayerAction(action, this.currentProfile, this.lobby, {
      reloadState: this.reloadState.bind(this),
      findTableById: this.findTableById.bind(this),
      loadTableHand: this.loadTableHand.bind(this),
      saveTableHand: this.saveTableHand.bind(this),
      persistState: this.persistState.bind(this),
      advanceHoldemHand: this.advanceHoldemHand.bind(this),
      pushNotice: this.pushNotice.bind(this),
      showPromptDialog: (title, text, value) => this.dialogManager.showPromptDialog(title, text, value),
    });
  }

  // ============================================================================
  // UNO GAME METHODS
  // ============================================================================

  private async startUnoGame(table: LobbyTable): Promise<void> {
    await this.gameStateManager.startUnoGame(table, this.lobby, this.currentProfile, {
      reloadState: this.reloadState.bind(this),
      findTableById: this.findTableById.bind(this),
      saveUnoGameState: this.saveUnoGameState.bind(this),
      updateTableStatus: this.updateTableStatus.bind(this),
      clearTableHand: this.clearTableHand.bind(this),
      pushNotice: this.pushNotice.bind(this),
      pushEvent: this.pushEvent.bind(this),
      persistState: this.persistState.bind(this),
      advanceUnoGame: this.advanceUnoGame.bind(this),
      broadcastEvent: this.unoEvents.broadcastUnoEvent.bind(this.unoEvents),
    });
  }

  private async advanceUnoGame(table: LobbyTable, engineOverride?: UnoGameEngine, beforeStacksOverride?: Record<string, number>): Promise<void> {
    await this.gameStateManager.advanceUnoGame(table, engineOverride, beforeStacksOverride, this.lobby, this.currentProfile, {
      loadUnoGameState: this.loadUnoGameState.bind(this),
      saveUnoGameState: this.saveUnoGameState.bind(this),
      persistState: this.persistState.bind(this),
      updateTablePanel: this.updateTablePanel.bind(this),
      performBotUnoAction: this.performBotUnoAction.bind(this),
      finalizeUnoGame: this.finalizeUnoGame.bind(this),
      pushNotice: this.pushNotice.bind(this),
      pushEvent: this.pushEvent.bind(this),
      broadcastEvent: this.unoEvents.broadcastUnoEvent.bind(this.unoEvents),
    });
  }

  private async performBotUnoAction(engine: UnoGameEngine, playerId: string, pushEvent: (message: string) => void): Promise<void> {
    await this.gameStateManager.performBotUnoAction(engine, playerId, pushEvent);
  }

  private async finalizeUnoGame(table: LobbyTable, engine: UnoGameEngine, beforeStacks: Record<string, number>): Promise<void> {
    if (!this.lobby) return;

    const profiles: Record<string, PlayerProfile> = {};
    for (const player of table.players) {
      if (!player.isBot) {
        const profile = this.profiles[player.userId];
        if (profile) profiles[player.userId] = profile;
      }
    }

    await this.gameStateManager.finalizeUnoGame(table, engine, beforeStacks, this.lobby, profiles, this.currentProfile, {
      clearTableHand: this.clearTableHand.bind(this),
      updateTableStatus: this.updateTableStatus.bind(this),
      updateStatsAfterHand: this.updateStatsAfterHand.bind(this),
      handleAchievementUnlocks: this.handleAchievementUnlocks.bind(this),
      pushNotice: this.pushNotice.bind(this),
      pushEvent: this.pushEvent.bind(this),
      emitLiveChat: (message: string) => this.emitLiveChat(message),
      broadcastEvent: this.unoEvents.broadcastUnoEvent.bind(this.unoEvents),
      persistState: this.persistState.bind(this),
    });
  }

  private async handleUnoAction(action: UnoActionType, cardIndex?: number, chosenColor?: UnoColor): Promise<void> {
    await this.gameStateManager.handleUnoAction(action, cardIndex, chosenColor, this.currentProfile, this.lobby, {
      reloadState: this.reloadState.bind(this),
      findTableById: this.findTableById.bind(this),
      loadUnoGameState: this.loadUnoGameState.bind(this),
      saveUnoGameState: this.saveUnoGameState.bind(this),
      persistState: this.persistState.bind(this),
      advanceUnoGame: this.advanceUnoGame.bind(this),
      pushNotice: this.pushNotice.bind(this),
      pushEvent: this.pushEvent.bind(this),
      broadcastEvent: this.unoEvents.broadcastUnoEvent.bind(this.unoEvents),
      showColorSelectionDialog: () => this.dialogManager.showColorSelectionDialog(),
    });
  }


  public selectUnoCard(index: number): void {
    if (!this.currentProfile || !this.lobby) return;
    const table = this.currentProfile.currentTableId
      ? this.findTableById(this.currentProfile.currentTableId)
      : null;
    if (!table) return;

    const gameState = this.loadUnoGameState(table);
    if (!gameState) return;

    const player = gameState.engine.getPlayer(this.currentProfile.userId);
    if (!player) return;

    // Validate index is within hand range
    if (index < 0 || index >= player.hand.length) {
      this.selectedUnoCardIndex = null;
      this.updateTablePanel();
      return;
    }

    // Toggle selection
    if (this.selectedUnoCardIndex === index) {
      this.selectedUnoCardIndex = null;
    } else {
      this.selectedUnoCardIndex = index;
    }

    this.updateTablePanel();
  }

  // ============================================================================
  // GAME-SPECIFIC RENDERING
  // ============================================================================



  // Dialog delegation methods (called from setupScreen)
  // These are accessed via this.dialogManager.methodName() in setupScreen

  // Wrapper methods for backward compatibility
  public showPromptDialog(title: string, text: string, value: string): Promise<string | null> {
    return this.dialogManager.showPromptDialog(title, text, value);
  }

  public showYesNoDialog(title: string, text: string): Promise<boolean | null> {
    return this.dialogManager.showYesNoDialog(title, text);
  }

  public showListDialog(title: string, items: string[]): Promise<number | null> {
    return this.dialogManager.showListDialog(title, items);
  }

  public showMessageDialog(title: string, text: string): Promise<void> {
    return this.dialogManager.showMessageDialog(title, text);
  }







}
