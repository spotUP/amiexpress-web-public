/**
 * A CONFERENCE READS THE SCREEN DIRECTORY ITS ICON NAMES.
 *
 * "i only need one main menu for the users and one for the sysops is there a
 * central place in amiexpress where screens can live instead of duplicating so
 * much?" (the sysop, 2026-09-17). There is, and this port ignored it.
 *
 * express.e:5052-5054 sets a conference's screen directory on every join:
 *
 *     StrCopy(confScreenDir,currentConfDir)
 *     readToolType(TOOLTYPE_CONF,conf,'SCREENS',confScreenDir)
 *     checkPathSlash(confScreenDir)
 *
 * The conference's own directory is only the DEFAULT. `SCREENS` in
 * `Conf<n>.info` overrides it, and every conference-scoped screen follows -
 * MENU (6560), BULL (6558), JoinMsgBase (6592), DownloadMsg (6598), FileHelp
 * (6601), UploadMsg (6604), NoUploads (6607) and the bulletin tree (24616).
 * Point every conference at one directory and the board has one menu.
 *
 * The node arm of this module has honoured the identical tooltype since the
 * image started collapsing node screens. The conference arm did not, so
 * setting the tooltype on a real board did nothing, and this checkout carries
 * fourteen `Menu.txt` with eleven of them byte-identical.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { screenSearchLocations } from '../../src/screens/screen-resolution';

let root: string;

/** A board with two conferences, the second of which lives out of order. */
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-screens-'));
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf2'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Screens', 'Conf'), { recursive: true });
});

const dirsFor = (confId: number) =>
  screenSearchLocations(root, 'MENU', { nodeId: 1, confId }).map(l => path.resolve(l.dir));

describe('where a conference screen is looked for', () => {
  it('ends at the directory every conference can share', () => {
    // RED before the fix: the list stopped at Conf1 and Conf1/Screens.
    expect(dirsFor(1)).toContain(path.resolve(root, 'Screens', 'Conf'));
  });

  it("puts the conference's own directory FIRST, so its own art is never shadowed", () => {
    const dirs = dirsFor(1);
    const own = dirs.indexOf(path.resolve(root, 'Conf1'));
    const shared = dirs.indexOf(path.resolve(root, 'Screens', 'Conf'));
    expect(own).toBeGreaterThanOrEqual(0);
    expect(own).toBeLessThan(shared);
  });

  it('a board with no shared directory is unchanged', () => {
    fs.rmSync(path.join(root, 'Screens', 'Conf'), { recursive: true, force: true });
    expect(dirsFor(1)).not.toContain(path.resolve(root, 'Screens', 'Conf'));
  });
});

describe('the SCREENS tooltype on a conference icon', () => {
  /** An .info whose tooltype array carries one entry, as applyTooltypes writes it. */
  const writeIcon = (name: string, tooltype: string) => {
    const { applyTooltypes } = require('../../src/utils/info-file.util');
    applyTooltypes(path.join(root, name), [['SCREENS', tooltype]]);
  };

  it('sends the conference somewhere else entirely', () => {
    fs.mkdirSync(path.join(root, 'Screens', 'Shared'), { recursive: true });
    writeIcon('Conf1.info', 'BBS:Screens/Shared/');

    const dirs = dirsFor(1);
    expect(dirs[0]).toBe(path.resolve(root, 'Screens', 'Shared'));
  });

  it('is what makes ONE menu serve every conference', () => {
    // The whole point: both conferences, pointed at one directory, look in the
    // same place first. One MENU.txt, edited once.
    fs.mkdirSync(path.join(root, 'Screens', 'Conf'), { recursive: true });
    writeIcon('Conf1.info', 'BBS:Screens/Conf/');
    writeIcon('Conf2.info', 'BBS:Screens/Conf/');

    const shared = path.resolve(root, 'Screens', 'Conf');
    expect(dirsFor(1)[0]).toBe(shared);
    expect(dirsFor(2)[0]).toBe(shared);
  });

  it('does not offer the shared floor twice when the tooltype already points there', () => {
    writeIcon('Conf1.info', 'BBS:Screens/Conf/');
    const shared = path.resolve(root, 'Screens', 'Conf');
    const dirs = dirsFor(1);
    expect(dirs.filter(d => d === shared)).toHaveLength(1);
  });

  it('a corrupt icon loses the conference nothing', () => {
    fs.writeFileSync(path.join(root, 'Conf1.info'), Buffer.from('not an icon'));
    // Falls back to express.e's own ELSE branch: the conference's directory.
    expect(dirsFor(1)).toContain(path.resolve(root, 'Conf1'));
  });

  it('a conference with no icon at all reads its own directory', () => {
    expect(dirsFor(2)[0]).toBe(path.resolve(root, 'Conf2'));
  });
});
