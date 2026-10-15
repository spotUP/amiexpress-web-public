/**
 * DOORMAN's file explorer opens on the door, not on the backend's directory.
 *
 * A door's LOCATION is relative to the BBS root - Doors/<door> - and the
 * explorer resolved it against process.cwd(). The backend runs with cwd
 * /app/web/backend on the board, a tree that holds no doors at all, so every
 * door whose registration carries a relative path opened on nothing.
 *
 * DOORMAN already knew how to find the BBS root: resolveBbsRoot in
 * ViewManager.ts, which prefers BBS_DATA_DIR and otherwise walks up to the
 * directory that actually contains Commands/BBSCmd. The explorer is the one
 * place that did not use it.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { doorPathFrom } from '../../../../Doors/door-manager/FileExplorerOverlay';
import { resolveBbsRoot } from '../../../../Doors/door-manager/ViewManager';

describe("DOORMAN's file explorer", () => {
  let bbsRoot: string;

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-root-'));
    fs.mkdirSync(path.join(bbsRoot, 'Commands', 'BBSCmd'), { recursive: true });
    fs.mkdirSync(path.join(bbsRoot, 'Doors', 'livechat'), { recursive: true });
  });

  afterEach(() => fs.rmSync(bbsRoot, { recursive: true, force: true }));

  it('resolves a door LOCATION against the BBS root', () => {
    expect(doorPathFrom(bbsRoot, 'Doors/livechat')).toBe(path.join(bbsRoot, 'Doors', 'livechat'));
  });

  it('leaves an absolute path alone', () => {
    const absolute = path.join(bbsRoot, 'Doors', 'livechat');

    expect(doorPathFrom(bbsRoot, absolute)).toBe(absolute);
  });

  it('does not resolve against the process working directory', () => {
    const resolved = doorPathFrom(bbsRoot, 'Doors/livechat');

    expect(resolved.startsWith(bbsRoot)).toBe(true);
    expect(resolved).not.toBe(path.resolve(process.cwd(), 'Doors/livechat'));
  });

  it('finds the BBS root the way the rest of DOORMAN does', () => {
    const fromEnv = resolveBbsRoot('/nowhere', { BBS_DATA_DIR: bbsRoot });

    expect(fromEnv).toBe(bbsRoot);
    expect(doorPathFrom(fromEnv, 'Doors/livechat')).toBe(path.join(bbsRoot, 'Doors', 'livechat'));
  });
});

/**
 * A .guide opened as plain text on the board, silently.
 *
 * The overlay required the backend's AmigaGuide parser from
 * cwd + web/backend/dist/amigaguide/AmigaGuideParser. cwd IS the backend
 * (/app/web/backend), so that path pointed a directory tree too deep, and the
 * board runs the backend from SOURCE under tsx - there is no dist/ to find
 * even at the right depth. The require sat inside a catch, so the viewer just
 * fell back to plain text with no error anywhere.
 */
describe('the AmigaGuide parser lookup', () => {
  const { guideParserCandidates } = require('../../../../Doors/door-manager/FileExplorerOverlay');
  const path = require('path');

  it('looks for the running backend first, which is the source tree', () => {
    const [first] = guideParserCandidates('/app/web/backend');

    expect(first).toBe(path.join('/app/web/backend', 'src', 'amigaguide', 'AmigaGuideParser'));
  });

  it('still tries a compiled backend, and the path it used to use', () => {
    const candidates = guideParserCandidates('/app/web/backend');

    expect(candidates).toContain(path.join('/app/web/backend', 'dist', 'amigaguide', 'AmigaGuideParser'));
    expect(candidates).toContain(
      path.join('/app/web/backend', 'web', 'backend', 'dist', 'amigaguide', 'AmigaGuideParser'));
  });

  it('finds the parser this repo actually ships', () => {
    const backend = path.resolve(__dirname, '../..');
    const candidates = guideParserCandidates(backend);
    const found = candidates.find((c: string) => {
      try { return Boolean(require(c).AmigaGuideParser); } catch { return false; }
    });

    expect(found).toBe(path.join(backend, 'src', 'amigaguide', 'AmigaGuideParser'));
  });
});
