/**
 * The door finds its own directory from wherever it is run.
 *
 * "still no petscii logo in sight" - the sysop, on a localhost build where
 * every layer of the PETSCII pipeline had been proven correct. The logo was
 * never on the wire: `DOOR_ROOT` was `path.resolve(__dirname, '..')`, which is
 * the door root when the board runs `dist/index.js` and is `Doors/` when it
 * runs `index.ts` from source - which is what localhost does. The placeholder,
 * the wide art and `GLCViewer.cfg` were all silently missing there, and the
 * compiled-in art covered for it on the wide screen.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { doorRootFrom } from '../../../../board/Doors/glc-viewer/src/door-root';

const DOOR = path.join(__dirname, '../../../../board/Doors/glc-viewer');

describe('the door root', () => {
  it('is the same from the root, from src/, from dist/ and from dist/src/', () => {
    // The four places `__dirname` can be, depending on how the board ran it.
    for (const from of [DOOR, path.join(DOOR, 'src'), path.join(DOOR, 'dist'), path.join(DOOR, 'dist', 'src')]) {
      expect({ from, root: doorRootFrom(from) }).toEqual({ from, root: DOOR });
    }
  });

  it('holds the files the door reads relative to itself', () => {
    const root = doorRootFrom(path.join(DOOR, 'src'));
    for (const file of ['GLCViewer.cfg', 'door.settings.json', 'art/style3.ans', 'art/style3.c64.ans']) {
      expect({ file, exists: fs.existsSync(path.join(root, file)) }).toEqual({ file, exists: true });
    }
  });

  it('would have been Doors/ under the old rule, run from source', () => {
    // The mistake, pinned so nobody reintroduces it with a tidy one-liner.
    expect(path.resolve(DOOR, '..')).toBe(path.join(DOOR, '..'));
    expect(doorRootFrom(DOOR)).not.toBe(path.resolve(DOOR, '..'));
  });

  it('falls back to the parent when nothing above it is a package', () => {
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-door-'));
    const inner = path.join(nowhere, 'a', 'b');
    fs.mkdirSync(inner, { recursive: true });
    // No package.json anywhere up the temp tree: the old guess, rather than a
    // throw at import time.
    expect(doorRootFrom(inner)).toBe(path.join(nowhere, 'a'));
  });
});
