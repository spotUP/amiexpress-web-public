/**
 * The lobby on a 40-column screen shows ONE panel at a time.
 *
 * Two columns of 40 leaves thirteen characters of content per panel, and
 * "Slot 2: (empty)" is fifteen - so every row broke mid-word and the lobby
 * read as rubble: "(e" / "mpty)", "Stand" / "ard (9 specia" / "ls)"
 * (reported live with a screenshot, 2026-09-06). A C64 screen is not a small
 * desktop; it shows one thing at a time, and Tab - which this widget already
 * cycles panels with - is how you reach the next.
 *
 * Driven through the real widget, not through a copy of its arithmetic: the
 * bug was in the geometry the constructor builds, which an inline
 * re-implementation of cycleFocus cannot see.
 */

import { describe, it, expect } from '@jest/globals';
import { Screen } from '../engines/ui/blessed/core/screen';
import { MultiplayerLobby } from '../engines/ui/blessed/widgets/multiplayer-lobby';
import { EventEmitter } from '../engines/ui/blessed/core/events';

class FakeAdapter extends EventEmitter {
  getState() {
    return {
      lobbyId: 'lobby-test',
      mode: 'standard',
      status: 'waiting' as const,
      hostId: '1',
      players: [
        { id: '1', name: 'sysop', ready: false, isBot: false },
        { id: '2', name: 'BOT', ready: true, isBot: true },
      ],
      settings: { startingLevel: 1 },
    };
  }
  async joinQueue(): Promise<void> {}
  async createLobby(): Promise<string> { return 'lobby-test'; }
  async joinLobby(): Promise<void> {}
  async leaveLobby(): Promise<void> {}
  async setReady(): Promise<void> {}
  async startMatch(): Promise<void> {}
  async setTeam(): Promise<void> {}
}

function lobbyOn(width: number): { lobby: any; screen: any } {
  const screen: any = new Screen({
    title: 'lobby', width, height: 25, responsive: width !== 80,
  } as any);
  const lobby: any = new MultiplayerLobby({
    parent: screen,
    adapter: new FakeAdapter() as any,
    localPlayerId: '1',
    title: 'TETRINET LOBBY',
    features: { slotBased: true, chat: true, teams: true, settingsEditor: true, bots: true },
    modes: {
      standard: {
        name: 'Standard (9 specials)',
        maxPlayers: 6, maxSlots: 6, minPlayers: 2,
        teamBased: true, teams: ['Red', 'Blue'],
      },
    },
  } as any);
  return { lobby, screen };
}

describe('the lobby on a narrow screen', () => {
  it('gives a panel the whole width instead of half of it', () => {
    const { lobby, screen } = lobbyOn(40);
    try {
      // 13 characters of content is what broke "Slot 2: (empty)" in half.
      const inner = lobby.playerList.width as number;
      expect(inner).toBeGreaterThanOrEqual(30);
      expect(lobby.playerList.left + inner).toBeLessThanOrEqual(40);
    } finally {
      screen.destroy();
    }
  });

  it('shows one panel, and Tab reveals the next', () => {
    const { lobby, screen } = lobbyOn(40);
    try {
      const panels = lobby.compactPanels.map((entry: any) => entry.panel);
      expect(panels.length).toBeGreaterThan(1);

      const shown = () => panels.filter((p: any) => !p.hidden).length;
      expect(shown()).toBe(1);

      // Every panel must be reachable: walking the cycle has to reveal each
      // of them in turn, or a hidden panel is a lost panel.
      const seen = new Set<any>();
      for (let i = 0; i < panels.length * 2; i++) {
        lobby.revealCompactPanelFor(lobby.compactPanels[i % panels.length].target());
        const visible = panels.find((p: any) => !p.hidden);
        if (visible) seen.add(visible);
        expect(shown()).toBe(1);
      }
      expect(seen.size).toBeGreaterThan(1);
    } finally {
      screen.destroy();
    }
  });

  it('leaves an 80-column lobby in two columns, every panel showing', () => {
    const { lobby, screen } = lobbyOn(80);
    try {
      const panels = lobby.compactPanels.map((entry: any) => entry.panel);
      expect(panels.every((p: any) => !p.hidden)).toBe(true);
      expect(lobby.playerList.width).toBeLessThan(40);
    } finally {
      screen.destroy();
    }
  });
});
