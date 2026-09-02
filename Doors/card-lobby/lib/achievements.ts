/**
 * Which achievements a profile has just earned.
 *
 * A pure pass over the player's own numbers: it awards the chips, records the
 * achievement on the profile, and hands back what was unlocked so the caller
 * can say so. Out of index.ts because the door sits at the repo's 2000-line
 * ceiling and because "does 25 hands unlock the grinder" is worth a test that
 * needs no terminal.
 */

import { ACHIEVEMENTS } from './constants';
import type { PlayerProfile } from './types';

export interface UnlockedAchievement {
  id: string;
  name: string;
  reward: number;
}

export function unlockAchievements(profile: PlayerProfile): UnlockedAchievement[] {
  const held = new Set(profile.achievements);
  const unlocked: UnlockedAchievement[] = [];

  const award = (id: string): void => {
    if (held.has(id)) return;
    const definition = ACHIEVEMENTS.find((achievement) => achievement.id === id);
    if (!definition) return;

    held.add(id);
    profile.achievements.push(id);
    profile.wallet.chips += definition.reward;
    profile.wallet.lifetimeEarned += definition.reward;
    unlocked.push({ id, name: definition.name, reward: definition.reward });
  };

  if (profile.stats.handsPlayed >= 1) award('first_hand');
  if (profile.stats.wins >= 1) award('first_win');
  if (profile.stats.bestWinStreak >= 3) award('hot_streak');
  if (profile.stats.biggestPot >= 500) award('big_pot');
  if (profile.stats.handsPlayed >= 25) award('grinder');

  return unlocked;
}

/**
 * Fold one finished hand into a profile's running totals.
 *
 * `delta` is what the hand cost or paid, `pot` is what was on the table. A
 * winning hand extends the streak; a losing one ends it; a hand that broke
 * even does neither, which is why the two branches are not an else.
 */
export function recordHandResult(profile: PlayerProfile, delta: number, pot: number): void {
  profile.stats.handsPlayed += 1;
  profile.stats.net += delta;
  profile.stats.daily.hands += 1;
  profile.stats.weekly.hands += 1;
  profile.stats.daily.net += delta;
  profile.stats.weekly.net += delta;

  if (delta > 0) {
    profile.stats.wins += 1;
    profile.stats.daily.wins += 1;
    profile.stats.weekly.wins += 1;
    profile.stats.winStreak += 1;
    profile.stats.bestWinStreak = Math.max(profile.stats.bestWinStreak, profile.stats.winStreak);
  } else if (delta < 0) {
    profile.stats.losses += 1;
    profile.stats.winStreak = 0;
  }

  profile.stats.biggestPot = Math.max(profile.stats.biggestPot, pot);
}
