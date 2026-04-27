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

const LOCATION_NAMES = [
  'Brooklyn','Bronx','Ghetto','Central Park',
  'Manhattan','Coney Island','Battery Park','Queens',
];

export async function createApp(ctx: DoorContext, server: DopewarsServer): Promise<void> {
  const user = (ctx as any).user ?? { username: 'PLAYER', id: 'player' };
  const id   = String(user.username ?? user.id);

  const layout = createLayout(ctx);
  const { screen, header, market, inventory, events, players, actions } = layout;

  const inputManager = new DoorInputManager(ctx as any, screen, {
    enableGameMode: true,
    enableGrabKeys: true,
    enableMouse:    false,
  });

  let state:       PlayerState;
  let marketState: MarketState;
  let mode:        ActionBarMode = 'normal';
  let unbindCombat: (() => void) | null = null;

  function updateHeader(): void {
    const loc = LOCATION_NAMES[state.location] ?? `Loc${state.location}`;
    header.setContent(
      ` {bold}DOPEWARS{/} | Day {yellow-fg}${state.turn}/${state.totalTurns}{/}` +
      ` | {cyan-fg}${loc}{/}` +
      ` | HP: {${state.health > 50 ? 'green' : 'red'}-fg}${state.health}{/}` +
      ` | Cash: {green-fg}$${Math.round(state.cash).toLocaleString('en-US')}{/}` +
      ` | Debt: {red-fg}$${Math.round(state.debt).toLocaleString('en-US')}{/}`
    );
  }

  function fullRender(): void {
    updateHeader();
    renderMarket(market, marketState, state);
    renderInventory(inventory, state, marketState);
    renderActionBar(actions, mode);
    screen.render();
  }

  async function applyResult(result: ActionResult): Promise<void> {
    state = { ...result.newState, id, name: user.username ?? id };
    try { marketState = await server.getMarket(id); } catch { /* ignore if out of game */ }
    updatePresenceSub(state.location);

    for (const ev of result.events) {
      pushEvent(events, ev.msg || `Event #${ev.code}`);
    }

    if (state.inCombat && mode !== 'combat') {
      mode = 'combat';
      unbindCombat = bindCombatKeys(screen, {
        onFight: async () => {
          const r = await server.fight(id);
          await applyResult(r);
          fullRender();
        },
        onRun: async (loc: number) => {
          if (unbindCombat) { unbindCombat(); unbindCombat = null; }
          mode = 'normal';
          const r = await server.runFrom(id, loc);
          await applyResult(r);
          fullRender();
        },
        onSurrender: async () => {
          if (unbindCombat) { unbindCombat(); unbindCombat = null; }
          mode = 'normal';
          const r = await server.surrender(id);
          await applyResult(r);
          fullRender();
        },
      });
    } else if (!state.inCombat && mode === 'combat') {
      if (unbindCombat) { unbindCombat(); unbindCombat = null; }
      mode = 'normal';
    }

    if (result.questions.length > 0 && mode !== 'combat') {
      mode = 'question';
      renderActionBar(actions, 'question');
      screen.render();
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
    if (mode !== 'normal') return;
    showBuyOverlay(screen, marketState, state,
      async (drug: number, amt: number) => {
        const r = await server.buyDrug(id, drug, amt);
        await applyResult(r);
        fullRender();
      },
      () => fullRender()
    );
  });

  screen.key(['s','S'], () => {
    if (mode !== 'normal') return;
    showSellOverlay(screen, state,
      async (drug: number, amt: number) => {
        const r = await server.sellDrug(id, drug, amt);
        await applyResult(r);
        fullRender();
      },
      () => fullRender()
    );
  });

  screen.key(['j','J'], () => {
    if (mode !== 'normal') return;
    showJetOverlay(screen, state.location,
      async (loc: number) => {
        const r = await server.jetTo(id, loc);
        updatePresenceSub(r.newState.location);
        await applyResult(r);
        fullRender();
      },
      () => fullRender()
    );
  });

  screen.key(['h','H'], async () => {
    if (mode !== 'normal') return;
    showHighScores(screen, await server.getHighScores(), () => fullRender());
  });

  screen.key(['q','Q'], async () => {
    await server.leaveGame(id);
    inputManager.disable();
    screen.destroy();
  });

  /* -- Boot ------------------------------------------------------- */

  inputManager.enable();

  state = await server.joinGame(id, user.username ?? id);
  state = { ...state, id, name: user.username ?? id };
  marketState = await server.getMarket(id);

  updatePresenceSub(state.location);

  pushEvent(events, `{bold}Welcome to DOPEWARS, ${user.username ?? id}!{/}`);
  pushEvent(events, `You have {green-fg}$${Math.round(state.cash).toLocaleString('en-US')}{/} and {yellow-fg}${state.totalTurns}{/} turns.`);
  pushEvent(events, `You are in {cyan-fg}${LOCATION_NAMES[state.location] ?? 'Brooklyn'}{/}.`);

  fullRender();

  await new Promise<void>((resolve) => {
    screen.on('destroy', () => resolve());
  });
}
