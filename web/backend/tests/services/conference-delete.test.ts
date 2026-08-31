/**
 * Deleting a conference must not scramble the board.
 *
 * What it used to do: delete the conference_config row and unlink
 * Conf<N>.info. ConfConfig.info was untouched - NCONFS unchanged, NAME.<N>
 * and LOCATION.<N> still there - so express.e:31849 went on building the
 * conference into its list, users who had access could still join it, and
 * what they joined had no icon behind it: no NDIRS, no message base, no file
 * paths. A half-deleted conference, on a live board.
 *
 * The constraint that shapes all of this: a conference is a POSITION.
 * express.e:8506 is `user.conferenceAccess[confNum-1]="X"`, so closing a gap
 * by renumbering would shift every account's access by one, silently. Only
 * the last conference can come off.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { ConferenceSetupService } from '../../src/services/conference-setup.service';

function makeBoard(conferences: number): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-delete-'));
  const lines = [`NCONFS=${conferences}`];
  for (let i = 1; i <= conferences; i += 1) {
    lines.push(`NAME.${i}=Conference ${i}`);
    lines.push(`LOCATION.${i}=BBS:Conf${i}`);
  }
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), lines.join('\n') + '\n');
  for (let i = 1; i <= conferences; i += 1) {
    fs.writeFileSync(path.join(root, `Conf${i}.info`), `NDIRS=1\nDLPATH.1=BBS:Conf${i}/Files\n`);
    fs.mkdirSync(path.join(root, `Conf${i}`, 'MsgBase'), { recursive: true });
    fs.writeFileSync(path.join(root, `Conf${i}`, 'MsgBase', '1'), 'a message');
  }
  return root;
}

describe('removing a conference', () => {
  let root: string;

  beforeEach(() => { root = makeBoard(14); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('refuses anything but the last, because access is stored by position', async () => {
    const setup = new ConferenceSetupService(root);

    await expect(setup.removeLastConference(7)).rejects.toThrow(/Only the last conference/);

    // And nothing moved.
    const after = readTooltypeMap(path.join(root, 'ConfConfig.info'));
    expect(after.get('NCONFS')).toBe('14');
    expect(after.get('NAME.7')).toBe('Conference 7');
    expect(after.get('NAME.14')).toBe('Conference 14');
  });

  it('names the reason, so the sysop is not left guessing', async () => {
    const setup = new ConferenceSetupService(root);
    await expect(setup.removeLastConference(3)).rejects.toThrow(/express\.e:8506/);
  });

  it('takes the last one off and leaves every other conference alone', async () => {
    const setup = new ConferenceSetupService(root);

    const { nconfs } = await setup.removeLastConference(14);

    const after = readTooltypeMap(path.join(root, 'ConfConfig.info'));
    expect(nconfs).toBe(13);
    expect(after.get('NCONFS')).toBe('13');
    expect(after.has('NAME.14')).toBe(false);
    expect(after.has('LOCATION.14')).toBe(false);

    // 1..13 untouched, names AND locations.
    for (let i = 1; i <= 13; i += 1) {
      expect(after.get(`NAME.${i}`)).toBe(`Conference ${i}`);
      expect(after.get(`LOCATION.${i}`)).toBe(`BBS:Conf${i}`);
    }
  });

  it('never renumbers, so no account silently changes conference', async () => {
    // The whole reason for the restriction. Conference 13 must still be 13.
    const setup = new ConferenceSetupService(root);
    await setup.removeLastConference(14);

    const after = readTooltypeMap(path.join(root, 'ConfConfig.info'));
    expect(after.get('NAME.13')).toBe('Conference 13');
    expect(after.get('NAME.1')).toBe('Conference 1');
  });

  it('leaves the messages and files where they are', async () => {
    const setup = new ConferenceSetupService(root);
    const { location } = await setup.removeLastConference(14);

    // The caller is told where they are; nothing has been removed.
    expect(location).toBe('BBS:Conf14');
    expect(fs.existsSync(path.join(root, 'Conf14', 'MsgBase', '1'))).toBe(true);
  });

  it('refuses to empty the board', async () => {
    const single = makeBoard(1);
    try {
      const setup = new ConferenceSetupService(single);
      await expect(setup.removeLastConference(1)).rejects.toThrow(/at least one conference/);
    } finally {
      fs.rmSync(single, { recursive: true, force: true });
    }
  });

  it('can be repeated, taking one off each time', async () => {
    const setup = new ConferenceSetupService(root);
    await setup.removeLastConference(14);
    await setup.removeLastConference(13);
    await setup.removeLastConference(12);

    const after = readTooltypeMap(path.join(root, 'ConfConfig.info'));
    expect(after.get('NCONFS')).toBe('11');
    expect(after.has('NAME.12')).toBe(false);
    expect(after.get('NAME.11')).toBe('Conference 11');
  });
});

describe('creating a conference', () => {
  // The mirror of the delete bug. setupConference built the icon, the
  // directory tree, the DIR files and the counters - and never touched
  // ConfConfig.info, the file that decides whether a conference EXISTS.
  // express.e:31849 walks `FOR i:=1 TO cmds.numConf` reading NAME.i and
  // LOCATION.i out of it, so a conference absent from it is invisible to the
  // BBS however complete its directory is.
  let root: string;

  beforeEach(() => { root = makeBoard(3); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('appears in ConfConfig.info, where the BBS looks for it', async () => {
    const setup = new ConferenceSetupService(root);

    await setup.setupConference({
      conferenceId: 4,
      conferenceName: 'Elite',
      location: 'Conf4',
      ndirs: 1,
    });
    await setup.updateConfConfig(4, 'Elite', 'Conf4');

    const after = readTooltypeMap(path.join(root, 'ConfConfig.info'));
    expect(after.get('NCONFS')).toBe('4');
    expect(after.get('NAME.4')).toBe('Elite');
    expect(after.get('LOCATION.4')).toBe('Conf4');
  });

  it('builds what express.e needs on disk', async () => {
    const setup = new ConferenceSetupService(root);
    await setup.setupConference({
      conferenceId: 4, conferenceName: 'Elite', location: 'Conf4', ndirs: 2,
    });

    expect(fs.existsSync(path.join(root, 'Conf4.info'))).toBe(true);
    // express.e:2068 reads <ConfLocation>MsgBase/, :24648 Bulletins/
    expect(fs.existsSync(path.join(root, 'Conf4', 'MsgBase'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'Conf4', 'Bulletins'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'Conf4', 'DIR1'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'Conf4', 'DIR2'))).toBe(true);
  });

  it('will not skip a number and leave a gap', async () => {
    // NCONFS is a COUNT. Registering 6 on a 3-conference board would make the
    // BBS walk 1..6 and find nothing behind 4 and 5.
    const setup = new ConferenceSetupService(root);
    await expect(setup.updateConfConfig(6, 'Too far', 'Conf6')).rejects.toThrow(/too high/i);
  });

  it('round-trips: create it, then remove it, and the board is as it was', async () => {
    const setup = new ConferenceSetupService(root);
    const before = readTooltypeMap(path.join(root, 'ConfConfig.info'));

    await setup.setupConference({ conferenceId: 4, conferenceName: 'Elite', location: 'Conf4', ndirs: 1 });
    await setup.updateConfConfig(4, 'Elite', 'Conf4');
    await setup.removeLastConference(4);

    const after = readTooltypeMap(path.join(root, 'ConfConfig.info'));
    expect(after.get('NCONFS')).toBe(before.get('NCONFS'));
    expect(after.has('NAME.4')).toBe(false);
    for (let i = 1; i <= 3; i += 1) {
      expect(after.get(`NAME.${i}`)).toBe(before.get(`NAME.${i}`));
      expect(after.get(`LOCATION.${i}`)).toBe(before.get(`LOCATION.${i}`));
    }
  });
});
