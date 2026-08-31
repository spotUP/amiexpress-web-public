/**
 * ENTER on DOORMAN's list runs the selected door.
 *
 * The mechanics are the reason this logic is worth testing away from blessed.
 * bbs.executeCommand() does NOT launch the door inline: while inDoorManager
 * is set it queues the command and the BBS runs it once DOORMAN exits. Two
 * 68K doors cannot share a node, so queue-then-exit is the only order that
 * works - and it means anything the BBS says about the command arrives after
 * DOORMAN has closed, where it reads as DOORMAN having crashed.
 *
 * So the cases that can be detected are refused up front, while there is
 * still a status line to show them on, and the view is only torn down once
 * the command is actually queued.
 */
import { decideRun, runSelectedDoor } from '../../../Doors/door-manager/run-door';

describe('decideRun', () => {
  it('accepts an ordinary door and hands back its command', () => {
    expect(decideRun({ command: 'AEHELP', enabled: true })).toEqual({
      ok: true,
      command: 'AEHELP',
    });
  });

  it('treats a door with no explicit enabled flag as runnable', () => {
    // Amiga doors are registered without one; only an explicit false means
    // the sysop took it out of service.
    expect(decideRun({ command: 'WALL' })).toEqual({ ok: true, command: 'WALL' });
  });

  it('refuses a disabled door, naming it', () => {
    const d = decideRun({ command: 'WALL', enabled: false });
    expect(d.ok).toBe(false);
    expect((d as { reason: string }).reason).toContain('WALL');
  });

  it('refuses an entry with no command', () => {
    // The list has shown phantoms before; a blank command would queue an
    // empty command line.
    expect(decideRun({ command: '   ', enabled: true }).ok).toBe(false);
    expect(decideRun({ enabled: true }).ok).toBe(false);
  });

  it('refuses when nothing is selected', () => {
    expect(decideRun(null).ok).toBe(false);
  });

  it('trims the command it returns', () => {
    expect(decideRun({ command: '  AEHELP  ' })).toEqual({ ok: true, command: 'AEHELP' });
  });
});

describe('runSelectedDoor', () => {
  function ctx(door: any, executeCommand = jest.fn()) {
    const setStatus = jest.fn();
    const teardown = jest.fn();
    return { door, executeCommand, setStatus, teardown };
  }

  it('queues the command and then tears the view down', () => {
    const c = ctx({ command: 'AEHELP', enabled: true });

    expect(runSelectedDoor(c)).toBe(true);
    expect(c.executeCommand).toHaveBeenCalledWith('AEHELP');
    expect(c.teardown).toHaveBeenCalledTimes(1);
    expect(c.setStatus).not.toHaveBeenCalled();
  });

  it('does NOT tear down when it refuses', () => {
    // Tearing down on a refusal would close DOORMAN and leave the sysop
    // staring at a menu with no idea why nothing ran.
    const c = ctx({ command: 'WALL', enabled: false });

    expect(runSelectedDoor(c)).toBe(false);
    expect(c.executeCommand).not.toHaveBeenCalled();
    expect(c.teardown).not.toHaveBeenCalled();
    expect(c.setStatus).toHaveBeenCalledTimes(1);
  });

  it('does not tear down when queueing throws', () => {
    const c = ctx({ command: 'AEHELP' }, jest.fn(() => { throw new Error('no session'); }));

    expect(runSelectedDoor(c)).toBe(false);
    expect(c.teardown).not.toHaveBeenCalled();
    expect(c.setStatus.mock.calls[0][0]).toContain('AEHELP');
    expect(c.setStatus.mock.calls[0][1]).toBe('red');
  });

  it('reports a refusal in yellow and a failure in red', () => {
    const refused = ctx({ command: 'WALL', enabled: false });
    runSelectedDoor(refused);
    expect(refused.setStatus.mock.calls[0][1]).toBe('yellow');
  });
});
