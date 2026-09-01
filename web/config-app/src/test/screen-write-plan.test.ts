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
