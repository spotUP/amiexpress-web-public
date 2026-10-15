/**
 * The Duplicates tab shows the real exceptions - screens whose content DRIFTED
 * across copies - and auto-collapses the identical-across-nodes groups (the
 * expected "one screen on N nodes") into a summary. isDrift / partitionDuplicates
 * are the split the tab is built on.
 */
import { describe, it, expect } from 'vitest';
import { isDrift, partitionDuplicates, type DuplicateGroup } from '../pages/screen-duplicates';

function group(name: string, versionCount: number, fileCount = 10): DuplicateGroup {
  const versions = Array.from({ length: versionCount }, (_, i) => ({
    sha256: `${name}-${i}`,
    paths: [`Node${i + 1}/${name}`],
    editPath: `Node${i + 1}/${name}`,
    readerCount: 1,
    readership: `node ${i + 1}`,
    bytes: 100,
  }));
  return { name, fileCount, versions, uniform: versionCount === 1, anyRead: true };
}

describe('duplicates: show only drift', () => {
  it('isDrift is true only when the content differs across copies', () => {
    expect(isDrift(group('logoff.txt', 5))).toBe(true);   // 5 versions = drifted
    expect(isDrift(group('menu.txt', 1))).toBe(false);    // all identical
  });

  it('partitions into drifted exceptions and a count of the identical groups', () => {
    const groups = [
      group('logoff.txt', 5),   // drifted
      group('menu.txt', 1),     // identical
      group('confbull.txt', 1), // identical
      group('who.txt', 2),      // drifted
    ];
    const { drifted, identicalCount } = partitionDuplicates(groups);

    expect(drifted.map(g => g.name)).toEqual(['logoff.txt', 'who.txt']);
    expect(identicalCount).toBe(2);
  });

  it('a board with no drift yields an empty exception list', () => {
    const { drifted, identicalCount } = partitionDuplicates([group('a', 1), group('b', 1)]);
    expect(drifted).toEqual([]);
    expect(identicalCount).toBe(2);
  });
});
