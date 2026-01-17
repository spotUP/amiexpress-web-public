/**
 * TetriNET Network Protocol
 *
 * Defines message types and encoding for TetriNET multiplayer games.
 * Supports both BBS-local play (WebSocket) and external TetriNET 1.x servers (TCP).
 */
import type { SpecialType } from '../core/tetrinet/specials';
import type { TetriNetGameOptions } from '../core/tetrinet/game-rules';
/**
 * Player slot (1-6 in TetriNET)
 */
export type PlayerSlot = 1 | 2 | 3 | 4 | 5 | 6;
/**
 * Player info in a TetriNET game
 */
export interface TetriNetPlayer {
    slot: PlayerSlot;
    name: string;
    team?: string;
    alive: boolean;
    level: number;
    hasImmunity: boolean;
}
/**
 * TetriNET game room
 */
export interface TetriNetRoom {
    id: string;
    name: string;
    hostId: string;
    players: TetriNetPlayer[];
    maxPlayers: number;
    options: TetriNetGameOptions;
    status: 'waiting' | 'countdown' | 'playing' | 'finished';
}
/**
 * All TetriNET message types
 */
export type TetriNetMessageType = 'tetrinet:join' | 'tetrinet:leave' | 'tetrinet:connect' | 'tetrinet:disconnect' | 'tetrinet:connect_error' | 'tetrinet:kick' | 'tetrinet:player_list' | 'tetrinet:player_joined' | 'tetrinet:player_left' | 'tetrinet:chat' | 'tetrinet:winlist' | 'tetrinet:spectator_list' | 'tetrinet:spectator_joined' | 'tetrinet:spectator_left' | 'tetrinet:spectator_chat' | 'tetrinet:game_start' | 'tetrinet:countdown' | 'tetrinet:field_update' | 'tetrinet:special_used' | 'tetrinet:lines_sent' | 'tetrinet:player_lost' | 'tetrinet:game_over' | 'tetrinet:sudden_death' | 'tetrinet:options_update' | 'tetrinet:start_game';
/**
 * Base message interface
 */
export interface TetriNetMessage {
    type: TetriNetMessageType;
    timestamp: number;
}
/**
 * Join room request
 */
export interface JoinMessage extends TetriNetMessage {
    type: 'tetrinet:join';
    roomId: string;
    playerName: string;
    team?: string;
}
/**
 * Server acknowledged connection
 */
export interface ConnectMessage extends TetriNetMessage {
    type: 'tetrinet:connect';
}
/**
 * Server disconnected
 */
export interface DisconnectMessage extends TetriNetMessage {
    type: 'tetrinet:disconnect';
    reason?: string;
}
/**
 * Connection rejected
 */
export interface ConnectErrorMessage extends TetriNetMessage {
    type: 'tetrinet:connect_error';
    reason: string;
}
/**
 * Kicked from server
 */
export interface KickMessage extends TetriNetMessage {
    type: 'tetrinet:kick';
    reason?: string;
}
/**
 * Leave room notification
 */
export interface LeaveMessage extends TetriNetMessage {
    type: 'tetrinet:leave';
    playerId: string;
}
/**
 * Player list update
 */
export interface PlayerListMessage extends TetriNetMessage {
    type: 'tetrinet:player_list';
    players: TetriNetPlayer[];
}
/**
 * Player joined notification
 */
export interface PlayerJoinedMessage extends TetriNetMessage {
    type: 'tetrinet:player_joined';
    player: TetriNetPlayer;
}
/**
 * Player left notification
 */
export interface PlayerLeftMessage extends TetriNetMessage {
    type: 'tetrinet:player_left';
    playerId: string;
    slot: PlayerSlot;
}
/**
 * Chat message
 */
export interface ChatMessage extends TetriNetMessage {
    type: 'tetrinet:chat';
    senderId: string;
    senderName: string;
    text: string;
}
/**
 * Winlist entry
 */
export interface WinlistEntry {
    type: 't' | 'p';
    name: string;
    points: number;
    games?: number;
}
/**
 * Winlist update
 */
export interface WinlistMessage extends TetriNetMessage {
    type: 'tetrinet:winlist';
    entries: WinlistEntry[];
    raw: string;
}
/**
 * Spectator list update
 */
export interface SpectatorListMessage extends TetriNetMessage {
    type: 'tetrinet:spectator_list';
    channel?: string;
    names: string[];
}
/**
 * Spectator joined
 */
export interface SpectatorJoinedMessage extends TetriNetMessage {
    type: 'tetrinet:spectator_joined';
    name: string;
    info?: string;
}
/**
 * Spectator left
 */
export interface SpectatorLeftMessage extends TetriNetMessage {
    type: 'tetrinet:spectator_left';
    name: string;
    info?: string;
}
/**
 * Spectator chat
 */
export interface SpectatorChatMessage extends TetriNetMessage {
    type: 'tetrinet:spectator_chat';
    name: string;
    text: string;
    isAction?: boolean;
}
/**
 * Game start notification
 */
export interface GameStartMessage extends TetriNetMessage {
    type: 'tetrinet:game_start';
    options: TetriNetGameOptions;
    seed: number;
}
/**
 * Countdown update
 */
export interface CountdownMessage extends TetriNetMessage {
    type: 'tetrinet:countdown';
    count: number;
}
/**
 * Field update (board state sync)
 */
export interface FieldUpdateMessage extends TetriNetMessage {
    type: 'tetrinet:field_update';
    playerId: string;
    slot: PlayerSlot;
    field: string;
    level: number;
}
/**
 * Special used notification
 */
export interface SpecialUsedMessage extends TetriNetMessage {
    type: 'tetrinet:special_used';
    senderId: string;
    senderSlot: PlayerSlot;
    targetId: string | null;
    targetSlot: PlayerSlot | null;
    special: SpecialType;
}
/**
 * Lines sent to target
 */
export interface LinesSentMessage extends TetriNetMessage {
    type: 'tetrinet:lines_sent';
    senderId: string;
    senderSlot: PlayerSlot;
    targetId: string;
    targetSlot: PlayerSlot;
    lineCount: number;
}
/**
 * Player lost (topped out)
 */
export interface PlayerLostMessage extends TetriNetMessage {
    type: 'tetrinet:player_lost';
    playerId: string;
    slot: PlayerSlot;
    place: number;
}
/**
 * Game over
 */
export interface GameOverMessage extends TetriNetMessage {
    type: 'tetrinet:game_over';
    winnerId: string | null;
    winnerSlot: PlayerSlot | null;
    finalPlacements: Array<{
        playerId: string;
        place: number;
    }>;
}
/**
 * Sudden death event
 */
export interface SuddenDeathMessage extends TetriNetMessage {
    type: 'tetrinet:sudden_death';
    event: 'activated' | 'line_added';
    totalLines?: number;
}
/**
 * Options update
 */
export interface OptionsUpdateMessage extends TetriNetMessage {
    type: 'tetrinet:options_update';
    options: Partial<TetriNetGameOptions>;
}
/**
 * Start game request (host only)
 */
export interface StartGameMessage extends TetriNetMessage {
    type: 'tetrinet:start_game';
}
/**
 * Encode a field to a TetriNET-compatible string.
 *
 * @param grid - The game board grid
 * @param width - Board width (default 12)
 * @param height - Board height (default 22)
 * @returns Encoded field string (width * height characters)
 */
export declare function encodeField(grid: any[][], width?: number, height?: number): string;
/**
 * Decode a TetriNET field string to a grid.
 *
 * @param encoded - Encoded field string
 * @param width - Board width (default 12)
 * @param height - Board height (default 22)
 * @returns Decoded grid
 */
export declare function decodeField(encoded: string, width?: number, height?: number): any[][];
/**
 * Encode field update for TetriNET 1.x differential mode.
 * Only sends changes since the last update (more efficient).
 *
 * Format: Uses characters < '0' with coordinate offsets from ASCII '3'.
 * This is the format used by the official TetriNET client for field updates.
 *
 * @param oldGrid - Previous field state
 * @param newGrid - Current field state
 * @returns Differential encoded string, or full encoding if too many changes
 */
export declare function encodeFieldDifferential(oldGrid: any[][], newGrid: any[][], width?: number, height?: number): string;
/**
 * Apply a TetriNET field update (full or differential) to a grid.
 */
export declare function applyFieldUpdate(encoded: string, grid?: any[][], width?: number, height?: number): any[][];
/**
 * Original TetriNET 1.x text protocol commands.
 * For connecting to external TetriNET servers on port 31457.
 *
 * IMPORTANT: TetriNET 1.x uses XOR encryption for the initial login message.
 * The login message is encrypted using an IP-based hash.
 */
/**
 * Protocol mode (standard or TetriFast)
 */
export type TetriFastMode = 'standard' | 'tetrifast' | 'tspec';
/**
 * TetriNET 1.x newgame options parsed from server
 */
export interface TetriNet1xGameOptions {
    startingHeight: number;
    startingLevel: number;
    linesPerLevel: number;
    levelIncrement: number;
    linesForSpecials: number;
    specialsAdded: number;
    specialCapacity: number;
    pieceFrequency: number[];
    specialFrequency: number[];
    averageHeight: boolean;
    classicMode: boolean;
    seedString?: string;
    seed?: number;
    fastMode?: boolean;
}
/**
 * Calculate IP-based hash for login encryption.
 * Hash = ip[0]*54 + ip[1]*41 + ip[2]*29 + ip[3]*17
 */
export declare function calculateIpHash(ipAddress: string): number;
/**
 * Encode login message using Jetrix (server) TetriNET 1.x encoding.
 * Uses initial byte 0x80, then prev+plain mod 255 XOR hash digit.
 */
export declare function encodeLoginMessage(message: string, ipAddress: string): string;
/**
 * Decode login message (for debugging/testing)
 */
export declare function decodeLoginMessage(encoded: string, ipAddress: string): string;
/**
 * Format TetriNET 1.x login message (encrypted).
 * Format: "tetrisstart <nickname> 1.13" (or "tetrifaster" for TetriFast mode)
 * The entire message is encrypted using the IP-based rolling hash.
 *
 * @param nickname - Player nickname
 * @param ipAddress - Client IP address (for encryption)
 * @param mode - 'standard', 'tetrifast', or 'tspec'
 * @param token - Version string for standard/tetrifast, password for TSpec
 */
export declare function formatTetrenetLogin(nickname: string, ipAddress: string, mode?: TetriFastMode, token?: string): string;
/**
 * Legacy function name for compatibility (but this is WRONG for actual servers!)
 * Use formatTetrenetLogin for real server connections.
 * @deprecated Use formatTetrenetLogin instead
 */
export declare function formatTetrenetJoin(nickname: string): string;
/**
 * Format: "f <slot> <field>"
 * Sends field update to server
 */
export declare function formatTetrenetField(slot: PlayerSlot, field: string): string;
/**
 * Format: "sb <target> <special> <sender>"
 * Sends special block usage to server
 */
export declare function formatTetrenetSpecial(targetSlot: PlayerSlot, special: SpecialType, senderSlot: PlayerSlot): string;
/**
 * Format: "lvl <slot> <level>"
 * Sends level update
 */
export declare function formatTetrenetLevel(slot: PlayerSlot, level: number): string;
/**
 * Format: "pline <slot> <message>"
 * Sends partyline (chat) message
 */
export declare function formatTetrenetChat(slot: PlayerSlot, message: string): string;
/**
 * Format TSpec spectator chat message.
 * Private: "pline 0 <message>"
 * Public:  "pline 0 //<message>"
 */
export declare function formatTspecChat(message: string, isPublic?: boolean): string;
/**
 * Format: "plineact <slot> <action>"
 * Sends partyline /me action message
 */
export declare function formatTetrenetAction(slot: PlayerSlot, action: string): string;
/**
 * Format: "gmsg <message>"
 * Sends in-game chat message
 */
export declare function formatTetrenetGameMessage(message: string): string;
/**
 * Format: "team <slot> <teamname>"
 * Sets player's team name
 */
export declare function formatTetrenetTeam(slot: PlayerSlot, teamName: string): string;
/**
 * Format: "connected"
 * Acknowledges slot assignment
 */
export declare function formatTetrenetConnected(): string;
/**
 * Format: "version <client>"
 * Sends client version (used by some servers/spectators)
 */
export declare function formatTetrenetVersion(version: string): string;
/**
 * Format: "clientinfo <client> <version>"
 * Sends client identification (optional)
 */
export declare function formatTetrenetClientInfo(clientName: string, version: string): string;
/**
 * Format: "startgame <state> <slot>"
 * Starts or stops the game (operator only)
 */
export declare function formatTetrenetStartGame(start: boolean, slot: PlayerSlot): string;
/**
 * Format: "playerlost <slot>"
 * Reports that this player has topped out
 */
export declare function formatTetrenetPlayerLost(slot: PlayerSlot): string;
/**
 * Format: "pause <state> <slot>"
 * Pauses or resumes the game (operator only)
 */
export declare function formatTetrenetPause(pause: boolean, slot: PlayerSlot): string;
/**
 * Format: "sb 0 cs<N> <slot>"
 * Sends classic-style garbage lines (for non-special modes)
 */
export declare function formatTetrenetClassicLines(lineCount: 1 | 2 | 4, slot: PlayerSlot): string;
/**
 * Parse TetriNET 1.x newgame rules string.
 * Format: "newgame [stack] [level] [lines_per_level] [level_inc] [special_lines] [special_count] [capacity] [piece_freq(7)] [special_freq(9)] [avg] [mode]"
 */
export declare function parseNewgameOptions(parts: string[], fastMode?: boolean): TetriNet1xGameOptions;
/**
 * Convert TetriNET 1.x options to our TetriNetGameOptions format
 */
export declare function convertToGameOptions(options: TetriNet1xGameOptions): TetriNetGameOptions;
/**
 * Parse TetriNET 1.x server response.
 * Returns parsed message or null if unrecognized.
 *
 * Handles both standard TetriNET and TetriFast protocol variations.
 */
export declare function parseTetrenetMessage(line: string): TetriNetMessage | null;
/**
 * Create a WebSocket message for BBS-local games
 */
export declare function createMessage<T extends TetriNetMessage>(type: TetriNetMessageType, data: Omit<T, 'type' | 'timestamp'>): T;
/**
 * Create a field update message
 */
export declare function createFieldUpdate(playerId: string, slot: PlayerSlot, grid: any[][], level: number): FieldUpdateMessage;
/**
 * Create a special used message
 */
export declare function createSpecialUsed(senderId: string, senderSlot: PlayerSlot, targetId: string | null, targetSlot: PlayerSlot | null, special: SpecialType): SpecialUsedMessage;
/**
 * Create a lines sent message
 */
export declare function createLinesSent(senderId: string, senderSlot: PlayerSlot, targetId: string, targetSlot: PlayerSlot, lineCount: number): LinesSentMessage;
//# sourceMappingURL=tetrinet-protocol.d.ts.map