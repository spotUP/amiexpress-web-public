import { DoorContext } from '@amiexpress/bbs-door-sdk';
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { DopewarsServer } from './server';
import { PlayerState, MarketState, GameQuestion, ActionResult } from './types';
import { createLayout } from './ui/layout';
import { renderMarket } from './ui/market';
import { renderInventory } from './ui/inventory';
import { pushEvent } from './ui/events';
import { renderPlayers } from './ui/players';
import {
  renderActionBar, showBuyOverlay, showSellOverlay,
  showJetOverlay, showQuestionOverlay, showHighScores,
  ActionBarMode,
} from './ui/actions';
import { bindCombatKeys } from './ui/combat';

export async function createApp(ctx: DoorContext, server: DopewarsServer): Promise<void> {
  const user = (ctx as any).user ?? { username: 'PLAYER', id: 'player' };
  const id   = String(user.username ?? user.id);

  const layout = createLayout(ctx);
  const { screen, header, market, inventory, events, players, actions } = layout;

  const inputManager = new DoorInputManager(ctx as any, screen, {
    enableGameMode: false,  // game mode intercepts keys before neo-blessed screen.key() — must be off
    enableGrabKeys: true,
    enableMouse:    true,   // consume mouse events before they corrupt blessed's input buffer
  });

  let state:       PlayerState;
  let marketState: MarketState;
  let mode:        ActionBarMode = 'normal';
  let unbindCombat: (() => void) | null = null;

  function updateHeader(): void {
    const loc = server.getLocationNames()[state.location] ?? `Loc${state.location}`;
    header.setContent(
      ` {bold}${server.getTitle()}{/} | Day {yellow-fg}${state.turn}/${state.totalTurns}{/}` +
      ` | {cyan-fg}${loc}{/}` +
      ` | HP: {${state.health > 50 ? 'green' : 'red'}-fg}${state.health}{/}` +
      ` | Cash: {green-fg}$${Math.round(state.cash).toLocaleString('en-US')}{/}` +
      ` | Debt: {red-fg}$${Math.round(state.debt).toLocaleString('en-US')}{/}`
    );
  }

  function fullRender(): void {
    console.log(`[GANJA] fullRender loc=${state?.location} turn=${state?.turn} mode=${mode}`);
    updateHeader();
    renderMarket(market, marketState, state);
    renderInventory(inventory, state, marketState);
    renderActionBar(actions, mode);
    (screen as any).alloc();   // force full repaint — clears blessed's dirty cache
    screen.render();
    console.log('[GANJA] screen.render() done');
  }

  async function runAction(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err: any) {
      pushEvent(events, `{red-fg}Error: ${err?.message ?? String(err)}{/}`);
      fullRender();
    }
  }

  async function applyResult(result: ActionResult): Promise<void> {
    console.log(`[GANJA] applyResult ok=${result.ok} events=${result.events.length} questions=${result.questions.length} newLoc=${result.newState?.location}`);
    state = { ...result.newState, id, name: user.username ?? id };
    try { marketState = await server.getMarket(id); } catch { /* ignore if out of game */ }
    updatePresenceSub(state.location);

    for (const ev of result.events) {
      pushEvent(events, ev.msg || `Event #${ev.code}`);
    }

    if (state.inCombat && mode !== 'combat') {
      mode = 'combat';
      unbindCombat = bindCombatKeys(screen, {
        onFight: () => runAction(async () => {
          const r = await server.fight(id);
          await applyResult(r);
          fullRender();
        }),
        onRun: (loc: number) => runAction(async () => {
          if (unbindCombat) { unbindCombat(); unbindCombat = null; }
          mode = 'normal';
          const r = await server.runFrom(id, loc);
          await applyResult(r);
          fullRender();
        }),
        onSurrender: () => runAction(async () => {
          if (unbindCombat) { unbindCombat(); unbindCombat = null; }
          mode = 'normal';
          const r = await server.surrender(id);
          await applyResult(r);
          fullRender();
        }),
      });
    } else if (!state.inCombat && mode === 'combat') {
      if (unbindCombat) { unbindCombat(); unbindCombat = null; }
      mode = 'normal';
    } else if (!state.inCombat && result.questions.length === 0) {
      // No combat, no pending question — reset any stale mode (e.g. after answering a question)
      mode = 'normal';
    }

    if (result.questions.length > 0 && mode !== 'combat') {
      mode = 'question';
      fullRender();  // update all panels with current state before the overlay appears
      showQuestionOverlay(screen, result.questions[0] as GameQuestion, async (answer: string) => {
        const r = await server.handleAnswer(id, answer);
        await applyResult(r);
        fullRender();
      });
      return;
    }

    fullRender();
  }

  /* -- Server event subscriptions --------------------------------- */

  server.on('state:' + id, async (newState: PlayerState) => {
    state = { ...newState, id, name: user.username ?? id };
    try { marketState = await server.getMarket(id); } catch { /* ignore */ }
    fullRender();
  });

  /* -- Update presence subscription when location changes --------- */
  let lastLocation = -1;
  function updatePresenceSub(location: number): void {
    if (location === lastLocation) return;
    if (lastLocation >= 0) server.removeAllListeners('presence:' + lastLocation);
    server.on('presence:' + location, (ps: any[]) => {
      renderPlayers(players, ps, id);
      screen.render();
    });
    lastLocation = location;
  }

  /* -- Keyboard bindings ------------------------------------------ */

  screen.key(['b','B'], () => {
    console.log(`[GANJA] key B pressed, mode=${mode}`);
    if (mode !== 'normal') return;
    showBuyOverlay(screen, marketState, state,
      (drug, amt) => runAction(async () => {
        console.log(`[GANJA] buyDrug drug=${drug} amt=${amt}`);
        const r = await server.buyDrug(id, drug, amt);
        await applyResult(r);
        fullRender();
      }),
      () => fullRender()
    );
  });

  screen.key(['s','S'], () => {
    console.log(`[GANJA] key S pressed, mode=${mode}`);
    if (mode !== 'normal') return;
    showSellOverlay(screen, state, marketState,
      (drug, amt) => runAction(async () => {
        console.log(`[GANJA] sellDrug drug=${drug} amt=${amt}`);
        const r = await server.sellDrug(id, drug, amt);
        await applyResult(r);
        fullRender();
      }),
      () => fullRender()
    );
  });

  screen.key(['j','J'], () => {
    console.log(`[GANJA] key J pressed, mode=${mode}`);
    if (mode !== 'normal') return;
    showJetOverlay(screen, state.location, server.getLocationNames(),
      (loc) => runAction(async () => {
        console.log(`[GANJA] jetTo loc=${loc}`);
        const r = await server.jetTo(id, loc);
        updatePresenceSub(r.newState.location);
        await applyResult(r);
        fullRender();
      }),
      () => fullRender()
    );
  });

  screen.key(['h','H'], () => {
    console.log(`[GANJA] key H pressed, mode=${mode}`);
    if (mode !== 'normal') return;
    runAction(async () => {
      showHighScores(screen, await server.getHighScores(), () => fullRender());
    });
  });

  screen.key(['q','Q'], () => {
    console.log(`[GANJA] key Q pressed`);
    runAction(async () => {
      await server.leaveGame(id);
      inputManager.disable();
      screen.destroy();
    });
  });

  // Log any unhandled keypress at screen level for diagnostics
  screen.on('keypress', (_ch: any, key: any) => {
    console.log(`[GANJA] screen keypress: ${key?.full ?? key?.name ?? JSON.stringify(key)} mode=${mode}`);
  });

  /* -- Boot ------------------------------------------------------- */

  inputManager.enable();

  state = await server.joinGame(id, user.username ?? id);
  state = { ...state, id, name: user.username ?? id };
  marketState = await server.getMarket(id);

  updatePresenceSub(state.location);

  screen.clear();
  screen.render();
  pushEvent(events, `{bold}Welcome to ${server.getTitle()}, ${user.username ?? id}!{/}`);
  pushEvent(events, `You have {green-fg}$${Math.round(state.cash).toLocaleString('en-US')}{/} and {yellow-fg}${state.totalTurns}{/} turns.`);
  pushEvent(events, `You are in {cyan-fg}${server.getLocationNames()[state.location] ?? 'Trench Town'}{/}.`);

  fullRender();

  await new Promise<void>((resolve) => {
    screen.on('destroy', () => resolve());
  });
}
