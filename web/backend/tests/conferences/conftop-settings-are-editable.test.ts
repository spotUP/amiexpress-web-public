/**
 * Editing ConfTop's settings without hand-editing a binary icon.
 *
 * "add the door setting to our admin web ui" (the sysop, 2026-09-14), after
 * `ROWS=20` on a 25-row terminal cut the top off the conference-join bulletin
 * and the only way to change it was to copy icons onto the live volume.
 *
 * Two properties carry this, and both are about NOT losing things:
 *
 *  - A save writes the fields it was given and leaves every other tooltype
 *    alone. ConfTop has settings this form does not model - SHARE_DATA,
 *    EXCLUDE_<n>, PLAYPEN_<n>, CONFNAME - and a form that dropped them would
 *    break a board to change one number.
 *  - A flag is its PRESENCE. ConfTop reads SKIP_EMPTY_LINES with
 *    FindToolType, so off means the line is gone, not `=0`.
 *
 * The height rule is enforced in the service rather than the form, because
 * the icon is reachable by more routes than one page.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readConftopSettings,
  writeConftopSettings,
  conftopHeight,
  MAX_FITTING_ROWS,
  CONFTOP_CHROME_ROWS,
} from '../../src/conferences/conftop-settings';

/** A board with one conference directory, and the icon inside it. */
function boardWithIcon(tooltypes: string[]): { root: string; icon: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conftop-'));
  const dir = path.join(root, 'Conf1');
  fs.mkdirSync(dir, { recursive: true });
  // A TEXT .info: the parser takes either, and a text fixture keeps this test
  // about the tooltypes rather than about Amiga icon binary layout.
  fs.writeFileSync(path.join(dir, 'Conftop.info'), tooltypes.join('\n') + '\n', 'latin1');
  fs.writeFileSync(
    path.join(root, 'ConfConfig.info'),
    ['NCONFS=1', `LOCATION.1=${dir}`].join('\n') + '\n',
    'latin1',
  );
  return { root, icon: path.join(dir, 'Conftop.info') };
}

const lines = (icon: string) =>
  fs.readFileSync(icon, 'latin1').split('\n').map(l => l.trim()).filter(Boolean);

describe("a conference's top-uploaders settings", () => {
  it('are read off the icon the door reads', () => {
    const { root } = boardWithIcon(['DAYS=WEEKLY', 'ROWS=12', 'MAILUSER=eall', 'SKIP_EMPTY_LINES']);

    const settings = readConftopSettings(root, 1);

    expect(settings.present).toBe(true);
    expect(settings.rows).toBe(12);
    expect(settings.days).toBe('WEEKLY');
    expect(settings.mailUser).toBe('eall');
    expect(settings.skipEmptyLines).toBe(true);
    expect(settings.showResetDate).toBe(false);
  });

  it('say how tall the bulletin will be', () => {
    // The arithmetic the sysop had to discover from a screenshot.
    const { root } = boardWithIcon(['ROWS=12']);

    expect(readConftopSettings(root, 1).height).toBe(CONFTOP_CHROME_ROWS + 12);
    expect(readConftopSettings(root, 1).fits).toBe(true);
  });

  it('report a height that does not fit as not fitting', () => {
    // The state the live board was in: 6 + 20 = 26 lines at a 25-line caller.
    const { root } = boardWithIcon(['ROWS=20']);

    const settings = readConftopSettings(root, 1);

    expect(settings.height).toBe(26);
    expect(settings.fits).toBe(false);
  });

  it('refuse a row count that cannot fit the caller', () => {
    const { root } = boardWithIcon(['ROWS=12']);

    expect(() => writeConftopSettings(root, 1, { rows: 20 })).toThrow(/most that fits is/i);
    // And the icon is untouched by the refusal.
    expect(readConftopSettings(root, 1).rows).toBe(12);
  });

  it('keep the settings this form does not model', () => {
    // The property that makes editing an icon safe at all.
    const { root, icon } = boardWithIcon([
      'DAYS=WEEKLY', 'ROWS=20', 'SHARE_DATA=BBS2:', 'EXCLUDE_1=sysop', 'CONFNAME=Internal',
    ]);

    writeConftopSettings(root, 1, { rows: 12 });

    expect(lines(icon)).toEqual(
      expect.arrayContaining(['SHARE_DATA=BBS2:', 'EXCLUDE_1=sysop', 'CONFNAME=Internal']),
    );
    expect(readConftopSettings(root, 1).rows).toBe(12);
  });

  it('write a flag as a bare line, the way the door reads it', () => {
    // FindToolType answers presence: `SKIP_EMPTY_LINES=0` would read as ON.
    const { root, icon } = boardWithIcon(['ROWS=12']);

    writeConftopSettings(root, 1, { skipEmptyLines: true });

    expect(lines(icon)).toContain('SKIP_EMPTY_LINES');
    expect(lines(icon).some(l => /^SKIP_EMPTY_LINES=/.test(l))).toBe(false);
  });

  it('turn a flag off by taking the line out', () => {
    const { root, icon } = boardWithIcon(['ROWS=12', 'SKIP_EMPTY_LINES']);

    writeConftopSettings(root, 1, { skipEmptyLines: false });

    expect(lines(icon)).not.toContain('SKIP_EMPTY_LINES');
    expect(readConftopSettings(root, 1).skipEmptyLines).toBe(false);
  });

  it('leave a field alone when the save does not mention it', () => {
    // A partial save is the normal case - the form sends what it holds.
    const { root } = boardWithIcon(['ROWS=12', 'DAYS=WEEKLY', 'MAILUSER=eall']);

    writeConftopSettings(root, 1, { rows: 10 });

    const settings = readConftopSettings(root, 1);
    expect(settings.days).toBe('WEEKLY');
    expect(settings.mailUser).toBe('eall');
  });

  it('clear a scalar when it is set to nothing', () => {
    const { root, icon } = boardWithIcon(['ROWS=12', 'MIN_LIMIT=1024']);

    writeConftopSettings(root, 1, { minLimit: null });

    expect(lines(icon).some(l => l.startsWith('MIN_LIMIT'))).toBe(false);
  });

  it('say a conference does not run ConfTop rather than inventing an icon', () => {
    // Creating the icon is how the door is INSTALLED (Conftop.Guide), which
    // is more than a settings form should do on its own.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conftop-'));
    const dir = path.join(root, 'Conf1');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ConfConfig.info'),
      ['NCONFS=1', `LOCATION.1=${dir}`].join('\n') + '\n',
      'latin1',
    );

    expect(readConftopSettings(root, 1).present).toBe(false);
    expect(() => writeConftopSettings(root, 1, { rows: 10 })).toThrow(/does not run ConfTop/i);
    expect(fs.existsSync(path.join(dir, 'Conftop.info'))).toBe(false);
  });

  it('agree with the budget the board actually has', () => {
    // 25 rows, less the six the join prints after the bulletin, less ConfTop's
    // own six of chrome.
    expect(conftopHeight(MAX_FITTING_ROWS)).toBe(25 - 6);
  });
});
