/**
 * WHERE THE BOARD'S FILES ARE - one answer, for everything that reads them.
 *
 * The answer lives in config.dataDir (config.ts: BBS_DATA_DIR, then BBS_ROOT,
 * then the repo tree) and boardRoot() returns it. It used to be computed a
 * second time here, and about thirty other sites computed it a third way
 * (BBS_ROOT || cwd/../..). Tests and the admin change config.dataDir at
 * runtime, so any site that did not ask config disagreed with those that did:
 * new-user read the node icon from the configured dir and wrote Answers to the
 * env one. In the container BBS_ROOT is empty and BBS_DATA_DIR is
 * /app/data/bbs; a site that fell back to cwd/../.. resolved to /app, where a
 * Conf1 DOES exist (the image's own copy), so nothing failed - the board just
 * answered about the wrong files.
 *
 * Two roots, never confused:
 *   boardRoot() - the board's DATA: Conf*, Node*, Commands, Answers, user.data,
 *                 the Doors volume content, logs the board writes.
 *   codeRoot()  - the CODE tree: built bundles, the SDK, door source that ships
 *                 in the image. On live that is /app, not the volume.
 */
import * as path from 'path';
import { config } from '../config';

/** The directory holding Conf1, Commands, ConfConfig.info and the rest. */
export function boardRoot(): string {
  return path.resolve(config.get('dataDir'));
}

/**
 * The checkout / image tree that holds built bundles and shipped door code.
 * BBS_ROOT overrides it for a host that keeps the checkout somewhere unusual.
 */
export function codeRoot(): string {
  if (process.env.BBS_ROOT) return path.resolve(process.env.BBS_ROOT);
  // From web/backend/src/utils to the repo root.
  return path.resolve(__dirname, '../../../..');
}
