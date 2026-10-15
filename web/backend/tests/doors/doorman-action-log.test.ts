import { ActionLog } from '../../../../Doors/door-manager/action-log';

/**
 * "Show a log in doorman and doorrepo in the right panel when deleting doors
 * so the sysop sees what happens. This is the second time doorman wipes out a
 * lot more than it should."
 *
 * A status line saying "Uninstalled WALL" told the sysop nothing about what
 * was touched. These pin what the panel shows instead.
 */
describe('DOORMAN action log', () => {
  it('names every path it touched, one per line', () => {
    const log = new ActionLog('Uninstalling WALL');
    log.ok('removed Commands/BBSCmd/WALL.info');
    log.ok('removed Doors/WALL/');

    const body = log.render();
    expect(body).toContain('Uninstalling WALL');
    expect(body).toContain('removed Commands/BBSCmd/WALL.info');
    expect(body).toContain('removed Doors/WALL/');
    expect(body.split('\n').filter(l => l.includes('[OK]'))).toHaveLength(2);
  });

  it('distinguishes what it skipped from what it removed', () => {
    // A door whose directory was already gone is not the same as one it
    // deleted, and the sysop needs to see which happened.
    const log = new ActionLog('Uninstalling WALL');
    log.ok('removed Commands/BBSCmd/WALL.info');
    log.skip('Doors/WALL/ was not there');

    const body = log.render();
    expect(body).toContain('[OK]');
    expect(body).toContain('[SKIP]');
  });

  it('shows a refusal as a failure with its reason', () => {
    const log = new ActionLog('Uninstalling WALL');
    log.fail('kept the files: install directory is the Doors directory itself, not a door inside it');

    expect(log.render()).toContain('[FAIL]');
    expect(log.render()).toContain('Doors directory itself');
  });

  it('says so plainly when nothing was changed', () => {
    expect(new ActionLog('Uninstalling WALL').render()).toContain('Nothing was changed');
  });

  it('summarises for the status bar', () => {
    const log = new ActionLog('Uninstalling WALL');
    log.ok('removed one');
    log.skip('missed one');

    expect(log.summary()).toBe('1 of 2 steps completed');
  });

  it('uses ASCII markers, not emoji - this renders in a BBS terminal', () => {
    const log = new ActionLog('Uninstalling WALL');
    log.ok('removed Doors/WALL/');
    log.skip('nothing else');
    log.fail('refused');

    expect(log.render()).toMatch(/\[OK\]/);
    expect(log.render()).toMatch(/\[SKIP\]/);
    expect(log.render()).toMatch(/\[FAIL\]/);
    expect(log.render()).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
