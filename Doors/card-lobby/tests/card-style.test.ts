/**
 * How big a card is drawn, and who chooses.
 *
 * "uno in cardlobby doesnt show the full size cards when it can" and "we could
 * add a menu option in cardlobby for the users to select cards style" (sysop,
 * 2026-09-02).
 *
 * UNO's discard card was hardcoded `size: 'mini'`, with a comment saying the
 * panel is four rows tall - true of the 80x25 board it was written for, and
 * wrong the moment the door is given a real terminal. Poker had the rule
 * already; this is that rule in one place, plus the player's own preference.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveCardStyle, FULL_CARD_ROWS } from '../lib/card-style';
import { unlockAchievements, recordHandResult } from '../lib/achievements';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-cards-'));

export async function aTallPanelGetsFullSizeCards(): Promise<void> {
  assert.strictEqual(resolveCardStyle(undefined, FULL_CARD_ROWS).size, 'full');
  assert.strictEqual(resolveCardStyle(undefined, FULL_CARD_ROWS - 1).size, 'mini',
    'a panel that cannot hold a full card gets the small one');
  assert.strictEqual(resolveCardStyle(undefined, 40).size, 'full', 'and a big screen gets full cards');
}

export async function aPlayerCanInsistOnSmallCards(): Promise<void> {
  assert.strictEqual(resolveCardStyle({ size: 'mini' }, 40).size, 'mini',
    'asked for small, gets small however much room there is');
  assert.strictEqual(resolveCardStyle({ size: 'auto' }, 40).size, 'full');
}

export async function unicodeFacesNeedATerminalThatDrawsThem(): Promise<void> {
  // A box of question marks is worse than a plain card.
  assert.strictEqual(resolveCardStyle({ style: 'unicode' }, 10, false).style, 'ascii');
  assert.strictEqual(resolveCardStyle({ style: 'unicode' }, 10, true).style, 'unicode');
  assert.strictEqual(resolveCardStyle({ style: 'ascii' }, 10, true).style, 'ascii');
  assert.strictEqual(resolveCardStyle(undefined, 10, true).style, 'ascii', 'ASCII is the default');
}

export async function theCardBackIsRememberedToo(): Promise<void> {
  assert.strictEqual(resolveCardStyle(undefined, 10).back, 'lined');
  assert.strictEqual(resolveCardStyle({ back: 'shiny' }, 10).back, 'shiny');
}

export async function theMenuOffersCardStyle(): Promise<void> {
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 100, height: 30 }),
    readFile: async () => null, writeFile: async () => {},
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const app: any = new CardLobbyApp({
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 30, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  } as any);
  void app.run();
  await new Promise((r) => setTimeout(r, 1500));

  try {
    const views = app.uiManager.menus[0];
    const entry = views.items.find((item: any) => item.label === 'Card Style');
    assert.ok(entry, `no Card Style entry in: ${views.items.map((i: any) => i.label).join(', ')}`);

    // And the door hands the renderer what the profile says.
    app.currentProfile.cards = { size: 'mini', back: 'shiny' };
    app.applyCardPreferences();
    assert.deepStrictEqual(app.uiManager.cardPreferences, { size: 'mini', back: 'shiny' });
    assert.strictEqual(app.uiManager.unicodeCapable, true, 'and what this terminal can draw');
  } finally { app.screen?.destroy?.(); }
}

// ---------------------------------------------------------------------------
// The two things that moved out of index.ts to make room, with the tests they
// never had.
// ---------------------------------------------------------------------------

function profile(): any {
  return {
    userId: '1', username: 'sysop',
    wallet: { chips: 1000, lifetimeEarned: 1000 },
    stats: {
      handsPlayed: 0, wins: 0, losses: 0, net: 0, winStreak: 0, bestWinStreak: 0, biggestPot: 0,
      daily: { hands: 0, wins: 0, net: 0 }, weekly: { hands: 0, wins: 0, net: 0 },
    },
    achievements: [], status: 'lobby',
  };
}

export async function anAchievementIsAwardedOnceAndPaysOnce(): Promise<void> {
  const p = profile();
  p.stats.handsPlayed = 1;

  const first = unlockAchievements(p);
  assert.ok(first.some((a) => a.id === 'first_hand'), 'the first hand unlocks something');
  const paid = p.wallet.chips;

  const second = unlockAchievements(p);
  assert.deepStrictEqual(second, [], 'and never unlocks again');
  assert.strictEqual(p.wallet.chips, paid, 'nor pays again');
}

export async function aWinExtendsTheStreakAndALossEndsIt(): Promise<void> {
  const p = profile();

  recordHandResult(p, 100, 250);
  recordHandResult(p, 50, 120);
  assert.strictEqual(p.stats.winStreak, 2);
  assert.strictEqual(p.stats.bestWinStreak, 2);
  assert.strictEqual(p.stats.biggestPot, 250, 'the biggest pot is the biggest, not the latest');

  recordHandResult(p, 0, 80);
  assert.strictEqual(p.stats.winStreak, 2, 'breaking even neither extends nor ends a streak');

  recordHandResult(p, -75, 300);
  assert.strictEqual(p.stats.winStreak, 0, 'a loss ends it');
  assert.strictEqual(p.stats.bestWinStreak, 2, 'and the best stands');
  assert.strictEqual(p.stats.handsPlayed, 4);
  assert.strictEqual(p.stats.net, 75);
}
