/**
 * The Auto-Fix button has to actually fix things.
 *
 * Reported from the live board 2026-09-02: four screens whose colour codes had
 * lost the escape byte, each offering "Auto-fix: Put the escape byte back (a
 * backup is written first)", and pressing it changed nothing - "the bbs health
 * checker doesnt manage to autofix these, or anything".
 *
 * The cause was not the repair, which works and is used by the Screen Files
 * page. It was dispatch: autoFixIssue read the issue's PROSE, matched two
 * spellings ('directory missing', 'file missing'), and returned silently for
 * everything else - and autoFixAll counted every return as a fix. So the page
 * reported "47 fixed" over an untouched board, which is worse than having no
 * button at all.
 *
 * These tests drive the service, not the route: what was broken is what
 * autoFixAll does, and a route test would prove only that a request succeeds -
 * which it always did.
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

/** A screen whose CSI sequences kept everything except the escape byte. */
const DAMAGED = '[0;1;31mWELCOME[0m\r\n';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'health-fix-'));
  write('ConfConfig.info', 'NCONFS=1\nNAME.1=Demoscene\nLOCATION.1=BBS:Conf1/\n');
  invalidateScreenIndex();
});

afterEach(() => {
  invalidateScreenIndex();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('auto-fix does what it offers', () => {
  it('puts the escape byte back in a damaged screen', async () => {
    write('Screens/LOGON24.TXT', DAMAGED);

    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();
    const result = await health.autoFixAll(report);

    const after = fs.readFileSync(path.join(root, 'Screens/LOGON24.TXT'), 'latin1');
    expect(after).toContain('\x1b[0;1;31m');
    expect(result.fixed).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
  });

  it('writes a backup before it touches the screen', async () => {
    // The offer says a backup is written first. It has to be true.
    write('Screens/LOGON24.TXT', DAMAGED);

    const health = new BBSHealthCheckService(root);
    await health.autoFixAll(await health.runFullHealthCheck());

    const backup = fs.readFileSync(path.join(root, 'Screens/LOGON24.TXT.backup'), 'latin1');
    expect(backup).toBe(DAMAGED);
  });

  it('reports the screen as repaired the next time it is asked', async () => {
    // The index caches per file, so a repair that does not invalidate it leaves
    // the health page still listing the file it just fixed.
    write('Screens/LOGON24.TXT', DAMAGED);

    const health = new BBSHealthCheckService(root);
    await health.autoFixAll(await health.runFullHealthCheck());
    const after = await health.runFullHealthCheck();

    const stillDamaged = after.categories
      .flatMap(c => c.issues)
      .filter(i => i.description.includes('no escape byte'));
    expect(stillDamaged).toEqual([]);
  });

  it('counts a refused repair as failed, and says why', async () => {
    // A file that already holds escape bytes is refused: a bare [ in it may be
    // art. That refusal must reach the sysop, not be counted as a fix.
    write('Screens/LOGON24.TXT', DAMAGED);

    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();

    // Damaged when the report was taken, repaired by hand before the fix ran.
    write('Screens/LOGON24.TXT', '\x1b[0;1;31mWELCOME\x1b[0m\r\n');

    const result = await health.autoFixAll(report);

    // The rest of this bare board's missing directories still get made; what
    // matters is that the one that could NOT be done is reported as such.
    expect(result.failed).toBe(1);
    expect(result.failures.join(' ')).toContain('already contains escape bytes');
    expect(result.failures.join(' ')).toContain('LOGON24.TXT');
  });

  it('offers no fix it cannot carry out', async () => {
    // The structural rule behind the bug: thirteen issues claimed to be
    // auto-fixable with nothing behind the claim. `autoFixable` is derived from
    // `fix` now, so the button's count is what will actually be acted on.
    write('Screens/LOGON24.TXT', DAMAGED);

    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();

    const claimed = report.categories
      .flatMap(c => c.issues)
      .filter(i => i.autoFixable && !i.fix)
      .map(i => i.description);

    expect(claimed).toEqual([]);
    expect(report.autoFixableIssues).toBeGreaterThan(0);
  });

  it('stops offering to create a bbsConfig.info it cannot write', async () => {
    // writeInfoFile mutates an existing DiskObject; it cannot conjure one. The
    // offer was never real - and an empty file where an icon belongs is worse
    // than a missing one.
    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();

    const core = report.categories
      .flatMap(c => c.issues)
      .filter(i => i.description.includes('bbsConfig.info missing'));

    expect(core).toHaveLength(1);
    expect(core[0].autoFixable).toBe(false);
  });
});

describe('a screen that points at something the board does not have', () => {
  it('is reported, with the code that is dead', async () => {
    // Reported from the live board: the conference-join screen offers a
    // conference request that runs a door this board never installed. A caller
    // presses the key and gets nothing - no error, no message.
    write('Screens/JOINCONF.TXT', '~CC_confrequest|\r\nPick a conference\r\n');

    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();

    const dead = report.categories
      .flatMap(c => c.issues)
      .filter(i => i.description.includes('~CC_confrequest'));

    expect(dead).toHaveLength(1);
    expect(dead[0].description).toContain('JOINCONF.TXT');
    expect(dead[0].severity).toBe('warning');
  });

  it('says nothing about a code whose command IS installed', async () => {
    write('Screens/JOINCONF.TXT', '~CC_confrequest|\r\n');
    write('Commands/BBSCmd/CONFREQUEST.info', 'ACCESS=10\n');

    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();

    const dead = report.categories
      .flatMap(c => c.issues)
      .filter(i => i.description.includes('does not have'));

    expect(dead).toEqual([]);
  });

  it('counts the copies instead of listing them', async () => {
    // 153 files on the live board carry a dead reference and there are exactly
    // four distinct dead codes among them - 42 copies of one Logoff.txt. One
    // issue per copy is a page nobody reads, and the decision is per code.
    for (const node of [1, 2, 3, 4]) {
      write(`Node${node}/Logoff.txt`, '~SS_BBS:screens/gone.txt\r\n');
    }

    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();

    const dead = report.categories
      .flatMap(c => c.issues)
      .filter(i => i.description.includes('~SS_BBS:screens/gone.txt'));

    expect(dead).toHaveLength(1);
    expect(dead[0].description).toContain('3 other screens');
  });

  it('stops reporting it once the command is installed', async () => {
    // The screen's own bytes never change, so a resolution cached with them
    // would outlive the problem: the sysop installs the door, re-runs the
    // check, and is told the same thing about a door now sitting there.
    write('Screens/JOINCONF.TXT', '~CC_confrequest|\r\n');

    const health = new BBSHealthCheckService(root);
    const before = await health.runFullHealthCheck();
    expect(before.categories.flatMap(c => c.issues)
      .some(i => i.description.includes('~CC_confrequest'))).toBe(true);

    write('Commands/BBSCmd/CONFREQUEST.info', 'ACCESS=10\n');
    invalidateScreenIndex();

    const after = await health.runFullHealthCheck();
    expect(after.categories.flatMap(c => c.issues)
      .some(i => i.description.includes('~CC_confrequest'))).toBe(false);
  });

  it('does not offer to fix it, because that is a decision', async () => {
    // Install the door, or stop advertising it. The board cannot choose.
    write('Screens/JOINCONF.TXT', '~CC_confrequest|\r\n');

    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();

    const dead = report.categories
      .flatMap(c => c.issues)
      .find(i => i.description.includes('~CC_confrequest'));

    expect(dead?.autoFixable).toBe(false);
  });
});

/**
 * The other half of the same report: a command whose door is gone.
 *
 * The .info still OWNS the command name - dispatch finds it and answers with
 * an error rather than falling through - so an uninstalled door can shadow a
 * working command. This board has exactly one: BestConf, pointing at a
 * Doors/BestConf that no longer exists.
 */
describe('a command whose door is not installed', () => {
  it('is reported, with the location that no longer resolves', async () => {
    fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
    write('Commands/BBSCmd/BESTCONF.info', 'LOCATION=Doors/BestConf/BestConf.XIM\nTYPE=XIM\n');

    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();

    const dead = report.categories
      .flatMap(c => c.issues)
      .filter(i => i.description.includes('BESTCONF'));

    expect(dead).toHaveLength(1);
    expect(dead[0].description).toContain('its door is not installed');
    expect(dead[0].description).toContain('Doors/BestConf/BestConf.XIM');
  });

  it('leaves a door whose directory is there alone', async () => {
    // A missing FILE inside a door directory is normal: nothing named
    // Doors/bbslink/bbslink has ever existed and 24 live commands point at it.
    fs.mkdirSync(path.join(root, 'Doors', 'bbslink'), { recursive: true });
    write('Commands/BBSCmd/BBSLINK.info', 'LOCATION=Doors/bbslink/bbslink\nTYPE=XIM\n');

    const health = new BBSHealthCheckService(root);
    const report = await health.runFullHealthCheck();

    const dead = report.categories
      .flatMap(c => c.issues)
      .filter(i => i.description.includes('door is not installed'));

    expect(dead).toEqual([]);
  });
});
