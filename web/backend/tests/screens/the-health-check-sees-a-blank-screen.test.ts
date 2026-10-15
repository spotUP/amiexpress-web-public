/**
 * The board's own blank screens, found on the board rather than in the repo.
 *
 * `the-board-ships-no-blank-screen.test.ts` asks `git ls-files`, which is the
 * right question for what this repository SHIPS. It is not the question for
 * what the BOARD HOLDS: the volume keeps files the image stopped shipping, and
 * an untracked one is invisible to it. An empty `Screens/LOGON.TXT` appeared on
 * the live volume at 14:52 on 2026-09-14, three minutes after the tracked
 * copies were removed, and no test in this repository could have noticed.
 *
 * So the same rule runs as a health check, against the board as it stands.
 * `displayScreen` answers TRUE for any file that opens (express.e:6773) and the
 * flow pauses on that answer, so each of these costs a caller a keypress on a
 * blank terminal.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BBSHealthCheckService } from '../../src/services/bbs-health-check.service';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

/**
 * Every issue the whole report carries, not one category's.
 *
 * The blank-screen finding is raised inside `checkScreenContents`, whose
 * RESULT is called "Screen Contents" while its issues are tagged "Screens" -
 * two names for one thing. Filtering on the result's name found nothing and
 * the negative cases passed vacuously, which is the failure mode a test that
 * only ever asserts absence cannot detect. Reading the whole report and
 * matching the finding itself cannot go quiet that way.
 */
const screensIssues = async () => {
  const report = await new BBSHealthCheckService(root).runFullHealthCheck();
  return report.categories.flatMap(c => c.issues);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'blank-screen-health-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  invalidateScreenIndex();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

describe('a screen that opens and draws nothing', () => {
  it('is reported, with the keypress it costs said out loud', async () => {
    write('Node1/LOGON.TXT', '~\n');

    const blank = (await screensIssues()).filter(i => /draws nothing/.test(i.description));

    expect(blank).toHaveLength(1);
    expect(blank[0].description).toMatch(/logon\.txt/i);
    expect(blank[0].description).toMatch(/keypress for a blank screen/);
    expect(blank[0].severity).toBe('warning');
  });

  it('is never auto-fixed, because deleting a caller\'s screen is a decision', async () => {
    write('Node1/LOGON.TXT', '~\n');

    const blank = (await screensIssues()).find(i => /draws nothing/.test(i.description))!;

    expect(blank.fix).toBeUndefined();
    expect(blank.fixAction).toMatch(/screen manager/);
  });

  it('counts forty-one copies of one screen as one decision', async () => {
    // The shape this board actually had: 41 nodes, one empty Logon.txt each.
    for (let node = 1; node <= 41; node += 1) write(`Node${node}/Logon.txt`, '~\n');

    const blank = (await screensIssues()).filter(i => /draws nothing/.test(i.description));

    expect(blank).toHaveLength(1);
    expect(blank[0].description).toMatch(/40 other copies/);
    expect(blank[0].fixAction).toMatch(/remove all 41/);
  });

  it('leaves a screen that only INCLUDES another alone', async () => {
    // `~f|` + an include is every visible byte of the board bulletin, and it
    // draws: the include puts ink on the screen.
    write('Node1/BULL.TXT', '~f|\n~SS_BBS:Bulletins/bull7.txt\n');

    const blank = (await screensIssues()).filter(i => /draws nothing/.test(i.description));

    expect(blank).toEqual([]);
  });

  it('DOES flag a file of nothing but a clear', async () => {
    // `~f|` alone clears and draws nothing - and it is what the login-sequence
    // picker would leave behind if unticking the last item were allowed.
    write('Node1/LOGOFF.TXT', '~f|\n');

    const blank = (await screensIssues()).filter(i => /draws nothing/.test(i.description));

    expect(blank.map(i => i.description.toLowerCase()).join(' ')).toMatch(/logoff\.txt/);
  });

  it('says nothing about a screen with art in it', async () => {
    write('Node1/BBSTITLE.txt', '\x1b[31mTHE BOARD\n');

    const blank = (await screensIssues()).filter(i => /draws nothing/.test(i.description));

    expect(blank).toEqual([]);
  });
});
