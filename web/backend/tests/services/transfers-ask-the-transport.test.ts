/**
 * Which transfer protocols a caller is offered.
 *
 * "about the transfers, yes fix it for petscii browser users as well" (sysop,
 * 2026-09-07). The picker asked `petsciiMode`, which is a question about
 * GLYPHS, and defaulted every PETSCII caller to Punter with no ZMODEM on the
 * list. A caller who answered `P` or `P8` in the web terminal is a browser -
 * packages/terminal ships zmodem.js - and a real Commodore is the one that
 * cannot do better than Punter.
 *
 * So the question is the TRANSPORT, and `terminalType === 'c64'` is what the
 * TTYPE handshake and the DEL-probe stamp on real hardware.
 */
import { getDefaultProtocol, getAvailableProtocols } from '../../src/services/transfer-protocol.service';

/** A real C64 over telnet: PETSCII glyphs AND Commodore hardware. */
const realC64 = { petsciiMode: true, terminalType: 'c64', connectionType: 'telnet' } as any;
/** The web terminal after `P` or `P8`: PETSCII glyphs, browser transport. */
const petsciiBrowser = { petsciiMode: true, connectionType: 'web' } as any;
const widePetsciiBrowser = { petsciiMode: true, petsciiColumns: 80, connectionType: 'web' } as any;
/** The ordinary browser caller. */
const ansiBrowser = { petsciiMode: false, connectionType: 'web', terminalType: 'modern' } as any;

describe('the default protocol', () => {
  it('is Punter for a real Commodore', () => {
    expect(getDefaultProtocol(realC64)).toBe('punter');
  });

  it('is ZMODEM for a browser, whatever font it is drawing', () => {
    expect(getDefaultProtocol(petsciiBrowser)).toBe('zmodem');
    expect(getDefaultProtocol(widePetsciiBrowser)).toBe('zmodem');
    expect(getDefaultProtocol(ansiBrowser)).toBe('zmodem');
  });

  it('still yields to a caller who picked one', () => {
    expect(getDefaultProtocol({ ...petsciiBrowser, user: { protocol: 'punter' } })).toBe('punter');
    expect(getDefaultProtocol({ ...realC64, user: { protocol: 'zmodem' } })).toBe('zmodem');
  });
});

describe('the protocols on offer', () => {
  it('are the Commodore ones for real hardware', () => {
    expect(getAvailableProtocols(realC64)).toEqual(['punter', 'xmodem', 'xmodem-crc']);
  });

  it('include ZMODEM for a PETSCII browser caller, at either width', () => {
    for (const session of [petsciiBrowser, widePetsciiBrowser]) {
      const offered = getAvailableProtocols(session);
      expect(offered).toContain('zmodem');
      expect(offered).toContain('ymodem');
      // Punter stays on the list: it works, and a caller may want it.
      expect(offered).toContain('punter');
    }
  });

  it('are unchanged for an ordinary browser caller', () => {
    expect(getAvailableProtocols(ansiBrowser))
      .toEqual(['zmodem', 'ymodem', 'xmodem-1k', 'xmodem-crc', 'xmodem', 'punter']);
  });
});
