/**
 * WHAT A PLAYER HAS DONE HERE: the running totals, the board's achievements,
 * and the table of who has won what.
 *
 * Three things that all answer the same question and used to sit in three
 * different places - `index.ts`'s achievement glue, `lib/achievements.ts`'s
 * per-hand totals, and nothing at all for "skitgubbe can have a highscore
 * list that tracks games won same for uno etc" (sysop, 2026-09-16).
 *
 * WHY A GAME'S WIN IS NOT A HAND'S WIN. `PlayerStats.wins` counts hands that
 * PAID - it is a chip delta - which is the right answer for poker and the
 * wrong one for every game in the lobby that is played for the title: "
 * skitgubbe is a social game, it requires no buy in" (sysop, 2026-09-15), so
 * every hand of it settles at zero and nobody has ever won one by that
 * measure. A game that ENDS reports its result here instead, per game, and
 * the two counts stay separate on purpose.
 */

import type { PlayerProfile } from '../lib/types';
import { unlockAchievements, recordHandResult } from '../lib/achievements';

/** What a door has to be able to do for this to report anything. */
export interface ScoresHost {
  readonly profiles: Record<string, PlayerProfile>;
  pushNotice(message: string): void;
  /** The board's own achievement channel, which may not exist. */
  reportToBoard(type: string, opts?: { value?: number; key?: string }): void;
}

/** One player's record in one game. */
export interface GameRecord {
  played: number;
  won: number;
}

/** A row of the table the caller reads. */
export interface ScoreRow {
  userId: string;
  username: string;
  played: number;
  won: number;
}

export class Scores {
  constructor(private readonly host: ScoresHost) {}

  /**
   * The lobby's OWN awards, and the board's.
   *
   * These are two systems on purpose (achievements SP3): the chips and the
   * notice are this door's, scoped to the table; `door.cardlobby.unlock` is
   * the global one, reported through the board so a player's card play counts
   * beside everything else he does. The lobby award is the trigger, not the
   * payload - the key is which one, so the global rules can ask for variety
   * rather than duplicating the local thresholds.
   */
  public handleAchievementUnlocks(profile: PlayerProfile): void {
    for (const unlocked of unlockAchievements(profile)) {
      this.host.pushNotice(`Achievement unlocked: ${unlocked.name} (+${unlocked.reward})`);
      this.host.reportToBoard('door.cardlobby.unlock', { key: unlocked.id });
    }
  }

  /** One finished hand, folded into the totals and reported onward. */
  public updateStatsAfterHand(profile: PlayerProfile, delta: number, pot: number): void {
    recordHandResult(profile, delta, pot);
    this.host.reportToBoard('door.cardlobby.hand');
    if (delta > 0) this.host.reportToBoard('door.cardlobby.win', { value: delta });
  }

  /**
   * ONE FINISHED GAME, for the player who won it and everyone who did not.
   *
   * Called with every human who was at the table, so a game counts as PLAYED
   * for the ones who lost it - a table of games won with no games played
   * beside it says nothing about who is any good.
   *
   * Bots are not passed in: they have no profile, and a board of bot names
   * would be a scoreboard of the house.
   */
  public recordGameResult(gameId: string, playerIds: string[], winnerId: string | null): void {
    for (const userId of new Set(playerIds)) {
      const profile = this.host.profiles[userId];
      if (!profile) continue;

      // Old profiles were saved before this existed; a missing record is a
      // player who has not finished a game yet, not a broken one.
      const byGame = (profile.stats.byGame ??= {});
      const record: GameRecord = byGame[gameId] ?? { played: 0, won: 0 };
      record.played += 1;
      if (userId === winnerId) record.won += 1;
      byGame[gameId] = record;
    }

    if (winnerId && this.host.profiles[winnerId]) {
      // The board hears about a game won as well as a hand that paid: a
      // social game pays nothing, and winning one is still winning.
      this.host.reportToBoard('door.cardlobby.win', { key: gameId });
    }
  }

  /**
   * The table for one game, best first.
   *
   * Ordered by games WON, then by the fewest played to get them - two players
   * on four wins are not level if one of them needed twenty games - and then
   * by name, so the order never wobbles between two identical records.
   */
  public table(gameId: string, limit = 10): ScoreRow[] {
    return Object.values(this.host.profiles)
      .map((profile) => ({
        userId: profile.userId,
        username: profile.username,
        played: profile.stats.byGame?.[gameId]?.played ?? 0,
        won: profile.stats.byGame?.[gameId]?.won ?? 0,
      }))
      .filter((row) => row.played > 0)
      .sort((a, b) => (b.won - a.won)
        || (a.played - b.played)
        || a.username.localeCompare(b.username))
      .slice(0, limit);
  }

  /** Every game anybody has finished, in the order they are worth reading. */
  public gamesPlayed(): string[] {
    const seen = new Set<string>();
    for (const profile of Object.values(this.host.profiles)) {
      for (const [gameId, record] of Object.entries(profile.stats.byGame ?? {})) {
        if (record.played > 0) seen.add(gameId);
      }
    }
    return [...seen].sort();
  }
}
