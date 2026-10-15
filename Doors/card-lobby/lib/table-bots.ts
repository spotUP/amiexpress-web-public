/**
 * Who is at the table, and keeping the empty seats filled with bots.
 *
 * Lifted out of `index.ts` (2026-09-20) when the door hit the 2000-line
 * ceiling its own test enforces - "1999 lines against a 2000 ceiling, so the
 * next edit needs an extraction first". This is the piece that asked to go:
 * it is table arithmetic, it touched nothing on the app but one other helper
 * beside it, and the app keeps thin methods over it because `TableFlow` calls
 * them through the host interface.
 */
import {
  type LobbyTable,
  type TablePlayer,
  isBotPlayer,
  buildBotId,
  buildBotName,
} from './index';

/** Everyone at the table who is not a bot. */
export function humanPlayers(table: LobbyTable): TablePlayer[] {
  return table.players.filter((player) => player.role === 'player' && !isBotPlayer(player));
}

/**
 * Brings the bot count to whatever the humans have left free, and clears out
 * any bot that has busted. Mutates the table and answers whether it changed -
 * the caller decides when to persist.
 */
export function syncBotsForTable(table: LobbyTable): boolean {
  const humans = humanPlayers(table);
  const bustedBots = table.players.filter((player) => player.role === 'player' && isBotPlayer(player) && player.stack <= 0);
  if (bustedBots.length > 0) {
    const bustedIds = new Set(bustedBots.map((bot) => bot.userId));
    table.players = table.players.filter((player) => !bustedIds.has(player.userId));
  }

  const bots = table.players.filter((player) => player.role === 'player' && isBotPlayer(player));
  const targetBots = Math.max(0, table.maxPlayers - humans.length);

  let changed = false;

  if (bustedBots.length > 0) changed = true;

  if (bots.length > targetBots) {
    const removeCount = bots.length - targetBots;
    const botIds = bots.slice(-removeCount).map((bot) => bot.userId);
    table.players = table.players.filter((player) => !botIds.includes(player.userId));
    changed = true;
  }

  if (bots.length < targetBots) {
    const takenSeats = new Set(table.players.map((player) => player.seat));
    for (let seat = 0; seat < table.maxPlayers; seat += 1) {
      if (table.players.filter((p) => p.role === 'player' && isBotPlayer(p)).length >= targetBots) {
        break;
      }
      if (takenSeats.has(seat)) continue;

      const botId = buildBotId(table.id, seat);
      table.players.push({
        userId: botId,
        username: buildBotName(seat),
        seat,
        stack: table.buyIn,
        buyIn: table.buyIn,
        role: 'player',
        joinedAt: Date.now(),
        isBot: true,
      });
      takenSeats.add(seat);
      changed = true;
    }
  }

  return changed;
}
