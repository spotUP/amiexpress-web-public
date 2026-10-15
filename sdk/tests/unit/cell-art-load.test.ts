/**
 * The sheet loader: a door points it at its sprites/ directory once at
 * start, and a malformed file fails the LOAD, loudly and named.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadSpriteSheet } from '../../engines/graphics/cell-art/load';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cell-art-'));
}

const VALID = {
  name: 'dot',
  cellW: 1,
  cellH: 1,
  animations: { idle: { ticksPerFrame: 1, loop: true, frames: [[[['*', 11, 0]]]] } },
};

describe('loadSpriteSheet', () => {
  it('loads every *.sprite.json, keyed by sprite name', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'dot.sprite.json'), JSON.stringify(VALID));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

    const sheet = loadSpriteSheet(dir);
    expect(Object.keys(sheet)).toEqual(['dot']);
    expect(sheet.dot.cellW).toBe(1);
  });

  it('names the file when one is malformed', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'bad.sprite.json'),
      JSON.stringify({ ...VALID, cellW: 0 }));
    expect(() => loadSpriteSheet(dir)).toThrow(/bad\.sprite\.json/);
  });

  it('throws on a missing directory rather than returning an empty sheet', () => {
    // An empty sheet renders a blank board and LOOKS like a render bug;
    // a missing directory is a packaging bug and must say so.
    expect(() => loadSpriteSheet('/nonexistent/sprites')).toThrow(/sprites/);
  });
});
