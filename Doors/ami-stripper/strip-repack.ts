/**
 * Strip-and-repack finalization for the AmiStripper door.
 *
 * Extracted from index.ts so the temp-file lifecycle is unit-testable
 * without pulling in the door SDK. stripArchive always writes a portable
 * ZIP and may adjust the requested output path (forced .zip extension),
 * so cleanup must track the path it ACTUALLY wrote (outputPath), not the
 * literal tmp path we asked for.
 */

import * as fs from 'fs';

export interface StripRepackOutcome {
  ok: boolean;
  origSize: number;
  newSize: number;
  finalPath: string;
  error?: string;
}

export type StripArchiveFn = (
  archivePath: string,
  outPath: string,
) => Promise<{ outputPath?: string } | null | undefined | void>;

export async function runStripRepack(
  stripArchiveFn: StripArchiveFn,
  archivePath: string,
): Promise<StripRepackOutcome> {
  const tmpOut = archivePath + '.strip_tmp';
  // Outer-scoped so the catch block can clean up the file stripArchive
  // actually produced. Regression guard: the produced file is e.g.
  // <archive>.strip_tmp.zip, NOT the literal tmpOut — cleaning only
  // tmpOut orphans the real temp file when the rename below fails.
  let producedPath: string | null = null;
  try {
    const res = await stripArchiveFn(archivePath, tmpOut);
    producedPath = res && typeof res === 'object' && res.outputPath ? res.outputPath : tmpOut;

    if (!fs.existsSync(producedPath) || fs.statSync(producedPath).isDirectory()) {
      if (fs.existsSync(producedPath)) fs.rmSync(producedPath, { recursive: true, force: true });
      return { ok: false, origSize: 0, newSize: 0, finalPath: '', error: 'Repack produced unexpected output.' };
    }

    const origSize = fs.statSync(archivePath).size;
    const finalPath = archivePath.replace(/\.(lha|lzx|lzh)$/i, '') + '.zip';
    if (producedPath !== finalPath) {
      if (fs.existsSync(finalPath)) fs.rmSync(finalPath, { force: true });
      fs.renameSync(producedPath, finalPath);
    }
    const newSize = fs.statSync(finalPath).size;
    return { ok: true, origSize, newSize, finalPath };
  } catch (err) {
    for (const p of producedPath && producedPath !== tmpOut ? [producedPath, tmpOut] : [tmpOut]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { /* best effort */ }
      }
    }
    return { ok: false, origSize: 0, newSize: 0, finalPath: '', error: `Repack failed: ${(err as Error).message}` };
  }
}
