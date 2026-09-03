/**
 * Where TETRIS ATTACK replays live.
 *
 * One JSON file per game, in panel-attack's ReplayV3 format, under the door's
 * data directory beside high-scores.json - the pattern this door already uses
 * for anything it must keep.
 *
 * DELIBERATELY NOT the gm_replays table. That table's columns are Tetris
 * shaped - final_grade, snapshots_data - and its rows hang off a foreign key
 * into gm_users that a door session need not have. More to the point, a file
 * IS the deliverable here: the thing on disk is exactly the file Panel Attack
 * opens, so a caller who wants their game can be handed it as it sits.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ReplayV3Json } from '../core/panels/replay-recorder';

export interface StoredReplay {
  /** File name without the extension; also the id. */
  id: string;
  playerName: string;
  mode: string;
  /** Seconds since the epoch, as the file records it. */
  timestamp: number;
  /** Frames of play. */
  duration: number;
  completed: boolean;
}

/** Newest first, and never more than this many are listed. */
const DEFAULT_LIMIT = 50;

export class PanelReplayStore {
  private readonly directory: string;

  constructor(directory?: string) {
    this.directory = directory ?? path.join(__dirname, '../../data/panel-replays');
  }

  /** Write a replay. Returns its id, or null if it could not be written. */
  save(fileName: string, replay: ReplayV3Json): string | null {
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      // A replay is worth exactly nothing next to the game it came from, so a
      // failure here must never take the game down with it.
      fs.writeFileSync(
        path.join(this.directory, `${fileName}.json`),
        JSON.stringify(replay),
        'utf-8',
      );
      return fileName;
    } catch {
      return null;
    }
  }

  /** What is on disk, newest first. */
  list(limit = DEFAULT_LIMIT): StoredReplay[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.directory).filter((name) => name.endsWith('.json'));
    } catch {
      return [];
    }

    const replays: StoredReplay[] = [];
    for (const name of names) {
      const replay = this.read(name.replace(/\.json$/, ''));
      if (replay) replays.push(replay);
    }

    replays.sort((a, b) => b.timestamp - a.timestamp);
    return replays.slice(0, limit);
  }

  /** The listing entry for one replay, or null if it will not parse. */
  read(id: string): StoredReplay | null {
    const json = this.load(id);
    if (!json) return null;
    try {
      const parsed = JSON.parse(json) as ReplayV3Json;
      const player = parsed.metadata.stacks[0];
      return {
        id,
        playerName: player?.name ?? 'UNKNOWN',
        mode: parsed.metadata.gameModeName,
        timestamp: parsed.metadata.timestamp,
        duration: parsed.metadata.duration ?? 0,
        completed: parsed.metadata.completed === true,
      };
    } catch {
      return null;
    }
  }

  /** The file itself, for playback. */
  load(id: string): string | null {
    // The id comes from a listing, but it also comes from a caller typing one,
    // so it must not be able to walk out of the directory.
    if (id.includes('/') || id.includes('\\') || id.includes('..')) return null;
    try {
      return fs.readFileSync(path.join(this.directory, `${id}.json`), 'utf-8');
    } catch {
      return null;
    }
  }

  delete(id: string): boolean {
    if (id.includes('/') || id.includes('\\') || id.includes('..')) return false;
    try {
      fs.unlinkSync(path.join(this.directory, `${id}.json`));
      return true;
    } catch {
      return false;
    }
  }
}
