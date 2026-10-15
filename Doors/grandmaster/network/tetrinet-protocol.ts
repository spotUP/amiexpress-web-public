/**
 * TetriNET Network Protocol
 *
 * Defines message types and encoding for TetriNET multiplayer games.
 * Supports both BBS-local play (WebSocket) and external TetriNET 1.x servers (TCP).
 */

import type { SpecialType } from '../core/tetrinet/specials';
import type { TetriNetGameOptions, TetriNetRule } from '../core/tetrinet/game-rules';

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

// ============================================================================
// Message Types
// ============================================================================

/**
 * All TetriNET message types
 */
export type TetriNetMessageType =
  // Lobby messages
  | 'tetrinet:join'           // Player joins room
  | 'tetrinet:leave'          // Player leaves room
  | 'tetrinet:connect'        // Server acknowledged connection
  | 'tetrinet:disconnect'     // Server disconnected
  | 'tetrinet:connect_error'  // Connection rejected
  | 'tetrinet:kick'           // Server kicked client
  | 'tetrinet:player_list'    // Current player list
  | 'tetrinet:player_joined'  // Player joined notification
  | 'tetrinet:player_left'    // Player left notification
  | 'tetrinet:chat'           // Chat message
  | 'tetrinet:winlist'        // Winlist update
  | 'tetrinet:spectator_list' // Spectator list update
  | 'tetrinet:spectator_joined' // Spectator joined
  | 'tetrinet:spectator_left' // Spectator left
  | 'tetrinet:spectator_chat' // Spectator chat
  // Game state messages
  | 'tetrinet:game_start'     // Game starting
  | 'tetrinet:countdown'      // Countdown update
  | 'tetrinet:field_update'   // Player's field state
  | 'tetrinet:special_used'   // Special was used
  | 'tetrinet:lines_sent'     // Lines sent to target
  | 'tetrinet:player_lost'    // Player topped out
  | 'tetrinet:game_over'      // Game ended
  | 'tetrinet:sudden_death'   // Sudden death event
  // Options
  | 'tetrinet:options_update' // Game options changed
  | 'tetrinet:start_game';    // Host starts game

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
  seed: number;  // Random seed for reproducible piece sequences
}

/**
 * Countdown update
 */
export interface CountdownMessage extends TetriNetMessage {
  type: 'tetrinet:countdown';
  count: number;  // 3, 2, 1, 0 (go)
}

/**
 * Field update (board state sync)
 */
export interface FieldUpdateMessage extends TetriNetMessage {
  type: 'tetrinet:field_update';
  playerId: string;
  slot: PlayerSlot;
  field: string;  // Encoded field string (see encodeField)
  level: number;
}

/**
 * Special used notification
 */
export interface SpecialUsedMessage extends TetriNetMessage {
  type: 'tetrinet:special_used';
  senderId: string;
  senderSlot: PlayerSlot;
  targetId: string | null;  // null for self-targeting specials
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
  place: number;  // 6th, 5th, etc.
}

/**
 * Game over
 */
export interface GameOverMessage extends TetriNetMessage {
  type: 'tetrinet:game_over';
  winnerId: string | null;  // null if draw
  winnerSlot: PlayerSlot | null;
  finalPlacements: Array<{ playerId: string; place: number }>;
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

// ============================================================================
// Field Encoding
// ============================================================================

/**
 * TetriNET 1.x Field Encoding
 *
 * Field dimensions: 12 columns x 22 rows = 264 characters
 *
 * Cell encoding:
 * - '0' = empty cell
 * - '1'-'5' = colored blocks (blue, yellow, green, purple, red)
 * - 'a'-'s' = special blocks (9 standard specials)
 *
 * The field is transmitted row by row from top to bottom, left to right.
 *
 * Standard TetriNET specials (9):
 * - 'a' = Add Line
 * - 'c' = Clear Line
 * - 'n' = Nuke Field
 * - 'r' = Random Clear
 * - 's' = Switch Fields
 * - 'b' = Clear Specials (Block Bomb in some versions)
 * - 'g' = Gravity
 * - 'q' = Quake
 * - 'o' = Block Bomb (original special)
 *
 * Extended specials (for BBS-local games, not compatible with standard servers):
 * - 'v' = Clear Column
 * - 'i' = Immunity
 * - 'd' = Darkness
 * - 'f' = Confusion
 * - 'm' = Mutation
 * - 'z' = Zebra
 * - 'l' = Left Gravity
 */

/**
 * Map piece types to TetriNET color numbers (1-5).
 * TetriNET only has 5 colors, so we map our 7 piece types to them.
 */
const PIECE_TO_COLOR: Record<string, string> = {
  I: '1',
  O: '2',
  J: '3',
  L: '4',
  S: '5',
  Z: '1',
  T: '2',
};

/**
 * Map TetriNET colors back to piece types (for display).
 */
const COLOR_TO_PIECE: Record<string, string> = {
  '1': 'I',
  '2': 'O',
  '3': 'J',
  '4': 'L',
  '5': 'S',
};

// TetriNET field encoding block order (official client)
const TETRINET_BLOCKS = '012345acnrsbgqo';

/**
 * Standard TetriNET special block characters (9 specials).
 * These are compatible with official TetriNET servers.
 */
const STANDARD_SPECIAL_CHARS: Record<SpecialType, string> = {
  add_line: 'a',
  clear_line: 'c',
  nuke: 'n',
  random_clear: 'r',
  switch: 's',
  clear_specials: 'b',
  gravity: 'g',
  quake: 'q',
  block_bomb: 'o',
  // Extended specials (BBS-local only)
  clear_column: 'v',
  immunity: 'i',
  darkness: 'd',
  confusion: 'f',
  mutation: 'm',
  zebra: 'z',
  left_gravity: 'l',
};

/**
 * Map of characters to special types.
 * Used for decoding incoming field updates.
 */
const CHAR_TO_SPECIAL: Record<string, SpecialType> = {
  a: 'add_line',
  c: 'clear_line',
  n: 'nuke',
  r: 'random_clear',
  s: 'switch',
  b: 'clear_specials',
  g: 'gravity',
  q: 'quake',
  o: 'block_bomb',
  // Extended
  v: 'clear_column',
  i: 'immunity',
  d: 'darkness',
  f: 'confusion',
  m: 'mutation',
  z: 'zebra',
  l: 'left_gravity',
};

// Alias for backward compatibility
const SPECIAL_CHARS = STANDARD_SPECIAL_CHARS;

/**
 * Encode a field to a TetriNET-compatible string.
 *
 * @param grid - The game board grid
 * @param width - Board width (default 12)
 * @param height - Board height (default 22)
 * @returns Encoded field string (width * height characters)
 */
export function encodeField(
  grid: any[][],
  width: number = 12,
  height: number = 22
): string {
  let encoded = '';

  // TetriNET encodes top to bottom, left to right
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]?.[x];

      if (!cell || !cell.filled) {
        encoded += '0';
      } else if (cell.special) {
        // Special block
        const specialChar = STANDARD_SPECIAL_CHARS[cell.special as SpecialType];
        encoded += specialChar || 'a';  // Default to add_line if unknown
      } else {
        // Normal colored block
        const color = cell.color as string;
        encoded += PIECE_TO_COLOR[color] || '1';
      }
    }
  }

  return encoded;
}

/**
 * Decode a TetriNET field string to a grid.
 *
 * @param encoded - Encoded field string
 * @param width - Board width (default 12)
 * @param height - Board height (default 22)
 * @returns Decoded grid
 */
export function decodeField(
  encoded: string,
  width: number = 12,
  height: number = 22
): any[][] {
  const grid: any[][] = [];

  // Initialize empty grid
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = { filled: false, color: null, locked: false };
    }
  }

  // Decode string (top to bottom, left to right)
  for (let i = 0; i < encoded.length && i < width * height; i++) {
    const y = Math.floor(i / width);
    const x = i % width;
    const char = encoded[i];

    if (char === '0') {
      // Empty cell
      grid[y][x] = { filled: false, color: null, locked: false };
    } else if (char >= '1' && char <= '5') {
      // Colored block
      grid[y][x] = {
        filled: true,
        color: COLOR_TO_PIECE[char] || 'I',
        locked: true,
      };
    } else if (CHAR_TO_SPECIAL[char]) {
      // Special block
      grid[y][x] = {
        filled: true,
        color: 'I',  // Default color for special blocks
        locked: true,
        special: CHAR_TO_SPECIAL[char],
      };
    }
  }

  return grid;
}

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
export function encodeFieldDifferential(
  oldGrid: any[][],
  newGrid: any[][],
  width: number = 12,
  height: number = 22
): string {
  const changes: Array<{ x: number; y: number; char: string }> = [];

  // Find all changes
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const oldCell = oldGrid[y]?.[x];
      const newCell = newGrid[y]?.[x];

      const oldFilled = oldCell?.filled || false;
      const newFilled = newCell?.filled || false;
      const oldSpecial = oldCell?.special;
      const newSpecial = newCell?.special;
      const oldColor = oldCell?.color;
      const newColor = newCell?.color;

      if (oldFilled !== newFilled || oldSpecial !== newSpecial || oldColor !== newColor) {
        let char = '0';
        if (newFilled) {
          if (newSpecial) {
            char = STANDARD_SPECIAL_CHARS[newSpecial as SpecialType] || 'a';
          } else {
            char = PIECE_TO_COLOR[newColor as string] || '1';
          }
        }
        changes.push({ x, y, char });
      }
    }
  }

  // If too many changes (>30% of field), send full update
  if (changes.length > (width * height * 0.3)) {
    return encodeField(newGrid, width, height);
  }

  // Build differential encoding
  // Format: <offset from '!'><tile value><x offset from '3'><y offset from '3'>...
  let encoded = '';
  for (const change of changes) {
    const tileValue = TETRINET_BLOCKS.indexOf(change.char);
    if (tileValue < 0) continue;
    const offsetChar = String.fromCharCode('!'.charCodeAt(0) + tileValue);
    const xOffset = String.fromCharCode('3'.charCodeAt(0) + change.x);
    const yOffset = String.fromCharCode('3'.charCodeAt(0) + change.y);
    encoded += offsetChar + xOffset + yOffset;
  }

  // If differential is longer than full encoding, use full
  const fullEncoded = encodeField(newGrid, width, height);
  return encoded.length < fullEncoded.length ? encoded : fullEncoded;
}

/**
 * Apply a TetriNET field update (full or differential) to a grid.
 */
export function applyFieldUpdate(
  encoded: string,
  grid?: any[][],
  width: number = 12,
  height: number = 22
): any[][] {
  if (!grid) {
    grid = decodeField('0'.repeat(width * height), width, height);
  }

  if (!encoded) {
    return grid;
  }

  const first = encoded.charCodeAt(0);
  const isDifferential = first >= 0x21 && first <= 0x2F;
  if (!isDifferential) {
    return decodeField(encoded, width, height);
  }

  let currentBlock = -1;
  for (let i = 0; i < encoded.length; i++) {
    const ch = encoded[i];
    const code = ch.charCodeAt(0);
    if (code >= 0x21 && code <= 0x2F) {
      currentBlock = code - 0x21;
      continue;
    }

    const xChar = encoded[i];
    const yChar = encoded[i + 1];
    if (!yChar || currentBlock < 0) {
      break;
    }
    i++;

    const x = xChar.charCodeAt(0) - 0x33;
    const y = yChar.charCodeAt(0) - 0x33;
    if (x < 0 || x >= width || y < 0 || y >= height) {
      continue;
    }

    const blockChar = TETRINET_BLOCKS[currentBlock] || '0';
    applyFieldChar(grid, x, y, blockChar);
  }

  return grid;
}

function applyFieldChar(grid: any[][], x: number, y: number, char: string): void {
  if (char === '0') {
    grid[y][x] = { filled: false, color: null, locked: false };
    return;
  }
  if (char >= '1' && char <= '5') {
    grid[y][x] = {
      filled: true,
      color: COLOR_TO_PIECE[char] || 'I',
      locked: true,
    };
    return;
  }
  if (CHAR_TO_SPECIAL[char]) {
    grid[y][x] = {
      filled: true,
      color: 'I',
      locked: true,
      special: CHAR_TO_SPECIAL[char],
    };
  }
}

// ============================================================================
// TetriNET 1.x Protocol (for external server support)
// ============================================================================

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
  startingHeight: number;        // Initial garbage stack height (0-12)
  startingLevel: number;         // Starting level (0-100)
  linesPerLevel: number;         // Lines needed per level
  levelIncrement: number;        // Level increment per advance
  linesForSpecials: number;      // Lines to clear for specials
  specialsAdded: number;         // Specials added per clear
  specialCapacity: number;       // Maximum inventory size
  pieceFrequency: number[];      // 7 cumulative values (0-100)
  specialFrequency: number[];    // 9 cumulative values (0-100)
  averageHeight: boolean;        // Use average levels
  classicMode: boolean;          // Classic mode (no specials)
  seedString?: string;           // v1.14 seed string (8 hex chars)
  seed?: number;                 // Parsed seed value for 1.14 (32-bit)
  fastMode?: boolean;            // TetriFast mode (no next-block delay)
}

/**
 * Calculate IP-based hash for login encryption.
 * Hash = ip[0]*54 + ip[1]*41 + ip[2]*29 + ip[3]*17
 */
export function calculateIpHash(ipAddress: string): number {
  const octets = ipAddress.split('.').map(n => parseInt(n, 10) || 0);
  // Pad to 4 octets if needed
  while (octets.length < 4) octets.push(0);

  return octets[0] * 54 + octets[1] * 41 + octets[2] * 29 + octets[3] * 17;
}

/**
 * Encode login message using Jetrix (server) TetriNET 1.x encoding.
 * Uses initial byte 0x80, then prev+plain mod 255 XOR hash digit.
 */
export function encodeLoginMessage(message: string, ipAddress: string): string {
  const ipHashStr = String(calculateIpHash(ipAddress) || 0);
  const ipHashBytes = Buffer.from(ipHashStr, 'ascii');
  const bytes: number[] = [];

  // Initial byte is a random salt (0-255) per protocol spec
  bytes.push(Math.floor(Math.random() * 256));

  for (let i = 0; i < message.length; i++) {
    const prev = bytes[i] & 0xFF;
    const charCode = message.charCodeAt(i) & 0xFF;
    const key = ipHashBytes[i % ipHashBytes.length] & 0xFF;
    const encoded = (((prev + charCode) % 255) ^ key) & 0xFF;
    bytes.push(encoded);
  }

  return bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Decode login message (for debugging/testing)
 */
export function decodeLoginMessage(encoded: string, ipAddress: string): string {
  const ipHashStr = String(calculateIpHash(ipAddress) || 0);
  const ipHashBytes = Buffer.from(ipHashStr, 'ascii');
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i += 2) {
    bytes.push(parseInt(encoded.substring(i, i + 2), 16) & 0xFF);
  }

  let decoded = '';
  for (let i = 0; i < bytes.length - 1; i++) {
    const prev = bytes[i] & 0xFF;
    const cur = bytes[i + 1] & 0xFF;
    const key = ipHashBytes[i % ipHashBytes.length] & 0xFF;
    const temp = (cur ^ key) & 0xFF;
    let charCode = (temp - prev) % 255;
    if (charCode < 0) charCode += 255;
    decoded += String.fromCharCode(charCode);
  }

  return decoded;
}

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
export function formatTetrenetLogin(
  nickname: string,
  ipAddress: string,
  mode: TetriFastMode = 'standard',
  token = '1.13'
): string {
  const prefix = mode === 'tetrifast' ? 'tetrifaster' : 'tetrisstart';
  const plainMessage = `${prefix} ${nickname} ${token}`;
  console.log(`[TetriNet Protocol] Plain login: "${plainMessage}", IP: ${ipAddress}`);
  const encoded = encodeLoginMessage(plainMessage, ipAddress);
  console.log(`[TetriNet Protocol] Encoded login (${encoded.length / 2} bytes): ${encoded.substring(0, 40)}...`);
  return encoded;
}

/**
 * Legacy function name for compatibility (but this is WRONG for actual servers!)
 * Use formatTetrenetLogin for real server connections.
 * @deprecated Use formatTetrenetLogin instead
 */
export function formatTetrenetJoin(nickname: string): string {
  // This plain-text version ONLY works for modified servers that don't require encryption
  return `tetrisstart ${nickname} 1.13`;
}

/**
 * Format: "f <slot> <field>"
 * Sends field update to server
 */
export function formatTetrenetField(slot: PlayerSlot, field: string): string {
  return `f ${slot} ${field}`;
}

/**
 * Format: "sb <target> <special> <sender>"
 * Sends special block usage to server
 */
export function formatTetrenetSpecial(
  targetSlot: PlayerSlot,
  special: SpecialType,
  senderSlot: PlayerSlot
): string {
  return `sb ${targetSlot} ${SPECIAL_CHARS[special]} ${senderSlot}`;
}

/**
 * Format: "lvl <slot> <level>"
 * Sends level update
 */
export function formatTetrenetLevel(slot: PlayerSlot, level: number): string {
  return `lvl ${slot} ${level}`;
}

/**
 * Format: "pline <slot> <message>"
 * Sends partyline (chat) message
 */
export function formatTetrenetChat(slot: PlayerSlot, message: string): string {
  return `pline ${slot} ${message}`;
}

/**
 * Format TSpec spectator chat message.
 * Private: "pline 0 <message>"
 * Public:  "pline 0 //<message>"
 */
export function formatTspecChat(message: string, isPublic = false): string {
  return isPublic ? `pline 0 //${message}` : `pline 0 ${message}`;
}

/**
 * Format: "plineact <slot> <action>"
 * Sends partyline /me action message
 */
export function formatTetrenetAction(slot: PlayerSlot, action: string): string {
  return `plineact ${slot} ${action}`;
}

/**
 * Format: "gmsg <message>"
 * Sends in-game chat message
 */
export function formatTetrenetGameMessage(message: string): string {
  return `gmsg ${message}`;
}

/**
 * Format: "team <slot> <teamname>"
 * Sets player's team name
 */
export function formatTetrenetTeam(slot: PlayerSlot, teamName: string): string {
  return `team ${slot} ${teamName}`;
}

/**
 * Format: "connected"
 * Acknowledges slot assignment
 */
export function formatTetrenetConnected(): string {
  return 'connected';
}

/**
 * Format: "version <client>"
 * Sends client version (used by some servers/spectators)
 */
export function formatTetrenetVersion(version: string): string {
  return `version ${version}`;
}

/**
 * Format: "clientinfo <client> <version>"
 * Sends client identification (optional)
 */
export function formatTetrenetClientInfo(clientName: string, version: string): string {
  return `clientinfo ${clientName} ${version}`;
}

/**
 * Format: "startgame <state> <slot>"
 * Starts or stops the game (operator only)
 */
export function formatTetrenetStartGame(start: boolean, slot: PlayerSlot): string {
  return `startgame ${start ? '1' : '0'} ${slot}`;
}

/**
 * Format: "playerlost <slot>"
 * Reports that this player has topped out
 */
export function formatTetrenetPlayerLost(slot: PlayerSlot): string {
  return `playerlost ${slot}`;
}

/**
 * Format: "pause <state> <slot>"
 * Pauses or resumes the game (operator only)
 */
export function formatTetrenetPause(pause: boolean, slot: PlayerSlot): string {
  return `pause ${pause ? '1' : '0'} ${slot}`;
}

/**
 * Format: "sb 0 cs<N> <slot>"
 * Sends classic-style garbage lines (for non-special modes)
 */
export function formatTetrenetClassicLines(lineCount: 1 | 2 | 4, slot: PlayerSlot): string {
  return `sb 0 cs${lineCount} ${slot}`;
}

/**
 * Parse TetriNET 1.x newgame rules string.
 * Format: "newgame [stack] [level] [lines_per_level] [level_inc] [special_lines] [special_count] [capacity] [piece_freq(7)] [special_freq(9)] [avg] [mode]"
 */
export function parseNewgameOptions(parts: string[], fastMode = false): TetriNet1xGameOptions {
  const startingHeight = parseInt(parts[1]) || 0;
  const startingLevel = parseInt(parts[2]) || 1;
  const linesPerLevel = parseInt(parts[3]) || 2;
  const levelIncrement = parseInt(parts[4]) || 1;
  const linesForSpecials = parseInt(parts[5]) || 1;
  const specialsAdded = parseInt(parts[6]) || 1;
  const specialCapacity = parseInt(parts[7]) || 18;

  const pieceFreqStr = parts[8] || '';
  const specialFreqStr = parts[9] || '';

  const pieceFrequency = buildCumulativeFrequency(pieceFreqStr, 7, [14, 28, 42, 56, 70, 84, 100]);
  const specialFrequency = buildCumulativeFrequency(specialFreqStr, 9, [11, 22, 33, 44, 55, 66, 77, 88, 100]);

  const averageHeight = parts[10] === '1';
  const classicMode = parts[11] === '1';
  const seedString = parts[12] || undefined;
  const seed = seedString ? parseSeedString(seedString) : undefined;

  return {
    startingHeight,
    startingLevel,
    linesPerLevel,
    levelIncrement,
    linesForSpecials,
    specialsAdded,
    specialCapacity,
    pieceFrequency,
    specialFrequency,
    averageHeight,
    classicMode,
    seedString,
    seed,
    fastMode,
  };
}

function buildCumulativeFrequency(raw: string, size: number, fallback: number[]): number[] {
  const counts = new Array<number>(size).fill(0);
  for (const ch of raw) {
    const idx = ch.charCodeAt(0) - '1'.charCodeAt(0);
    if (idx >= 0 && idx < size) {
      counts[idx] += 1;
    }
  }

  if (counts.every(count => count === 0)) {
    return [...fallback];
  }

  const cumulative: number[] = [];
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    total += counts[i];
    cumulative.push(total);
  }

  if (cumulative[cumulative.length - 1] < 100) {
    cumulative[cumulative.length - 1] = 100;
  }

  return cumulative;
}

function parseSeedString(seedString: string): number {
  const normalized = seedString.trim();
  if (!/^[0-9A-Fa-f]+$/.test(normalized)) {
    return 0;
  }
  return parseInt(normalized, 16) >>> 0;
}

function parseWinlistEntries(tokens: string[]): WinlistEntry[] {
  const entries: WinlistEntry[] = [];
  for (const token of tokens) {
    if (!token) continue;
    const typeChar = token[0];
    if (typeChar !== 't' && typeChar !== 'p') continue;
    const rest = token.slice(1);
    const parts = rest.split(';');
    const name = parts[0] || '';
    const points = parseInt(parts[1] || '0', 10) || 0;
    const games = parts[2] ? parseInt(parts[2], 10) || 0 : undefined;
    entries.push({
      type: typeChar,
      name,
      points,
      games,
    });
  }
  return entries;
}

/**
 * Convert TetriNET 1.x options to our TetriNetGameOptions format
 */
export function convertToGameOptions(options: TetriNet1xGameOptions): TetriNetGameOptions {
  // Map the 9 standard special frequencies to our special occurancies
  const standardSpecials: SpecialType[] = [
    'add_line', 'clear_line', 'nuke', 'random_clear', 'switch',
    'clear_specials', 'gravity', 'quake', 'block_bomb'
  ];

  const specialOccurancies = standardSpecials.map((type, i) => ({
    type,
    rate: i === 0
      ? (options.specialFrequency[0] || 0)
      : Math.max(0, (options.specialFrequency[i] || 0) - (options.specialFrequency[i - 1] || 0)),
  }));

  return {
    rule: options.classicMode ? 'classic' : 'standard',
    noSpecials: options.classicMode,
    inventorySize: options.specialCapacity,
    linesToMakeForSpecials: options.linesForSpecials,
    specialsAddedEachTime: options.specialsAdded,
    specialOccurancies,
    startingHeight: options.startingHeight,
    linesPerLevel: options.linesPerLevel,
    levelIncrement: options.levelIncrement,
    pieceFrequency: options.pieceFrequency,
    specialFrequency: options.specialFrequency,
    levelAverage: options.averageHeight,
    classicMode: options.classicMode,
    startingLevel: options.startingLevel,
    classicStyleMultiplayer: true,
    nextPieceDelayMs: options.fastMode ? 0 : 1000,
    useSameBlocks: Boolean(options.seedString),
    randomSeed: options.seed ?? undefined,
    delayBeforeSuddenDeath: 0,  // Not in TetriNET 1.x protocol
    suddenDeathTick: 5,
  };
}

/**
 * Parse TetriNET 1.x server response.
 * Returns parsed message or null if unrecognized.
 *
 * Handles both standard TetriNET and TetriFast protocol variations.
 */
export function parseTetrenetMessage(line: string): TetriNetMessage | null {
  const sanitized = line.replace(/\r/g, '');
  if (!sanitized.length) return null;

  const parts = sanitized.split(' ');
  let cmd = parts[0];
  const timestamp = Date.now();
  const isTetrifastPlayernum = cmd === ')#)(!@(*3';
  const isTetrifastNewgame = cmd === '*******';

  // TetriFast uses obfuscated playernum: ")#)(!@(*3" instead of "playernum"
  if (isTetrifastPlayernum) {
    cmd = 'playernum';
  }
  // TetriFast uses obfuscated newgame: "*******" instead of "newgame"
  if (isTetrifastNewgame) {
    cmd = 'newgame';
  }

  if (cmd.startsWith('smsg') && cmd !== 'smsg') {
    const name = cmd.substring(4);
    const text = parts.slice(1).join(' ');
    return {
      type: 'tetrinet:spectator_chat',
      timestamp,
      name,
      text,
    } as SpectatorChatMessage;
  }

  if (cmd.startsWith('specjoin') && cmd !== 'specjoin') {
    const name = cmd.substring(8);
    return {
      type: 'tetrinet:spectator_joined',
      timestamp,
      name: name || '',
    } as SpectatorJoinedMessage;
  }

  if (cmd.startsWith('specleave') && cmd !== 'specleave') {
    const name = cmd.substring(9);
    return {
      type: 'tetrinet:spectator_left',
      timestamp,
      name: name || '',
    } as SpectatorLeftMessage;
  }

  switch (cmd) {
    case 'connect':
      return {
        type: 'tetrinet:connect',
        timestamp,
      } as ConnectMessage;

    case 'disconnect':
      return {
        type: 'tetrinet:disconnect',
        timestamp,
        reason: parts.slice(1).join(' ') || undefined,
      } as DisconnectMessage;

    case 'noconnecting':
      return {
        type: 'tetrinet:connect_error',
        timestamp,
        reason: parts.slice(1).join(' ') || 'Connection rejected',
      } as ConnectErrorMessage;

    case 'kick':
      return {
        type: 'tetrinet:kick',
        timestamp,
        reason: parts.slice(1).join(' ') || undefined,
      } as KickMessage;

    case 'playernum':
      // Format: "playernum <slot>" - Initial slot assignment
      return {
        type: 'tetrinet:join',
        timestamp,
        roomId: 'external',
        playerName: '',
        slot: parseInt(parts[1]) as PlayerSlot,
      } as JoinMessage & { slot: PlayerSlot };

    case 'playerjoin':
      // Format: "playerjoin <slot> <name>"
      return {
        type: 'tetrinet:player_joined',
        timestamp,
        player: {
          slot: parseInt(parts[1]) as PlayerSlot,
          name: parts.slice(2).join(' '),
          alive: true,
          level: 1,
          hasImmunity: false,
        },
      } as PlayerJoinedMessage;

    case 'playerleave':
      // Format: "playerleave <slot>"
      return {
        type: 'tetrinet:player_left',
        timestamp,
        playerId: '',
        slot: parseInt(parts[1]) as PlayerSlot,
      } as PlayerLeftMessage;

    case 'team':
      // Format: "team <slot> <teamname>"
      // Update player's team (we return as player_joined with team info)
      return {
        type: 'tetrinet:player_joined',
        timestamp,
        player: {
          slot: parseInt(parts[1]) as PlayerSlot,
          name: '',  // Name not included in team message
          team: parts.slice(2).join(' '),
          alive: true,
          level: 1,
          hasImmunity: false,
        },
      } as PlayerJoinedMessage;

    case 'f':
      // Format: "f <slot> <field>"
      return {
        type: 'tetrinet:field_update',
        timestamp,
        playerId: '',
        slot: parseInt(parts[1]) as PlayerSlot,
        field: parts[2] || '',
        level: 0,
      } as FieldUpdateMessage;

    case 'sb': {
      // Format: "sb <target> <special> <sender>"
      // Special case: "sb 0 cs<N> <sender>" for classic-style lines
      const specialCode = parts[2];
      let special: SpecialType = 'add_line';
      let lineCount = 0;

      if (specialCode.startsWith('cs')) {
        // Classic-style add lines: cs1, cs2, cs4
        lineCount = parseInt(specialCode.substring(2)) || 0;
        special = 'add_line';
      } else {
        special = CHAR_TO_SPECIAL[specialCode] || 'add_line';
      }

      return {
        type: 'tetrinet:special_used',
        timestamp,
        senderId: '',
        senderSlot: parseInt(parts[3]) as PlayerSlot,
        targetId: null,
        targetSlot: parseInt(parts[1]) as PlayerSlot,
        special,
        classicLines: lineCount || undefined,
      } as SpecialUsedMessage & { classicLines?: number };
    }

    case 'btrixnewgame':
    case 'newgame': {
      // Format: "newgame [stack] [level] [lines_per_level] [level_inc] [special_lines] [special_count] [capacity] [piece_freq(7)] [special_freq(9)] [avg] [mode]"
      const parsedOptions = parseNewgameOptions(parts, isTetrifastNewgame);
      const gameOptions = convertToGameOptions(parsedOptions);
      const seedValue = parsedOptions.seed ?? Date.now();

      return {
        type: 'tetrinet:game_start',
        timestamp,
        options: gameOptions,
        seed: seedValue,
        serverOptions: parsedOptions,  // Include raw server options
        btrix: cmd === 'btrixnewgame',
      } as GameStartMessage & { serverOptions: TetriNet1xGameOptions };
    }

    case 'ingame':
      // Format: "ingame" - Game already in progress when joining
      return {
        type: 'tetrinet:game_start',
        timestamp,
        options: {} as TetriNetGameOptions,
        seed: 0,
        inProgress: true,
      } as GameStartMessage & { inProgress: boolean };

    case 'endgame':
      return {
        type: 'tetrinet:game_over',
        timestamp,
        winnerId: null,
        winnerSlot: null,
        finalPlacements: [],
      } as GameOverMessage;

    case 'pause':
      // Format: "pause <0|1>"
      return {
        type: 'tetrinet:options_update',
        timestamp,
        options: { paused: parts[1] === '1' },
      } as OptionsUpdateMessage & { options: { paused: boolean } };

    case 'startgame': {
      // Format: "startgame <0|1> <slot>"
      const start = parts[1] === '1';
      return {
        type: 'tetrinet:start_game',
        timestamp,
        start,
        slot: parseInt(parts[2]) as PlayerSlot,
      } as StartGameMessage & { start: boolean; slot: PlayerSlot };
    }

    case 'playerlost':
      // Format: "playerlost <slot>"
      return {
        type: 'tetrinet:player_lost',
        timestamp,
        playerId: '',
        slot: parseInt(parts[1]) as PlayerSlot,
        place: 0,  // Place is determined by order of elimination
      } as PlayerLostMessage;

    case 'playerwon':
      // Format: "playerwon <slot>"
      return {
        type: 'tetrinet:game_over',
        timestamp,
        winnerId: '',
        winnerSlot: parseInt(parts[1]) as PlayerSlot,
        finalPlacements: [],
      } as GameOverMessage;

    case 'lvl':
      // Format: "lvl <slot> <level>"
      // Special case: "lvl 0 0" is a client info request
      if (parts[1] === '0' && parts[2] === '0') {
        return {
          type: 'tetrinet:options_update',
          timestamp,
          options: { clientInfoRequest: true },
        } as OptionsUpdateMessage & { options: { clientInfoRequest: boolean } };
      }

      return {
        type: 'tetrinet:field_update',
        timestamp,
        playerId: '',
        slot: parseInt(parts[1]) as PlayerSlot,
        field: '',
        level: parseInt(parts[2]) || 0,
      } as FieldUpdateMessage;

    case 'pline':
      // Format: "pline <slot> <message>" - Partyline chat
      return {
        type: 'tetrinet:chat',
        timestamp,
        senderId: '',
        senderSlot: parseInt(parts[1]) as PlayerSlot,
        senderName: '',
        text: parts.slice(2).join(' '),
      } as ChatMessage & { senderSlot: PlayerSlot };

    case 'plineact':
      // Format: "plineact <slot> <action>" - Partyline /me action
      return {
        type: 'tetrinet:chat',
        timestamp,
        senderId: '',
        senderSlot: parseInt(parts[1]) as PlayerSlot,
        senderName: '',
        text: `* ${parts.slice(2).join(' ')}`,
        isAction: true,
      } as ChatMessage & { senderSlot: PlayerSlot; isAction: boolean };

    case 'gmsg':
      // Format: "gmsg <message>" - In-game message
      return {
        type: 'tetrinet:chat',
        timestamp,
        senderId: '',
        senderName: '',
        text: parts.slice(1).join(' '),
        isGameMessage: true,
      } as ChatMessage & { isGameMessage: boolean };

    case 'winlist':
      // Format: "winlist <type><name>;<score>[;<games>] ..."
      return {
        type: 'tetrinet:winlist',
        timestamp,
        entries: parseWinlistEntries(parts.slice(1)),
        raw: parts.slice(1).join(' '),
      } as WinlistMessage;

    case 'speclist': {
      // Format: "speclist #<channel> <name> <name> ..."
      const rawChannel = parts[1] || '';
      const channel = rawChannel.startsWith('#') ? rawChannel.substring(1) : rawChannel;
      const names = parts.slice(2);
      return {
        type: 'tetrinet:spectator_list',
        timestamp,
        channel,
        names,
      } as SpectatorListMessage;
    }

    case 'specjoin': {
      // Format: "specjoin<name>" (no space) or "specjoin <name> <info...>"
      const name = parts[1] || '';
      const info = parts.slice(2).join(' ');
      return {
        type: 'tetrinet:spectator_joined',
        timestamp,
        name,
        info: info || undefined,
      } as SpectatorJoinedMessage;
    }

    case 'specleave': {
      // Format: "specleave<name>" (no space) or "specleave <name> <info...>"
      const name = parts[1] || '';
      const info = parts.slice(2).join(' ');
      return {
        type: 'tetrinet:spectator_left',
        timestamp,
        name,
        info: info || undefined,
      } as SpectatorLeftMessage;
    }

    case 'smsg': {
      // Format: "smsg<name> <text>" or "smsg <name> <text>"
      return {
        type: 'tetrinet:spectator_chat',
        timestamp,
        name: parts[1] || '',
        text: parts.slice(2).join(' '),
      } as SpectatorChatMessage;
    }

    case 'sact': {
      // Format: "sact <name> <text>"
      return {
        type: 'tetrinet:spectator_chat',
        timestamp,
        name: parts[1] || '',
        text: parts.slice(2).join(' '),
        isAction: true,
      } as SpectatorChatMessage & { isAction: boolean };
    }

    default:
      // Unknown message type
      return null;
  }
}

// ============================================================================
// WebSocket Message Helpers
// ============================================================================

/**
 * Create a WebSocket message for BBS-local games
 */
export function createMessage<T extends TetriNetMessage>(
  type: TetriNetMessageType,
  data: Omit<T, 'type' | 'timestamp'>
): T {
  return {
    type,
    timestamp: Date.now(),
    ...data,
  } as T;
}

/**
 * Create a field update message
 */
export function createFieldUpdate(
  playerId: string,
  slot: PlayerSlot,
  grid: any[][],
  level: number
): FieldUpdateMessage {
  return createMessage<FieldUpdateMessage>('tetrinet:field_update', {
    playerId,
    slot,
    field: encodeField(grid),
    level,
  });
}

/**
 * Create a special used message
 */
export function createSpecialUsed(
  senderId: string,
  senderSlot: PlayerSlot,
  targetId: string | null,
  targetSlot: PlayerSlot | null,
  special: SpecialType
): SpecialUsedMessage {
  return createMessage<SpecialUsedMessage>('tetrinet:special_used', {
    senderId,
    senderSlot,
    targetId,
    targetSlot,
    special,
  });
}

/**
 * Create a lines sent message
 */
export function createLinesSent(
  senderId: string,
  senderSlot: PlayerSlot,
  targetId: string,
  targetSlot: PlayerSlot,
  lineCount: number
): LinesSentMessage {
  return createMessage<LinesSentMessage>('tetrinet:lines_sent', {
    senderId,
    senderSlot,
    targetId,
    targetSlot,
    lineCount,
  });
}
