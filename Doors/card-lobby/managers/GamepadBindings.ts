/**
 * Card Lobby - gamepad bindings
 *
 * The pad's buttons mean different things at a poker table and at an UNO
 * table, and nothing at all while a dialog is up. That decision table was
 * 110 lines in the middle of setupScreen(), where three of its calls -
 * drawUnoCard(), callUno(), refreshLobby() - named methods that do not
 * exist. The file carried `// @ts-nocheck`, so every one of them was a
 * TypeError waiting for somebody with a gamepad at an UNO table.
 *
 * Out here it is checked, and the host interface says exactly what the pad
 * is allowed to reach.
 */

import { isUnoTable } from '../lib/utils';
import { GamepadInputManager } from '@amiexpress/bbs-door-sdk/utils/gamepad-input-manager';
import type { DoorSession, LobbyTable, PlayerProfile } from '../lib';

/** What the pad needs from the door. */
export interface GamepadHost {
  readonly modalActive: boolean;
  readonly viewMode: 'lobby' | 'table';
  readonly currentProfile: PlayerProfile | null;
  readonly screen: { program: { emit(event: string, ...args: unknown[]): void } };
  findTableById(tableId: number): LobbyTable | undefined;
  runAction(action: () => void | Promise<void>): void;
  focusLobby(): void;
  focusTable(): void;
  joinSelectedTable(): Promise<void>;
  leaveCurrentTable(): Promise<void>;
  manualRefresh(): Promise<void>;
  selectUnoCard(index: number): void;
  triggerCall(): void;
  triggerFold(): void;
  triggerRaise(): void;
  triggerUnoDrawCard(): void;
  triggerUnoCallUno(): void;
}

/** Wire the pad to the door and hand back the manager to clean up later. */
export function attachGamepadBindings(session: DoorSession, host: GamepadHost): GamepadInputManager {
  // Set up gamepad support
  const gamepadManager = new GamepadInputManager(session.socket, {
    deadzone: 0.15,
    pollRate: 16,
  });

  // D-pad navigation
  gamepadManager.on('dpad:up', () => {
    if (host.modalActive) return;
    // Simulate up arrow key press
    host.screen.program.emit('keypress', null, { name: 'up' });
  });

  gamepadManager.on('dpad:down', () => {
    if (host.modalActive) return;
    // Simulate down arrow key press
    host.screen.program.emit('keypress', null, { name: 'down' });
  });

  gamepadManager.on('dpad:left', () => {
    if (host.modalActive) return;
    if (host.viewMode === 'table') {
      host.focusLobby();
    }
  });

  gamepadManager.on('dpad:right', () => {
    if (host.modalActive) return;
    if (host.viewMode === 'lobby' && host.currentProfile?.currentTableId) {
      host.focusTable();
    }
  });

  // Button A: Join/Select/Confirm
  gamepadManager.on('button:a', (pressed: boolean) => {
    if (!pressed || host.modalActive) return;

    if (host.viewMode === 'lobby') {
      // Join selected table
      host.runAction(() => host.joinSelectedTable());
    } else if (host.viewMode === 'table') {
      // Trigger action (call/check/fold based on game state)
      const table = host.currentProfile?.currentTableId
        ? host.findTableById(host.currentProfile.currentTableId)
        : null;

      if (table) {
        if (table.gameId === 'poker' || table.gameId === 'poker-house') {
          host.triggerCall();
        } else if (isUnoTable(table)) {
          // Select the first card in hand; selectUnoCard loads the
          // game itself and does nothing when there is no game.
          host.selectUnoCard(0);
        }
      }
    }
  });

  // Button B: Back/Cancel
  gamepadManager.on('button:b', (pressed: boolean) => {
    if (!pressed || host.modalActive) return;

    if (host.viewMode === 'table') {
      host.runAction(() => host.leaveCurrentTable());
    }
  });

  // Button X: Fold (poker) or Draw card (UNO)
  gamepadManager.on('button:x', (pressed: boolean) => {
    if (!pressed || host.modalActive || host.viewMode !== 'table') return;

    const table = host.currentProfile?.currentTableId
      ? host.findTableById(host.currentProfile.currentTableId)
      : null;

    if (table) {
      if (table.gameId === 'poker' || table.gameId === 'poker-house') {
        host.triggerFold();
      } else if (isUnoTable(table)) {
        host.triggerUnoDrawCard();
      }
    }
  });

  // Button Y: Raise (poker) or Call UNO
  gamepadManager.on('button:y', (pressed: boolean) => {
    if (!pressed || host.modalActive || host.viewMode !== 'table') return;

    const table = host.currentProfile?.currentTableId
      ? host.findTableById(host.currentProfile.currentTableId)
      : null;

    if (table) {
      if (table.gameId === 'poker' || table.gameId === 'poker-house') {
        host.triggerRaise();
      } else if (isUnoTable(table)) {
        host.triggerUnoCallUno();
      }
    }
  });

  // Start button: Refresh lobby
  gamepadManager.on('button:start', (pressed: boolean) => {
    if (!pressed || host.modalActive) return;

    if (host.viewMode === 'lobby') {
      host.runAction(() => host.manualRefresh());
    }
  });

  return gamepadManager;
}
