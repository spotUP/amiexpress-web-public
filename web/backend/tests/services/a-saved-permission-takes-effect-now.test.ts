/**
 * Saving a security level changes the board, not just the file.
 *
 * `acs-access-loader` parses Access/ every file into a map on the first
 * permission check and never looks at the directory again. The admin's
 * Security page writes ACS.<level>.info and reported success - and the running
 * board went on answering from the map it had read at startup. The sysop
 * ticked ACS.OVERRIDE_TIMELIMIT, the file on disk said so, and the board kept
 * disconnecting people at sixty minutes until something restarted it.
 *
 * Whoever writes one of these files now invalidates the cache, so the next
 * permission check re-reads the directory.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkSecurity } from '../../src/utils/acs.util';
import { ACSPermission } from '../../src/constants/acs-permissions';
import {
  loadAcsAccessFiles,
  resetAcsLoader,
  invalidateAcsIfAccessFile,
} from '../../src/utils/acs-access-loader';
import { parseInfoFile, writeInfoFile } from '../../src/utils/info-file.util';
import { setBoardRoot } from '../helpers/board-root';
import {
  acsLevelFilePath,
  flagsToTooltypes,
  saveAcsLevelFlags,
} from '../../src/services/config-services/acs-level-file.service';

const BOARD = path.join(__dirname, '..', '..', '..', '..');
const TIMELIMIT = 'ACS.OVERRIDE_TIMELIMIT';

/** A board with one real ACS file, on a root of its own. */
function boardWithLevel(level: number): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acs-save-'));
  fs.mkdirSync(path.join(root, 'Access'), { recursive: true });
  fs.copyFileSync(
    path.join(BOARD, 'board', 'Access', `ACS.${level}.info`),
    acsLevelFilePath(root, level),
  );
  return root;
}

/**
 * The save the admin performs. PUT /config/security/levels/:level is a call to
 * this and nothing else, so driving it here drives the route's whole body.
 */
function grantOnDisk(root: string, level: number, flag: string): string {
  return saveAcsLevelFlags(root, level, { [flag]: true }).file;
}

describe('a permission saved from the admin', () => {
  let root: string;
  let restoreBoard: () => void;
  const caller = {
    id: 'u-50',
    username: 'scener',
    secLevel: 50,
    securityFlags: null,
    secOverride: null,
  } as any;

  beforeEach(() => {
    root = boardWithLevel(50);
    resetAcsLoader();
    restoreBoard = setBoardRoot(root);
    loadAcsAccessFiles(root);
  });

  afterEach(() => {
    restoreBoard();
    fs.rmSync(root, { recursive: true, force: true });
    resetAcsLoader();
  });

  it('is not granted before it is saved', () => {
    expect(checkSecurity(caller, ACSPermission.OVERRIDE_TIMELIMIT)).toBe(false);
  });

  it('reaches the running board without a restart', () => {
    grantOnDisk(root, 50, TIMELIMIT);

    // The defect was here: the file said yes and the board went on saying no,
    // because nothing told it the file had changed.
    expect(checkSecurity(caller, ACSPermission.OVERRIDE_TIMELIMIT)).toBe(true);
  });

  it('is the clearing that does it - the write alone never did', () => {
    // The old save, reproduced: parse, apply, write, stop. The file now grants
    // the permission and the board still refuses it, which is the whole defect.
    const file = acsLevelFilePath(root, 50);
    const info = parseInfoFile(file);
    info.tooltypes = flagsToTooltypes(info.tooltypes as any, { [TIMELIMIT]: true }) as any;
    writeInfoFile(info);

    expect(checkSecurity(caller, ACSPermission.OVERRIDE_TIMELIMIT)).toBe(false);

    expect(invalidateAcsIfAccessFile(file)).toBe(true);
    expect(checkSecurity(caller, ACSPermission.OVERRIDE_TIMELIMIT)).toBe(true);
  });

  it('leaves the other permissions in the file exactly as they were', () => {
    const before = checkSecurity(caller, ACSPermission.DOWNLOAD);
    const file = grantOnDisk(root, 50, TIMELIMIT);
    invalidateAcsIfAccessFile(file);

    expect(checkSecurity(caller, ACSPermission.DOWNLOAD)).toBe(before);
  });
});

describe('what counts as an access file', () => {
  it('is an ACS level file', () => {
    expect(invalidateAcsIfAccessFile('/board/Access/ACS.255.info')).toBe(true);
  });

  it('is Default.info, which checkSecurity also reads', () => {
    expect(invalidateAcsIfAccessFile('/board/Access/Default.info')).toBe(true);
  });

  it('is not an AREA file, which holds conference access and not permissions', () => {
    expect(invalidateAcsIfAccessFile('/board/Access/AREA.Elite.info')).toBe(false);
  });

  it('is not a door icon - the generic .info editor writes those all day', () => {
    expect(invalidateAcsIfAccessFile('/board/Doors/BULLS/BULLS.info')).toBe(false);
  });

  it('is not an ACS-looking name outside the Access directory', () => {
    expect(invalidateAcsIfAccessFile('/board/Doors/ACS.10.info')).toBe(false);
  });
});
