// @ts-nocheck
/**
 * Card Lobby - Neo-Blessed Desktop UI
 *
 * Full-featured multi-window lobby for card games with PokerEngine support.
 */

import blessed, {
  Screen,
  Box,
  List,
  Button,
  Log,
  Listbar,
  Prompt,
  Question,
  ScrollableText,
  type MouseEvent,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText, createLog } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { DoorLoader } from '@amiexpress/bbs-door-sdk/utils/DoorLoader';
import {
  CardEngine,
  PokerEngine,
  ActionType,
  pokerCardsToCards,
  Storage,
} from '@amiexpress/bbs-door-sdk';
import type { Snapshot } from '@amiexpress/bbs-door-sdk';
import type { Colors } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/core/types';
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
  UI_THEME,
  ACTION_BUTTON_STYLES,
  ACTION_BUTTON_ORDER,
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
  isBotId,
  buildBotId,
  buildBotName,
  calculateEntryFee,
  calculateRake,
  getCurrentBet,
  getPlayerBet,
  buildWeeklyBulletin,
  buildBullHelpContent,
  renderCardLines,
  padColumn,
  mergeColumns,
  visibleWidth,
} from './lib';
import { UIManager, DialogManager, GameStateManager } from './managers';

export const metadata = {
  name: 'Card Lobby',
  version: '2.0.0',
  description: 'Desktop-style card lobby with PokerEngine tables',
  author: 'AmiExpress Team',
  command: 'CARDLOBBY',
};

class CardLobbyApp {
  private session: DoorSession;
  private screen!: Screen;
  private desktop!: Box;

  // Managers
  private uiManager!: UIManager;
  private dialogManager!: DialogManager;
  private gameStateManager!: GameStateManager;

  // UI elements (now accessed via uiManager)
  private get topBar() { return this.uiManager.topBar; }
  private get topInfoBar() { return this.uiManager.topInfoBar; }
  private get statusBar() { return this.uiManager.statusBar; }
  private get logWindow() { return this.uiManager.logWindow; }
  private get lobbyWindow() { return this.uiManager.lobbyWindow; }
  private get tableWindow() { return this.uiManager.tableWindow; }
  private get lobbyList() { return this.uiManager.lobbyList; }
  private get lobbyActions() { return this.uiManager.lobbyActions; }
  private get tableActions() { return this.uiManager.tableActions; }
  private get tableContent() { return this.uiManager.tableContent; }
  private get flopPanel() { return this.uiManager.flopPanel; }
  private get flopContent() { return this.uiManager.flopContent; }
  private get playersPanel() { return this.uiManager.playersPanel; }
  private get playersContent() { return this.uiManager.playersContent; }
  private get handPanel() { return this.uiManager.handPanel; }
  private get handContent() { return this.uiManager.handContent; }
  private get activityPanel() { return this.uiManager.activityPanel; }
  private get activityContent() { return this.uiManager.activityContent; }
  private get actionButtons() { return this.uiManager.actionButtons; }
  private get overlayShade() { return this.uiManager.overlayShade; }
  private get layout() { return this.uiManager.layout; }

  private viewMode: 'lobby' | 'table' = 'lobby';
  private autoDealInProgress = false;
  private lastAnimatedHandStartedAt: number | null = null;

  private lobby: LobbyState | null = null;
  private profiles: Record<string, PlayerProfile> = {};
  private currentProfile: PlayerProfile | null = null;
  private lobbyFilters: LobbyFilters = { gameId: null, openSeatsOnly: false };
  private notices: string[] = [];
  private refreshTimer: NodeJS.Timeout | null = null;
  private tableListMap: number[] = [];
  private selectedTableId: number | null = null;

  constructor(session: DoorSession) {
    this.session = session;
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
    await this.writeBullHelpFile();

    loader.update(70, 'Checking weekly bulletins...');
    await this.writeWeeklyBulletinIfNeeded();

    loader.update(85, 'Saving state...');
    await this.persistState();

    loader.update(95, 'Finalizing lobby...');
    this.updateAllPanels();

    loader.update(100, 'Ready!');
    await loader.delay(500);
    loader.hide();
    loader.destroy();

    this.lobbyList.focus();
    this.screen.render();
    this.startRefreshTimer();

    await new Promise<void>((resolve) => {
      this.screen.on('destroy', () => resolve());
    });

    this.cleanup();
  }

  private setupScreen(): void {
    const height = this.session.bbsSession?.screenHeight || 24;

    this.screen = blessed.screen({
      height,
      smartCSR: true,
      dockBorders: true,
      fullUnicode: false,
      title: 'Card Lobby',
      output: (data: string) => this.session.bbs.write(data),
    });

    if (this.session.bbsSession) {
      this.session.bbsSession.mouseEventsEnabled = true;
      this.session.bbsSession.doorInputHandler = (data: string) => {
        if (typeof data === 'string' && data.trim().startsWith('{')) {
          try {
            const payload = JSON.parse(data);
            if (payload?.type?.startsWith('mouse-')) {
              const buttonMap: Record<number, MouseEvent['button']> = {
                0: 'left',
                1: 'middle',
                2: 'right',
              };
              const event: MouseEvent = {
                x: Number(payload.x) || 0,
                y: Number(payload.y) || 0,
                action: 'mousemove',
                button: buttonMap[payload.button] ?? 'left',
                shift: Boolean(payload.shift),
                ctrl: Boolean(payload.ctrl),
                meta: Boolean(payload.alt),
              };

              if (payload.type === 'mouse-click') {
                event.action = 'mousedown';
              } else if (payload.type === 'mouse-up') {
                event.action = 'mouseup';
              } else if (payload.type === 'mouse-wheel') {
                event.action = payload.deltaY < 0 ? 'wheelup' : 'wheeldown';
              } else if (payload.type === 'mouse-drag' || payload.type === 'mouse-hover') {
                event.action = 'mousemove';
              }

              this.screen.program.emit('mouse', event);
              return;
            }
          } catch {
            // Fall through to normal input handling.
          }
        }
        this.screen._handleData(data);
      };
      this.session.bbsSession.doorReconnectHandler = () => {
        this.screen.clear();
        this.screen.render();
      };
    }

    this.screen.enableMouse();

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
      if (this.modalActive || this.viewMode !== 'table') return;
      this.triggerCall();
    });

    this.screen.key(['r'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.triggerRaise();
    });

    this.screen.key(['l'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.runAction(() => this.leaveCurrentTable());
    });

    this.screen.key(['d'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.runAction(() => this.dealHand());
    });

    this.desktop = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      ch: ' ',
      style: {
        bg: 'black',
      },
    });

    // Initialize managers
    this.uiManager = new UIManager(this.screen, this.desktop);
    this.dialogManager = new DialogManager(this.screen, this.uiManager.overlayShade);
    this.gameStateManager = new GameStateManager();

    // Build UI via manager
    this.uiManager.buildTopBar({
      focusLobby: this.focusLobby.bind(this),
      focusTable: this.focusTable.bind(this),
      showProfileWindow: () => this.dialogManager.showProfileWindow(this.currentProfile),
      showLeaderboardWindow: () => this.dialogManager.showLeaderboardWindow(this.profiles),
      showAchievementsWindow: () => this.dialogManager.showAchievementsWindow(this.currentProfile),
      showBulletinsWindow: () => this.dialogManager.showBulletinsWindow(this.session),
      exitDoor: this.exitDoor.bind(this),
      runAction: this.runAction.bind(this),
    });
    this.uiManager.buildStatusBar();
    this.uiManager.buildWindows({
      onLobbySelect: (index, tableListMap) => {
        this.selectedTableId = tableListMap[index] ?? null;
        this.updateTablePanel();
        this.screen.render();
      },
      createTableFlow: this.createTableFlow.bind(this),
      joinSelectedTable: this.joinSelectedTable.bind(this),
      observeSelectedTable: this.observeSelectedTable.bind(this),
      toggleFilters: this.toggleFilters.bind(this),
      manualRefresh: this.manualRefresh.bind(this),
      runAction: this.runAction.bind(this),
    });
    this.uiManager.buildOverlay();

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

  private get modalActive(): boolean {
    return this.dialogManager.isModalActive();
  }

  private set modalActive(value: boolean) {
    this.dialogManager.setModalActive(value);
  }

  private runAction(action: () => void | Promise<void>): void {
    void (async () => {
      try {
        await action();
      } catch (error) {
        console.error('[CardLobby] Action failed:', error);
        this.pushNotice('Action failed. Please try again.');
        this.screen.render();
      }
    })();
  }

  private exitDoor(): void {
    void this.shutdown();
  }

  private async shutdown(): Promise<void> {
    this.stopRefreshTimer();
    if (this.currentProfile?.currentTableId) {
      await this.leaveCurrentTable();
    }
    this.cleanup();
    this.screen.disableMouse();
    this.screen.destroy();
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

    if (this.session.bbsSession) {
      delete this.session.bbsSession.doorInputHandler;
      delete this.session.bbsSession.doorReconnectHandler;
    }
  }

  private async reloadState(): Promise<void> {
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

  private async persistState(): Promise<void> {
    if (!this.lobby || !this.currentProfile) return;

    const globalStore = new Storage({
      doorName: 'card_lobby',
      global: true,
    });

    await globalStore.save(LOBBY_KEY, this.lobby);
    await globalStore.save(PROFILES_KEY, this.profiles);
  }

  private findTableById(tableId: number): LobbyTable | undefined {
    return this.lobby?.tables.find((table) => table.id === tableId);
  }

  private loadTableHand(table: LobbyTable): { engine: PokerEngine; beforeStacks: Record<string, number> } | null {
    if (!table.hand) return null;
    try {
      const engine = PokerEngine.restore(table.hand.snapshot) as PokerEngine;
      return { engine, beforeStacks: table.hand.beforeStacks ?? {} };
    } catch (error) {
      console.error('[CardLobby] Failed to restore hand snapshot:', error);
      return null;
    }
  }

  private saveTableHand(
    table: LobbyTable,
    engine: PokerEngine,
    beforeStacks: Record<string, number>,
    startedAt?: number,
  ): void {
    table.hand = {
      snapshot: engine.snapshot as Snapshot,
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

  private getHumanPlayers(table: LobbyTable): TablePlayer[] {
    return table.players.filter((player) => player.role === 'player' && !isBotPlayer(player));
  }

  private getOpenHumanSeats(table: LobbyTable): number {
    const humans = this.getHumanPlayers(table).length;
    return Math.max(0, table.maxPlayers - humans);
  }

  private syncBotsForTable(table: LobbyTable): boolean {
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

  private updateTableStatus(table: LobbyTable): void {
    if (table.hand) {
      table.status = 'in-progress';
      return;
    }
    const seated = table.players.filter((player) => player.role === 'player').length;
    if (table.autoStart && seated >= table.minPlayers) {
      table.status = 'in-progress';
    } else {
      table.status = 'open';
    }
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

  private pushNotice(message: string): void {
    this.notices.push(message);
    if (this.notices.length > 3) this.notices.shift();
    this.updateStatusBar();
  }

  private pushEvent(message: string): void {
    if (!this.lobby) return;
    this.lobby.events.unshift({ message, createdAt: Date.now() });
    if (this.lobby.events.length > MAX_ACTIVITY_EVENTS) {
      this.lobby.events = this.lobby.events.slice(0, MAX_ACTIVITY_EVENTS);
    }
    this.logWindow.log(message);
    this.updateActivityPanel();
  }

  private emitLiveChat(message: string): void {
    const socket = this.session.socket;
    if (!socket?.emit) return;
    socket.emit('bbs:event', {
      type: 'system_announcement',
      details: { message },
      visibility: 'all',
      timestamp: new Date(),
      userId: Number(this.session.user.id) || undefined,
      username: this.session.user.username,
      nodeId: this.session.bbsSession?.nodeId || 1,
    });
  }

  private updateStatusBar(): void {
    if (!this.currentProfile) return;
    const statusLabel = this.currentProfile.currentTableId
      ? `Table #${this.currentProfile.currentTableId}`
      : this.currentProfile.status;
    const noticeText = this.notices.join(' | ');
    const label = ` ${this.currentProfile.username} | Chips: ${this.currentProfile.wallet.chips} | ${statusLabel} `;
    const padded = noticeText ? `${label} - ${noticeText}` : label;
    this.statusBar.setContent(padded.slice(0, 80));
    this.screen.render();
  }

  private updateTopInfoBar(): void {
    if (!this.currentProfile || !this.lobby) return;
    const tableId = this.currentProfile.currentTableId ?? this.selectedTableId;
    if (!tableId) {
      this.topInfoBar.setContent(' Card Lobby ');
      return;
    }

    const table = this.findTableById(tableId);
    if (!table) {
      this.topInfoBar.setContent(' Card Lobby ');
      return;
    }

    let pot = 0;
    const handState = this.loadTableHand(table);
    if (handState) {
      pot = handState.engine.state.pots.reduce((sum, potItem) => sum + potItem.amount, 0);
    }

    let turnLabel = '';
    if (handState) {
      const actionSeat = handState.engine.state.actionTo;
      if (actionSeat !== null && actionSeat !== undefined) {
        const actor = handState.engine.state.players[actionSeat];
        if (actor?.name) {
          turnLabel = actor.id === this.currentProfile.userId ? 'Your turn' : `Turn: ${actor.name}`;
        }
      }
    }

    const infoSegments = [
      `{cyan-fg}${table.gameName}{/}`,
      `{yellow-fg}Pot: ${pot}{/}`,
      `{cyan-fg}Stakes: ${table.stakesLabel}{/}`,
      `{green-fg}Buy-in: ${table.buyIn}{/}`,
    ];
    if (turnLabel) {
      infoSegments.push(`{white-fg}${turnLabel}{/}`);
    }
    const width = Number(this.topInfoBar.width) || 80;
    const line = ` ${infoSegments.join('   ')} `;
    this.topInfoBar.setContent(padColumn(line, width));
  }

  private updateActivityPanel(tableOverride?: LobbyTable | null, engineOverride?: PokerEngine | null): void {
    if (!this.lobby) return;

    let table: LobbyTable | null = tableOverride ?? null;
    if (!table && this.currentProfile?.currentTableId) {
      table = this.findTableById(this.currentProfile.currentTableId) ?? null;
    }

    const hintLines: string[] = [];
    if (this.viewMode === 'table' && table && this.currentProfile) {
      const engine = engineOverride ?? this.loadTableHand(table)?.engine ?? null;
      if (!engine) {
        const seatedPlayers = table.players.filter((player) => player.role === 'player' && player.stack > 0);
        if (seatedPlayers.length < table.minPlayers) {
          hintLines.push('{yellow-fg}Waiting for players to join...{/}');
        } else {
          hintLines.push('{yellow-fg}Ready to deal. Press D or use Deal to start.{/}');
        }
      } else {
        const actionSeat = engine.state.actionTo;
        if (actionSeat === null || actionSeat === undefined) {
          hintLines.push('{yellow-fg}Dealing in progress...{/}');
        } else {
          const actor = engine.state.players[actionSeat];
          if (actor?.id === this.currentProfile.userId) {
            hintLines.push('{yellow-fg}Your turn. Choose an action below.{/}');
          } else if (actor?.name) {
            hintLines.push(`{yellow-fg}Waiting for ${actor.name} to act...{/}`);
          }
        }
      }

      hintLines.push('{gray-fg}Keys: F Fold  X Check  C Call  R Raise  L Leave  D Deal{/}');
    }

    const eventLines = this.lobby.events.length > 0
      ? [...this.lobby.events].reverse().map((event) => event.message)
      : ['No activity yet.'];
    const lines = hintLines.length > 0 ? [...hintLines, '', ...eventLines] : eventLines;

    const previousScroll = this.activityContent.getScroll();
    const previousHeight = this.activityContent.getScrollHeight();
    const isAtBottom = previousHeight === 0 || previousScroll >= Math.max(0, previousHeight - 1);
    this.activityContent.setContent(lines.join('\n'));
    const newHeight = this.activityContent.getScrollHeight();
    if (isAtBottom) {
      this.activityContent.setScroll(newHeight);
    } else {
      this.activityContent.setScroll(Math.min(previousScroll, newHeight));
    }
  }

  private updateAllPanels(): void {
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
    if (this.isObserverForTable(table, this.currentProfile.userId)) return;
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

  private updateLobbyPanel(): void {
    if (!this.lobby) return;
    const filterName = this.lobbyFilters.gameId
      ? getGameById(this.lobbyFilters.gameId)?.name ?? 'Unknown'
      : 'All Games';
    const openOnly = this.lobbyFilters.openSeatsOnly ? 'Open Seats' : 'All Seats';
    this.lobbyWindow.setLabel(` Lobby - ${filterName} / ${openOnly} `);

    const rows: string[] = [];
    const map: number[] = [];

    const filtered = this.lobby.tables.filter((table) => {
      if (this.lobbyFilters.gameId && table.gameId !== this.lobbyFilters.gameId) return false;
      if (this.lobbyFilters.openSeatsOnly && this.getOpenHumanSeats(table) === 0) return false;
      return true;
    });

    filtered.forEach((table) => {
      const humanCount = this.getHumanPlayers(table).length;
      const seats = `${humanCount}/${table.maxPlayers}`;
      const line =
        pad(String(table.id), 3) +
        ' ' +
        pad(table.gameName, 12) +
        pad(table.stakesLabel, 6) +
        pad(seats, 6) +
        pad(table.status.toUpperCase(), 10) +
        formatAge(table.createdAt);
      rows.push(line);
      map.push(table.id);
    });

    if (rows.length === 0) {
      rows.push('No tables. Create one with the Create button.');
    }

    this.tableListMap = map;
    this.lobbyList.setWrapItems(rows.length === 1 && map.length === 0);
    this.lobbyList.setItems(rows);

    if (map.length === 0) {
      this.selectedTableId = null;
    } else if (this.selectedTableId === null && map.length > 0) {
      this.selectedTableId = map[0];
      this.lobbyList.select(0);
    }
  }

  private updateTablePanel(): void {
    if (!this.lobby || !this.currentProfile) return;
    const tableId = this.currentProfile.currentTableId ?? this.selectedTableId;
    if (!tableId) {
      this.flopPanel.hide();
      this.playersPanel.hide();
      this.handPanel.hide();
      this.activityPanel.hide();
      this.tableActions.hide();
      this.tableContent.show();
      this.tableContent.setContent([
        'Select a table to view details.',
        '',
        '{yellow-fg}Quick start{/}:',
        'Use the lobby list to highlight a table.',
        'Press {cyan-fg}J{/} to join, {cyan-fg}O{/} to observe, or {cyan-fg}C{/} to create a table.',
      ].join('\n'));
      this.updateTableActions();
      return;
    }

    const table = this.findTableById(tableId);
    if (!table) {
      this.flopPanel.hide();
      this.playersPanel.hide();
      this.handPanel.hide();
      this.activityPanel.hide();
      this.tableActions.hide();
      this.tableContent.show();
      this.tableContent.setContent('Table not found. Press {cyan-fg}R{/} to refresh the lobby.');
      this.updateTableActions();
      return;
    }

    const isObserver = this.isObserverForTable(table, this.currentProfile.userId);
    const showGameView = this.viewMode === 'table' && this.currentProfile?.currentTableId === table.id;

    if (showGameView) {
      this.tableContent.hide();
      this.flopPanel.show();
      this.playersPanel.show();
      this.handPanel.show();
      this.activityPanel.show();
      this.tableActions.show();
      this.layoutTablePanels();

      const flopInnerHeight = Math.max(0, Number(this.flopPanel.height) - 2);
      const handInnerHeight = Math.max(0, Number(this.handPanel.height) - 2);
      const flopCardSize = flopInnerHeight >= 7 ? 'full' : 'mini';
      const handCardSize = handInnerHeight >= 7 ? 'full' : 'mini';

      const handState = this.loadTableHand(table);
      const boardCards = handState
        ? pokerCardsToCards(handState.engine.state.board)
        : pokerCardsToCards(table.lastHand?.board ?? []);

      const playerSeat = handState?.engine.state.players.find((seat) => seat?.id === this.currentProfile?.userId);
      const playerHand = pokerCardsToCards(
        playerSeat?.hand ?? table.lastHand?.hands[this.currentProfile.userId] ?? [],
      );

      const handStartedAt = table.hand?.startedAt ?? null;
      const shouldAnimate = Boolean(
        handState &&
        handStartedAt &&
        handStartedAt !== this.lastAnimatedHandStartedAt &&
        !this.dealAnimationInProgress,
      );

      if (shouldAnimate) {
        this.lastAnimatedHandStartedAt = handStartedAt;
        void this.runDealAnimation(boardCards, playerHand, flopCardSize, handCardSize);
      } else if (!this.dealAnimationInProgress) {
        this.renderBoardAndHand(boardCards, playerHand, flopCardSize, handCardSize, Boolean(handState));
      }

      const seated = table.players
        .filter((player) => player.role === 'player')
        .sort((a, b) => a.seat - b.seat);
      const playersWidth = Math.max(20, Number(this.playersPanel.width) - 2);
      const seatWidth = 2;
      const stackWidth = Math.min(8, Math.max(5, Math.floor(playersWidth * 0.35)));
      const nameWidth = Math.max(8, playersWidth - seatWidth - stackWidth - 2);
      const playersLines = seated.map((player) => {
        const tag = isBotPlayer(player) ? '*' : ' ';
        const name = `${player.username}${tag}`.slice(0, nameWidth);
        const nameValue = padColumn(`{cyan-fg}${name}{/}`, nameWidth);
        const stackValue = padColumn(`{yellow-fg}${player.stack}{/}`, stackWidth);
        return `${pad(String(player.seat + 1), seatWidth)} ${nameValue} ${stackValue}`;
      });

      if (playersLines.length === 0) {
        playersLines.push('No players seated.');
      }
      this.playersContent.setContent(playersLines.join('\n'));
      this.playersContent.resetScroll();

      this.updateTableActions();
      this.updateActivityPanel(table, handState?.engine ?? null);
      this.updateTopInfoBar();
      this.screen.render();
      return;
    }

    this.flopPanel.hide();
    this.playersPanel.hide();
    this.handPanel.hide();
    this.activityPanel.hide();
    this.tableActions.hide();
    this.tableContent.show();

    const contentWidth = Math.max(40, (this.tableContent as any).iwidth ?? 78);
    const gap = 2;
    const minLeftWidth = 24;
    const minRightWidth = 20;

    const leftLines: string[] = [];
    const rightLines: string[] = [];

    rightLines.push(`{${UI_THEME.accent}-fg}Table #${table.id}{/} - ${table.gameName}`);
    rightLines.push(`Stakes: ${table.stakesLabel}  Buy-in: ${table.buyIn}`);
    rightLines.push(`Status: ${table.status}  Players: ${table.players.filter((p) => p.role === 'player').length}/${table.maxPlayers}`);
    if (table.isPrivate && table.inviteCode) {
      rightLines.push(`Invite: ${table.inviteCode}`);
    }
    if (isObserver) {
      rightLines.push('Mode: Observer');
    }

    if (table.lastHand) {
      const winners = table.lastHand.winners.map((winner) => `${winner.username} (${winner.amount})`).join(', ');
      rightLines.push('');
      rightLines.push(`Last hand pot: ${table.lastHand.pot}`);
      rightLines.push(`Last winners: ${winners || 'TBD'}`);
    }

    rightLines.push('');
    rightLines.push('Seats:');
    const seated = table.players
      .filter((player) => player.role === 'player')
      .sort((a, b) => a.seat - b.seat);
    seated.forEach((player) => {
      const tag = isBotPlayer(player) ? '*' : ' ';
      const name = `${player.username}${tag}`.slice(0, 10);
      rightLines.push(`${pad(String(player.seat + 1), 2)} ${pad(name, 10)} ${pad(String(player.stack), 5)}`);
    });

    if (table.observers.length > 0) {
      rightLines.push('');
      rightLines.push(`Observers: ${table.observers.map((obs) => obs.username).join(', ')}`);
    }

    rightLines.push('');
    rightLines.push('{yellow-fg}Actions{/}: J Join  O Observe');
    rightLines.push('{yellow-fg}More{/}: C Create  R Refresh  F Filter');
    rightLines.push('{gray-fg}Auto-deal starts when enough players are seated.{/}');

    let lines: string[] = [];
    if (leftLines.length === 0) {
      lines = rightLines;
    } else {
      const maxLeftWidth = Math.max(minLeftWidth, ...leftLines.map(visibleWidth));
      const canUseColumns = maxLeftWidth + gap + minRightWidth <= contentWidth;
      if (canUseColumns) {
        const leftWidth = Math.min(maxLeftWidth, contentWidth - minRightWidth - gap);
        const rightWidth = Math.max(minRightWidth, contentWidth - leftWidth - gap);
        lines = mergeColumns(leftLines, rightLines, leftWidth, rightWidth, gap);
      } else {
        lines = [...leftLines, '', ...rightLines];
      }
    }
    this.tableContent.setContent(lines.join('\n'));
    this.tableContent.resetScroll();
    this.updateTableActions();
    this.screen.render();
  }

  private getActionContext(): { table: LobbyTable | null; isObserver: boolean; canAct: boolean; toCall: number } {
    if (!this.currentProfile || !this.lobby) {
      return { table: null, isObserver: false, canAct: false, toCall: 0 };
    }

    const table = this.currentProfile.currentTableId ? this.findTableById(this.currentProfile.currentTableId) : null;
    if (!table) {
      return { table: null, isObserver: false, canAct: false, toCall: 0 };
    }

    const isObserver = this.isObserverForTable(table, this.currentProfile.userId);
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

  private triggerFold(): void {
    if (this.modalActive) return;
    const { canAct } = this.getActionContext();
    if (!canAct) return;
    this.runAction(() => this.handlePlayerAction('fold'));
  }

  private triggerCheck(): void {
    if (this.modalActive) return;
    if (this.currentProfile?.currentTableId && this.lobby) {
      const table = this.findTableById(this.currentProfile.currentTableId);
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

  private triggerCall(): void {
    if (this.modalActive) return;
    const { canAct } = this.getActionContext();
    if (!canAct) return;
    this.runAction(() => this.handlePlayerAction('call'));
  }

  private triggerRaise(): void {
    if (this.modalActive) return;
    const { canAct } = this.getActionContext();
    if (!canAct) return;
    this.runAction(() => this.handlePlayerAction('bet'));
  }

  private triggerQuit(): void {
    if (this.modalActive) return;
    this.exitDoor();
  }

  private updateTableActions(): void {
    if (!this.currentProfile || !this.lobby) return;
    if (this.viewMode !== 'table' || !this.currentProfile.currentTableId) {
      this.tableActions.hide();
      return;
    }

    this.tableActions.show();

    this.actionButtons.fold.setContent('FOLD');
    const table = this.findTableById(this.currentProfile.currentTableId);
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

    this.layoutActionButtons();
  }

  private focusLobby(): void {
    this.applyViewMode('lobby');
    this.lobbyList.focus();
    this.screen.render();
  }

  private focusTable(): void {
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
      : [this.lobbyList, this.lobbyActions, this.tableContent];
    const current = this.screen.focused;
    const currentIndex = focusOrder.findIndex((item) => item === current);
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + direction + focusOrder.length) % focusOrder.length;
    const next = focusOrder[nextIndex];
    if (next?.focus) {
      next.focus();
      this.screen.render();
    }
  }

  private syncViewMode(): void {
    const wantsTable = Boolean(this.currentProfile?.currentTableId);
    this.applyViewMode(wantsTable ? 'table' : 'lobby');
  }

  private applyViewMode(mode: 'lobby' | 'table'): void {
    if (!this.layout) return;
    if (this.viewMode === mode) return;
    this.viewMode = mode;

    const { width, leftWidth, rightWidth, mainHeight, tableHeight } = this.layout;

    if (mode === 'table') {
      this.lobbyWindow.hide();
      this.tableWindow.show();
      this.tableWindow.options.left = 0;
      this.tableWindow.options.width = width;
      this.tableWindow.options.height = tableHeight;
      this.logWindow.hide();
      this.topBar.hide();
      this.topInfoBar.show();
    } else {
      this.lobbyWindow.show();
      this.lobbyWindow.options.width = leftWidth;
      this.tableWindow.show();
      this.tableWindow.options.left = leftWidth;
      this.tableWindow.options.width = rightWidth;
      this.tableWindow.options.height = mainHeight;
      this.logWindow.show();
      this.topBar.hide();
      this.topInfoBar.show();
    }

    this.layoutTablePanels();
    this.screen.render();
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

  private async manualRefresh(): Promise<void> {
    if (this.modalActive) return;
    await this.reloadState();
    this.updateAllPanels();
  }

  private isObserverForTable(table: LobbyTable, userId: string): boolean {
    const seated = table.players.find((player) => player.userId === userId && player.role === 'player');
    if (seated) return false;
    return table.observers.some((obs) => obs.userId === userId);
  }

  private async createTableFlow(): Promise<void> {
    if (this.modalActive) return;

    const enabledGames = GAME_CATALOG.filter((game) => game.enabled);
    const gameIndex = await this.showListDialog(
      'Select Game',
      enabledGames.map((game) => `${game.name}`),
    );
    if (gameIndex === null) return;

    const game = enabledGames[gameIndex];
    const stakeIndex = await this.showListDialog(
      'Select Stakes',
      game.stakes.map((stake) => `${stake.label} (Buy-in ${stake.buyIn})`),
    );
    if (stakeIndex === null) return;

    const maxPlayersStr = await this.showPromptDialog(
      'Table Size',
      `Max players (${game.minPlayers}-${game.maxPlayers})`,
      String(game.maxPlayers),
    );
    if (maxPlayersStr === null) return;

    const maxPlayers = safeNumber(maxPlayersStr);
    if (maxPlayers === null || maxPlayers < game.minPlayers || maxPlayers > game.maxPlayers) {
      await this.showMessageDialog('Invalid player count.', 'Max players must be within game limits.');
      return;
    }

    const isPrivate = await this.showYesNoDialog('Private Table?', 'Create a private table?');
    if (isPrivate === null) return;

    const autoStart = await this.showYesNoDialog('Auto Start?', 'Auto-start when table is full?');
    if (autoStart === null) return;

    await this.finalizeCreateTable(game, stakeIndex, maxPlayers, isPrivate, autoStart);
  }

  private async finalizeCreateTable(
    game: GameDefinition,
    stakeIndex: number,
    maxPlayers: number,
    isPrivate: boolean,
    autoStart: boolean,
  ): Promise<void> {
    await this.reloadState();
    if (!this.lobby || !this.currentProfile) return;

    const stake = game.stakes[stakeIndex];
    const buyIn = stake.buyIn;
    const entryFee = calculateEntryFee(buyIn);

    if (this.currentProfile.wallet.chips < buyIn + entryFee) {
      this.pushNotice('Not enough chips for buy-in + entry fee.');
      return;
    }

    this.currentProfile.wallet.chips -= buyIn + entryFee;
    this.currentProfile.wallet.lifetimeSpent += entryFee;

    const tableId = this.lobby.lastTableId + 1;
    this.lobby.lastTableId = tableId;

    const table: LobbyTable = {
      id: tableId,
      gameId: game.id,
      gameName: game.name,
      stakesLabel: stake.label,
      smallBlind: stake.smallBlind,
      bigBlind: stake.bigBlind,
      buyIn,
      entryFee,
      minPlayers: game.minPlayers,
      maxPlayers,
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hostUserId: this.currentProfile.userId,
      autoStart,
      isPrivate,
      inviteCode: isPrivate ? String(Math.floor(Math.random() * 9000) + 1000) : undefined,
      players: [],
      observers: [],
    };

    table.players.push({
      userId: this.currentProfile.userId,
      username: this.currentProfile.username,
      seat: 0,
      stack: buyIn,
      buyIn,
      role: 'player',
      joinedAt: Date.now(),
      isBot: false,
    });

    this.syncBotsForTable(table);
    this.updateTableStatus(table);
    if (table.status === 'in-progress') {
      this.emitLiveChat(`TABLE START: ${table.gameName} ${table.stakesLabel} (#${table.id})`);
    }

    this.currentProfile.status = 'table';
    this.currentProfile.currentTableId = tableId;

    this.lobby.tables.unshift(table);
    this.pushEvent(`Table #${table.id} opened: ${table.gameName} ${table.stakesLabel}`);
    this.emitLiveChat(`TABLE OPEN: ${table.gameName} ${table.stakesLabel} (#${table.id}) - /JOIN ${table.id}`);

    await this.persistState();
    this.selectedTableId = table.id;
    this.applyViewMode('table');
    this.updateAllPanels();
  }

  private async joinSelectedTable(): Promise<void> {
    if (this.modalActive || !this.lobby || !this.currentProfile) return;
    if (!this.selectedTableId) {
      this.pushNotice('Select a table first.');
      return;
    }

    await this.reloadState();
    if (!this.lobby) return;

    const table = this.findTableById(this.selectedTableId);
    if (!table) {
      this.pushNotice('Table not found.');
      return;
    }

    if (this.currentProfile.currentTableId && this.currentProfile.currentTableId !== table.id) {
      this.pushNotice('Leave your current table first.');
      return;
    }

    if (this.getOpenHumanSeats(table) <= 0) {
      this.pushNotice('Table is full of players.');
      return;
    }

    const buyIn = table.buyIn;
    const entryFee = table.entryFee;
    if (this.currentProfile.wallet.chips < buyIn + entryFee) {
      this.pushNotice('Not enough chips for buy-in + entry fee.');
      return;
    }

    const existingSeat = table.players.find((player) => player.userId === this.currentProfile?.userId && player.role === 'player');
    if (existingSeat) {
      this.currentProfile.currentTableId = table.id;
      this.currentProfile.status = 'table';
      this.applyViewMode('table');
      this.updateAllPanels();
      return;
    }

    const seat = this.findSeatForHuman(table);
    if (seat === null) {
      this.pushNotice('No seat available.');
      return;
    }

    table.players = table.players.filter((player) => !(player.seat === seat && isBotPlayer(player)));

    this.currentProfile.wallet.chips -= buyIn + entryFee;
    this.currentProfile.wallet.lifetimeSpent += entryFee;

    table.players.push({
      userId: this.currentProfile.userId,
      username: this.currentProfile.username,
      seat,
      stack: buyIn,
      buyIn,
      role: 'player',
      joinedAt: Date.now(),
      isBot: false,
    });

    table.observers = table.observers.filter((observer) => observer.userId !== this.currentProfile?.userId);
    table.updatedAt = Date.now();

    this.currentProfile.status = 'table';
    this.currentProfile.currentTableId = table.id;

    const previousStatus = table.status;
    this.syncBotsForTable(table);
    this.updateTableStatus(table);
    if (previousStatus !== 'in-progress' && table.status === 'in-progress') {
      this.emitLiveChat(`TABLE START: ${table.gameName} ${table.stakesLabel} (#${table.id})`);
    }

    this.pushEvent(`${this.currentProfile.username} joined table #${table.id}`);

    await this.persistState();
    this.applyViewMode('table');
    this.updateAllPanels();
  }

  private async observeSelectedTable(): Promise<void> {
    if (this.modalActive || !this.lobby || !this.currentProfile) return;
    if (!this.selectedTableId) {
      this.pushNotice('Select a table first.');
      return;
    }

    await this.reloadState();
    if (!this.lobby) return;

    const table = this.findTableById(this.selectedTableId);
    if (!table) {
      this.pushNotice('Table not found.');
      return;
    }

    const seated = table.players.find((player) => player.userId === this.currentProfile?.userId && player.role === 'player');
    if (seated) {
      this.currentProfile.currentTableId = table.id;
      this.currentProfile.status = 'table';
      this.applyViewMode('table');
      this.updateAllPanels();
      return;
    }

    const alreadyObserver = table.observers.find((obs) => obs.userId === this.currentProfile?.userId);
    if (!alreadyObserver) {
      table.observers.push({
        userId: this.currentProfile.userId,
        username: this.currentProfile.username,
        joinedAt: Date.now(),
      });
    }

    this.currentProfile.status = 'table';
    this.currentProfile.currentTableId = table.id;

    this.pushEvent(`${this.currentProfile.username} is observing table #${table.id}`);

    await this.persistState();
    this.applyViewMode('table');
    this.updateAllPanels();
  }

  private findSeatForHuman(table: LobbyTable): number | null {
    const humanSeats = new Set(this.getHumanPlayers(table).map((player) => player.seat));
    for (let seat = 0; seat < table.maxPlayers; seat += 1) {
      if (!humanSeats.has(seat)) return seat;
    }
    return null;
  }

  private async leaveCurrentTable(): Promise<void> {
    if (!this.currentProfile || !this.lobby) return;
    const tableId = this.currentProfile.currentTableId;
    if (!tableId) {
      this.pushNotice('You are not at a table.');
      return;
    }

    await this.reloadState();
    if (!this.lobby) return;

    const table = this.findTableById(tableId);
    if (!table) {
      this.currentProfile.currentTableId = undefined;
      this.currentProfile.status = 'lobby';
      this.applyViewMode('lobby');
      await this.persistState();
      this.updateAllPanels();
      return;
    }

    const playerIndex = table.players.findIndex((player) => player.userId === this.currentProfile?.userId && player.role === 'player');
    if (playerIndex >= 0 && table.hand) {
      this.pushNotice('Hand in progress. Wait for it to finish before leaving.');
      return;
    }
    if (playerIndex >= 0) {
      const player = table.players[playerIndex];
      const net = player.stack - player.buyIn;
      this.currentProfile.wallet.chips += player.stack;
      if (net > 0) this.currentProfile.wallet.lifetimeEarned += net;
      if (net < 0) this.currentProfile.wallet.lifetimeSpent += Math.abs(net);
      table.players.splice(playerIndex, 1);
    }

    const observerIndex = table.observers.findIndex((obs) => obs.userId === this.currentProfile?.userId);
    if (observerIndex >= 0) {
      table.observers.splice(observerIndex, 1);
    }

    this.currentProfile.status = 'lobby';
    this.currentProfile.currentTableId = undefined;
    table.updatedAt = Date.now();

    const remainingHumans = this.getHumanPlayers(table);
    if (remainingHumans.length === 0) {
      this.lobby.tables = this.lobby.tables.filter((item) => item.id !== table.id);
      this.pushEvent(`Table #${table.id} closed.`);
    } else {
      this.syncBotsForTable(table);
      if (table.hostUserId === this.currentProfile.userId && remainingHumans[0]) {
        table.hostUserId = remainingHumans[0].userId;
      }
      this.updateTableStatus(table);
    }

    await this.persistState();
    this.applyViewMode('lobby');
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

    const isObserver = this.isObserverForTable(table, this.currentProfile.userId);
    if (isObserver) {
      this.pushNotice('Observers cannot deal hands.');
      return;
    }

    if (table.gameId !== 'holdem') {
      this.pushNotice('Only Hold\'em is playable right now.');
      return;
    }

    if (table.hand) {
      this.pushNotice('Hand already in progress.');
      return;
    }

    await this.startHoldemHand(table);
    this.updateAllPanels();
  }

  private handleAchievementUnlocks(profile: PlayerProfile): void {
    const unlocked = new Set(profile.achievements);

    const addAchievement = (id: string): void => {
      if (unlocked.has(id)) return;
      const def = ACHIEVEMENTS.find((achievement) => achievement.id === id);
      if (!def) return;
      unlocked.add(id);
      profile.achievements.push(id);
      profile.wallet.chips += def.reward;
      profile.wallet.lifetimeEarned += def.reward;
      this.pushNotice(`Achievement unlocked: ${def.name} (+${def.reward})`);
    };

    if (profile.stats.handsPlayed >= 1) addAchievement('first_hand');
    if (profile.stats.wins >= 1) addAchievement('first_win');
    if (profile.stats.bestWinStreak >= 3) addAchievement('hot_streak');
    if (profile.stats.biggestPot >= 500) addAchievement('big_pot');
    if (profile.stats.handsPlayed >= 25) addAchievement('grinder');
  }

  private updateStatsAfterHand(profile: PlayerProfile, delta: number, pot: number): void {
    profile.stats.handsPlayed += 1;
    profile.stats.net += delta;
    profile.stats.daily.hands += 1;
    profile.stats.weekly.hands += 1;
    profile.stats.daily.net += delta;
    profile.stats.weekly.net += delta;

    if (delta > 0) {
      profile.stats.wins += 1;
      profile.stats.daily.wins += 1;
      profile.stats.weekly.wins += 1;
      profile.stats.winStreak += 1;
      profile.stats.bestWinStreak = Math.max(profile.stats.bestWinStreak, profile.stats.winStreak);
    } else if (delta < 0) {
      profile.stats.losses += 1;
      profile.stats.winStreak = 0;
    }

    profile.stats.biggestPot = Math.max(profile.stats.biggestPot, pot);
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

  private async performBotAction(engine: PokerEngine, seat: number, playerId: string): Promise<void> {
    await this.gameStateManager.performBotAction(engine, seat, playerId, this.pushEvent.bind(this));
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

  // Dialog delegation methods (called from setupScreen)
  // These are accessed via this.dialogManager.methodName() in setupScreen

  // Wrapper methods for backward compatibility
  private showPromptDialog(title: string, text: string, value: string): Promise<string | null> {
    return this.dialogManager.showPromptDialog(title, text, value);
  }

  private showYesNoDialog(title: string, text: string): Promise<boolean | null> {
    return this.dialogManager.showYesNoDialog(title, text);
  }

  private showListDialog(title: string, items: string[]): Promise<number | null> {
    return this.dialogManager.showListDialog(title, items);
  }

  private showMessageDialog(title: string, text: string): Promise<void> {
    return this.dialogManager.showMessageDialog(title, text);
  }

  private startRefreshTimer(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      if (this.modalActive) return;
      this.reloadState()
        .then(() => this.updateAllPanels())
        .catch(() => undefined);
    }, REFRESH_INTERVAL_MS);
  }

  private stopRefreshTimer(): void {
    if (!this.refreshTimer) return;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }
}

export async function runDoor(session: DoorSession): Promise<void> {
  const app = new CardLobbyApp(session);
  await app.run();
}

export default { runDoor, metadata };
