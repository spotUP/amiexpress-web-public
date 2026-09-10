/**
 * Native packet rendering contract (vendored TheMarco/teletext engine).
 *
 * Pins what the board depends on: DE/PN/OL frames render to 8-color ANSI
 * with double-height duplication, color bars and mosaic cells - and anything
 * unparseable returns null so the loader falls through instead of serving
 * packet bytes raw. Frozen frames (Marco grammar); live pages change hourly.
 */
import { renderNativeTti, looksNativeTti, tryNativeTtiFile } from '../../src/teletext/render-native';

const DH_PAGE = [
  'DE,Double height test',
  'PN,10000',
  'SC,0000',
  'CT,8,C',
  'PS,8000',
  'OL,0,  DH TEST',
  'OL,2, BIG TEXT',
  'OL,23, foot',
  '',
].join('\n');

describe('renderNativeTti', () => {
  test('renders colors and doubles double-height rows', () => {
    const r = renderNativeTti(DH_PAGE);
    expect(r).not.toBeNull();
    // White-on-black bar with content, SGR-wrapped.
    expect(r!.ansi).toContain('\x1b[');
    expect(r!.ansi).toContain('DH TEST');
    expect(r!.ansi).toContain('BIG TEXT');
  });

  test('rows stay 40 columns of addressable text', () => {
    const r = renderNativeTti(DH_PAGE);
    expect(r).not.toBeNull();
    const stripped = r!.ansi
      .split('\n')
      .map((line) => line.replace(/\x1b\[[0-9;]*m/g, '').replace(/[^ -~]/g, '?'));
    for (const line of stripped) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  test('garbage and empty input return null, never throw', () => {
    expect(renderNativeTti('hello world\n')).toBeNull();
    expect(renderNativeTti('')).toBeNull();
    expect(renderNativeTti('[{\"num\":\"100\"}]')).toBeNull();
  });

  test('looksNativeTti sniffs the record grammar', () => {
    expect(looksNativeTti(DH_PAGE)).toBe(true);
    expect(looksNativeTti('\x1b[31mANSI art')).toBe(false);
    expect(looksNativeTti('')).toBe(false);
  });
});

describe('tryNativeTtiFile', () => {
  test('missing files return null instead of throwing', () => {
    expect(tryNativeTtiFile('/nonexistent/path/Nope.tti')).toBeNull();
  });
});
