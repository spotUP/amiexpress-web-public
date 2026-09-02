"use strict";
/**
 * Card Lobby - Neo-Blessed Desktop UI
 *
 * Full-featured multi-window lobby for card games with PokerEngine support.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardLobbyApp = exports.metadata = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const door_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/door-input-manager");
const GamepadBindings_1 = require("./managers/GamepadBindings");
const TableFlow_1 = require("./managers/TableFlow");
const UnoEventBus_1 = require("./managers/UnoEventBus");
const GameViews_1 = require("./managers/GameViews");
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const DoorLoader_1 = require("@amiexpress/bbs-door-sdk/utils/DoorLoader");
const bbs_door_sdk_2 = require("@amiexpress/bbs-door-sdk");
const uno_engine_1 = require("./lib/uno-engine");
const lib_1 = require("./lib");
const managers_1 = require("./managers");
exports.metadata = {
    name: 'Card Lobby',
    version: '2.0.0',
    description: 'Desktop-style card lobby with PokerEngine tables',
    author: 'AmiExpress Team',
    command: 'CARDLOBBY',
};
/**
 * Main door class
 */
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    const app = new CardLobbyApp(ctx);
    await app.run();
});
exports.default = door;
class CardLobbyApp {
    // UI elements (now accessed via uiManager)
    get topBar() { return this.uiManager.topBar; }
    get topInfoBar() { return this.uiManager.topInfoBar; }
    get statusBar() { return this.uiManager.statusBar; }
    get logWindow() { return this.uiManager.logWindow; }
    get lobbyWindow() { return this.uiManager.lobbyWindow; }
    get tableWindow() { return this.uiManager.tableWindow; }
    get lobbyList() { return this.uiManager.lobbyList; }
    get lobbyActions() { return this.uiManager.lobbyActions; }
    get tableActions() { return this.uiManager.tableActions; }
    get tableContent() { return this.uiManager.tableContent; }
    get flopPanel() { return this.uiManager.flopPanel; }
    get flopContent() { return this.uiManager.flopContent; }
    get playersPanel() { return this.uiManager.playersPanel; }
    get playersContent() { return this.uiManager.playersContent; }
    get handPanel() { return this.uiManager.handPanel; }
    get handContent() { return this.uiManager.handContent; }
    get activityPanel() { return this.uiManager.activityPanel; }
    get activityContent() { return this.uiManager.activityContent; }
    get actionButtons() { return this.uiManager.actionButtons; }
    get overlayShade() { return this.uiManager.overlayShade; }
    get layout() { return this.uiManager.layout; }
    // Animation state and methods (delegated to UIManager)
    get dealAnimationInProgress() { return this.uiManager.getDealAnimationInProgress(); }
    runDealAnimation(boardCards, playerHand, flopCardSize, handCardSize) {
        // The sound effects travel with the animation; UIManager cannot reach the
        // door's own screen program to emit them.
        return this.uiManager.runDealAnimation(boardCards, playerHand, flopCardSize, handCardSize, (id) => this.emitSfx(id));
    }
    renderBoardAndHand(boardCards, playerHand, flopCardSize, handCardSize, hasActiveHand) {
        return this.uiManager.renderBoardAndHand(boardCards, playerHand, flopCardSize, handCardSize, hasActiveHand);
    }
    layoutTablePanels() {
        return this.uiManager.layoutTablePanels();
    }
    layoutActionButtons() {
        return this.uiManager.layoutActionButtons();
    }
    applyActionButtonPalette(action) {
        return this.uiManager.applyActionButtonPalette(action);
    }
    constructor(session) {
        this.gamepadManager = null;
        /** Resolves the promise onStart is waiting on - see run(). */
        this.exitResolve = null;
        this.viewMode = 'lobby';
        this.autoDealInProgress = false;
        this.lastAnimatedHandStartedAt = null;
        this.actionInProgress = false;
        this.lobby = null;
        this.profiles = {};
        this.currentProfile = null;
        this.lobbyFilters = { gameId: null, openSeatsOnly: false };
        this.notices = [];
        this.tableListMap = [];
        this.selectedTableId = null;
        this.selectedUnoCardIndex = null;
        this.session = session;
    }
    async run() {
        this.setupScreen();
        // Show loading screen while initializing
        const loader = new DoorLoader_1.DoorLoader(this.screen, {
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
        await new Promise((resolve) => {
            this.exitResolve = resolve;
            this.screen.once('destroy', resolve);
        });
    }
    setupScreen() {
        const height = this.session.bbsSession?.screenHeight || 24;
        // Clear BBS output before creating blessed screen
        this.session.bbs.write('\x1b[2J\x1b[H'); // Clear screen and move cursor to home
        this.screen = (0, blessed_helpers_1.createScreen)(this.session.bbs, {
            height,
            smartCSR: true,
            dockBorders: false, // Not needed for BBS environment
            fullUnicode: true,
            title: 'Card Lobby v2.0',
            fastCSR: false, // Disable for stable rendering
            focusKeys: false, // Prevent arrows from being swallowed
            ignoreLocked: ['mouse', 'keypress'],
            // NOTE: grabKeys is NOT a valid blessed constructor option
            // DoorInputManager.enable() sets screen.program.grabKeys = true (line 265)
        });
        // Clear terminal then flush blessed's internal buffer
        this.screen.program.write('\x1b[2J');
        this.screen.program.write('\x1b[H');
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
        this.screen.alloc();
        // Set up input management (enables mouse, keyboard routing)
        // DoorInputManager handles all the input routing automatically
        this.inputManager = new door_input_manager_1.DoorInputManager(this.session, this.screen, {
            enableGameMode: false, // Blessed UI mode, not ncurses game mode
            enableGrabKeys: true, // Enable grabKeys for browser mode screen handlers
            enableMouse: true, // Enable mouse events
            debug: true, // Enable debug logging to diagnose input issues
            debugName: 'CardLobby'
        });
        this.inputManager.enable();
        // The pad's decision table lives in managers/GamepadBindings.ts.
        this.gamepadManager = (0, GamepadBindings_1.attachGamepadBindings)(this.session, this);
        // Reconnect handler for screen refresh
        if (this.session.bbsSession) {
            this.session.bbsSession.doorReconnectHandler = () => {
                this.screen.clear();
                this.screen.render();
            };
        }
        this.screen.key(['C-c'], () => {
            if (this.modalActive)
                return;
            this.exitDoor();
        });
        this.screen.key(['q'], () => {
            if (this.modalActive)
                return;
            this.exitDoor();
        });
        this.screen.key(['tab'], () => {
            if (this.modalActive)
                return;
            this.cycleFocus(1);
        });
        this.screen.key(['S-tab'], () => {
            if (this.modalActive)
                return;
            this.cycleFocus(-1);
        });
        this.screen.key(['f'], () => {
            if (this.modalActive || this.viewMode !== 'table')
                return;
            this.triggerFold();
        });
        this.screen.key(['x'], () => {
            if (this.modalActive || this.viewMode !== 'table')
                return;
            this.triggerCheck();
        });
        this.screen.key(['c'], () => {
            if (this.modalActive)
                return;
            if (this.viewMode === 'table') {
                this.triggerCall();
            }
            else if (this.viewMode === 'lobby') {
                this.runAction(() => this.tableFlow.createTableFlow());
            }
        });
        this.screen.key(['r'], () => {
            if (this.modalActive)
                return;
            if (this.viewMode === 'table') {
                this.triggerRaise();
            }
            else if (this.viewMode === 'lobby') {
                this.runAction(() => this.manualRefresh());
            }
        });
        // J is NOT bound. The lobby list reads j/k as vi-style down/up, so a J
        // that also joined moved the cursor and joined whatever the cursor had
        // just left. ENTER joins, through the list's own 'select' event.
        this.screen.key(['o'], () => {
            if (this.modalActive || this.viewMode !== 'lobby')
                return;
            this.runAction(() => this.tableFlow.observeSelectedTable());
        });
        this.screen.key(['l'], () => {
            if (this.modalActive || this.viewMode !== 'table')
                return;
            this.runAction(() => this.tableFlow.leaveCurrentTable());
        });
        this.screen.key(['d'], () => {
            if (this.modalActive)
                return;
            if (this.viewMode === 'table') {
                this.runAction(() => this.dealHand());
            }
            else if (this.viewMode === 'lobby') {
                this.runAction(() => this.tableFlow.deleteTableFlow());
            }
        });
        // UNO card selection keys (1-9, 0 for 10th card)
        for (let i = 1; i <= 9; i++) {
            this.screen.key([String(i)], () => {
                if (this.modalActive || this.viewMode !== 'table')
                    return;
                const table = this.currentProfile?.currentTableId
                    ? this.findTableById(this.currentProfile.currentTableId)
                    : null;
                if (table && (table.gameId === 'uno' || table.gameId === 'uno-house')) {
                    this.selectUnoCard(i - 1); // Convert 1-based to 0-based index
                }
            });
        }
        this.screen.key(['0'], () => {
            if (this.modalActive || this.viewMode !== 'table')
                return;
            const table = this.currentProfile?.currentTableId
                ? this.findTableById(this.currentProfile.currentTableId)
                : null;
            if (table && (table.gameId === 'uno' || table.gameId === 'uno-house')) {
                this.selectUnoCard(9); // 0 key = 10th card (index 9)
            }
        });
        this.desktop = (0, blessed_helpers_1.createBox)({
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
                bg: 'black',
            },
        });
        // Initialize managers
        this.uiManager = new managers_1.UIManager(this.screen, this.desktop);
        this.gameStateManager = new managers_1.GameStateManager();
        this.tableFlow = new TableFlow_1.TableFlow(this);
        this.unoEvents = new UnoEventBus_1.UnoEventBus(this, lib_1.REFRESH_INTERVAL_MS);
        this.gameViews = new GameViews_1.GameViews(this);
        // Initialize AI system
        const ai = new bbs_door_sdk_2.CardGameAI();
        ai.registerStrategy(new bbs_door_sdk_2.PokerAIStrategy());
        ai.registerStrategy(new bbs_door_sdk_2.UnoAIStrategy());
        this.gameStateManager.setAI(ai);
        // Build overlay FIRST so overlayShade exists
        this.uiManager.buildOverlay();
        // Now create DialogManager with valid overlayShade
        this.dialogManager = new managers_1.DialogManager(this.screen, this.uiManager.overlayShade);
        // 80x25 like the board, or the caller's whole terminal on Alt+Enter.
        // A door looks like the board it opened from until the caller asks for
        // more, so this starts FIXED; the panels are laid out from the screen's
        // own size, which makes following a resize a re-layout and a repaint
        // (sdk/utils/terminal-mode.ts).
        this.terminalMode = (0, terminal_mode_1.createTerminalModeSwitch)({
            bbs: this.session.bbs,
            screen: this.screen,
            start: 'fixed',
            onRelayout: () => {
                // The windows carry absolute width/height, so following a resize is
                // a re-layout, not just a repaint.
                this.uiManager.relayout();
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
    emitSfx(id, params) {
        if (!this.screen?.program)
            return;
        const payload = JSON.stringify({ id, params });
        this.screen.program.write(`\x1b]9999;sfx;${payload}\x07`);
    }
    get modalActive() {
        return this.dialogManager.isModalActive();
    }
    set modalActive(value) {
        this.dialogManager.setModalActive(value);
    }
    runAction(action) {
        if (this.actionInProgress) {
            this.pushNotice('Please wait for current action to complete.');
            return;
        }
        this.actionInProgress = true;
        void (async () => {
            try {
                await action();
            }
            catch (error) {
                this.pushNotice(`Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                this.screen.render();
            }
            finally {
                this.actionInProgress = false;
            }
        })();
    }
    exitDoor() {
        void this.shutdown();
    }
    async shutdown() {
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
    cleanup() {
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
        // Put the caller's terminal back to 80x25 whatever the door was showing
        this.terminalMode?.dispose();
    }
    async reloadState() {
        const globalStore = new bbs_door_sdk_2.Storage({
            doorName: 'card_lobby',
            global: true,
        });
        const lobby = (await globalStore.load(lib_1.LOBBY_KEY)) ?? (0, lib_1.initLobbyState)();
        const profiles = (await globalStore.load(lib_1.PROFILES_KEY)) ?? {};
        const userId = String(this.session.user.id);
        const profile = profiles[userId] ?? (0, lib_1.initProfile)(this.session);
        profile.username = this.session.user.username;
        profiles[userId] = profile;
        this.lobby = lobby;
        this.profiles = profiles;
        this.currentProfile = profile;
        let changed = false;
        lobby.tables.forEach((table) => {
            const updateResult = this.syncBotsForTable(table);
            if (updateResult)
                changed = true;
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
    async persistState() {
        if (!this.lobby || !this.currentProfile)
            return;
        const globalStore = new bbs_door_sdk_2.Storage({
            doorName: 'card_lobby',
            global: true,
        });
        await globalStore.save(lib_1.LOBBY_KEY, this.lobby);
        await globalStore.save(lib_1.PROFILES_KEY, this.profiles);
    }
    findTableById(tableId) {
        return this.lobby?.tables.find((table) => table.id === tableId);
    }
    loadTableHand(table) {
        if (!table.hand)
            return null;
        try {
            const engine = bbs_door_sdk_2.PokerEngine.restore(table.hand.snapshot);
            return { engine, beforeStacks: table.hand.beforeStacks ?? {} };
        }
        catch (error) {
            this.pushNotice(`Failed to restore hand: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    saveTableHand(table, engine, beforeStacks, startedAt) {
        // CRITICAL: Sanitize snapshot to prevent recursive nesting
        // The @pokertools/engine Snapshot includes `previousStates: Snapshot[]` which
        // creates O(n^2) storage growth as each snapshot contains all prior snapshots.
        // We strip previousStates (not needed for restore) and limit actionHistory.
        const rawSnapshot = engine.snapshot;
        const sanitizedSnapshot = {
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
    clearTableHand(table) {
        table.hand = undefined;
        table.updatedAt = Date.now();
    }
    // ============================================================================
    // UNO STATE MANAGEMENT
    // ============================================================================
    loadUnoGameState(table) {
        if (!table.hand)
            return null;
        try {
            const engine = uno_engine_1.UnoGameEngine.deserialize(table.hand.snapshot);
            return { engine, beforeStacks: table.hand.beforeStacks ?? {} };
        }
        catch (error) {
            this.pushNotice(`Failed to restore UNO game: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    saveUnoGameState(table, engine, beforeStacks, startedAt) {
        const snapshot = engine.serialize();
        table.hand = {
            snapshot: snapshot, // UnoGameSnapshot stored as generic snapshot
            beforeStacks,
            startedAt: startedAt ?? table.hand?.startedAt ?? Date.now(),
            updatedAt: Date.now(),
        };
        table.updatedAt = Date.now();
    }
    getHumanPlayers(table) {
        return table.players.filter((player) => player.role === 'player' && !(0, lib_1.isBotPlayer)(player));
    }
    getOpenHumanSeats(table) {
        const humans = this.getHumanPlayers(table).length;
        return Math.max(0, table.maxPlayers - humans);
    }
    syncBotsForTable(table) {
        const humans = this.getHumanPlayers(table);
        const bustedBots = table.players.filter((player) => player.role === 'player' && (0, lib_1.isBotPlayer)(player) && player.stack <= 0);
        if (bustedBots.length > 0) {
            const bustedIds = new Set(bustedBots.map((bot) => bot.userId));
            table.players = table.players.filter((player) => !bustedIds.has(player.userId));
        }
        const bots = table.players.filter((player) => player.role === 'player' && (0, lib_1.isBotPlayer)(player));
        const targetBots = Math.max(0, table.maxPlayers - humans.length);
        let changed = false;
        if (bustedBots.length > 0)
            changed = true;
        if (bots.length > targetBots) {
            const removeCount = bots.length - targetBots;
            const botIds = bots.slice(-removeCount).map((bot) => bot.userId);
            table.players = table.players.filter((player) => !botIds.includes(player.userId));
            changed = true;
        }
        if (bots.length < targetBots) {
            const takenSeats = new Set(table.players.map((player) => player.seat));
            for (let seat = 0; seat < table.maxPlayers; seat += 1) {
                if (table.players.filter((p) => p.role === 'player' && (0, lib_1.isBotPlayer)(p)).length >= targetBots) {
                    break;
                }
                if (takenSeats.has(seat))
                    continue;
                const botId = (0, lib_1.buildBotId)(table.id, seat);
                table.players.push({
                    userId: botId,
                    username: (0, lib_1.buildBotName)(seat),
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
    updateTableStatus(table) {
        if (table.hand) {
            // Game is actually in progress
            table.status = 'in-progress';
            return;
        }
        // No hand in progress - table is open
        table.status = 'open';
    }
    maybeGrantDailyBonus() {
        if (!this.currentProfile)
            return;
        const now = Date.now();
        if (now - this.currentProfile.wallet.lastDailyGrant < lib_1.DAILY_COOLDOWN_MS)
            return;
        this.currentProfile.wallet.chips += lib_1.DAILY_BONUS;
        this.currentProfile.wallet.lifetimeEarned += lib_1.DAILY_BONUS;
        this.currentProfile.wallet.lastDailyGrant = now;
        this.pushNotice(`Daily bonus: +${lib_1.DAILY_BONUS} ${lib_1.CHIP_NAME}`);
    }
    maybeResetBuckets() {
        if (!this.lobby)
            return;
        const now = Date.now();
        if (now - this.lobby.lastDailyReset >= lib_1.DAILY_COOLDOWN_MS) {
            Object.values(this.profiles).forEach((profile) => {
                profile.stats.daily = (0, lib_1.initStatsBucket)();
            });
            this.lobby.lastDailyReset = now;
        }
        if (now - this.lobby.lastWeeklyReset >= lib_1.WEEK_MS) {
            Object.values(this.profiles).forEach((profile) => {
                profile.stats.weekly = (0, lib_1.initStatsBucket)();
            });
            this.lobby.lastWeeklyReset = now;
        }
    }
    pushNotice(message) {
        this.notices.push(message);
        if (this.notices.length > 3)
            this.notices.shift();
        this.updateStatusBar();
    }
    pushEvent(message) {
        if (!this.lobby)
            return;
        this.lobby.events.unshift({ message, createdAt: Date.now() });
        if (this.lobby.events.length > lib_1.MAX_ACTIVITY_EVENTS) {
            this.lobby.events = this.lobby.events.slice(0, lib_1.MAX_ACTIVITY_EVENTS);
        }
        this.logWindow.log(message);
        this.updateActivityPanel();
    }
    emitLiveChat(message) {
        const socket = this.session.socket;
        if (!socket?.emit)
            return;
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
    updateStatusBar() {
        if (!this.currentProfile)
            return;
        const statusLabel = this.currentProfile.currentTableId
            ? `Table #${this.currentProfile.currentTableId}`
            : this.currentProfile.status;
        const noticeText = this.notices.join(' | ');
        const label = ` ${this.currentProfile.username} | Chips: ${this.currentProfile.wallet.chips} | ${statusLabel} `;
        const padded = noticeText ? `${label} - ${noticeText}` : label;
        this.statusBar.setContent(padded.slice(0, 80));
        this.screen.render();
    }
    updateTopInfoBar() {
        if (!this.currentProfile || !this.lobby)
            return;
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
        this.topInfoBar.setContent((0, lib_1.padColumn)(line, width));
    }
    updateActivityPanel(tableOverride, engineOverride) {
        if (!this.lobby)
            return;
        let table = tableOverride ?? null;
        if (!table && this.currentProfile?.currentTableId) {
            table = this.findTableById(this.currentProfile.currentTableId) ?? null;
        }
        const hintLines = [];
        if (this.viewMode === 'table' && table && this.currentProfile) {
            const engine = engineOverride ?? this.loadTableHand(table)?.engine ?? null;
            if (!engine) {
                const seatedPlayers = table.players.filter((player) => player.role === 'player' && player.stack > 0);
                if (seatedPlayers.length < table.minPlayers) {
                    hintLines.push('{yellow-fg}Waiting for players to join...{/}');
                }
                else {
                    hintLines.push('{yellow-fg}Ready to deal. Press D or use Deal to start.{/}');
                }
            }
            else {
                const actionSeat = engine.state.actionTo;
                if (actionSeat === null || actionSeat === undefined) {
                    hintLines.push('{yellow-fg}Dealing in progress...{/}');
                }
                else {
                    const actor = engine.state.players[actionSeat];
                    if (actor?.id === this.currentProfile.userId) {
                        hintLines.push('{yellow-fg}Your turn. Choose an action below.{/}');
                    }
                    else if (actor?.name) {
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
        }
        else {
            this.activityContent.setScroll(Math.min(previousScroll, newHeight));
        }
    }
    updateAllPanels() {
        if (this.viewMode === 'table' && !this.currentProfile?.currentTableId) {
            this.applyViewMode('lobby');
        }
        else if (this.viewMode === 'table') {
            this.syncViewMode();
        }
        else {
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
    async maybeAutoDealCurrentTable() {
        if (!this.currentProfile || !this.lobby)
            return;
        if (!this.currentProfile.currentTableId)
            return;
        const table = this.findTableById(this.currentProfile.currentTableId);
        if (!table)
            return;
        await this.maybeAutoDeal(table);
    }
    async maybeAutoDeal(table) {
        if (this.autoDealInProgress || this.modalActive || !this.currentProfile)
            return;
        if (table.gameId !== 'holdem')
            return;
        if (this.tableFlow.isObserverForTable(table, this.currentProfile.userId))
            return;
        const seatedPlayers = table.players.filter((player) => player.role === 'player' && player.stack > 0);
        if (seatedPlayers.length < table.minPlayers)
            return;
        if (table.hand)
            return;
        this.autoDealInProgress = true;
        try {
            await this.startHoldemHand(table);
        }
        finally {
            this.autoDealInProgress = false;
        }
    }
    updateLobbyPanel() {
        if (!this.lobby)
            return;
        const filterName = this.lobbyFilters.gameId
            ? (0, lib_1.getGameById)(this.lobbyFilters.gameId)?.name ?? 'Unknown'
            : 'All Games';
        // Short label that fits in 30% window width
        this.lobbyWindow.setLabel(` Lobby - ${filterName} `);
        const rows = [];
        const map = [];
        const filtered = this.lobby.tables.filter((table) => {
            if (this.lobbyFilters.gameId && table.gameId !== this.lobbyFilters.gameId)
                return false;
            if (this.lobbyFilters.openSeatsOnly && this.getOpenHumanSeats(table) === 0)
                return false;
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
            rows.push(['', '', '>>> No tables available. Press [C] to create one. <<<', '', '']);
        }
        this.tableListMap = map;
        this.uiManager.lobbyList.setRows(rows);
        if (map.length === 0) {
            this.selectedTableId = null;
        }
        else if (this.selectedTableId === null && map.length > 0) {
            this.selectedTableId = map[0];
            this.lobbyList.select(0);
        }
    }
    updateTablePanel() {
        if (!this.lobby || !this.currentProfile)
            return;
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
        const isObserver = this.tableFlow.isObserverForTable(table, this.currentProfile.userId);
        const showGameView = this.viewMode === 'table' && this.currentProfile?.currentTableId === table.id;
        if (showGameView) {
            this.tableContent.hide();
            this.flopPanel.show();
            this.playersPanel.show();
            this.handPanel.show();
            this.activityPanel.show();
            this.tableActions.show();
            this.layoutTablePanels();
            // Detect game type and render appropriately
            if (table.gameId === 'uno' || table.gameId === 'uno-house') {
                this.gameViews.renderUnoGameView(table);
            }
            else {
                this.gameViews.renderPokerGameView(table);
            }
            this.updateTableActions();
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
        const contentWidth = Math.max(40, this.tableContent.iwidth ?? 78);
        const gap = 2;
        const minLeftWidth = 24;
        const minRightWidth = 20;
        const leftLines = [];
        const rightLines = [];
        rightLines.push(`{${lib_1.UI_THEME.accent}-fg}Table #${table.id}{/} - ${table.gameName}`);
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
            const tag = (0, lib_1.isBotPlayer)(player) ? '*' : ' ';
            const name = `${player.username}${tag}`.slice(0, 10);
            rightLines.push(`${(0, lib_1.pad)(String(player.seat + 1), 2)} ${(0, lib_1.pad)(name, 10)} ${(0, lib_1.pad)(String(player.stack), 5)}`);
        });
        if (table.observers.length > 0) {
            rightLines.push('');
            rightLines.push(`Observers: ${table.observers.map((obs) => obs.username).join(', ')}`);
        }
        rightLines.push('');
        rightLines.push('{yellow-fg}Actions{/}: ENTER Join  O Observe');
        rightLines.push('{yellow-fg}More{/}: C Create  R Refresh  F Filter');
        rightLines.push('{gray-fg}Auto-deal starts when enough players are seated.{/}');
        let lines = [];
        if (leftLines.length === 0) {
            lines = rightLines;
        }
        else {
            const maxLeftWidth = Math.max(minLeftWidth, ...leftLines.map(lib_1.visibleWidth));
            const canUseColumns = maxLeftWidth + gap + minRightWidth <= contentWidth;
            if (canUseColumns) {
                const leftWidth = Math.min(maxLeftWidth, contentWidth - minRightWidth - gap);
                const rightWidth = Math.max(minRightWidth, contentWidth - leftWidth - gap);
                lines = (0, lib_1.mergeColumns)(leftLines, rightLines, leftWidth, rightWidth, gap);
            }
            else {
                lines = [...leftLines, '', ...rightLines];
            }
        }
        this.tableContent.setContent(lines.join('\n'));
        this.tableContent.resetScroll();
        this.updateTableActions();
        this.screen.render();
    }
    getActionContext() {
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
                    const currentBet = (0, lib_1.getCurrentBet)(handState.engine);
                    const playerBet = (0, lib_1.getPlayerBet)(handState.engine, actionSeat);
                    toCall = Math.max(0, currentBet - playerBet);
                    canAct = !isObserver;
                }
            }
        }
        return { table, isObserver, canAct, toCall };
    }
    triggerFold() {
        if (this.modalActive)
            return;
        const { canAct } = this.getActionContext();
        if (!canAct)
            return;
        this.runAction(() => this.handlePlayerAction('fold'));
    }
    triggerCheck() {
        if (this.modalActive)
            return;
        if (this.currentProfile?.currentTableId && this.lobby) {
            const table = this.findTableById(this.currentProfile.currentTableId);
            // Route to appropriate game handler
            if (table && (table.gameId === 'uno' || table.gameId === 'uno-house')) {
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
        if (!canAct)
            return;
        if (toCall > 0) {
            this.pushNotice(`Cannot check. Call ${toCall} or fold.`);
            return;
        }
        this.runAction(() => this.handlePlayerAction('call'));
    }
    triggerCall() {
        if (this.modalActive)
            return;
        // Route to UNO handler if UNO game
        if (this.currentProfile?.currentTableId && this.lobby) {
            const table = this.findTableById(this.currentProfile.currentTableId);
            if (table && (table.gameId === 'uno' || table.gameId === 'uno-house')) {
                this.triggerUnoDrawCard();
                return;
            }
        }
        const { canAct } = this.getActionContext();
        if (!canAct)
            return;
        this.runAction(() => this.handlePlayerAction('call'));
    }
    triggerRaise() {
        if (this.modalActive)
            return;
        // Route to UNO handler if UNO game
        if (this.currentProfile?.currentTableId && this.lobby) {
            const table = this.findTableById(this.currentProfile.currentTableId);
            if (table && (table.gameId === 'uno' || table.gameId === 'uno-house')) {
                this.triggerUnoCallUno();
                return;
            }
        }
        const { canAct } = this.getActionContext();
        if (!canAct)
            return;
        this.runAction(() => this.handlePlayerAction('bet'));
    }
    triggerQuit() {
        if (this.modalActive)
            return;
        // Route to UNO handler if UNO game
        if (this.currentProfile?.currentTableId && this.lobby) {
            const table = this.findTableById(this.currentProfile.currentTableId);
            if (table && (table.gameId === 'uno' || table.gameId === 'uno-house')) {
                this.triggerUnoChallenge();
                return;
            }
        }
        this.exitDoor();
    }
    // ============================================================================
    // UNO ACTION TRIGGERS
    // ============================================================================
    triggerUnoPlayCard() {
        if (this.modalActive || !this.currentProfile || !this.lobby)
            return;
        const table = this.currentProfile.currentTableId
            ? this.findTableById(this.currentProfile.currentTableId)
            : null;
        if (!table)
            return;
        const gameState = this.loadUnoGameState(table);
        if (!gameState)
            return;
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
    triggerUnoDrawCard() {
        if (this.modalActive || !this.currentProfile || !this.lobby)
            return;
        const table = this.currentProfile.currentTableId
            ? this.findTableById(this.currentProfile.currentTableId)
            : null;
        if (!table)
            return;
        const gameState = this.loadUnoGameState(table);
        if (!gameState)
            return;
        const state = gameState.engine.getGameState();
        const currentPlayer = state.players[state.currentPlayerIndex];
        // Check if it's the player's turn
        if (currentPlayer.id !== this.currentProfile.userId) {
            this.pushNotice('Not your turn.');
            return;
        }
        this.runAction(() => this.handleUnoAction('draw-card'));
    }
    triggerUnoCallUno() {
        if (this.modalActive || !this.currentProfile || !this.lobby)
            return;
        const table = this.currentProfile.currentTableId
            ? this.findTableById(this.currentProfile.currentTableId)
            : null;
        if (!table)
            return;
        const gameState = this.loadUnoGameState(table);
        if (!gameState)
            return;
        const player = gameState.engine.getPlayer(this.currentProfile.userId);
        if (!player)
            return;
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
    triggerUnoChallenge() {
        if (this.modalActive || !this.currentProfile || !this.lobby)
            return;
        const table = this.currentProfile.currentTableId
            ? this.findTableById(this.currentProfile.currentTableId)
            : null;
        if (!table)
            return;
        const gameState = this.loadUnoGameState(table);
        if (!gameState)
            return;
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
        this.runAction(() => this.handleUnoAction(challengeType));
    }
    updateTableActions() {
        if (!this.currentProfile || !this.lobby)
            return;
        if (this.viewMode !== 'table' || !this.currentProfile.currentTableId) {
            this.tableActions.hide();
            return;
        }
        this.tableActions.show();
        const table = this.findTableById(this.currentProfile.currentTableId);
        // Detect game type and update button labels
        if (table && (table.gameId === 'uno' || table.gameId === 'uno-house')) {
            this.updateUnoActionButtons(table);
        }
        else {
            this.updatePokerActionButtons(table ?? null);
        }
        this.layoutActionButtons();
    }
    updatePokerActionButtons(table) {
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
    updateUnoActionButtons(table) {
        const gameState = this.loadUnoGameState(table);
        const state = gameState?.engine.getGameState();
        // Fold button -> hidden (not used in UNO)
        this.actionButtons.fold.hide();
        // Check button -> PLAY CARD / DEAL
        if (!gameState) {
            this.actionButtons.check.setContent('DEAL');
        }
        else {
            this.actionButtons.check.setContent('PLAY');
        }
        // Call button -> DRAW
        this.actionButtons.call.setContent('DRAW');
        // Raise button -> UNO
        this.actionButtons.raise.setContent('UNO');
        // Quit button -> CHALLENGE (if window active) or QUIT
        if (state?.challengeWindow) {
            this.actionButtons.quit.setContent('CHALLENGE');
        }
        else {
            this.actionButtons.quit.setContent('QUIT');
        }
        // Apply UNO button styles
        this.applyUnoButtonPalette('check', 'play');
        this.applyUnoButtonPalette('call', 'draw');
        this.applyUnoButtonPalette('raise', 'uno');
        if (state?.challengeWindow) {
            this.applyUnoButtonPalette('quit', 'challenge');
        }
        else {
            this.applyUnoButtonPalette('quit', 'quit');
        }
    }
    applyUnoButtonPalette(buttonKey, unoKey) {
        const button = this.actionButtons[buttonKey];
        const styleSet = lib_1.UNO_ACTION_BUTTON_STYLES[unoKey];
        if (!button || !styleSet)
            return;
        // Apply base style
        button.style.fg = styleSet.base.fg;
        button.style.bg = styleSet.base.bg;
        // Note: hover and focus styles would be applied by blessed's event handlers
        // For now, we just set the base style
    }
    focusLobby() {
        this.applyViewMode('lobby');
        this.lobbyList.focus();
        this.screen.render();
    }
    focusTable() {
        const wantsTable = Boolean(this.currentProfile?.currentTableId);
        this.applyViewMode(wantsTable ? 'table' : 'lobby');
        if (this.viewMode === 'table') {
            this.playersContent.focus();
        }
        else {
            this.tableContent.focus();
        }
        this.screen.render();
    }
    cycleFocus(direction) {
        const focusOrder = this.viewMode === 'table'
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
        const ring = focusOrder.filter((item) => item && !item.hidden && typeof item.focus === 'function' && item.options?.focusable !== false);
        if (ring.length === 0)
            return;
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
    syncViewMode() {
        const wantsTable = Boolean(this.currentProfile?.currentTableId);
        this.applyViewMode(wantsTable ? 'table' : 'lobby');
    }
    applyViewMode(mode) {
        if (!this.layout)
            return;
        if (this.viewMode === mode)
            return;
        this.viewMode = mode;
        const { width, leftWidth, rightWidth, mainHeight, tableHeight } = this.layout;
        if (mode === 'table') {
            this.lobbyWindow.hide();
            this.tableWindow.show();
            this.tableWindow.options.left = 0;
            this.tableWindow.options.width = width;
            this.tableWindow.options.height = tableHeight;
            this.logWindow.hide();
            this.topBar.show();
            this.topInfoBar.hide();
        }
        else {
            this.lobbyWindow.show();
            this.lobbyWindow.options.width = leftWidth;
            this.tableWindow.show();
            this.tableWindow.options.left = leftWidth;
            this.tableWindow.options.width = rightWidth;
            this.tableWindow.options.height = mainHeight;
            this.logWindow.show();
            this.topBar.show();
            this.topInfoBar.hide();
        }
        this.layoutTablePanels();
        this.screen.render();
    }
    toggleFilters() {
        if (this.modalActive)
            return;
        if (!this.lobbyFilters.gameId) {
            const firstGame = lib_1.GAME_CATALOG.find((game) => game.enabled);
            this.lobbyFilters.gameId = firstGame?.id ?? null;
        }
        else if (!this.lobbyFilters.openSeatsOnly) {
            this.lobbyFilters.openSeatsOnly = true;
        }
        else {
            this.lobbyFilters.gameId = null;
            this.lobbyFilters.openSeatsOnly = false;
        }
        this.updateLobbyPanel();
        this.screen.render();
    }
    /** The pad and the key bindings ask the door; the door asks the flow. */
    joinSelectedTable() {
        return this.tableFlow.joinSelectedTable();
    }
    leaveCurrentTable() {
        return this.tableFlow.leaveCurrentTable();
    }
    async manualRefresh() {
        if (this.modalActive)
            return;
        await this.reloadState();
        this.updateAllPanels();
    }
    async dealHand() {
        if (this.modalActive || !this.currentProfile || !this.lobby)
            return;
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
        }
        else if (table.gameId === 'uno' || table.gameId === 'uno-house') {
            await this.startUnoGame(table);
        }
        else {
            this.pushNotice(`${table.gameName} is not implemented yet.`);
            return;
        }
        this.updateAllPanels();
    }
    handleAchievementUnlocks(profile) {
        const unlocked = new Set(profile.achievements);
        const addAchievement = (id) => {
            if (unlocked.has(id))
                return;
            const def = lib_1.ACHIEVEMENTS.find((achievement) => achievement.id === id);
            if (!def)
                return;
            unlocked.add(id);
            profile.achievements.push(id);
            profile.wallet.chips += def.reward;
            profile.wallet.lifetimeEarned += def.reward;
            this.pushNotice(`Achievement unlocked: ${def.name} (+${def.reward})`);
        };
        if (profile.stats.handsPlayed >= 1)
            addAchievement('first_hand');
        if (profile.stats.wins >= 1)
            addAchievement('first_win');
        if (profile.stats.bestWinStreak >= 3)
            addAchievement('hot_streak');
        if (profile.stats.biggestPot >= 500)
            addAchievement('big_pot');
        if (profile.stats.handsPlayed >= 25)
            addAchievement('grinder');
    }
    updateStatsAfterHand(profile, delta, pot) {
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
        }
        else if (delta < 0) {
            profile.stats.losses += 1;
            profile.stats.winStreak = 0;
        }
        profile.stats.biggestPot = Math.max(profile.stats.biggestPot, pot);
    }
    // Game state delegation methods
    async finalizeHoldemHand(table, engine, beforeStacks) {
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
    async startHoldemHand(table) {
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
    async advanceHoldemHand(table, engineOverride, beforeStacksOverride) {
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
    async performBotAction(engine, seat, playerId, table) {
        await this.gameStateManager.performBotAction(engine, seat, playerId, this.pushEvent.bind(this), table);
    }
    async handlePlayerAction(action) {
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
    async startUnoGame(table) {
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
    async advanceUnoGame(table, engineOverride, beforeStacksOverride) {
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
    async performBotUnoAction(engine, playerId, pushEvent) {
        await this.gameStateManager.performBotUnoAction(engine, playerId, pushEvent);
    }
    async finalizeUnoGame(table, engine, beforeStacks) {
        if (!this.lobby)
            return;
        const profiles = {};
        for (const player of table.players) {
            if (!player.isBot) {
                const profile = this.profiles[player.userId];
                if (profile)
                    profiles[player.userId] = profile;
            }
        }
        await this.gameStateManager.finalizeUnoGame(table, engine, beforeStacks, this.lobby, profiles, this.currentProfile, {
            clearTableHand: this.clearTableHand.bind(this),
            updateTableStatus: this.updateTableStatus.bind(this),
            updateStatsAfterHand: this.updateStatsAfterHand.bind(this),
            handleAchievementUnlocks: this.handleAchievementUnlocks.bind(this),
            pushNotice: this.pushNotice.bind(this),
            pushEvent: this.pushEvent.bind(this),
            emitLiveChat: (message) => this.emitLiveChat(message),
            broadcastEvent: this.unoEvents.broadcastUnoEvent.bind(this.unoEvents),
            persistState: this.persistState.bind(this),
        });
    }
    async handleUnoAction(action, cardIndex, chosenColor) {
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
    selectUnoCard(index) {
        if (!this.currentProfile || !this.lobby)
            return;
        const table = this.currentProfile.currentTableId
            ? this.findTableById(this.currentProfile.currentTableId)
            : null;
        if (!table)
            return;
        const gameState = this.loadUnoGameState(table);
        if (!gameState)
            return;
        const player = gameState.engine.getPlayer(this.currentProfile.userId);
        if (!player)
            return;
        // Validate index is within hand range
        if (index < 0 || index >= player.hand.length) {
            this.selectedUnoCardIndex = null;
            this.updateTablePanel();
            return;
        }
        // Toggle selection
        if (this.selectedUnoCardIndex === index) {
            this.selectedUnoCardIndex = null;
        }
        else {
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
    showPromptDialog(title, text, value) {
        return this.dialogManager.showPromptDialog(title, text, value);
    }
    showYesNoDialog(title, text) {
        return this.dialogManager.showYesNoDialog(title, text);
    }
    showListDialog(title, items) {
        return this.dialogManager.showListDialog(title, items);
    }
    showMessageDialog(title, text) {
        return this.dialogManager.showMessageDialog(title, text);
    }
}
exports.CardLobbyApp = CardLobbyApp;
