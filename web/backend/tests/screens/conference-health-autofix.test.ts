/**
 * What a conference health check can actually fix.
 *
 * The sysop, from localhost: "i tried health check ... it shows errors, some
 * that should be auto fixable but it didnt work."
 *
 * Two defects, and the report shows both at once:
 *
 * - `canAutoFix` was ONE FLAG PER CONFERENCE. A `Bulletins` that is a file
 *   rather than a directory set it false, and every other issue in that
 *   conference - including "Missing Messages/", which is a mkdir - was then
 *   labelled "Manual fix required". That is why Conf4 offered a fix for
 *   exactly the same missing directory that Conf6 called manual.
 * - Nothing could fix the file-instead-of-a-directory case, even though the
 *   files in question are ZERO BYTES. An empty file standing where a directory
 *   belongs is safe to replace; one with content in it is not, and stays
 *   manual.
 *
 * And the check built `Conf<n>` from the conference NUMBER, which is the
 * mistake this board keeps meeting: conference 1 lives in Conf2 on the live
 * board, so the check read a directory belonging to something else.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConferenceSetupService } from '../../src/services/conference-setup.service';

let root: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-health-'));
  // Conference 1 lives in Conf2, as it does on the live board.
  write('ConfConfig.info', 'NCONFS=1\nNAME.1=Amiga Demoscene\nLOCATION.1=BBS:Conf2/\n');
  write('Conf2.info', 'x');
  fs.mkdirSync(path.join(root, 'Conf2'), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a conference that needs directories', () => {
  test('a missing directory stays fixable even beside one that is a file', () => {
    // The empty file standing where Bulletins should be - eight conferences on
    // the live board are in this state, all of them 0 bytes, dated 2020.
    write('Conf2/Bulletins', '');

    const service = new ConferenceSetupService(root);
    const health = service.checkConferenceHealthSync(1);

    const messages = health.issueList.find(i => i.description.includes('Messages'));
    expect(messages?.autoFixable).toBe(true);
  });

  test('an EMPTY file standing where a directory belongs can be replaced', () => {
    write('Conf2/Bulletins', '');

    const service = new ConferenceSetupService(root);
    const health = service.checkConferenceHealthSync(1);
    const bulletins = health.issueList.find(i => i.description.includes('Bulletins'));

    expect(bulletins?.autoFixable).toBe(true);
  });

  test('a file with CONTENT in it is never replaced silently', () => {
    write('Conf2/Bulletins', 'somebody put a bulletin list here\n');

    const service = new ConferenceSetupService(root);
    const health = service.checkConferenceHealthSync(1);
    const bulletins = health.issueList.find(i => i.description.includes('Bulletins'));

    expect(bulletins?.autoFixable).toBe(false);
  });

  test('reads the directory the conference actually lives in', () => {
    const service = new ConferenceSetupService(root);
    const health = service.checkConferenceHealthSync(1);

    expect(JSON.stringify(health.issueList)).toContain('Conf2');
    expect(JSON.stringify(health.issueList)).not.toContain('Conf1/');
  });
});

describe('fixing it', () => {
  test('creates the directories and replaces the empty files', async () => {
    write('Conf2/Bulletins', '');

    const service = new ConferenceSetupService(root);
    await service.autoFixConference(1, service.checkConferenceHealthSync(1));

    expect(fs.statSync(path.join(root, 'Conf2', 'Bulletins')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(root, 'Conf2', 'Messages')).isDirectory()).toBe(true);
  });

  test('leaves a file with content alone, and says it did', async () => {
    write('Conf2/Bulletins', 'real content\n');

    const service = new ConferenceSetupService(root);
    await service.autoFixConference(1, service.checkConferenceHealthSync(1));

    // The directories it COULD make are made; the file it must not touch is
    // still a file, with its content.
    expect(fs.statSync(path.join(root, 'Conf2', 'Messages')).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(root, 'Conf2', 'Bulletins'), 'latin1')).toBe('real content\n');
  });
});
