import { describe, expect, test } from 'vitest';
import { toScreenRows, filterScreenRows, type ScreenIndexShape } from '../pages/screen-index-view';

const index: ScreenIndexShape = {
  builtAt: '2026-09-01T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE',
      dirType: 'node',
      missingScopes: 1,
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
        { scope: 'node', id: 2, dir: 'Node2', dirIsShared: false, file: null, variants: [] },
      ],
      duplicateGroups: [{ sha256: 'a', paths: ['Node1/BBSTITLE.txt'] }],
    },
    {
      screen: 'MENU',
      dirType: 'conf',
      missingScopes: 0,
      resolutions: [
        { scope: 'conf', id: 1, dir: 'Conf1', dirIsShared: false, file: 'Conf1/MENU.TXT', variants: [] },
      ],
      duplicateGroups: [],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: 6, format: 'text', sha256: 'a',
      mci: [{ code: 'CC', target: 'nosuchdoor', resolves: false, scopeSpecific: false }],
    },
    'Conf1/MENU.TXT': {
      relPath: 'Conf1/MENU.TXT', bytes: 5, format: 'ansi', sha256: 'b',
      mci: [{ code: 'CC', target: 'gwall', resolves: true, scopeSpecific: false }],
    },
  },
};

describe('the screens list', () => {
  test('counts what resolves and what is missing', () => {
    const [row] = toScreenRows(index);
    expect(row).toMatchObject({ screen: 'BBSTITLE', resolvedCount: 1, missingCount: 1 });
  });

  test('says which scope a screen belongs to, in words', () => {
    expect(toScreenRows(index)[0].scopeLabel).toBe('node scope');
    expect(toScreenRows(index)[1].scopeLabel).toBe('conference scope');
  });

  test('counts the distinct contents behind a screen', () => {
    expect(toScreenRows(index)[0].distinctContents).toBe(1);
  });

  test('counts broken references, so a dead menu item is visible in the list', () => {
    expect(toScreenRows(index)[0].brokenReferences).toBe(1);
    expect(toScreenRows(index)[1].brokenReferences).toBe(0);
  });

  test('search matches the screen name, case-insensitively', () => {
    const rows = toScreenRows(index);
    expect(filterScreenRows(rows, 'bbstitle').map(r => r.screen)).toEqual(['BBSTITLE']);
    expect(filterScreenRows(rows, 'MENU').map(r => r.screen)).toEqual(['MENU']);
    expect(filterScreenRows(rows, '')).toHaveLength(2);
  });

  test('a screen with nothing anywhere is still listed - that is the point', () => {
    const empty: ScreenIndexShape = {
      ...index,
      screens: [{
        screen: 'NODE_BULL', dirType: 'node', missingScopes: 2, duplicateGroups: [],
        resolutions: [
          { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: null, variants: [] },
          { scope: 'node', id: 2, dir: 'Node2', dirIsShared: false, file: null, variants: [] },
        ],
      }],
    };
    expect(toScreenRows(empty)[0]).toMatchObject({ resolvedCount: 0, missingCount: 2 });
  });
});
