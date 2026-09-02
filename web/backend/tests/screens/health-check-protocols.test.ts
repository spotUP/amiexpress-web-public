/**
 * The protocol check reads the board's own spelling.
 *
 * "This is weird it says checked 0 but still reports issues: No XPR protocol
 * files found." The board has eight of them - XprZmodem.info, XprYmodem.info,
 * XprKermit.info and the rest - and the check missed every one, because it
 * matched `xpr` in lower case only while AmiExpress writes `Xpr`. The volume is
 * case-insensitive; the check was not.
 *
 * "Checked: 0" came from the same line: it counted the files it MATCHED, so a
 * failed match reported that nothing had been looked at.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BBSHealthCheckService } from '../../src/services/bbs-health-check.service';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'health-protocols-'));
  fs.mkdirSync(path.join(root, 'Protocols'), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

async function protocolsResult(): Promise<{ issues: unknown[]; checkedCount: number }> {
  const report = await new BBSHealthCheckService(root).runFullHealthCheck();
  const category = report.categories.find(c => c.category === 'File Transfer Protocols');
  return category as never;
}

it('finds the protocols the board actually registers, whatever their case', async () => {
  for (const name of ['XprZmodem.info', 'XprYmodem.info', 'XprKermit.info']) {
    fs.writeFileSync(path.join(root, 'Protocols', name), 'x');
  }

  const protocols = await protocolsResult();

  expect(protocols.checkedCount).toBe(3);
  expect(JSON.stringify(protocols.issues)).not.toMatch(/No XPR protocol files/);
});

it('says how many files it looked at, even when it finds no protocol', async () => {
  fs.writeFileSync(path.join(root, 'Protocols', 'Hydra.info'), 'x');

  const protocols = await protocolsResult();

  // It looked at one file and found no XPR in it: "checked 0" was the lie.
  expect(protocols.checkedCount).toBe(1);
  expect(JSON.stringify(protocols.issues)).toMatch(/No XPR protocol files/);
});

/**
 * The same class, twice more.
 *
 * The doors check looked for `doors/` while every board writes `Doors/`, and
 * the screens check reads `Conf1/Screens` by NUMBER - on a renumbered board
 * conference 1 lives in Conf2, which is the mistake this repo keeps meeting.
 */
it('finds the door directory by the name the board writes, not by case', async () => {
  fs.mkdirSync(path.join(root, 'Doors', 'GWall'), { recursive: true });

  const report = await new BBSHealthCheckService(root).runFullHealthCheck();
  const doors = report.categories.find(c => c.category === 'Door Programs');

  expect(JSON.stringify(doors?.issues)).not.toMatch(/directory missing/);
  // The tell on a case-SENSITIVE filesystem, which the container is: the path
  // reported must be the one on disk. `doors` passes on a Mac and fails there.
  expect(JSON.stringify(doors)).not.toMatch(/\/doors/);
});

it('looks for a conference screen where the conference actually lives', async () => {
  // Conference 1 lives in Conf2 here, as it does on the live board.
  fs.writeFileSync(
    path.join(root, 'ConfConfig.info'),
    'NCONFS=1\nNAME.1=Amiga Demoscene\nLOCATION.1=BBS:Conf2/\n',
  );
  fs.mkdirSync(path.join(root, 'Conf2', 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf2', 'Screens', 'MENU.TXT'), 'menu');

  const report = await new BBSHealthCheckService(root).runFullHealthCheck();
  const screens = report.categories.find(c => c.category === 'Screen Files');

  // It looked in Conf2 - where conference 1 lives - and found MENU there, so
  // there is nothing to report. Looking in `Conf1` would have found no
  // directory at all and said nothing, which is worse: a silent pass.
  expect(JSON.stringify(screens)).not.toMatch(/Conf1/);
  expect(screens?.checkedCount).toBeGreaterThan(0);
});
