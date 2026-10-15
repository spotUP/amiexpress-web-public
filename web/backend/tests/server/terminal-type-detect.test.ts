import { classifyTerminalType } from '../../src/server/telnet-server';

describe('classifyTerminalType', () => {
  it('XTERM is unicode-capable (regression: substring TERM matched isAmiga)', () => {
    expect(classifyTerminalType('XTERM-256COLOR').unicodeCapable).toBe(true);
  });
  it('bare TERM (Amiga Term) is not unicode-capable', () => {
    expect(classifyTerminalType('TERM').unicodeCapable).toBe(false);
  });
  it('C64 TTYPEs are C64', () => {
    expect(classifyTerminalType('CGTERM-C64').isC64).toBe(true);
  });
});
