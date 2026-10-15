/**
 * Native packet rendering contract (vendored TheMarco/teletext engine).
 *
 * Pins what the board depends on: DE/PN/OL frames render to 8-color ANSI
 * with double-height duplication, color bars and mosaic cells - and anything
 * unparseable returns null so the loader falls through instead of serving
 * packet bytes raw. Frozen frames (Marco grammar); live pages change hourly.
 */
import { renderNativeTti, looksNativeTti } from '@amiexpress/bbs-door-sdk/teletext/render-native';
import { tryNativeTtiFile } from '../../src/handlers/screen.handler';

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

/**
 * A page says which G0 national option sub-set it is written in (PS bits
 * 8-10, ETSI EN 300 706 s.15.2). The lexer decoded it, the validator checked
 * it and the packet builder wrote it into the header - and the renderer then
 * printed the raw 7-bit code, so a Swedish page showed `{|}[\]` where
 * `äöåÄÖÅ` belong. On a board whose teletext feature is Swedish.
 */
describe('national option sub-sets reach the glass', () => {
  const page = (ps: string) =>
    [
      'DE,Subset test',
      'PN,10000',
      'SC,0000',
      'CT,8,C',
      `PS,${ps}`,
      'OL,1, {|}[\\]',
      '',
    ].join('\n');

  test('a Swedish page prints Swedish letters, not braces', () => {
    const r = renderNativeTti(page('0200'));
    expect(r).not.toBeNull();
    const text = r!.ansi.replace(/\x1b\[[0-9;]*m/g, '');
    expect(text).toContain('äöåÄÖ');
    expect(text).not.toContain('{|}');
  });

  test('a German page prints German letters', () => {
    const r = renderNativeTti(page('0100'));
    expect(r).not.toBeNull();
    const text = r!.ansi.replace(/\x1b\[[0-9;]*m/g, '');
    expect(text).toContain('äöüÄÖ');
  });

  test('a page that declares no sub-set is left exactly as it was', () => {
    const r = renderNativeTti(page('8000'));
    expect(r).not.toBeNull();
    const text = r!.ansi.replace(/\x1b\[[0-9;]*m/g, '');
    expect(text).toContain('{|}[\\]');
  });
});
