/**
 * TetriNET lobby regression tests.
 *
 * Two dead ends found on 2026-08-25:
 *
 * 1. The settings editor offers six knobs; startTetriNetGame copied three.
 *    Lines for Special, Specials Added and Inventory Size were edited by the
 *    sysop, shown in the lobby, and then dropped on the floor - every game
 *    ran on the rule set's defaults.
 * 2. state.winlist is written in exactly one place: the handler for the
 *    external server's 'tetrinet:winlist' message. Nothing emits that on the
 *    in-process bus, and a TetriNET game recorded no score at all, so the
 *    lobby's Winlist tab could never have an entry in local play.
 */

import assert from 'assert';
import { optionsFromLobbySettings, getDefaultOptions } from '../core/tetrinet/game-rules';
import { TetriNetEngine } from '../core/tetrinet/tetrinet-engine';
import { TetriNetLobbyAdapter } from '../network/tetrinet-lobby-adapter';
import { GrandmasterNetworkManager } from '../network/network-manager';

const ALL_EDITOR_SETTINGS = {
  startingLevel: 7,
  linesToMakeForSpecials: 3,
  specialsAddedEachTime: 2,
  inventorySize: 14,
  delayBeforeSuddenDeath: 4,
  suddenDeathTick: 9,
};

export async function everyLobbySettingReachesTheGameOptions(): Promise<void> {
  const options: any = optionsFromLobbySettings('standard', ALL_EDITOR_SETTINGS);

  for (const [key, value] of Object.entries(ALL_EDITOR_SETTINGS)) {
    assert.strictEqual(options[key], value,
      `${key} must reach the game options (the editor shows it, so it has to mean something)`);
  }
}

export async function unsetSettingsFallBackToTheRuleDefaults(): Promise<void> {
  const defaults = getDefaultOptions('extended');
  const options = optionsFromLobbySettings('extended', {});

  assert.strictEqual(options.inventorySize, defaults.inventorySize);
  assert.strictEqual(options.linesToMakeForSpecials, defaults.linesToMakeForSpecials);
  assert.strictEqual(options.specialsAddedEachTime, defaults.specialsAddedEachTime);
  assert.strictEqual(options.startingLevel, defaults.startingLevel);
}

export async function classicModeIgnoresTheSpecialsKnobs(): Promise<void> {
  const defaults = getDefaultOptions('classic');
  const options = optionsFromLobbySettings('classic', ALL_EDITOR_SETTINGS);

  assert.strictEqual(options.noSpecials, true, 'classic has no specials');
  assert.strictEqual(options.specialsAddedEachTime, defaults.specialsAddedEachTime,
    'a specials knob must not switch specials on in classic mode');
  assert.strictEqual(options.startingLevel, ALL_EDITOR_SETTINGS.startingLevel,
    'non-specials settings still apply in classic mode');
}

export async function inventorySizeReachesTheEngine(): Promise<void> {
  const engine: any = new TetriNetEngine({} as any, optionsFromLobbySettings('standard', {
    ...ALL_EDITOR_SETTINGS,
    inventorySize: 3,
  }));

  assert.strictEqual(engine.getInventory().getMaxSize(), 3,
    'the edited inventory size must reach the running engine, not just the options object');
}

export async function localWinlistShowsInTheLobbyState(): Promise<void> {
  const network: any = new GrandmasterNetworkManager({
    user: { id: `win-${Date.now()}`, username: 'sysop' },
    bbsSession: { nodeNumber: 1 },
    nodeNumber: 1,
  } as any);
  const adapter: any = new TetriNetLobbyAdapter(network);

  adapter.setLocalWinlist([
    { rank: 1, name: 'sysop', score: 4200, isTeam: false },
    { rank: 2, name: 'dial-up', score: 1100, isTeam: false },
  ]);
  adapter.addLocalPlayer('sysop', 1);
  await adapter.createLobby('standard');

  const state = adapter.getState();
  assert.strictEqual(state.leaderboard.length, 2,
    'a local lobby must show the door\'s own TetriNET winners, not an empty tab');
  assert.strictEqual(state.leaderboard[0].name, 'sysop');
}
