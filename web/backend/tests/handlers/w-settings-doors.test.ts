/**
 * Doors that register themselves as user settings, and so appear under `W`.
 *
 * "settings like this should live under W - can we make it possible for doors
 * to register under W?" (sysop, 2026-09-07). A door says `SETTINGS=YES` in its
 * own `Commands/BBSCmd/<CMD>.info` and the board lists it where a caller
 * already goes to change what the board does for him. Nothing in the board
 * knows any door by name.
 */
import * as fs from 'fs';
import * as path from 'path';

import { settingsDoorsFor, settingsLabelFor } from '../../src/handlers/commands/w-settings-doors';
import { parseInfoFile } from '../../src/utils/info-file.util';

const door = (over: Record<string, unknown> = {}) => ({
  command: 'SCREENTHEME',
  description: "Pick which set of the board's art you are shown",
  accessLevel: 1,
  enabled: true,
  toolTypes: { SETTINGS: 'YES', SETTINGS_LABEL: 'Screen artwork' },
  ...over,
});

const caller = (secLevel = 255) => ({ user: { secLevel } });

describe('which doors the W menu lists', () => {
  it('lists a door that declares itself a setting', () => {
    expect(settingsDoorsFor([door()], caller()).map((e) => e.command)).toEqual(['SCREENTHEME']);
  });

  it('lists no door that has not declared it', () => {
    // Every .info on the board is silent about SETTINGS, and a boolean
    // tooltype cannot default to true here: absent means "not declared".
    expect(settingsDoorsFor([door({ toolTypes: { MIN_COLUMNS: '40' } })], caller())).toEqual([]);
    expect(settingsDoorsFor([door({ toolTypes: null })], caller())).toEqual([]);
  });

  it('reads the declaration however the .info spells it', () => {
    for (const value of ['YES', 'yes', 'TRUE', '1', '']) {
      expect(settingsDoorsFor([door({ toolTypes: { settings: value } })], caller())).toHaveLength(1);
    }
    expect(settingsDoorsFor([door({ toolTypes: { SETTINGS: 'NO' } })], caller())).toHaveLength(0);
  });

  it('does not offer a door this caller cannot open', () => {
    expect(settingsDoorsFor([door({ accessLevel: 200 })], caller(100))).toEqual([]);
    expect(settingsDoorsFor([door({ accessLevel: 200 })], caller(255))).toHaveLength(1);
  });

  it('leaves a disabled door out', () => {
    expect(settingsDoorsFor([door({ enabled: false })], caller())).toEqual([]);
  });

  it('orders by the label the caller reads, so the list does not move about', () => {
    const doors = [
      door({ command: 'ZED', toolTypes: { SETTINGS: 'YES', SETTINGS_LABEL: 'Zoo mail' } }),
      door({ command: 'ALPHA', toolTypes: { SETTINGS: 'YES', SETTINGS_LABEL: 'Artwork' } }),
    ];
    expect(settingsDoorsFor(doors, caller()).map((e) => e.label)).toEqual(['Artwork', 'Zoo mail']);
  });
});

describe('what the row says', () => {
  it('is the label the door chose', () => {
    expect(settingsLabelFor(door())).toBe('Screen artwork');
  });

  it('falls back to the description, then to the command', () => {
    expect(settingsLabelFor(door({ toolTypes: { SETTINGS: 'YES' } })))
      .toBe("Pick which set of the board's art you are shown");
    expect(settingsLabelFor({ command: 'colours', toolTypes: { SETTINGS: 'YES' } })).toBe('COLOURS');
  });
});

/**
 * The board's own two pickers, read off the .info files it ships - so the
 * feature is not merely possible but actually in use, and a rename of either
 * file is caught here rather than by a caller finding an empty list.
 */
/**
 * WHICH doors are settings, decided once by reading the whole roster
 * (2026-09-07, at the sysop's request: "audit what other doors should have
 * user settings registered in W and register them").
 *
 * Three qualify, and the reason is the same for each: they change what the
 * BOARD does for this caller, and the change outlives the door.
 *
 *   SCREENTHEME  which set of the board's art he is shown
 *   THEME        the colours the doors are drawn with
 *   ACHIEVE      the account this board reports his achievements to
 *
 * The rest of the roster is games, chat, viewers, sysop tools and the
 * batch-registered DayDream imports: none of them remembers anything about
 * the caller. Two are deliberately NOT registered:
 *
 *   THEMEC       the same setting as THEME, in C. Two rows for one choice is
 *                worse than one, and this port exists to prove the C SDK.
 *   PROMPTCOMPLETE  a board-wide feature a door PROVIDES, not a per-caller
 *                setting. If it ever gains an on/off it belongs here.
 */
describe("the board's shipped settings doors", () => {
  const BBSCMD = path.resolve(__dirname, '../../../../Commands/BBSCmd');

  const toolTypesOf = (command: string): Record<string, string> => {
    const info = parseInfoFile(path.join(BBSCMD, `${command}.info`));
    const map: Record<string, string> = {};
    for (const tt of info.tooltypes) map[tt.key] = tt.value ?? '';
    return map;
  };

  it.each([
    ['SCREENTHEME', 'Screen artwork'],
    ['THEME', 'Door colours'],
    ['ACHIEVE', 'Achievements account'],
  ])('%s declares itself a setting and names its row', (command, label) => {
    expect(fs.existsSync(path.join(BBSCMD, `${command}.info`))).toBe(true);
    const toolTypes = toolTypesOf(command);
    expect(toolTypes.SETTINGS).toBe('YES');
    expect(settingsLabelFor({ command, toolTypes })).toBe(label);
  });

  it.each(['THEMEC', 'PROMPTCOMPLETE', 'DOORS', 'GMASTER'])(
    '%s is not a setting, and does not claim to be',
    (command) => {
      const file = path.join(BBSCMD, `${command}.info`);
      if (!fs.existsSync(file)) return; // a board that does not install it
      expect(toolTypesOf(command).SETTINGS).toBeUndefined();
    },
  );
});
