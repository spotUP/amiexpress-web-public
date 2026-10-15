/**
 * Configuration Files must survive the data it is actually sent.
 *
 * The page mapped the response as `file.name || file.split('/').pop()`, a
 * shape the server has never sent - it sends `{ path, relativePath, basename,
 * type }`. So `file.name` was undefined and `.split()` ran on the object:
 *
 *   TypeError: P.split is not a function
 *       at Array.map
 *
 * It had never thrown, because the endpoint replied in an envelope the page
 * could not read, so the list was always empty and the map never ran. Fixing
 * the envelope let real data through and the page died on the first file.
 * Two mismatches of the same kind, the second hidden behind the first.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  categorizeInfoFile,
  toInfoFileItems,
  infoFileCategories,
  filterInfoFiles,
  groupInfoFilesByCategory,
} from '../pages/info-file-list';

/** Exactly what /api/info-editor/files sends for one file. */
const SERVER_FILE = {
  path: '/app/data/bbs/Commands/BBSCmd/WALL.info',
  relativePath: 'Commands/BBSCmd/WALL.info',
  basename: 'WALL.info',
  type: 'command',
};

describe('the Configuration Files list', () => {
  it('reads the shape the server actually sends', () => {
    const items = toInfoFileItems([SERVER_FILE]);

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('WALL.info');
    // The editor endpoint resolves against the BBS root, so the relative path
    // is the one that works; the absolute one is useless to a browser.
    expect(items[0].path).toBe('Commands/BBSCmd/WALL.info');
    expect(items[0].category).toBe('Commands');
  });

  it('does not call split on an object', () => {
    // The crash, as a test: an entry with no `name` must not be treated as a
    // string.
    expect(() => toInfoFileItems([{ relativePath: 'bbsConfig.info' }])).not.toThrow();
    expect(() => toInfoFileItems([SERVER_FILE])).not.toThrow();
  });

  it('survives entries it cannot use rather than taking the page down', () => {
    const items = toInfoFileItems([null, undefined, 42, {}, SERVER_FILE]);

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('WALL.info');
  });

  it('still accepts a plain string entry', () => {
    const items = toInfoFileItems(['Doors/DOORMAN/DOORMAN.info']);

    expect(items[0].name).toBe('DOORMAN.info');
    expect(items[0].category).toBe('Doors');
  });

  it('returns nothing for a response that is not a list', () => {
    expect(toInfoFileItems(undefined)).toEqual([]);
    expect(toInfoFileItems(null)).toEqual([]);
    expect(toInfoFileItems({ files: [] })).toEqual([]);
  });

  describe('which section a file lands in', () => {
    it('sorts by the relative path', () => {
      expect(categorizeInfoFile('Commands/BBSCmd/WALL.info')).toBe('Commands');
      expect(categorizeInfoFile('Doors/DOORMAN/DOORMAN.info')).toBe('Doors');
      expect(categorizeInfoFile('AmiXnet/InBound.info')).toBe('AmiXnet Network');
      expect(categorizeInfoFile('bbsConfig.info')).toBe('BBS Configuration');
      expect(categorizeInfoFile('ConfConfig.info')).toBe('Conferences');
      expect(categorizeInfoFile('Conf1/Conf1.info')).toBe('Conferences');
      expect(categorizeInfoFile('Node1/Node1.info')).toBe('Nodes');
      expect(categorizeInfoFile('Protocols.info')).toBe('Protocols');
    });

    it('would have put everything in System if given the absolute path', () => {
      // Which is what it was given: no absolute path starts with 'Commands/',
      // so every file fell through to the catch-all.
      expect(categorizeInfoFile('/app/data/bbs/Commands/BBSCmd/WALL.info')).toBe('System');
    });
  });
});

/**
 * Configuration Files on a board with forty nodes.
 *
 * Measured on the live board: 1111 icons, of which 441 are in the Nodes
 * category. Every node holds the same fifteen files, so those 441 are a
 * handful of names - Modem.info, Serial.info, Work.info - repeated forty
 * times. Two things stopped a sysop reaching one of them.
 */
describe('narrowing the Configuration Files list', () => {
  const board = toInfoFileItems([
    { relativePath: 'Commands/BBSCmd/AE.info', basename: 'AE.info' },
    { relativePath: 'Doors/GWall/GWall.info', basename: 'GWall.info' },
    { relativePath: 'Node1/Modem.info', basename: 'Modem.info' },
    { relativePath: 'Node40/Modem.info', basename: 'Modem.info' },
    { relativePath: 'Node40/Serial.info', basename: 'Serial.info' },
    { relativePath: 'bbsConfig.info', basename: 'bbsConfig.info' },
  ]);

  // Every node's copy is called Modem.info, so a name-only match could not
  // tell node 1 from node 40 - and "Node40" matched NOTHING, because no file
  // is named that. This is what makes the page usable at forty nodes.
  it('finds a node by searching for it, though no file is named after it', () => {
    const found = filterInfoFiles(board, 'Node40', 'All');

    expect(found.map(f => f.path)).toEqual(['Node40/Modem.info', 'Node40/Serial.info']);
  });

  it('still matches a plain file name', () => {
    const found = filterInfoFiles(board, 'modem', 'All');

    expect(found.map(f => f.path)).toEqual(['Node1/Modem.info', 'Node40/Modem.info']);
  });

  it('combines the search with the chip', () => {
    expect(filterInfoFiles(board, 'modem', 'Nodes')).toHaveLength(2);
    expect(filterInfoFiles(board, 'modem', 'Commands')).toEqual([]);
  });

  // The chips were built from the FILTERED list, so choosing one left only
  // that one standing and there was no way to switch to another without
  // going back to All. Typing in the search box emptied them the same way.
  it('offers every category the board has, not only the chosen one', () => {
    const narrowed = filterInfoFiles(board, 'Node40', 'Nodes');

    // The bug, stated: chips built from the narrowed list leave one standing,
    // so there is no way to click from Nodes to Commands.
    expect(infoFileCategories(narrowed)).toEqual(['All', 'Nodes']);

    // What the page has to render instead.
    expect(infoFileCategories(board)).toEqual([
      'All',
      'BBS Configuration',
      'Commands',
      'Doors',
      'Nodes',
    ]);
  });

  // The function is only right if the page hands it the unfiltered list, and
  // that is the half that was wrong. Read as text, the way nav-routes.test.ts
  // reads App.tsx: what is being asserted is the wiring.
  it('is given the unfiltered list by the page', () => {
    const page = readFileSync(
      resolve(__dirname, '..', 'pages', 'SystemFilesPage.tsx'),
      'utf8',
    );

    expect(page).toContain('infoFileCategories(allFiles)');
    expect(page).toContain('filterInfoFiles(allFiles, searchTerm, selectedCategory)');
  });

  it('groups what is left under its category', () => {
    const grouped = groupInfoFilesByCategory(filterInfoFiles(board, '', 'All'));

    expect(Object.keys(grouped).sort()).toEqual([
      'BBS Configuration',
      'Commands',
      'Doors',
      'Nodes',
    ]);
    expect(grouped.Nodes).toHaveLength(3);
  });
});
