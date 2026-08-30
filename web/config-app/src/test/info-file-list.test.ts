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
import { categorizeInfoFile, toInfoFileItems } from '../pages/info-file-list';

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
