/**
 * BUGS raises `door.bugs.update` for the person who reported a bug when
 * someone else changes its status or comments on it (declared in
 * Doors/bug-tracker/door.settings.json). Never for the reporter's own
 * action, an internal sysop note, or an anonymous report.
 */
const { notifyReporter } = require('../../../../board/Doors/bug-tracker/board-announce');

const bug = (over: Record<string, unknown> = {}): any => ({
  id: 7, title: 'Crash on save', reporter: 'dino', status: 'fixed', updatedAt: 99, comments: [{ id: 4 }], ...over,
});
const bbs = () => ({ notify: jest.fn() });

describe('BUGS tells the reporter', () => {
  it('a status change by someone else raises door.bugs.update to the reporter, keyed by the change', () => {
    const b = bbs();
    notifyReporter(b, bug(), 'sysop', { kind: 'status', label: 'Fixed' });
    expect(b.notify).toHaveBeenCalledWith('door.bugs.update', 'dino', expect.objectContaining({ objectId: '7:status:fixed:99', title: 'Bug #7 Fixed' }));
  });

  it('a public comment raises it, keyed by the comment', () => {
    const b = bbs();
    notifyReporter(b, bug(), 'sysop', { kind: 'comment', isInternal: false });
    expect(b.notify).toHaveBeenCalledWith('door.bugs.update', 'dino', expect.objectContaining({ objectId: '7:comment:4' }));
  });

  it('stays silent for the reporter\'s own action, an internal note and an anonymous report', () => {
    const b = bbs();
    notifyReporter(b, bug(), 'dino', { kind: 'status', label: 'Closed' });
    notifyReporter(b, bug(), 'sysop', { kind: 'comment', isInternal: true });
    notifyReporter(b, bug({ reporter: 'Anonymous' }), 'sysop', { kind: 'status', label: 'Fixed' });
    expect(b.notify).not.toHaveBeenCalled();
  });

  it('a board without bbs.notify, or one that throws, never breaks the door', () => {
    expect(() => notifyReporter({}, bug(), 'sysop', { kind: 'status', label: 'Fixed' })).not.toThrow();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => notifyReporter({ notify: () => { throw new Error('x'); } }, bug(), 'sysop', { kind: 'status', label: 'Fixed' })).not.toThrow();
    spy.mockRestore();
  });
});
