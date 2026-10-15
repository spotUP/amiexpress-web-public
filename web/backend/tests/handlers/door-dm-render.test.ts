// @ts-nocheck

describe('formatDmLine', () => {
  let formatDmLine: (d: any) => string;
  beforeAll(() => {
    formatDmLine = require('../../../../Doors/livechat/handlers/dm-render').formatDmLine;
  });

  it('renders 1:1 sent DM with magenta', () => {
    const line = formatDmLine({ direction: 'sent', to: 'bob', message: 'hi', isGroup: false, delivered: true });
    expect(line).toMatch(/\[DM to bob\]: hi/);
    expect(line).toMatch(/\{magenta-fg\}/);
  });

  it('renders 1:1 received DM with cyan', () => {
    const line = formatDmLine({ direction: 'received', from: 'alice', message: 'hi', isGroup: false });
    expect(line).toMatch(/\[DM from alice\]: hi/);
    expect(line).toMatch(/\{cyan-fg\}/);
  });

  it('renders sent DM with offline hint when delivered=false', () => {
    const line = formatDmLine({ direction: 'sent', to: 'bob', message: 'hi', isGroup: false, delivered: false });
    expect(line).toMatch(/\(offline\)/);
  });

  it('renders group DM with participant list (sent)', () => {
    const line = formatDmLine({ direction: 'sent', participants: ['bob', 'charlie'], message: 'hi team', isGroup: true });
    expect(line).toMatch(/\[Group DM to bob, charlie\]: hi team/);
  });

  it('renders group DM with sender name (received)', () => {
    const line = formatDmLine({ direction: 'received', from: 'alice', message: 'hi team', isGroup: true });
    expect(line).toMatch(/\[Group DM from alice\]: hi team/);
  });

  it('renders group received in cyan, not magenta', () => {
    const line = formatDmLine({ direction: 'received', from: 'alice', message: 'hi', isGroup: true });
    expect(line).toMatch(/\{cyan-fg\}/);
    expect(line).not.toMatch(/^\{magenta-fg\}/);
  });

  it('renders group sent with offline hint when delivered=false', () => {
    const line = formatDmLine({ direction: 'sent', participants: ['bob', 'charlie'], message: 'hi', isGroup: true, delivered: false });
    expect(line).toMatch(/\(offline\)/);
  });

  it('falls back to "?" for missing from in 1:1 received', () => {
    const line = formatDmLine({ direction: 'received', message: 'hi', isGroup: false });
    expect(line).toMatch(/\[DM from \?\]/);
  });

  it('falls back to "?" for missing to in 1:1 sent', () => {
    const line = formatDmLine({ direction: 'sent', message: 'hi', isGroup: false });
    expect(line).toMatch(/\[DM to \?\]/);
  });

  it('falls back to "(none)" for empty participants array on group', () => {
    const line = formatDmLine({ direction: 'sent', participants: [], message: 'hi', isGroup: true });
    expect(line).toMatch(/\[Group DM to \(none\)\]/);
  });
});
