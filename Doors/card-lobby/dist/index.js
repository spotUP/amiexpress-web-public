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
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const ChatManager_1 = require("./managers/ChatManager");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const DoorLoader_1 = require("@amiexpress/bbs-door-sdk/utils/DoorLoader");
const bbs_door_sdk_2 = require("@amiexpress/bbs-door-sdk");
const uno_engine_1 = require("./lib/uno-engine");
const lib_1 = require("./lib");
const activity_hints_1 = require("./lib/activity-hints");
const live_chat_1 = require("./lib/live-chat");
const achievements_1 = require("./lib/achievements");
const desktop_layout_1 = require("./lib/desktop-layout");
const metadata_1 = require("./lib/metadata");
const managers_1 = require("./managers");
const announce_1 = require("@amiexpress/bbs-door-sdk/core/announce");
var metadata_2 = require("./lib/metadata");
Object.defineProperty(exports, "metadata", { enumerable: true, get: function () { return metadata_2.metadata; } });
/**
 * Main door class
 */
const door = new bbs_door_sdk_1.ServerDoor(metadata_1.metadata);
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
        this.chat = new ChatManager_1.ChatManager(this);
        this.session = session;
        this.announcer = (0, announce_1.createAnnouncer)(session.bbs);
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
        // The board's theme decides every colour this door draws, and it has to
        // be resolved BEFORE the first widget: they read UI_THEME as they are
        // built. A door that skips this looks the same in all seven themes.
        const theme = this.session.bbs?.getTheme ? this.session.bbs.getTheme() : (0, theme_1.themeById)('classic');
        (0, lib_1.applyTheme)(theme);
        this.styles = (0, theme_1.themeStyles)(theme);
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
        this.screen.key(['t'], () => {
            if (this.modalActive)
                return;
            this.runAction(() => this.saySomething());
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
                if (table && ((0, lib_1.isUnoTable)(table))) {
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
            if (table && ((0, lib_1.isUnoTable)(table))) {
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
                bg: lib_1.UI_THEME.windowBg,
            },
        });
        // Initialize managers
        this.uiManager = new managers_1.UIManager(this.screen, this.desktop, this.session.bbsSession?.nodeId ?? 1);
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
        // Before the screen goes: a chrome timer writing to a destroyed screen
        // takes the session with it, and stop() puts back any glitched row.
        this.uiManager?.stopChrome();
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
        // The renderer draws cards the way this player asked for them.
        this.applyCardPreferences();
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
        // An UNO table has no poker hand. Both games keep their state in
        // `table.hand.snapshot`, so this used to hand an UnoGameSnapshot to
        // PokerEngine.restore, which threw "cannot restore undefined" - and the
        // table screen calls this on every draw, so the notice appeared the
        // moment a game was dealt (reported live 2026-09-02). The guard lives
        // HERE rather than at the call sites: two of the twelve had already
        // forgotten it, and a thirteenth would have too.
        if ((0, lib_1.isUnoTable)(table))
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
    get announce() {
        return this.announcer;
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
        this.chat.paint();
    }
    /** The table this player is sitting at, for tagging what they say. */
    get currentTableId() {
        return this.currentProfile?.currentTableId ?? null;
    }
    chatHasItsOwnPanel() {
        return this.uiManager.chatHasItsOwnPanel();
    }
    setChatLines(lines) {
        this.uiManager.setChatLines(lines);
    }
    promptForLine(title, text) {
        return this.dialogManager.showPromptDialog(title, text, '');
    }
    render() {
        this.screen.render();
    }
    /** T talks. The lobby had no way to say anything at all until now. */
    async saySomething() {
        await this.chat.saySomething();
    }
    async chooseTheme() {
        await (0, blessed_1.openThemeMenu)({
            screen: this.screen,
            bbs: this.session.bbs,
            parent: this.uiManager.overlayShade,
            onApply: (theme) => {
                (0, lib_1.applyTheme)(theme);
                this.styles = (0, theme_1.themeStyles)(theme);
            },
        });
        this.updateAllPanels();
        this.screen.render();
    }
    async chooseCardStyle() {
        const unicodeCapable = Boolean(this.session.bbs?.unicodeCapable);
        // The panel stays open; every change lands on the profile and repaints
        // the table straight away, so a style is judged on real cards.
        const chosen = await this.dialogManager.showCardStyleWindow(this.currentProfile, unicodeCapable, (preferences) => {
            if (!this.currentProfile)
                return;
            this.currentProfile.cards = preferences;
            this.applyCardPreferences();
            this.updateAllPanels();
        });
        if (!chosen || !this.currentProfile)
            return;
        this.currentProfile.cards = chosen;
        this.applyCardPreferences();
        await this.persistState();
        this.updateAllPanels();
    }
    /** Hand the renderer the player's card preferences and this terminal's reach. */
    applyCardPreferences() {
        this.uiManager.cardPreferences = this.currentProfile?.cards;
        this.uiManager.unicodeCapable =
            Boolean(this.session.bbs?.unicodeCapable);
    }
    emitLiveChat(message) {
        (0, live_chat_1.emitLiveChatAnnouncement)(this.session, message);
    }
    updateStatusBar() {
        if (!this.currentProfile)
            return;
        const statusLabel = this.currentProfile.currentTableId
            ? `Table #${this.currentProfile.currentTableId}`
            : this.currentProfile.status;
        // Each part is its own section: the bar owns the separator and the
        // widths, so a notice arriving does not rebuild the whole line.
        const bar = this.statusBar;
        if (bar.setSection) {
            bar.setSection('user', this.currentProfile.username);
            bar.setSection('chips', `Chips: ${this.currentProfile.wallet.chips}`);
            bar.setSection('where', statusLabel);
            bar.setSection('notice', this.notices.join(' '));
        }
        else {
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
    updateTopInfoBar() {
        if (!this.currentProfile || !this.lobby)
            return;
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
    updateActivityPanel(tableOverride, engineOverride) {
        if (!this.lobby)
            return;
        let table = tableOverride ?? null;
        if (!table && this.currentProfile?.currentTableId) {
            table = this.findTableById(this.currentProfile.currentTableId) ?? null;
        }
        const hintLines = (0, activity_hints_1.buildActivityHints)({
            viewMode: this.viewMode,
            table: table,
            isUno: table ? (0, lib_1.isUnoTable)(table) : false,
            userId: this.currentProfile?.userId ?? null,
            engine: (engineOverride ?? (table ? this.loadTableHand(table)?.engine : null) ?? null),
        });
        const eventLines = this.lobby.events.length > 0
            ? [...this.lobby.events].reverse().map((event) => event.message)
            : ['No activity yet.'];
        const lines = hintLines.length > 0 ? [...hintLines, '', ...eventLines] : eventLines;
        // One painter owns the panel: it wraps to the panel's own width and holds
        // the reader's scroll position (UIManager.paintActivity).
        this.uiManager.setActivityBody(lines);
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
            rows.push(['-', 'No tables yet', '', '', '']);
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
        // The painting lives with the other table painting
        // (managers/GameViews.ts); this door is at the repo's line ceiling
        // and has been shaved four times already to stay under it.
        this.gameViews.updateTablePanel();
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
            if (table && ((0, lib_1.isUnoTable)(table))) {
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
            if (table && ((0, lib_1.isUnoTable)(table))) {
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
            if (table && ((0, lib_1.isUnoTable)(table))) {
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
            if (table && ((0, lib_1.isUnoTable)(table))) {
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
        if (table && ((0, lib_1.isUnoTable)(table))) {
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
    applyViewGeometry() {
        if (!this.layout)
            return;
        const { width, leftWidth, rightWidth, mainHeight, tableHeight } = this.layout;
        // LIVE properties, not `options`: that seeds a widget once and is never
        // read again, so writing it left the window as narrow as it was built.
        // A terminal with room for everything shows everything: the lobby and
        // its chat log stay where they are and the table takes the rest, rather
        // than the door hiding half of itself on a screen that could hold it
        // (lib/desktop-layout.ts).
        const roomForEverything = (0, desktop_layout_1.hasRoomForEverything)(Number(this.screen.width) || 80, Number(this.screen.height) || 25);
        if (this.viewMode === 'table' && !roomForEverything) {
            this.lobbyWindow.hide();
            this.tableWindow.show();
            this.tableWindow.left = 0;
            this.tableWindow.width = width;
            this.tableWindow.height = tableHeight;
            this.logWindow.hide();
            this.topBar.show();
            this.topInfoBar.hide();
        }
        else {
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
        else if ((0, lib_1.isUnoTable)(table)) {
            await this.startUnoGame(table);
        }
        else {
            this.pushNotice(`${table.gameName} is not implemented yet.`);
            return;
        }
        this.updateAllPanels();
    }
    handleAchievementUnlocks(profile) {
        for (const unlocked of (0, achievements_1.unlockAchievements)(profile)) {
            this.pushNotice(`Achievement unlocked: ${unlocked.name} (+${unlocked.reward})`);
        }
    }
    updateStatsAfterHand(profile, delta, pot) {
        (0, achievements_1.recordHandResult)(profile, delta, pot);
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
