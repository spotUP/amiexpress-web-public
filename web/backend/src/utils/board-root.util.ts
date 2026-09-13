/**
 * WHERE THE BOARD'S FILES ARE - one answer, for everything that reads them.
 *
 * Three call sites computed this independently and two of them were wrong in
 * the same way: they checked BBS_ROOT and fell back to the repo tree, missing
 * BBS_DATA_DIR entirely. In the container BBS_ROOT is empty and BBS_DATA_DIR
 * is /app/data/bbs, so those resolved to /app - where a Conf1 DOES exist
 * (the repo's own copy), so nothing failed and nothing looked wrong. The
 * co-sysop simply answered about the wrong board: a conference list, a
 * bulletin and a door catalogue that belong to the source tree, not to the
 * callers (the chat handler was fixed for exactly this on 2026-09-10; the
 * HTTP bot API was not).
 *
 * The order matters and is not arbitrary:
 *   BBS_DATA_DIR - the container's board volume, the real thing.
 *   BBS_ROOT     - what a host sets when it keeps the board elsewhere.
 *   the repo tree - dev, where the checkout IS a board tree.
 */
import * as path from 'path';

/** The directory holding Conf1, Commands, ConfConfig.info and the rest. */
export function boardRoot(): string {
  const fromEnv = process.env.BBS_DATA_DIR || process.env.BBS_ROOT;
  if (fromEnv) return path.resolve(fromEnv);
  // From web/backend/src/utils to the repo root.
  return path.resolve(__dirname, '../../../..');
}
