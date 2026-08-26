/**
 * A disabled tooltype keeps the form the file wrote it in.
 *
 * Amiga tooltypes are disabled by wrapping them in parentheses, and that is
 * what the BBS's own Access/ACS.*.info files use:
 *
 *   ACS.READ_BULLETINS
 *   (ACS.LIST_NODES)
 *
 * The parser accepts both `(KEY)` and `!KEY` as disabled, but the writer
 * always emitted `!KEY`. So editing any tooltype in such a file rewrote every
 * disabled entry into a different syntax - harmless to THIS BBS, whose loader
 * reads the parsed `commented` flag either way, but a divergence from
 * express.e and from what a real Amiga reads, in files that are shared with
 * both.
 */

import { parseTooltypeStringForTest, renderTooltypeForTest } from '../../src/utils/info-file.util';

describe('disabled tooltype round trip', () => {
  it('keeps parentheses, which is what the ACS files use', () => {
    const tt = parseTooltypeStringForTest('(ACS.LIST_NODES)');

    expect(tt?.commented).toBe(true);
    expect(tt?.key).toBe('ACS.LIST_NODES');
    expect(renderTooltypeForTest(tt!)).toBe('(ACS.LIST_NODES)');
  });

  it('keeps a bang where a file used a bang', () => {
    const tt = parseTooltypeStringForTest('!RESIDENT');

    expect(tt?.commented).toBe(true);
    expect(renderTooltypeForTest(tt!)).toBe('!RESIDENT');
  });

  it('leaves an enabled tooltype exactly as it was', () => {
    const tt = parseTooltypeStringForTest('ACCESS=50');

    expect(tt?.commented).toBe(false);
    expect(renderTooltypeForTest(tt!)).toBe('ACCESS=50');
  });

  it('keeps parentheses around a key with a value', () => {
    const tt = parseTooltypeStringForTest('(STACK=4096)');

    expect(tt?.commented).toBe(true);
    expect(renderTooltypeForTest(tt!)).toBe('(STACK=4096)');
  });

  it('defaults to a bang for a tooltype nobody parsed from a file', () => {
    // Hand-built entries have no original form to preserve; the previous
    // behaviour stays the default.
    const rendered = renderTooltypeForTest({
      key: 'NEWFLAG', value: '', commented: true, prefix: '', originalLine: '',
    } as any);

    expect(rendered).toBe('!NEWFLAG');
  });

  it('can be told to use parentheses for a new entry', () => {
    const rendered = renderTooltypeForTest({
      key: 'ACS.DOWNLOAD', value: '', commented: true, prefix: '',
      originalLine: '', commentStyle: '()',
    } as any);

    expect(rendered).toBe('(ACS.DOWNLOAD)');
  });
});
