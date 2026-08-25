/**
 * Lobby Screen
 *
 * Multiplayer lobby using the SDK's generic MultiplayerLobby widget
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  MultiplayerLobby,
  type LobbyNetworkAdapter,
  type LobbyPlayerInfo,
  type LobbyState,
  type LobbyResult,
  type LobbyEntryMode,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GrandmasterNetworkManager, MultiplayerMode } from '../network/network-manager';
import { BrokerLobbyAdapter } from '../network/broker-lobby-adapter';
import type { AppState } from '../core/types';
import type { SoundEngine, SoundEffect } from '../audio/sounds';

/**
 * Lobby mode
 */
export type LobbyMode = 'matchmaking' | 'custom' | 'browse';

/**
 * Lobby Screen
 *
 * Thin wrapper around SDK's MultiplayerLobby widget
 */
export class LobbyScreen {
  private screen: Screen;
  private state: AppState;
  private sounds: SoundEngine;
  private network: GrandmasterNetworkManager;
  private localPlayerId: string;
  private lobby: MultiplayerLobby | null = null;

  constructor(
    screen: Screen,
    state: AppState,
    sounds: SoundEngine,
    network: GrandmasterNetworkManager,
    localPlayerId: string
  ) {
    this.screen = screen;
    this.state = state;
    this.sounds = sounds;
    this.network = network;
    this.localPlayerId = localPlayerId;
  }

  /**
   * Show lobby and wait for result
   */
  async show(mode: LobbyMode, selectedMode?: MultiplayerMode): Promise<LobbyResult> {
    // Enable mouse control for lobby interaction
    this.screen.program.enableMouse();

    // Create adapter
    const adapter = new BrokerLobbyAdapter(this.network, this.localPlayerId);

    // Create lobby widget
    this.lobby = new MultiplayerLobby({
      parent: this.screen,
      adapter,
      localPlayerId: this.localPlayerId,
      title: 'GRANDMASTER LOBBY',
      features: {
        bots: true,
        settingsEditor: true,
        chat: true,
        leaderboard: true,
        readyFlow: false,
        // Start already bot-fills and launches on its own, and the
        // "waiting for other players" countdown auto-launches when it
        // expires - so a Force Start button would just be a second button
        // doing what Start does.
        forceStart: false,
      },
      autoStartTimeout: 60,
      gameSettings: [
        {
          key: 'startingLevel',
          label: 'Start Level',
          type: 'number',
          min: 1,
          max: 20,
          default: 1,
          hostOnly: true,
        },
        {
          key: 'garbage',
          // "Garbage Lines" read as "start the boards with garbage in them",
          // which is not what it does - it decides whether clearing lines
          // SENDS garbage to opponents. Reported as a bug on that reading
          // (2026-08-25); the behaviour is right, the name was not.
          label: 'Garbage Attacks',
          type: 'checkbox',
          default: true,
          hostOnly: true,
        },
      ],
      defaultBotDifficulty: 5,
      modes: {
        versus_1v1: { name: '1v1 Versus', maxPlayers: 2, minPlayers: 2 },
        team_2v2: { name: '2v2 Team Battle', maxPlayers: 4, minPlayers: 4 },
        battle_royale: { name: 'Battle Royale (99)', maxPlayers: 99, minPlayers: 2 },
      },
      onSound: (sound) => {
        // Map SDK sound names to GRANDMASTER sound effects
        const soundMap: Record<string, SoundEffect> = {
          select: 'menu_select',
          error: 'error',
          countdown: 'countdown',
          join: 'menu_select',
          leave: 'menu_select',
          chat: 'menu_select',
        };
        const sfx = soundMap[sound];
        if (sfx) {
          this.sounds.playSfx(sfx);
        }
      },
      formatPlayer: (player, isLocal, isHost) => {
        const hostBadge = isHost ? '{yellow-fg}[HOST]{/yellow-fg} ' : '';
        const youBadge = isLocal ? '{cyan-fg}(You){/cyan-fg} ' : '';
        const botBadge = player.isBot
          ? `{magenta-fg}[CPU-${player.botDifficulty}]{/magenta-fg} `
          : '';

        return `${hostBadge}${youBadge}${botBadge}{white-fg}${player.name}{/white-fg}`;
      },
    });

    // Convert lobby mode to entry mode
    const entryMode: LobbyEntryMode = mode === 'matchmaking' ? 'matchmaking' : 'custom';

    // Show and return result. Always detach the adapter afterwards: app.ts
    // loops back into the lobby after every match, building a new adapter
    // each time, so leaving the old one attached to the shared network
    // manager leaks a full set of handlers per visit.
    try {
      return await this.lobby.show(entryMode, selectedMode || 'versus_1v1');
    } finally {
      adapter.dispose();
    }
  }
}
