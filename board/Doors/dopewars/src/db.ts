import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { PlayerState, PlayerSummary, HighScore } from './types';

export function openDb(doorDir: string): Database.Database {
  const dataDir = path.join(doorDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'dopewars.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  return db;
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dw_players (
      id TEXT PRIMARY KEY,
      bbs_handle TEXT NOT NULL,
      location INTEGER NOT NULL DEFAULT 0,
      cash REAL NOT NULL DEFAULT 2000,
      debt REAL NOT NULL DEFAULT 5500,
      bank REAL NOT NULL DEFAULT 0,
      health INTEGER NOT NULL DEFAULT 100,
      coat_size INTEGER NOT NULL DEFAULT 100,
      turn INTEGER NOT NULL DEFAULT 0,
      total_turns INTEGER NOT NULL DEFAULT 30,
      event_num INTEGER NOT NULL DEFAULT 0,
      flags INTEGER NOT NULL DEFAULT 0,
      in_combat INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      last_seen DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dw_inventory (
      player_id TEXT NOT NULL REFERENCES dw_players(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL CHECK(item_type IN ('drug','gun')),
      item_index INTEGER NOT NULL,
      carried INTEGER NOT NULL DEFAULT 0,
      total_value REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, item_type, item_index)
    );

    CREATE TABLE IF NOT EXISTS dw_world_prices (
      location INTEGER NOT NULL,
      drug_index INTEGER NOT NULL,
      price REAL NOT NULL,
      cheap INTEGER NOT NULL DEFAULT 0,
      expensive INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (location, drug_index)
    );

    CREATE TABLE IF NOT EXISTS dw_high_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      bbs_handle TEXT NOT NULL,
      score REAL NOT NULL,
      turns INTEGER NOT NULL,
      achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dw_combat (
      player_id TEXT PRIMARY KEY REFERENCES dw_players(id) ON DELETE CASCADE,
      opponent_id TEXT,
      cop_index INTEGER,
      num_deputies INTEGER,
      fight_array TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS dw_spy_tips (
      player_id TEXT NOT NULL REFERENCES dw_players(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL,
      tip_type TEXT NOT NULL CHECK(tip_type IN ('spy','tip')),
      PRIMARY KEY (player_id, target_id, tip_type)
    );
  `);
}

export function upsertPlayer(
  db: Database.Database,
  state: PlayerState & { bbsHandle: string }
): void {
  db.prepare(`
    INSERT INTO dw_players
      (id, bbs_handle, location, cash, debt, bank, health, coat_size,
       turn, total_turns, event_num, flags, in_combat, active, last_seen)
    VALUES
      (@id, @bbsHandle, @location, @cash, @debt, @bank, @health, @coatSize,
       @turn, @totalTurns, @eventNum, @flags, @inCombat, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      location=excluded.location, cash=excluded.cash, debt=excluded.debt,
      bank=excluded.bank, health=excluded.health, coat_size=excluded.coat_size,
      turn=excluded.turn, total_turns=excluded.total_turns,
      event_num=excluded.event_num, flags=excluded.flags,
      in_combat=excluded.in_combat, last_seen=CURRENT_TIMESTAMP
  `).run({ ...state, inCombat: state.inCombat ? 1 : 0 });

  const upsertItem = db.prepare(`
    INSERT INTO dw_inventory (player_id, item_type, item_index, carried, total_value)
    VALUES (@playerId, @itemType, @itemIndex, @carried, @totalValue)
    ON CONFLICT(player_id, item_type, item_index) DO UPDATE SET
      carried=excluded.carried, total_value=excluded.total_value
  `);
  for (const drug of state.drugs) {
    upsertItem.run({
      playerId: state.id, itemType: 'drug',
      itemIndex: drug.index, carried: drug.carried, totalValue: drug.totalValue,
    });
  }
  for (const gun of state.guns) {
    upsertItem.run({
      playerId: state.id, itemType: 'gun',
      itemIndex: gun.index, carried: gun.carried, totalValue: 0,
    });
  }
}

export function getActivePlayers(db: Database.Database): any[] {
  return db.prepare(`SELECT * FROM dw_players WHERE active=1`).all();
}

export function getPlayerById(db: Database.Database, id: string): any {
  return db.prepare(`SELECT * FROM dw_players WHERE id=?`).get(id);
}

export function getPlayersAt(db: Database.Database, location: number): PlayerSummary[] {
  return db.prepare(`
    SELECT id, bbs_handle AS name, location, health, turn
    FROM dw_players WHERE active=1 AND location=?
  `).all(location) as PlayerSummary[];
}

export function deactivatePlayer(db: Database.Database, id: string): void {
  db.prepare(
    `UPDATE dw_players SET active=0, last_seen=CURRENT_TIMESTAMP WHERE id=?`
  ).run(id);
}

export function getInventory(db: Database.Database, playerId: string): any[] {
  return db.prepare(
    `SELECT * FROM dw_inventory WHERE player_id=?`
  ).all(playerId);
}

export function insertHighScore(
  db: Database.Database,
  playerId: string,
  bbsHandle: string,
  score: number,
  turns: number
): void {
  db.prepare(
    `INSERT INTO dw_high_scores (player_id, bbs_handle, score, turns) VALUES (?,?,?,?)`
  ).run(playerId, bbsHandle, score, turns);
}

export function getHighScores(db: Database.Database, limit = 20): HighScore[] {
  return db.prepare(`
    SELECT id, player_id AS playerId, bbs_handle AS bbsHandle, score, turns,
           achieved_at AS achievedAt
    FROM dw_high_scores ORDER BY score DESC LIMIT ?
  `).all(limit) as HighScore[];
}

export function upsertCombat(
  db: Database.Database,
  playerId: string,
  data: { opponentId?: string; copIndex?: number; numDeputies?: number; fightArray: any[] }
): void {
  db.prepare(`
    INSERT INTO dw_combat (player_id, opponent_id, cop_index, num_deputies, fight_array)
    VALUES (?,?,?,?,?)
    ON CONFLICT(player_id) DO UPDATE SET
      opponent_id=excluded.opponent_id, cop_index=excluded.cop_index,
      num_deputies=excluded.num_deputies, fight_array=excluded.fight_array
  `).run(
    playerId,
    data.opponentId ?? null,
    data.copIndex ?? null,
    data.numDeputies ?? null,
    JSON.stringify(data.fightArray)
  );
}

export function deleteCombat(db: Database.Database, playerId: string): void {
  db.prepare(`DELETE FROM dw_combat WHERE player_id=?`).run(playerId);
}
