/**
 * GANJA WARS runs on what the sysop set, and on its own shipped values when
 * they set nothing (Doors/dopewars/src/settings.ts).
 *
 * Every knob the manifest declares reaches the DopewarsConfig the server is
 * initialised with, which is the only place the game reads turns, cash, debt
 * and the two interest rates from. The manifest is read here too, so a key
 * renamed in one file and not the other fails a test rather than becoming a
 * settings form that edits into the void.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applySettings, configFieldsFrom, loadSettings, DEFAULT_SETTINGS } from '../../../../board/Doors/dopewars/src/settings';

const DOOR_DIR = path.join(__dirname, '../../../../board/Doors/dopewars');
const manifest = JSON.parse(fs.readFileSync(path.join(DOOR_DIR, 'door.settings.json'), 'utf8'));

describe('GANJA WARS settings', () => {
  it('declares exactly the keys the door reads', () => {
    const declared = manifest.settings.map((s: { key: string }) => s.key).sort();

    expect(declared).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('declares the door as the command the board registered', () => {
    expect(manifest.command).toBe('GANJA');
  });

  it('ships defaults that match what the door ran with before it declared any', () => {
    const fromManifest = Object.fromEntries(
      manifest.settings.map((s: { key: string; default: unknown }) => [s.key, s.default]),
    );

    expect(fromManifest).toEqual(DEFAULT_SETTINGS);
  });

  it('runs on the shipped values when the sysop has set nothing', () => {
    expect(applySettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('takes the sysop values', () => {
    expect(applySettings({
      numTurns: 60,
      startCash: 500,
      startDebt: 0,
      debtInterest: 25,
      bankInterest: 0,
      notifyLivechat: false,
    })).toEqual({
      numTurns: 60,
      startCash: 500,
      startDebt: 0,
      debtInterest: 25,
      bankInterest: 0,
      notifyLivechat: false,
    });
  });

  it('refuses a game that ends before it starts', () => {
    expect(applySettings({ numTurns: 0 }).numTurns).toBe(5);
    expect(applySettings({ numTurns: 9000 }).numTurns).toBe(100);
  });

  it('keeps both interest rates a percentage', () => {
    expect(applySettings({ debtInterest: -5 }).debtInterest).toBe(0);
    expect(applySettings({ bankInterest: 400 }).bankInterest).toBe(100);
  });
});

describe('GANJA WARS settings reach the door', () => {
  // The door's own directory is the sysop's live board data in this checkout;
  // the round trip runs on a copy of the door root, which is all the SDK needs
  // to resolve a manifest and the values beside it.
  let doorRoot: string;

  beforeAll(() => {
    doorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dopewars-settings-'));
    fs.copyFileSync(
      path.join(DOOR_DIR, 'door.settings.json'),
      path.join(doorRoot, 'door.settings.json'),
    );
  });

  afterAll(() => {
    fs.rmSync(doorRoot, { recursive: true, force: true });
  });

  it('reads what the admin saved beside the manifest', () => {
    fs.writeFileSync(
      path.join(doorRoot, 'settings.json'),
      JSON.stringify({ numTurns: 60, startCash: 500, notifyLivechat: false }, null, 2),
    );

    expect(loadSettings(doorRoot)).toEqual({
      ...DEFAULT_SETTINGS,
      numTurns: 60,
      startCash: 500,
      notifyLivechat: false,
    });
  });

  it('goes back to the shipped values when the sysop clears the form', () => {
    fs.writeFileSync(path.join(doorRoot, 'settings.json'), '{}');

    expect(loadSettings(doorRoot)).toEqual(DEFAULT_SETTINGS);
  });

  /*
   * REWRITTEN 2026-09-16, and the DOOR changed with it. This used to slice
   * `index.ts` from "door.onStart(" and check that the text mentioned
   * `settings.<key>` once per key - which cannot tell a value that is
   * FORWARDED from one that is merely named, and passes on a line like
   * `numTurns: 30, // was settings.numTurns`.
   *
   * The mapping lives in `configFieldsFrom` now, so the test compares values.
   */
  it('forwards every sysop value into the config the game is initialised with', () => {
    // Values that are not the defaults, so a field wired to the wrong source
    // cannot pass by coincidence.
    const set = {
      numTurns: 61, startCash: 1234, startDebt: 4321,
      debtInterest: 13, bankInterest: 7, notifyLivechat: false,
    };

    expect(configFieldsFrom(set)).toEqual(set);
  });

  it('forwards the shipped values untouched when the sysop set nothing', () => {
    expect(configFieldsFrom(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('carries every declared key, so a new knob cannot be added and dropped', () => {
    // The manifest, the defaults and the config now agree by construction -
    // this is the third side of that triangle.
    expect(Object.keys(configFieldsFrom(DEFAULT_SETTINGS)).sort())
      .toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('is what the door actually builds its config from', () => {
    // The wiring claim, and the one thing a runtime check cannot make from
    // outside: that `onStart` spreads the function rather than rebuilding the
    // literal. One line, not a shape.
    const source = fs.readFileSync(path.join(DOOR_DIR, 'src/index.ts'), 'utf8');
    expect(source).toContain('...configFieldsFrom(settings)');
  });
});
