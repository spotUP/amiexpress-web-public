/**
 * One-shot: backfill DIRn files for file_entries that exist in DB
 * but are missing from the conference's DIR file. Result of an
 * earlier upload pipeline that inserted the DB row but failed the
 * DIR write (e.g. EEXIST on stray HOLD blocker, or pre-unification
 * code that skipped DIR write entirely).
 *
 * Usage:
 *   cd web/backend && npx tsx /tmp/backfill-dir-from-db.ts
 */
import * as path from 'path';
import * as fs from 'fs';
import { db } from '../src/database';
import { writeUploadToDirFile } from '../src/utils/dir-file.util';
import { getConferenceDir } from '../src/utils/file-hold.util';
import { getMaxDirs } from '../src/utils/max-dirs.util';

async function main() {
  await new Promise(r => setTimeout(r, 1500)); // let DB init
  const bbsRoot = path.resolve(process.cwd(), '..', '..');
  console.log(`bbsRoot: ${bbsRoot}`);

  // Group file_entries by conference (via fileArea.conferenceId)
  // SQLite column names are stored as written in CREATE TABLE
  // (all lowercase for file_areas.conferenceid). Without an explicit
  // alias the JS object key reflects the declared column name, NOT
  // the way we typed it in the SELECT. Alias each one explicitly.
  const allRows = (await db.query(`
    SELECT fe.id            AS id,
           fe.filename       AS filename,
           fe.size           AS size,
           fe.description    AS description,
           fe.checked        AS checked,
           fe.uploader       AS uploader,
           fe.status         AS status,
           fe.uploaddate     AS uploadDate,
           fa.conferenceid   AS conferenceId,
           fa.id             AS areaid
    FROM file_entries fe
    JOIN file_areas fa ON fa.id = fe.areaid
    ORDER BY fa.conferenceid, fe.id
  `)).rows;
  console.log(`Total file_entries: ${allRows.length}`);

  let appended = 0;
  let skipped = 0;

  for (const row of allRows) {
    if (row.status !== 'active' && row.status !== 'hold' && row.status !== 'private') continue;
    const confDir = getConferenceDir(row.conferenceId, bbsRoot);
    const maxDirs = await getMaxDirs(row.conferenceId, bbsRoot);
    const dirNum = maxDirs > 0 ? maxDirs : 1;
    // Find the existing DIRn file (case-insensitive)
    const entries = fs.existsSync(confDir) ? fs.readdirSync(confDir) : [];
    const dirEntry = entries.find(e => e.toLowerCase() === `dir${dirNum}`);
    let dirFilePath: string;
    if (row.status === 'hold' || row.status === 'private') {
      dirFilePath = path.join(confDir, 'HOLD', 'HELD');
    } else {
      dirFilePath = path.join(confDir, dirEntry || `DIR${dirNum}`);
    }
    // Check if filename already in the DIR file
    let existingContent = '';
    try { existingContent = fs.readFileSync(dirFilePath, 'latin1'); } catch {}
    if (existingContent.includes(row.filename)) {
      skipped++;
      continue;
    }
    // Append
    try {
      await writeUploadToDirFile(
        row.filename,
        row.size,
        row.uploadDate ? new Date(row.uploadDate) : new Date(),
        row.description || '',
        (row.checked || 'N') as 'P' | 'F' | 'N' | 'D',
        row.uploader || 'sysop',
        confDir,
        row.status as 'active' | 'hold' | 'private',
        dirNum,
        true,
      );
      console.log(`  appended ${row.filename} → conf=${row.conferenceId} dirNum=${dirNum} status=${row.status}`);
      appended++;
    } catch (err: any) {
      console.error(`  FAIL ${row.filename} conf=${row.conferenceId}: ${err?.message || err}`);
    }
  }
  console.log(`\nDone. Appended ${appended}, skipped ${skipped}.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
