import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
  openDb,
  upsertPlayer,
  getActivePlayers,
  getPlayerById,
  getPlayersAt,
  deactivatePlayer,
  getInventory,
  insertHighScore,
  getHighScores,
} from '../db';
import { PlayerState } from '../types';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dw-test-'));
}

function makeState(
  overrides: Partial<PlayerState & { bbsHandle: string }> = {}
): PlayerState & { bbsHandle: string } {
  return {
    id: 'TEST1', name: 'TESTER', bbsHandle: 'TESTER',
    location: 0, cash: 2000, debt: 5500, bank: 0,
    health: 100, coatSize: 100, turn: 0, totalTurns: 30,
    eventNum: 0, flags: 0, inCombat: false,
    drugs: [{ index: 0, carried: 5, totalValue: 1000 }],
    guns: [],
    ...overrides,
  };
}

describe('openDb', () => {
  it('creates db and schema', () => {
    const db = openDb(tmpDir());
    expect(db).toBeDefined();
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dw_%'`
    ).all() as { name: string }[];
    const names = tables.map(t => t.name).sort();
    expect(names).toContain('dw_players');
    expect(names).toContain('dw_inventory');
    expect(names).toContain('dw_high_scores');
    expect(names).toContain('dw_combat');
    expect(names).toContain('dw_spy_tips');
    db.close();
  });
});

describe('upsertPlayer', () => {
  it('inserts a new player', () => {
    const db = openDb(tmpDir());
    upsertPlayer(db, makeState());
    const row = getPlayerById(db, 'TEST1');
    expect(row).toBeDefined();
    expect(row.cash).toBe(2000);
    expect(row.bbs_handle).toBe('TESTER');
    db.close();
  });

  it('updates existing player on conflict', () => {
    const db = openDb(tmpDir());
    upsertPlayer(db, makeState());
    upsertPlayer(db, makeState({ cash: 9999 }));
    const row = getPlayerById(db, 'TEST1');
    expect(row.cash).toBe(9999);
    db.close();
  });

  it('persists drug inventory', () => {
    const db = openDb(tmpDir());
    upsertPlayer(db, makeState());
    const inv = getInventory(db, 'TEST1');
    expect(inv.length).toBeGreaterThan(0);
    const drug = inv.find((i: any) => i.item_type === 'drug' && i.item_index === 0);
    expect(drug.carried).toBe(5);
    db.close();
  });
});

describe('getActivePlayers', () => {
  it('returns only active players', () => {
    const db = openDb(tmpDir());
    upsertPlayer(db, makeState({ id: 'A', name: 'A', bbsHandle: 'A' }));
    upsertPlayer(db, makeState({ id: 'B', name: 'B', bbsHandle: 'B' }));
    deactivatePlayer(db, 'B');
    const active = getActivePlayers(db);
    expect(active.length).toBe(1);
    expect(active[0].id).toBe('A');
    db.close();
  });
});

describe('getPlayersAt', () => {
  it('returns players at a given location', () => {
    const db = openDb(tmpDir());
    upsertPlayer(db, makeState({ id: 'A', name: 'A', bbsHandle: 'A', location: 3 }));
    upsertPlayer(db, makeState({ id: 'B', name: 'B', bbsHandle: 'B', location: 5 }));
    const at3 = getPlayersAt(db, 3);
    expect(at3.length).toBe(1);
    expect(at3[0].id).toBe('A');
    db.close();
  });
});

describe('getHighScores', () => {
  it('returns scores ordered by score desc', () => {
    const db = openDb(tmpDir());
    upsertPlayer(db, makeState({ id: 'A', name: 'A', bbsHandle: 'ALICE' }));
    upsertPlayer(db, makeState({ id: 'B', name: 'B', bbsHandle: 'BOB' }));
    insertHighScore(db, 'A', 'ALICE', 50000, 30);
    insertHighScore(db, 'B', 'BOB', 99000, 28);
    const scores = getHighScores(db);
    expect(scores[0].bbsHandle).toBe('BOB');
    expect(scores[0].score).toBe(99000);
    db.close();
  });
});
