import { describe, expect, test } from 'vitest';
import { fanOutOptions } from '../pages/screen-write-plan';
import type { ScreenIndexShape } from '../pages/screen-index-view';

const twoNodes = (hashA: string, hashB: string): ScreenIndexShape => ({
  builtAt: '',
  unused: [],
  screens: [{
    screen: 'BBSTITLE',
    dirType: 'node',
    missingScopes: 0,
    duplicateGroups: [],
    resolutions: [
      { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
      { scope: 'node', id: 2, dir: 'Node2', dirIsShared: false, file: 'Node2/BBSTITLE.txt', variants: [] },
    ],
  }],
  files: {
    'Node1/BBSTITLE.txt': { relPath: 'Node1/BBSTITLE.txt', bytes: 1, format: 'text', sha256: hashA, mci: [] },
    'Node2/BBSTITLE.txt': { relPath: 'Node2/BBSTITLE.txt', bytes: 1, format: 'text', sha256: hashB, mci: [] },
  },
});

describe('the fan-out choices', () => {
  test('offers this-file and all-copies when a screen exists on several nodes', () => {
    const options = fanOutOptions(twoNodes('a', 'b'), 'BBSTITLE', 'Node1/BBSTITLE.txt');

    expect(options.map(o => o.choice)).toEqual(['this-file', 'all-copies', 'share-then-write']);
    expect(options[1].targets).toEqual(['Node1/BBSTITLE.txt', 'Node2/BBSTITLE.txt']);
  });

  test('suggests sharing only when every copy is already identical', () => {
    const identical = fanOutOptions(twoNodes('a', 'a'), 'BBSTITLE', 'Node1/BBSTITLE.txt');
    const divergent = fanOutOptions(twoNodes('a', 'b'), 'BBSTITLE', 'Node1/BBSTITLE.txt');

    expect(identical.find(o => o.choice === 'share-then-write')!.suggested).toBe(true);
    expect(divergent.find(o => o.choice === 'share-then-write')!.suggested).toBe(false);
  });

  test('a screen that exists once offers only this-file', () => {
    const one = twoNodes('a', 'a');
    one.screens[0].resolutions = [one.screens[0].resolutions[0]];
    delete one.files['Node2/BBSTITLE.txt'];

    expect(fanOutOptions(one, 'BBSTITLE', 'Node1/BBSTITLE.txt').map(o => o.choice)).toEqual(['this-file']);
  });

  test('the all-copies label says how many files it will touch', () => {
    const options = fanOutOptions(twoNodes('a', 'b'), 'BBSTITLE', 'Node1/BBSTITLE.txt');

    expect(options[1].label).toBe('all 2 nodes that have BBSTITLE');
  });

  test('the file the sysop opened is always the first target', () => {
    const options = fanOutOptions(twoNodes('a', 'b'), 'BBSTITLE', 'Node2/BBSTITLE.txt');

    expect(options[0].targets).toEqual(['Node2/BBSTITLE.txt']);
    expect(options[1].targets[0]).toBe('Node2/BBSTITLE.txt');
  });
});

/**
 * The identical set.
 *
 * This board is 1,155 screen files of which 34 are unique - `guestlogon.txt`
 * exists 80 times in one version, `logoff.txt` 93 times in five - and original
 * AmiExpress only ever addressed 32 nodes (axcommon.e:28 MAX_NODES=32). At 255
 * nodes, editing one copy at a time is what produces the five versions.
 */
describe('writing every copy that is already identical', () => {
  /** Copies spread across the three shapes this board actually uses. */
  const spread = (): ScreenIndexShape => ({
    builtAt: '',
    unused: [],
    screens: [{
      screen: 'LOGOFF', dirType: 'node', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/Logoff.txt', variants: [] },
      ],
    }],
    files: {
      'Node1/Logoff.txt': { relPath: 'Node1/Logoff.txt', bytes: 1, format: 'text', sha256: 'same', mci: [] },
      'Node2/Screens/Logoff.txt': { relPath: 'Node2/Screens/Logoff.txt', bytes: 1, format: 'text', sha256: 'same', mci: [] },
      'Conf5/Screens/Logoff.txt': { relPath: 'Conf5/Screens/Logoff.txt', bytes: 1, format: 'text', sha256: 'same', mci: [] },
      'Node9/Logoff.txt': { relPath: 'Node9/Logoff.txt', bytes: 1, format: 'text', sha256: 'different', mci: [] },
    },
  });

  test('gathers copies by CONTENT, across scopes the screen does not resolve in', () => {
    const options = fanOutOptions(spread(), 'LOGOFF', 'Node1/Logoff.txt');
    const sameContent = options.find(o => o.choice === 'same-content')!;

    // The screen resolves on one node; the identical bytes live on three
    // paths, in a node directory, a node Screens directory and a conference.
    expect(sameContent.targets).toEqual([
      'Node1/Logoff.txt', 'Conf5/Screens/Logoff.txt', 'Node2/Screens/Logoff.txt',
    ]);
  });

  test('never includes a copy whose content differs', () => {
    const options = fanOutOptions(spread(), 'LOGOFF', 'Node1/Logoff.txt');

    expect(options.find(o => o.choice === 'same-content')!.targets)
      .not.toContain('Node9/Logoff.txt');
  });

  test('is the suggestion when there is nothing to share', () => {
    // One resolution, so no fan-out across nodes and no sharing to offer - the
    // identical set is the best answer available.
    const options = fanOutOptions(spread(), 'LOGOFF', 'Node1/Logoff.txt');

    expect(options.find(o => o.choice === 'same-content')!.suggested).toBe(true);
  });

  test('yields to sharing, which makes the NEXT edit one file instead of eighty', () => {
    const identical = fanOutOptions(twoNodes('a', 'a'), 'BBSTITLE', 'Node1/BBSTITLE.txt');

    expect(identical.find(o => o.choice === 'share-then-write')!.suggested).toBe(true);
    expect(identical.find(o => o.choice === 'same-content')!.suggested).toBe(false);
  });

  test('is not offered at all for a file nothing matches', () => {
    const options = fanOutOptions(twoNodes('a', 'b'), 'BBSTITLE', 'Node1/BBSTITLE.txt');

    expect(options.find(o => o.choice === 'same-content')).toBeUndefined();
  });
});
