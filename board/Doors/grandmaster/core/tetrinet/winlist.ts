/**
 * TetriNET winlist
 *
 * TetriNET does not rank players by score - it ranks them by wins, and the
 * points are fixed by the reference server (TetriNET2.Server/Game.cs, end of
 * game): the winner takes 3, the player who died LAST before them takes 2,
 * the one before that takes 1, and nobody else scores. Entries accumulate
 * across games and are keyed by player and team, so the same nick on two
 * teams keeps two records.
 *
 * The lobby's Winlist tab used to be filled from the door's own high score
 * table, which is a different thing entirely - a big solo score outranked
 * somebody who actually won matches.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface WinListEntry {
  name: string;
  team: string;
  points: number;
  /** Games this player finished in a scoring place. */
  games: number;
}

interface WinListData {
  version: string;
  entries: WinListEntry[];
}

/** Points the reference server awards, best placement first. */
export const WIN_POINTS = [3, 2, 1];

/**
 * Award points for one finished game.
 *
 * @param finishers players in FINISHING order - the winner first, then the
 *   others by how long they survived (last death first), which is the order
 *   the reference server walks when handing out 2 and 1.
 */
export function awardPoints(
  entries: WinListEntry[],
  finishers: Array<{ name: string; team?: string }>
): WinListEntry[] {
  const updated = entries.map(entry => ({ ...entry }));

  finishers.slice(0, WIN_POINTS.length).forEach((player, place) => {
    const team = player.team ?? '';
    let entry = updated.find(e => e.name === player.name && e.team === team);
    if (!entry) {
      entry = { name: player.name, team, points: 0, games: 0 };
      updated.push(entry);
    }
    entry.points += WIN_POINTS[place];
    entry.games += 1;
  });

  return updated.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

export class WinList {
  private filePath: string;
  private data: WinListData;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(__dirname, '../../data/tetrinet-winlist.json');
    this.data = this.load();
  }

  private load(): WinListData {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as WinListData;
      }
    } catch (error) {
      console.error('Failed to load TetriNET winlist:', error);
    }
    return { version: '1.0.0', entries: [] };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save TetriNET winlist:', error);
    }
  }

  /** Standings, highest first. */
  getEntries(limit: number = 10): WinListEntry[] {
    return this.data.entries.slice(0, limit);
  }

  /** Record one finished game and persist the new standings. */
  recordGame(finishers: Array<{ name: string; team?: string }>): WinListEntry[] {
    if (finishers.length === 0) return this.getEntries();

    this.data.entries = awardPoints(this.data.entries, finishers);
    this.save();
    return this.getEntries();
  }

  /** Replace the standings wholesale - used by the external server's winlist. */
  setEntries(entries: WinListEntry[]): void {
    this.data.entries = [...entries].sort((a, b) => b.points - a.points);
    this.save();
  }
}
