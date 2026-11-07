import { roleSgr, colorName, splitSubFields, renderMessageLine, renderSystemLine } from '../../src/services/chat-federation/ansi-render';

describe('ansi-render', () => {
  it('maps palette indexes to foreground SGR only', () => {
    expect(roleSgr('1')).toBe('\x1b[31m');
    expect(roleSgr('7')).toBe('\x1b[37m');
    expect(roleSgr('8')).toBe('\x1b[90m');
    expect(roleSgr('15')).toBe('\x1b[97m');
    expect(roleSgr('16')).toBeNull();
    expect(roleSgr('')).toBeNull();
  });
  it('never emits a background colour (SGR 40-47, 49)', () => {
    for (let i = 0; i < 16; i++) expect(roleSgr(String(i))).not.toMatch(/\[(4\d)m/);
    expect(renderMessageLine('a', '2', 'x', 0)).not.toMatch(/\[4\dm/);
    expect(renderSystemLine('x')).not.toMatch(/\[4\dm/);
  });
  it('leaves a name without a role plain', () => {
    expect(colorName('bob', '')).toBe('bob');
    expect(colorName('bob', '2')).toBe('\x1b[32mbob\x1b[0m');
  });
  it('splits bang sub-fields', () => {
    expect(splitSubFields('sysop!spam')).toEqual(['sysop', 'spam']);
  });
  it('renders a line ending CRLF', () => {
    expect(renderMessageLine('bob', '', 'hi', 1700000000)).toMatch(/^\[\d\d:\d\d\] bob: hi\r\n$/);
  });
});
