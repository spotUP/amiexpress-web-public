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
async function createApp(ctx, server) {
    const user = ctx.user ?? { username: 'PLAYER', id: 'player' };
    const id = String(user.username ?? user.id);
    const layout = (0, layout_1.createLayout)(ctx);
    const { screen, header, market, inventory, events, players, actions } = layout;
    const inputManager = new blessed_helpers_1.DoorInputManager(ctx, screen, {
        enableGameMode: false, // game mode intercepts keys before neo-blessed screen.key() — must be off
        enableGrabKeys: true,
        enableMouse: false,
    });
    let state;
    let marketState;
    let mode = 'normal';
    let unbindCombat = null;
    function updateHeader() {
        const loc = server.getLocationNames()[state.location] ?? `Loc${state.location}`;
        header.setContent(` {bold}${server.getTitle()}{/} | Day {yellow-fg}${state.turn}/${state.totalTurns}{/}` +
            ` | {cyan-fg}${loc}{/}` +
            ` | HP: {${state.health > 50 ? 'green' : 'red'}-fg}${state.health}{/}` +
            ` | Cash: {green-fg}$${Math.round(state.cash).toLocaleString('en-US')}{/}` +
            ` | Debt: {red-fg}$${Math.round(state.debt).toLocaleString('en-US')}{/}`);
    }
    function fullRender() {
        console.log(`[GANJA] fullRender loc=${state?.location} turn=${state?.turn} mode=${mode}`);
        updateHeader();
        (0, market_1.renderMarket)(market, marketState, state);
        (0, inventory_1.renderInventory)(inventory, state, marketState);
        (0, actions_1.renderActionBar)(actions, mode);
        screen.alloc(); // force full repaint — clears blessed's dirty cache
        screen.render();
        console.log('[GANJA] screen.render() done');
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
    async function applyResult(result) {
        console.log(`[GANJA] applyResult ok=${result.ok} events=${result.events.length} questions=${result.questions.length} newLoc=${result.newState?.location}`);
        state = { ...result.newState, id, name: user.username ?? id };
        try {
            marketState = await server.getMarket(id);
        }
        catch { /* ignore if out of game */ }
        updatePresenceSub(state.location);
        for (const ev of result.events) {
            (0, events_1.pushEvent)(events, ev.msg || `Event #${ev.code}`);
        }
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
            });
        }
        else if (!state.inCombat && mode === 'combat') {
            if (unbindCombat) {
                unbindCombat();
                unbindCombat = null;
            }
            mode = 'normal';
        }
        if (result.questions.length > 0 && mode !== 'combat') {
            mode = 'question';
            (0, actions_1.renderActionBar)(actions, 'question');
            screen.render();
            (0, actions_1.showQuestionOverlay)(screen, result.questions[0], async (answer) => {
                const r = await server.handleAnswer(id, answer);
                await applyResult(r);
                fullRender();
            });
            return;
        }
        fullRender();
    }
    /* -- Server event subscriptions --------------------------------- */
    server.on('state:' + id, async (newState) => {
        state = { ...newState, id, name: user.username ?? id };
        try {
            marketState = await server.getMarket(id);
        }
        catch { /* ignore */ }
        fullRender();
    });
    /* -- Update presence subscription when location changes --------- */
    let lastLocation = -1;
    function updatePresenceSub(location) {
        if (location === lastLocation)
            return;
        if (lastLocation >= 0)
            server.removeAllListeners('presence:' + lastLocation);
        server.on('presence:' + location, (ps) => {
            (0, players_1.renderPlayers)(players, ps, id);
            screen.render();
        });
        lastLocation = location;
    }
    /* -- Keyboard bindings ------------------------------------------ */
    screen.key(['b', 'B'], () => {
        if (mode !== 'normal')
            return;
        (0, actions_1.showBuyOverlay)(screen, marketState, state, (drug, amt) => runAction(async () => {
            const r = await server.buyDrug(id, drug, amt);
            await applyResult(r);
            fullRender();
        }), () => fullRender());
    });
    screen.key(['s', 'S'], () => {
        if (mode !== 'normal')
            return;
        (0, actions_1.showSellOverlay)(screen, state, marketState, (drug, amt) => runAction(async () => {
            const r = await server.sellDrug(id, drug, amt);
            await applyResult(r);
            fullRender();
        }), () => fullRender());
    });
    screen.key(['j', 'J'], () => {
        if (mode !== 'normal')
            return;
        (0, actions_1.showJetOverlay)(screen, state.location, server.getLocationNames(), (loc) => runAction(async () => {
            const r = await server.jetTo(id, loc);
            updatePresenceSub(r.newState.location);
            await applyResult(r);
            fullRender();
        }), () => fullRender());
    });
    screen.key(['h', 'H'], () => {
        if (mode !== 'normal')
            return;
        runAction(async () => {
            (0, actions_1.showHighScores)(screen, await server.getHighScores(), () => fullRender());
        });
    });
    screen.key(['q', 'Q'], () => {
        runAction(async () => {
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