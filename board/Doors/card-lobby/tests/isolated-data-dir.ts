/**
 * One lobby and one wallet per TEST FILE, instead of one for the whole repo.
 *
 * Twenty-one test files opened with
 *
 *   process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-x-'));
 *
 * and not one of them worked. The door roots its Storage at `defaultBaseDir()`
 * (sdk/core/Storage.ts), and that function honours BBS_DATA_DIR ONLY when the
 * directory is named `bbs` - the volume rule from 2026-09-09, where
 * BBS_DATA_DIR=<volume>/bbs means "the volume root is one level up". A temp
 * dir called `card-lobby-lobby-4Xk2` fails that test, so every file silently
 * fell back to `process.cwd()` and they all shared the checkout's own
 * `Doors/card-lobby/data/doors/card_lobby/`: one lobby.json, one
 * profiles.json, growing across every run and every dev preview (the copy
 * found on 2026-09-15 was 120 tables deep).
 *
 * So the temp dir has to be named `bbs`, and the door's data lands beside it.
 */

import { mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/**
 * Point this process's door storage at a fresh directory of its own and
 * return the volume root the door will use. Call it at the top of a test
 * file, before the first `import('../index')`.
 */
export function isolatedDataDir(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `card-lobby-${label}-`));
  const bbs = join(root, 'bbs');
  mkdirSync(bbs, { recursive: true });
  process.env.BBS_DATA_DIR = bbs;
  return root;
}

/** Where a door's files land for the dir this module last handed out. */
export function doorDataRoot(doorName: string): string {
  const bbs = process.env.BBS_DATA_DIR ?? '';
  return join(dirname(bbs), 'data', 'doors', doorName);
}
