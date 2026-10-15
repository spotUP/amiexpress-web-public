/**
 * The Card Lobby runs on what the sysop set, and on its own shipped values
 * when they set nothing (Doors/card-lobby/lib/settings.ts).
 *
 * Every knob the manifest declares has to reach something: the starting chips
 * are what a new wallet holds, the entry fee rate is what sitting down costs,
 * the activity and win rewards are what a hand pays, and the daily bonus and
 * its cooldown are the grant in maybeGrantDailyBonus. The manifest is read
 * here too, so a key renamed in one file and not the other fails a test rather
 * than becoming a settings form that edits into the void.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// lib/utils.ts reaches the SDK root for the card engines, and the SDK root
// reaches the audio engine and Tone.js - an ESM build jest cannot transform.
// Nothing under test plays a sound.
jest.mock('tone', () => ({}), { virtual: true });
import {
  applySettings,
  loadSettings,
  settings,
  dailyBonusCooldownMs,
  DEFAULT_SETTINGS,
} from '../../../../Doors/card-lobby/lib/settings';
import { initProfile, calculateEntryFee } from '../../../../Doors/card-lobby/lib/utils';
import {
  STARTING_CHIPS,
  DAILY_BONUS,
  DAILY_COOLDOWN_MS,
  DAILY_RESET_MS,
  ENTRY_FEE_RATE,
  ACTIVITY_REWARD,
  WIN_REWARD,
} from '../../../../Doors/card-lobby/lib/constants';

const DOOR_DIR = path.join(__dirname, '../../../../Doors/card-lobby');
const manifest = JSON.parse(fs.readFileSync(path.join(DOOR_DIR, 'door.settings.json'), 'utf8'));

describe('Card Lobby settings', () => {
  it('declares exactly the keys the door reads', () => {
    const declared = manifest.settings.map((s: { key: string }) => s.key).sort();

    expect(declared).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('declares the door as the command the board registered', () => {
    expect(manifest.command).toBe('CARDLOBBY');
  });

  it('ships defaults that match what the door ran with before it declared any', () => {
    const fromManifest = Object.fromEntries(
      manifest.settings.map((s: { key: string; default: unknown }) => [s.key, s.default]),
    );

    expect(fromManifest).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      startingChips: STARTING_CHIPS,
      dailyBonusChips: DAILY_BONUS,
      dailyBonusCooldownHours: DAILY_COOLDOWN_MS / (60 * 60 * 1000),
      entryFeeRate: ENTRY_FEE_RATE,
      activityReward: ACTIVITY_REWARD,
      winReward: WIN_REWARD,
    });
  });

  it('runs on the shipped values when the sysop has set nothing', () => {
    expect(applySettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('takes the sysop values', () => {
    expect(applySettings({
      startingChips: 250,
      dailyBonusChips: 50,
      dailyBonusCooldownHours: 6,
      entryFeeRate: 0.1,
      activityReward: 1,
      winReward: 3,
    })).toEqual({
      startingChips: 250,
      dailyBonusChips: 50,
      dailyBonusCooldownHours: 6,
      entryFeeRate: 0.1,
      activityReward: 1,
      winReward: 3,
    });
  });

  it('refuses an entry fee that would take more than the buy-in', () => {
    expect(applySettings({ entryFeeRate: 4 }).entryFeeRate).toBe(1);
    expect(applySettings({ entryFeeRate: -1 }).entryFeeRate).toBe(0);
  });

  it('keeps the daily bonus claimable at most hourly and at least weekly', () => {
    expect(applySettings({ dailyBonusCooldownHours: 0 }).dailyBonusCooldownHours).toBe(1);
    expect(applySettings({ dailyBonusCooldownHours: 9000 }).dailyBonusCooldownHours).toBe(168);
  });

  it('leaves the stats rollover on its own clock, not the bonus cooldown', () => {
    // A one-hour bonus must not reset the daily leaderboard every hour.
    expect(DAILY_RESET_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('Card Lobby settings reach the door', () => {
  // The door's own directory is the sysop's live board data in this checkout;
  // the round trip runs on a copy of the door root, which is all the SDK needs
  // to resolve a manifest and the values beside it.
  let doorRoot: string;

  beforeAll(() => {
    doorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'card-lobby-settings-'));
    fs.copyFileSync(
      path.join(DOOR_DIR, 'door.settings.json'),
      path.join(doorRoot, 'door.settings.json'),
    );
  });

  afterAll(() => {
    fs.rmSync(doorRoot, { recursive: true, force: true });
    loadSettings(doorRoot);
  });

  /** What the admin writes when the sysop saves the form. */
  const save = (values: Record<string, unknown>): void => {
    fs.writeFileSync(path.join(doorRoot, 'settings.json'), JSON.stringify(values, null, 2));
    loadSettings(doorRoot);
  };

  it('pays a new wallet what the sysop saved, not the shipped 1000', () => {
    save({ startingChips: 250 });

    const profile = initProfile({ user: { id: 7, username: 'spot' } } as never);

    expect(profile.wallet.chips).toBe(250);
    expect(profile.wallet.lifetimeEarned).toBe(250);
  });

  it('charges the entry fee the sysop saved', () => {
    save({ entryFeeRate: 0.5 });

    expect(calculateEntryFee(1000)).toBe(500);
  });

  it('holds the daily bonus for the hours the sysop saved', () => {
    save({ dailyBonusCooldownHours: 6 });

    expect(dailyBonusCooldownMs()).toBe(6 * 60 * 60 * 1000);
  });

  it('goes back to the shipped values when the sysop clears the form', () => {
    save({ startingChips: 250 });
    save({});

    expect(settings()).toEqual(DEFAULT_SETTINGS);
    expect(calculateEntryFee(1000)).toBe(Math.floor(1000 * ENTRY_FEE_RATE));
  });

  it('loads the settings once, when a player opens the door', () => {
    const source = fs.readFileSync(path.join(DOOR_DIR, 'index.ts'), 'utf8');
    const onStart = source.slice(source.indexOf('door.onStart('));

    expect(onStart.slice(0, 400)).toContain('loadSettings()');
  });
});
