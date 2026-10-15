/**
 * express.e addFlagItems (2724-2744): a space delimited name list becomes one
 * flag item per non-empty name, each carrying the conference passed in.
 * Port: FileFlagManager.addFlags (file-flag.util.ts).
 *
 * Kept divergence: the web flag list stores names upper-cased and refuses
 * duplicates (express.e addFlagToList 12523-12538 behaviour, applied to every
 * entry point by the FlaggedFile model), where addFlagItem 2713-2722 keeps the
 * typed case and does not dedupe.
 */
import { FileFlagManager } from '../../src/utils/file-flag.util';

describe('addFlagItems', () => {
  const mgr = () => new FileFlagManager('/nonexistent', 1, 1);

  it('makes one item per name, skipping runs of spaces, with the conference given', () => {
    const m = mgr();
    expect(m.addFlags('  one.lha   two.lha three.lha ', 7)).toBe(3);
    expect(m.getAll()).toEqual([
      { filename: 'ONE.LHA', confNum: 7 },
      { filename: 'TWO.LHA', confNum: 7 },
      { filename: 'THREE.LHA', confNum: 7 },
    ]);
  });

  it('adds nothing for an empty or all-space list', () => {
    const m = mgr();
    expect(m.addFlags('', 1)).toBe(0);
    expect(m.addFlags('    ', 1)).toBe(0);
    expect(m.getAll()).toEqual([]);
  });

  it('a name with no trailing space is still added (the last-name branch, 2739-2741)', () => {
    const m = mgr();
    expect(m.addFlags('only.lha', 2)).toBe(1);
  });
});
