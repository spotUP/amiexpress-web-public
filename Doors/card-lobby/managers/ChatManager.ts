/**
 * Card Lobby - saying something, and showing what was said.
 *
 * The door had an ACTIVITY feed it wrote to itself and no way for a player
 * to say a word ("i see no chat while playing in fullscreen responsive?
 * maybe cardlobby never had a chat in the lobby?", sysop 2026-09-02).
 *
 * Nothing new carries the messages: they go into the shared LobbyState that
 * the refresh timer already re-reads, so a line typed on node 3 appears on
 * node 7 with the next poll, the same way a new table does. This class is
 * the flow around that - ask for a line, append it, and paint whatever has
 * arrived since the last look.
 */

import {
  say,
  messagesSince,
  formatChatLine,
  MAX_CHAT_LENGTH,
  type ChatMessage,
} from '../lib/chat';
import { UI_THEME } from '../lib/constants';
import type { LobbyState, PlayerProfile } from '../lib/types';

export interface ChatHost {
  readonly lobby: LobbyState | null;
  readonly currentProfile: PlayerProfile | null;
  /** The table the player is sitting at, if any. */
  readonly currentTableId: number | null;
  persistState(): Promise<void>;
  /** The door's own feed, for boards too narrow to hold a chat panel. */
  pushEvent(message: string): void;
  /** Does the chat have a panel of its own right now? */
  chatHasItsOwnPanel(): boolean;
  setChatLines(lines: string[]): void;
  promptForLine(title: string, text: string): Promise<string | null>;
  render(): void;
}

export class ChatManager {
  /** The last message this node has painted; ids, not clocks. */
  private lastSeenId: string | null = null;

  constructor(private host: ChatHost) {}

  /**
   * Ask the player for a line and say it.
   *
   * Returns the message, or null when they cancelled or typed nothing -
   * which is not an error and is not announced.
   */
  async saySomething(): Promise<ChatMessage | null> {
    const lobby = this.host.lobby;
    const profile = this.host.currentProfile;
    if (!lobby || !profile) return null;

    const typed = await this.host.promptForLine(
      'Say something',
      `Up to ${MAX_CHAT_LENGTH} characters. Everyone in the lobby sees it.`,
    );
    if (typed === null) return null;

    const message = say(
      lobby,
      { userId: profile.userId, username: profile.username },
      typed,
      this.host.currentTableId ?? undefined,
    );
    if (!message) return null;

    // Painted before the write: a player should see their own line land
    // immediately, not after a round trip to the shared state.
    this.paint();
    await this.host.persistState();
    return message;
  }

  /**
   * Paint everything said since the last look.
   *
   * Called after a refresh, so it is the path by which other players' lines
   * arrive. With no panel of its own, chat goes to the activity feed rather
   * than nowhere - a board at 80 columns still hears the table talk.
   */
  paint(): void {
    const lobby = this.host.lobby;
    if (!lobby) return;

    const fresh = messagesSince(lobby, this.lastSeenId);
    if (fresh.length === 0) {
      // The panel can appear on a resize with the backlog already seen.
      if (this.host.chatHasItsOwnPanel()) this.repaintPanel();
      return;
    }

    this.lastSeenId = fresh[fresh.length - 1].id;

    if (this.host.chatHasItsOwnPanel()) {
      this.repaintPanel();
    } else {
      const me = this.host.currentProfile?.userId ?? '';
      for (const message of fresh) {
        this.host.pushEvent(formatChatLine(message, UI_THEME, me));
      }
    }
    this.host.render();
  }

  /** The whole panel, redrawn from the state - cheap at 60 messages. */
  private repaintPanel(): void {
    const lobby = this.host.lobby;
    if (!lobby) return;
    const me = this.host.currentProfile?.userId ?? '';
    const lines = (lobby.chat ?? []).map((message) => formatChatLine(message, UI_THEME, me));
    this.host.setChatLines(lines.length > 0
      ? lines
      : [`{${UI_THEME.dim}-fg}Nobody has said anything yet. Press T to talk.{/}`]);
  }

  /**
   * Forget what has been painted.
   *
   * Used when the door reloads the whole state from disk: the ids it was
   * tracking may not be in the new list at all.
   */
  reset(): void {
    this.lastSeenId = null;
  }
}
