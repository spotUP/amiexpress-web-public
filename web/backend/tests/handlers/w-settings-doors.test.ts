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

describe('a settings door says which section it belongs in', () => {
  const session = { user: { secLevel: 10 } };
  test('SETTINGS_SECTION names the section and DESCRIPTION is carried', () => {
    const [entry] = settingsDoorsFor([{ command: 'notify', enabled: true, accessLevel: 1, description: 'How the board reaches you',
      toolTypes: { SETTINGS: 'YES', SETTINGS_LABEL: 'Notifications', SETTINGS_SECTION: 'Communication' } }], session);
    expect(entry).toMatchObject({ command: 'NOTIFY', label: 'Notifications', section: 'Communication', description: 'How the board reaches you' });
  });
  test('no SETTINGS_SECTION is Board settings', () => {
    const [entry] = settingsDoorsFor([{ command: 'x', toolTypes: { SETTINGS: 'YES' } }], session);
    expect(entry.section).toBe('Board settings');
  });
});

/**
 * The board's shipped declarations, read off the .info files it ships - so
 * the feature is in use and a rename of a file is caught here rather than by
 * a caller finding an empty list. A property of the registration, not a
 * pinned board value.
 *
 * WHICH doors: the ones that change what the BOARD does for this caller and
 * whose change outlives the door. The two theme pickers (THEME, the C
 * door, and SCREENTHEME - sysop, 2026-10-14; the TypeScript THEME and the
 * THEMEC command were retired on the live board 2026-10-15), NOTIFY, COSYSOP and ACHIEVE; the last
 * three are also the doors the signup SCRIPT questionnaire runs
 * (`~CC_ACHIEVE`, `~CC_COSYSOP`, `~CC_SCREENTHEME`, `~CC_THEME`).
 */
describe("the board's shipped settings doors", () => {
  const BBSCMD = path.resolve(__dirname, '../../../../board/Commands/BBSCmd');

  const toolTypesOf = (command: string): Record<string, string> => {
    const info = parseInfoFile(path.join(BBSCMD, `${command}.info`));
    const map: Record<string, string> = {};
    for (const tt of info.tooltypes) map[tt.key] = tt.value ?? '';
    return map;
  };

  it.each([
    ['THEME', 'Door colours (C version)', 'Appearance'],
    ['SCREENTHEME', 'Screen artwork', 'Appearance'],
    ['NOTIFY', 'Notifications', 'Communication'],
    ['COSYSOP', 'Co-sysop', 'Communication'],
    ['ACHIEVE', 'Achievements account', 'Board features'],
  ])('%s declares itself under W as %s in %s', (command, label, section) => {
    expect(fs.existsSync(path.join(BBSCMD, `${command}.info`))).toBe(true);
    const toolTypes = toolTypesOf(command);
    expect(toolTypes.SETTINGS).toBe('YES');
    expect(settingsLabelFor({ command, toolTypes })).toBe(label);
    expect(toolTypes.SETTINGS_SECTION).toBe(section);
  });

  it.each(['PROMPTCOMPLETE', 'FRIENDSONLY', 'DOORS', 'GMASTER'])(
    '%s is not a setting, and does not claim to be',
    (command) => {
      const file = path.join(BBSCMD, `${command}.info`);
      if (!fs.existsSync(file)) return; // a board that does not install it
      expect(toolTypesOf(command).SETTINGS).toBeUndefined();
    },
  );
});
