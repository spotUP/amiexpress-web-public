/**
 * clean-playpen.util.ts
 *
 * Port of express.e:18259-... cleanPlayPen().
 *
 * After an upload session, any files left in the node's playpen are
 * partial/aborted uploads. cleanPlayPen moves each one to
 * <confDir>/PartUpload/<filename>@<slot> (or @<node>-<slot> when the
 * sysop has set ownPartFiles) so resumeStuff() can offer them back
 * to the user on the next upload attempt.
 *
 * Express.e drops files belonging to no logged-on user — we keep that
 * behavior; the slot suffix is what scopes them to a user. Without
 * slotNumber on session.user, we skip the move (leftover stays in
 * playpen, no data loss).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { BBSSession } from '../index';

export async function cleanPlayPen(
  playpenDir: string,
  session: BBSSession,
  config: any,
): Promise<void> {
  if (!session.user?.slotNumber) return;
  if (!fs.existsSync(playpenDir)) return;

  const slot = session.user.slotNumber;
  const nodeId = session.nodeId || 0;

  // Only claim what THIS session created.
  //
  // The playpen is a persistent per-node directory and nothing ever empties
  // it - every touchpoint is mkdirSync(recursive). A session that dropped
  // hard leaves its partial behind, and the next caller to trigger this
  // function would have it moved to PartUpload stamped with HIS slot, so
  // resumeStuff then offered him a file he never uploaded (live report
  // 2026-09-08). resumeStuff's @slot filter was right; the stamp was the lie.
  //
  // A file older than this caller's logon is not his. Leave it exactly where
  // it is - never branded, never deleted. With no logon time we cannot
  // attribute anything, so we claim nothing rather than guess.
  const logonMs = session.logonTime ? session.logonTime * 1000 : null;
  if (logonMs === null) {
    console.log("[cleanPlayPen] no logonTime on session; claiming nothing (cannot attribute)");
  }
  const ownPartFiles = (config && typeof config.get === 'function')
    ? !!config.get('ownPartFiles')
    : false;
  const suffix = ownPartFiles ? `@${nodeId}-${slot}` : `@${slot}`;

  // PartUpload sits under the current conference dir. Caller passes the
  // node-level playpen; the conf dir is derived from session.currentConf
  // via getConferenceDir.
  const { getConferenceDir } = require('./file-hold.util');
  const dataDir = (config && typeof config.get === 'function')
    ? config.get('dataDir')
    : path.resolve(process.cwd(), '..', '..');
  const confDir = getConferenceDir(session.currentConf || 1, dataDir);
  const partUploadDir = path.join(confDir, 'PartUpload');

  let leftovers: string[];
  try {
    leftovers = fs.readdirSync(playpenDir);
  } catch {
    return;
  }
  if (leftovers.length === 0) return;

  try {
    fs.mkdirSync(partUploadDir, { recursive: true });
  } catch (err: any) {
    // PartUpload may exist as a stray file (same class as the HOLD
    // blocker fix). Rename out of the way and retry.
    if (err?.code === 'EEXIST') {
      const stat = fs.statSync(partUploadDir);
      if (!stat.isDirectory()) {
        const backup = `${partUploadDir}.stray-${Date.now()}`;
        fs.renameSync(partUploadDir, backup);
        fs.mkdirSync(partUploadDir, { recursive: true });
      }
    } else {
      console.error(`[cleanPlayPen] mkdir failed: ${err?.message || err}`);
      return;
    }
  }

  for (const name of leftovers) {
    const src = path.join(playpenDir, name);
    let stat: fs.Stats;
    try { stat = fs.statSync(src); } catch { continue; }
    if (!stat.isFile()) continue;

    if (logonMs === null || stat.mtimeMs < logonMs) {
      console.log(`[cleanPlayPen] skipped ${name}: predates this logon, not this caller's`);
      continue;
    }

    const dest = path.join(partUploadDir, `${name}${suffix}`);
    try {
      fs.renameSync(src, dest);
      console.log(`[cleanPlayPen] moved ${name} -> ${path.basename(dest)}`);
    } catch (err: any) {
      // Cross-device rename can fail with EXDEV — fall back to copy+delete.
      if (err?.code === 'EXDEV') {
        try {
          fs.copyFileSync(src, dest);
          fs.unlinkSync(src);
        } catch (copyErr: any) {
          console.error(`[cleanPlayPen] move ${name} failed: ${copyErr?.message || copyErr}`);
        }
      } else {
        console.error(`[cleanPlayPen] move ${name} failed: ${err?.message || err}`);
      }
    }
  }
}
