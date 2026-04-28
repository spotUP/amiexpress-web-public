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

// EventNum value set by the C game engine when a player's game is over
const E_FINISH = 100;

export async function createApp(ctx: DoorContext, server: DopewarsServer): Promise<void> {
  const user = (ctx as any).user ?? { username: 'PLAYER', id: 'player' };
  const id   = String(user.username ?? user.id);

  const layout = createLayout(ctx);
  const { screen, header, market, inventory, events, players, actions } = layout;

  const inputManager = new DoorInputManager(ctx as any, screen, {
    enableGameMode: false,  // game mode intercepts keys before neo-blessed screen.key() — must be off
    enableGrabKeys: true,
    enableMouse:    true,
  });

  let state:       PlayerState;
  let marketState: MarketState;
  let mode:        ActionBarMode = 'normal';
  let unbindCombat: (() => void) | null = null;
  let gameOver = false;  // true once E_FINISH is detected; blocks all game actions

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
    updateHeader();
    renderMarket(market, marketState);
    renderInventory(inventory, state, marketState);
    renderActionBar(actions, mode);
    (screen as any).alloc();
    screen.render();
  }

  async function runAction(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err: any) {
      pushEvent(events, `{red-fg}Error: ${err?.message ?? String(err)}{/}`);
      fullRender();
    }
  }

  async function handleGameOver(): Promise<void> {
    if (gameOver) return;
    gameOver = true;
    if (unbindCombat) { unbindCombat(); unbindCombat = null; }
    mode = 'normal';

    // Save the high score
    try { await server.endGame(id); } catch { /* player may have been removed */ }

    const score = Math.round(state.cash + state.bank - state.debt);
    pushEvent(events, `{bold}{yellow-fg}GAME OVER!{/} Final score: {green-fg}$${score.toLocaleString('en-US')}{/}`);
    pushEvent(events, `{bold}[H]{/} high scores   {bold}[Q]{/} quit`);
    // Override action bar to game-over message
    actions.setContent('  {bold}{yellow-fg}GAME OVER{/}   Final score: {green-fg}$' +
      score.toLocaleString('en-US') + '{/}   {bold}[H]{/}iscores  {bold}[Q]{/}uit');
    (screen as any).alloc();
    screen.render();
  }

  async function applyResult(result: ActionResult): Promise<void> {
    const prevLocation = state?.location ?? -1;  // capture BEFORE update
    state = { ...result.newState, id, name: user.username ?? id };
    try { marketState = await server.getMarket(id); } catch { /* ignore if out of game */ }
    updatePresenceSub(state.location);

    // C_DRUGHERE (75/'K') = raw price data — market refreshed via getMarket(), skip it
    // C_UPDATE (74/'J', or 85/'U' per some code paths) = internal ping, no visible text
    for (const ev of result.events) {
      if (ev.msg && ev.code !== 75 && ev.code !== 74 && ev.code !== 85) {
        pushEvent(events, ev.msg);
      }
    }
    // Show arrival message when location changed
    if (state.location !== prevLocation) {
      const locName = server.getLocationNames()[state.location];
      if (locName) pushEvent(events, `You are in {cyan-fg}${locName}{/}.`);
    }

    // Game-over detection — E_FINISH is set by FinishGame() in the C engine
    if (state.eventNum === E_FINISH) {
      await handleGameOver();
      return;
    }

    // Combat state management
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
      }, { currentLocation: state.location, locationNames: server.getLocationNames() });
    } else if (!state.inCombat && mode === 'combat') {
      if (unbindCombat) { unbindCombat(); unbindCombat = null; }
      mode = 'normal';
    } else if (!state.inCombat && result.questions.length === 0) {
      mode = 'normal';
    }

    // Questions are shown regardless of mode (they overlay combat too)
    if (result.questions.length > 0) {
      const prevMode = mode;
      mode = 'question';
      fullRender();
      showQuestionOverlay(screen, result.questions[0] as GameQuestion, async (answer: string) => {
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
  const onStateUpdate = async (newState: PlayerState) => {
    state = { ...newState, id, name: user.username ?? id };
    try { marketState = await server.getMarket(id); } catch { /* ignore */ }
    fullRender();
  };
  server.on('state:' + id, onStateUpdate);

  /* -- Update presence subscription when location changes --------- */
  let lastLocation = -1;
  let lastPresenceListener: ((ps: any[]) => void) | null = null;

  function updatePresenceSub(location: number): void {
    if (location === lastLocation) return;
    if (lastLocation >= 0 && lastPresenceListener) {
      server.removeListener('presence:' + lastLocation, lastPresenceListener);
    }
    lastPresenceListener = (ps: any[]) => {
      renderPlayers(players, ps, id);
      screen.render();
    };
    server.on('presence:' + location, lastPresenceListener);
    lastLocation = location;
  }

  /* -- Keyboard bindings ------------------------------------------ */

  screen.key(['b','B'], () => {
    if (gameOver || mode !== 'normal') return;
    showBuyOverlay(screen, marketState, state,
      (drug, amt) => runAction(async () => {
        const r = await server.buyDrug(id, drug, amt);
        await applyResult(r);
        fullRender();
      }),
      () => fullRender()
    );
  });

  screen.key(['s','S'], () => {
    if (gameOver || mode !== 'normal') return;
    showSellOverlay(screen, state, marketState,
      (drug, amt) => runAction(async () => {
        const r = await server.sellDrug(id, drug, amt);
        await applyResult(r);
        fullRender();
      }),
      () => fullRender()
    );
  });

  screen.key(['j','J'], () => {
    if (gameOver || mode !== 'normal') return;
    showJetOverlay(screen, state.location, server.getLocationNames(),
      (loc) => runAction(async () => {
        const r = await server.jetTo(id, loc);
        updatePresenceSub(r.newState.location);
        await applyResult(r);
        fullRender();
      }),
      () => fullRender()
    );
  });

  screen.key(['h','H'], () => {
    if (mode === 'combat' || mode === 'question') return;
    runAction(async () => {
      showHighScores(screen, await server.getHighScores(), () => fullRender());
    });
  });

  screen.key(['q','Q'], () => {
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
  pushEvent(events, `{bold}Welcome to ${server.getTitle()}, ${user.username ?? id}!{/}`);
  pushEvent(events, `You have {green-fg}$${Math.round(state.cash).toLocaleString('en-US')}{/} and {yellow-fg}${state.totalTurns}{/} turns.`);
  pushEvent(events, `You are in {cyan-fg}${server.getLocationNames()[state.location] ?? 'Trench Town'}{/}.`);

  fullRender();

  await new Promise<void>((resolve) => {
    screen.on('destroy', () => resolve());
  });
}
