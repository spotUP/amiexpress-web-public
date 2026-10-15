/**
 * MISSION mode - who has cleared what.
 *
 * Free selection was the call: every mission in a pack is playable from the
 * start, and this file is the record of which ones a player has beaten and
 * how quickly. That makes the select screen a progress board rather than a
 * lock screen.
 *
 * Stored as JSON beside the door's other data, resolved through
 * resolveDoorRoot() - never `process.cwd()` or a bare `__dirname`, which two
 * repo tests fail on.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveDoorRoot } from '@amiexpress/bbs-door-sdk/settings';

export interface MissionClear {
  /** Seconds the winning run took. */
  seconds: number;
  /** ISO 8601. */
  date: string;
}

interface ProgressFile {
  version: string;
  /** player name -> pack name -> mission id -> best clear. */
  players: Record<string, Record<string, Record<string, MissionClear>>>;
}

const EMPTY: ProgressFile = { version: '1.0.0', players: {} };

export class MissionProgress {
  private readonly filePath: string;
  private data: ProgressFile;

  constructor(filePath?: string, startDir: string = __dirname) {
    this.filePath = filePath ?? path.join(resolveDoorRoot(startDir), 'data', 'mission-progress.json');
    this.data = this.load();
  }

  private load(): ProgressFile {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as ProgressFile;
        if (parsed && typeof parsed === 'object' && parsed.players) return parsed;
      }
    } catch {
      // A corrupt or unreadable record must not stop anyone playing; it is
      // progress, not save data, and it rebuilds itself from the next clear.
    }
    return { ...EMPTY, players: {} };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {
      // Same again: a read-only data directory costs the record, not the game.
    }
  }

  /** Every clear this player has in this pack. */
  getClears(player: string, pack: string): Record<string, MissionClear> {
    return this.data.players[player]?.[pack] ?? {};
  }

  getClear(player: string, pack: string, missionId: string): MissionClear | null {
    return this.getClears(player, pack)[missionId] ?? null;
  }

  /**
   * Record a clear. A slower repeat is kept out: the record is the best time,
   * so beating a mission again never makes the board look worse.
   */
  recordClear(player: string, pack: string, missionId: string, seconds: number): MissionClear {
    const existing = this.getClear(player, pack, missionId);
    if (existing && existing.seconds <= seconds) return existing;

    const clear: MissionClear = { seconds, date: new Date().toISOString() };
    const packs = this.data.players[player] ?? (this.data.players[player] = {});
    const missions = packs[pack] ?? (packs[pack] = {});
    missions[missionId] = clear;
    this.save();
    return clear;
  }

  /** How many of `total` this player has cleared, for the pack's header line. */
  countClears(player: string, pack: string): number {
    return Object.keys(this.getClears(player, pack)).length;
  }
}
