import Database from 'better-sqlite3';
import { PlayerState, PlayerSummary, HighScore } from './types';
export declare function openDb(doorDir: string): Database.Database;
export declare function upsertPlayer(db: Database.Database, state: PlayerState & {
    bbsHandle: string;
}): void;
export declare function getActivePlayers(db: Database.Database): any[];
export declare function getPlayerById(db: Database.Database, id: string): any;
export declare function getPlayersAt(db: Database.Database, location: number): PlayerSummary[];
export declare function deactivatePlayer(db: Database.Database, id: string): void;
export declare function getInventory(db: Database.Database, playerId: string): any[];
export declare function insertHighScore(db: Database.Database, playerId: string, bbsHandle: string, score: number, turns: number): void;
export declare function getHighScores(db: Database.Database, limit?: number): HighScore[];
export declare function upsertCombat(db: Database.Database, playerId: string, data: {
    opponentId?: string;
    copIndex?: number;
    numDeputies?: number;
    fightArray: any[];
}): void;
export declare function deleteCombat(db: Database.Database, playerId: string): void;
//# sourceMappingURL=db.d.ts.map