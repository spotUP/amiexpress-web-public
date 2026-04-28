"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const layout_1 = require("./ui/layout");
const market_1 = require("./ui/market");
const inventory_1 = require("./ui/inventory");
const events_1 = require("./ui/events");
const players_1 = require("./ui/players");
const actions_1 = require("./ui/actions");
const combat_1 = require("./ui/combat");
// EventNum value set by the C game engine when a player's game is over
const E_FINISH = 100;
async function createApp(ctx, server) {
    const user = ctx.user ?? { username: 'PLAYER', id: 'player' };
    const id = String(user.username ?? user.id);
    const layout = (0, layout_1.createLayout)(ctx);
    const { screen, header, market, inventory, events, players, actions } = layout;
    const inputManager = new blessed_helpers_1.DoorInputManager(ctx, screen, {
        enableGameMode: false, // game mode intercepts keys before neo-blessed screen.key() — must be off
        enableGrabKeys: true,
        enableMouse: true,
    });
    let state;
    let marketState;
    let mode = 'normal';
    let unbindCombat = null;
    let gameOver = false; // true once E_FINISH is detected; blocks all game actions
    function updateHeader() {
        const loc = server.getLocationNames()[state.location] ?? `Loc${state.location}`;
        header.setContent(` {bold}${server.getTitle()}{/} | Day {yellow-fg}${state.turn}/${state.totalTurns}{/}` +
            ` | {cyan-fg}${loc}{/}` +
            ` | HP: {${state.health > 50 ? 'green' : 'red'}-fg}${state.health}{/}` +
            ` | Cash: {green-fg}$${Math.round(state.cash).toLocaleString('en-US')}{/}` +
            ` | Debt: {red-fg}$${Math.round(state.debt).toLocaleString('en-US')}{/}`);
    }
    function fullRender() {
        updateHeader();
        (0, market_1.renderMarket)(market, marketState);
        (0, inventory_1.renderInventory)(inventory, state, marketState);
        (0, actions_1.renderActionBar)(actions, mode);
        screen.alloc();
        screen.render();
    }
    async function runAction(fn) {
        try {
            await fn();
        }
        catch (err) {
            (0, events_1.pushEvent)(events, `{red-fg}Error: ${err?.message ?? String(err)}{/}`);
            fullRender();
        }
    }
    async function handleGameOver() {
        if (gameOver)
            return;
        gameOver = true;
        if (unbindCombat) {
            unbindCombat();
            unbindCombat = null;
        }
        mode = 'normal';
        // Save the high score
        try {
            await server.endGame(id);
        }
        catch { /* player may have been removed */ }
        const score = Math.round(state.cash + state.bank - state.debt);
        (0, events_1.pushEvent)(events, `{bold}{yellow-fg}GAME OVER!{/} Final score: {green-fg}$${score.toLocaleString('en-US')}{/}`);
        (0, events_1.pushEvent)(events, `{bold}[H]{/} high scores   {bold}[Q]{/} quit`);
        // Override action bar to game-over message
        actions.setContent('  {bold}{yellow-fg}GAME OVER{/}   Final score: {green-fg}$' +
            score.toLocaleString('en-US') + '{/}   {bold}[H]{/}iscores  {bold}[Q]{/}uit');
        screen.alloc();
        screen.render();
    }
    async function applyResult(result) {
        const prevLocation = state?.location ?? -1; // capture BEFORE update
        state = { ...result.newState, id, name: user.username ?? id };
        try {
            marketState = await server.getMarket(id);
        }
        catch { /* ignore if out of game */ }
        updatePresenceSub(state.location);
        // C_DRUGHERE (75/'K') = raw price data — market refreshed via getMarket(), skip it
        // C_UPDATE (74/'J', or 85/'U' per some code paths) = internal ping, no visible text
        for (const ev of result.events) {
            if (ev.msg && ev.code !== 75 && ev.code !== 74 && ev.code !== 85) {
                (0, events_1.pushEvent)(events, ev.msg);
            }
        }
        // Show arrival message when location changed
        if (state.location !== prevLocation) {
            const locName = server.getLocationNames()[state.location];
            if (locName)
                (0, events_1.pushEvent)(events, `You are in {cyan-fg}${locName}{/}.`);
        }
        // Game-over detection — E_FINISH is set by FinishGame() in the C engine
        if (state.eventNum === E_FINISH) {
            await handleGameOver();
            return;
        }
        // Combat state management
        if (state.inCombat && mode !== 'combat') {
            mode = 'combat';
            unbindCombat = (0, combat_1.bindCombatKeys)(screen, {
                onFight: () => runAction(async () => {
                    const r = await server.fight(id);
                    await applyResult(r);
                    fullRender();
                }),
                onRun: (loc) => runAction(async () => {
                    if (unbindCombat) {
                        unbindCombat();
                        unbindCombat = null;
                    }
                    mode = 'normal';
                    const r = await server.runFrom(id, loc);
                    await applyResult(r);
                    fullRender();
                }),
                onSurrender: () => runAction(async () => {
                    if (unbindCombat) {
                        unbindCombat();
                        unbindCombat = null;
                    }
                    mode = 'normal';
                    const r = await server.surrender(id);
                    await applyResult(r);
                    fullRender();
                }),
            }, { currentLocation: state.location, locationNames: server.getLocationNames() });
        }
        else if (!state.inCombat && mode === 'combat') {
            if (unbindCombat) {
                unbindCombat();
                unbindCombat = null;
            }
            mode = 'normal';
        }
        else if (!state.inCombat && result.questions.length === 0) {
            mode = 'normal';
        }
        // Questions are shown regardless of mode (they overlay combat too)
        if (result.questions.length > 0) {
            const prevMode = mode;
            mode = 'question';
            fullRender();
            (0, actions_1.showQuestionOverlay)(screen, result.questions[0], async (answer) => {
                mode = prevMode;
                const r = await server.handleAnswer(id, answer);
                await applyResult(r);
                fullRender();
            });
            return;
        }
        fullRender();
    }
    /* -- Server event subscriptions --------------------------------- */
    // Store reference so we can remove it cleanly on exit
    const onStateUpdate = async (newState) => {
        state = { ...newState, id, name: user.username ?? id };
        try {
            marketState = await server.getMarket(id);
        }
        catch { /* ignore */ }
        fullRender();
    };
    server.on('state:' + id, onStateUpdate);
    /* -- Update presence subscription when location changes --------- */
    let lastLocation = -1;
    let lastPresenceListener = null;
    function updatePresenceSub(location) {
        if (location === lastLocation)
            return;
        if (lastLocation >= 0 && lastPresenceListener) {
            server.removeListener('presence:' + lastLocation, lastPresenceListener);
        }
        lastPresenceListener = (ps) => {
            (0, players_1.renderPlayers)(players, ps, id);
            screen.render();
        };
        server.on('presence:' + location, lastPresenceListener);
        lastLocation = location;
    }
    /* -- Keyboard bindings ------------------------------------------ */
    screen.key(['b', 'B'], () => {
        if (gameOver || mode !== 'normal')
            return;
        (0, actions_1.showBuyOverlay)(screen, marketState, state, (drug, amt) => runAction(async () => {
            const r = await server.buyDrug(id, drug, amt);
            await applyResult(r);
            fullRender();
        }), () => fullRender());
    });
    screen.key(['s', 'S'], () => {
        if (gameOver || mode !== 'normal')
            return;
        (0, actions_1.showSellOverlay)(screen, state, marketState, (drug, amt) => runAction(async () => {
            const r = await server.sellDrug(id, drug, amt);
            await applyResult(r);
            fullRender();
        }), () => fullRender());
    });
    screen.key(['j', 'J'], () => {
        if (gameOver || mode !== 'normal')
            return;
        (0, actions_1.showJetOverlay)(screen, state.location, server.getLocationNames(), (loc) => runAction(async () => {
            const r = await server.jetTo(id, loc);
            updatePresenceSub(r.newState.location);
            await applyResult(r);
            fullRender();
        }), () => fullRender());
    });
    screen.key(['h', 'H'], () => {
        if (mode === 'combat' || mode === 'question')
            return;
        runAction(async () => {
            (0, actions_1.showHighScores)(screen, await server.getHighScores(), () => fullRender());
        });
    });
    screen.key(['q', 'Q'], () => {
        runAction(async () => {
            server.removeListener('state:' + id, onStateUpdate);
            if (lastPresenceListener && lastLocation >= 0) {
                server.removeListener('presence:' + lastLocation, lastPresenceListener);
            }
            await server.leaveGame(id);
            inputManager.disable();
            screen.destroy();
        });
    });
    /* -- Boot ------------------------------------------------------- */
    inputManager.enable();
    state = await server.joinGame(id, user.username ?? id);
    state = { ...state, id, name: user.username ?? id };
    marketState = await server.getMarket(id);
    updatePresenceSub(state.location);
    screen.clear();
    screen.render();
    (0, events_1.pushEvent)(events, `{bold}Welcome to ${server.getTitle()}, ${user.username ?? id}!{/}`);
    (0, events_1.pushEvent)(events, `You have {green-fg}$${Math.round(state.cash).toLocaleString('en-US')}{/} and {yellow-fg}${state.totalTurns}{/} turns.`);
    (0, events_1.pushEvent)(events, `You are in {cyan-fg}${server.getLocationNames()[state.location] ?? 'Trench Town'}{/}.`);
    fullRender();
    await new Promise((resolve) => {
        screen.on('destroy', () => resolve());
    });
}
//# sourceMappingURL=app.js.map