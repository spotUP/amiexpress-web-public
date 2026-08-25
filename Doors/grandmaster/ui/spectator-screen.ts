/**
 * Spectator screen
 *
 * Watch a match you are not playing in. Deliberately mode-agnostic: it
 * subscribes to BOTH game channels and renders whatever arrives, so it
 * works for the TGM modes (versus, CPU battle - `game:update`) and for
 * TetriNET (`game:tnet_field`) without knowing which is running. The two
 * carry different board sizes (10x24 against 12x22); the mini-board
 * renderer scales by area, so neither is a special case.
 *
 * Spectators are ordinary lobby members that take no seat, so every game
 * event broadcast to the lobby already reaches them - see the broker's
 * handleJoinLobby.
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { GrandmasterNetworkManager } from '../network/network-manager';
import type { SoundEngine } from '../audio/sounds';
import { OpponentBoards, type OpponentBoardData } from './tetrinet/opponent-boards';

const FIELD_EVENT = 'game:tnet_field';
const MAX_CHAT_LINES = 3;

export interface SpectatorScreenOptions {
  screen: Screen;
  network: GrandmasterNetworkManager;
  sounds: SoundEngine;
  /** Shown in the header - the lobby's name or mode. */
  title: string;
}

interface WatchedPlayer {
  id: string;
  name: string;
  board: any;
  level: number;
  alive: boolean;
}

export class SpectatorScreen {
  private screen: Screen;
  private network: GrandmasterNetworkManager;
  private sounds: SoundEngine;
  private title: string;

  private headerBox: any;
  private chatBox: any;
  private boards!: OpponentBoards;

  private players: Map<string, WatchedPlayer> = new Map();
  private chatLines: string[] = [];
  private unsubscribers: Array<() => void> = [];
  private running = false;

  constructor(options: SpectatorScreenOptions) {
    this.screen = options.screen;
    this.network = options.network;
    this.sounds = options.sounds;
    this.title = options.title;

    this.setupUI();
    this.setupListeners();
  }

  /**
   * 80x24: header, a grid of up to six fields, and the last few chat lines.
   */
  private setupUI(): void {
    this.screen.children.forEach(child => child.destroy());

    this.headerBox = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: 80,
      height: 1,
      border: { type: 'none' },
      content: '',
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Six fields side by side across the full width: 6 * 13 = 78 plus the
    // panel's own frame.
    this.boards = new OpponentBoards({
      parent: this.screen,
      top: 1,
      left: 0,
      width: 80,
      height: 19,
      maxOpponents: 6,
      label: ' Fields ',
      boardWidth: 13,
      boardHeight: 17,
      perRow: 6,
    });

    this.chatBox = createBox({
      parent: this.screen,
      top: 20,
      left: 0,
      width: 80,
      height: 4,
      border: { type: 'line' },
      style: { border: { fg: 'gray' } },
      label: ' Table talk ',
      content: '',
      focusable: false,
      mouse: false,
      clickable: false,
    });
  }

  private setupListeners(): void {
    // TGM modes (versus, CPU battle).
    this.unsubscribers.push(this.network.onUpdate((update: any) => {
      this.record({
        id: String(update.playerId),
        name: update.playerName || String(update.playerId),
        board: update.board,
        level: update.level ?? 0,
        alive: update.alive !== false,
      });
    }));

    // TetriNET.
    this.unsubscribers.push(this.network.onGameEvent(FIELD_EVENT, (packet: any) => {
      this.record({
        id: String(packet.playerId),
        name: packet.name || String(packet.playerId),
        board: packet.board,
        level: packet.level ?? 0,
        alive: packet.alive !== false,
      });
    }));

    const onChat = (message: any) => {
      this.chatLines.push(`<${message.playerName}> ${message.text}`);
      if (this.chatLines.length > MAX_CHAT_LINES) this.chatLines.shift();
      this.render();
    };
    this.network.on('chat:message', onChat);
    this.unsubscribers.push(() => this.network.off('chat:message', onChat));
  }

  private record(player: WatchedPlayer): void {
    if (!player.board) return;
    this.players.set(player.id, player);
  }

  /** Watch until the viewer presses escape or Q. */
  async run(): Promise<void> {
    this.running = true;
    this.render();

    return new Promise<void>((resolve) => {
      const finish = () => {
        if (!this.running) return;
        this.running = false;
        clearInterval(timer);
        this.screen.unkey(['escape', 'q', 'Q'], finish);
        this.sounds.playSfx('menu_select');
        resolve();
      };

      const timer = setInterval(() => {
        if (!this.running) return;
        this.render();
      }, 200);

      this.screen.key(['escape', 'q', 'Q'], finish);
    });
  }

  private render(): void {
    const watched: OpponentBoardData[] = Array.from(this.players.values()).map(player => ({
      id: player.id,
      name: player.name,
      board: player.board,
      level: player.level,
      alive: player.alive,
      hasImmunity: false,
    }));

    this.boards.updateBoards(watched);

    const living = watched.filter(p => p.alive).length;
    this.headerBox.setContent(
      `{cyan-fg}Watching:{/cyan-fg} ${this.title}  ` +
      `{gray-fg}${watched.length} players, ${living} alive - ESC to stop watching{/gray-fg}`
    );

    this.chatBox.setContent(
      this.chatLines.length > 0
        ? this.chatLines.join('\n')
        : '{gray-fg}(quiet){/gray-fg}'
    );

    this.screen.render();
  }

  /** How many players this spectator has seen so far. */
  getWatchedCount(): number {
    return this.players.size;
  }

  cleanup(): void {
    this.running = false;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.boards.destroy();
  }
}
