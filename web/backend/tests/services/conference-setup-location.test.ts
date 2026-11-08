/**
 * A NEW CONFERENCE LIVES WHERE ITS LOCATION SAYS - not in a directory named
 * after the Amiga path.
 *
 * The admin create form registers `LOCATION.6=BBS:Conf6/`. setupConference
 * built the directory with path.join(bbsRoot, 'BBS:Conf6/'), so on the live
 * board DIR1, Files, Messages, MsgBase, Bulletins and NumULs landed in
 * /app/data/bbs/BBS:Conf6/ while every reader resolves BBS: to the board root
 * and opened /app/data/bbs/Conf6/ - empty.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConferenceSetupService } from '../../src/services/conference-setup.service';
import { parseInfoFile } from '../../src/utils/info-file.util';

/** A real Conf icon the board ships: a binary DiskObject with an image. */
const SHIPPED_ICON = path.resolve(__dirname, '../../../../board/Conf1.info');

describe('setupConference with an Amiga LOCATION', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-setup-location-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves BBS: to the board root instead of minting a BBS:Conf6 directory', async () => {
    await new ConferenceSetupService(root).setupConference({
      conferenceId: 6,
      conferenceName: 'Scene Tools',
      location: 'BBS:Conf6/',
      ndirs: 1,
    });

    expect(fs.existsSync(path.join(root, 'BBS:Conf6'))).toBe(false);
    for (const entry of ['DIR1', 'Files', 'Messages', 'MsgBase', 'Bulletins', 'NumULs']) {
      expect(fs.existsSync(path.join(root, 'Conf6', entry))).toBe(true);
    }
  });

  it('writes Conf N.info as a real icon copied from a sibling, carrying only its own tooltypes', async () => {
    // Before: 140 bytes of KEY=VALUE text, unlike the binary Conf1-5.info.
    fs.copyFileSync(SHIPPED_ICON, path.join(root, 'Conf1.info'));
    const sibling = parseInfoFile(path.join(root, 'Conf1.info'));
    expect(sibling.isBinary).toBe(true);

    await new ConferenceSetupService(root).setupConference({
      conferenceId: 6,
      conferenceName: 'Scene Tools',
      location: 'BBS:Conf6/',
      ndirs: 1,
    });

    const info = parseInfoFile(path.join(root, 'Conf6.info'));
    expect(info.isBinary).toBe(true);
    const keys = info.tooltypes.filter(tt => !tt.commented).map(tt => `${tt.key}=${tt.value}`);
    expect(keys).toContain('NAME=Scene Tools');
    expect(keys).toContain('LOCATION=BBS:Conf6/');
    // Nothing of Conf1's settings rides along on the copy.
    const ownKeys = new Set(['NAME', 'LOCATION', 'NDIRS', 'MIN_ACCESS', 'MAX_ACCESS', 'DLPATH.1', 'ULPATH.1']);
    expect(info.tooltypes.filter(tt => !ownKeys.has(tt.key))).toEqual([]);
  });
});
