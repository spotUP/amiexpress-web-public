"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatManager = void 0;
const chat_1 = require("../lib/chat");
const constants_1 = require("../lib/constants");
class ChatManager {
    constructor(host) {
        this.host = host;
        /** The last message this node has painted; ids, not clocks. */
        this.lastSeenId = null;
    }
    /**
     * Ask the player for a line and say it.
     *
     * Returns the message, or null when they cancelled or typed nothing -
     * which is not an error and is not announced.
     */
    async saySomething() {
        const lobby = this.host.lobby;
        const profile = this.host.currentProfile;
        if (!lobby || !profile)
            return null;
        const typed = await this.host.promptForLine('Say something', `Up to ${chat_1.MAX_CHAT_LENGTH} characters. Everyone in the lobby sees it.`);
        if (typed === null)
            return null;
        const message = (0, chat_1.say)(lobby, { userId: profile.userId, username: profile.username }, typed, this.host.currentTableId ?? undefined);
        if (!message)
            return null;
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
    paint() {
        const lobby = this.host.lobby;
        if (!lobby)
            return;
        const fresh = (0, chat_1.messagesSince)(lobby, this.lastSeenId);
        if (fresh.length === 0) {
            // The panel can appear on a resize with the backlog already seen.
            if (this.host.chatHasItsOwnPanel())
                this.repaintPanel();
            return;
        }
        this.lastSeenId = fresh[fresh.length - 1].id;
        if (this.host.chatHasItsOwnPanel()) {
            this.repaintPanel();
        }
        else {
            const me = this.host.currentProfile?.userId ?? '';
            for (const message of fresh) {
                this.host.pushEvent((0, chat_1.formatChatLine)(message, constants_1.UI_THEME, me));
            }
        }
        this.host.render();
    }
    /** The whole panel, redrawn from the state - cheap at 60 messages. */
    repaintPanel() {
        const lobby = this.host.lobby;
        if (!lobby)
            return;
        const me = this.host.currentProfile?.userId ?? '';
        const lines = (lobby.chat ?? []).map((message) => (0, chat_1.formatChatLine)(message, constants_1.UI_THEME, me));
        this.host.setChatLines(lines.length > 0
            ? lines
            : [`{${constants_1.UI_THEME.dim}-fg}Nobody has said anything yet. Press T to talk.{/}`]);
    }
    /**
     * Forget what has been painted.
     *
     * Used when the door reloads the whole state from disk: the ids it was
     * tracking may not be in the new list at all.
     */
    reset() {
        this.lastSeenId = null;
    }
}
exports.ChatManager = ChatManager;
