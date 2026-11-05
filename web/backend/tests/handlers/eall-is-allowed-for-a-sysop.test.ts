/**
 * A level-255 sysop may address a message to EVERYONE.
 *
 * Reported live on 2026-09-08: SUBS hands "EALL" back with RETURNCOMMAND, the
 * board echoes it at the To: prompt as express does (express.e:10762-10774),
 * and the answer was `User does not exist!!` - express.e:10814, the branch
 * taken when ACS_EALL_MESSAGES is not granted. The board's own
 * Access/ACS.255.info grants it.
 *
 * The permission is read through the ACS loader, so this drives the loader on
 * a board root of its own and asks checkSecurity the question the message
 * entry asks. A denial here is a code fault; a pass means the live board
 * answered from an ACS set that was never loaded - findAcsLevel returns -1
 * before the files are read, and every ACS check then denies (the same shape
 * that locked the sysop out of j/who/b/r on live for months,
 * acs.util.ts:468-486).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkSecurity } from '../../src/utils/acs.util';
import { ACSPermission } from '../../src/constants/acs-permissions';
import {
  loadAcsAccessFiles,
  isAcsLoaded,
  findAcsLevel,
  checkAcsPermission,
  resetAcsLoader,
} from '../../src/utils/acs-access-loader';

/** The board's own ACS.255.info, on a root of its own. */
function boardWithSysopAccess(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acs-eall-'));
  fs.mkdirSync(path.join(root, 'Access'), { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'board', 'Access', 'ACS.255.info'),
    path.join(root, 'Access', 'ACS.255.info'),
  );
  return root;
}

const sysop = {
  id: 'u-sysop',
  username: 'sysop',
  secLevel: 255,
  securityFlags: null,
  secOverride: null,
} as any;

describe('EALL and the sysop', () => {
  let root: string;

  beforeAll(() => {
    root = boardWithSysopAccess();
    loadAcsAccessFiles(root);
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('reads the board access files before it answers anything', () => {
    expect(isAcsLoaded()).toBe(true);
    expect(findAcsLevel(255)).toBe(255);
  });

  it('grants EALL to level 255, which is what the .info says', () => {
    expect(checkAcsPermission(255, 'ACS.EALL_MESSAGES')).toBe(true);
  });

  it('lets the sysop address EVERYONE - the check message entry makes', () => {
    // express.e:10810. False here is `User does not exist!!` on the caller's
    // screen, for a board that granted the permission.
    expect(checkSecurity(sysop, ACSPermission.EALL_MESSAGES)).toBe(true);
  });

  it('is denied to a user whose level the board gave no access file', () => {
    expect(checkSecurity({ ...sysop, secLevel: 20 }, ACSPermission.EALL_MESSAGES)).toBe(false);
  });
});

describe('a session that never came through login', () => {
  /**
   * The board restarts under a caller - a deploy does that several times an
   * evening - and the session is rebuilt without running initializeSecurity,
   * which was the only place the access files were read. Every ACS check then
   * answered from an empty set, which denies everything.
   */
  const root = boardWithSysopAccess();

  beforeAll(() => {
    resetAcsLoader();
    process.env.BBS_ROOT = root;
  });

  afterAll(() => {
    delete process.env.BBS_ROOT;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('still grants what the board granted, because the check reads the files', () => {
    expect(isAcsLoaded()).toBe(false);

    expect(checkSecurity(sysop, ACSPermission.EALL_MESSAGES)).toBe(true);
    expect(isAcsLoaded()).toBe(true);
  });
});
