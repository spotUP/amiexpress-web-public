/**
 * Regression tests for the AmiStripper door's repack finalization
 * (Doors/ami-stripper/strip-repack.ts).
 *
 * The bug: stripArchive writes to outputPath (e.g. <archive>.strip_tmp.zip,
 * with a forced .zip extension), not to the literal tmp path the door asked
 * for. The door's catch-block cleanup only removed the literal tmp path, so
 * a failure AFTER the repack (e.g. the rename to the final name throwing)
 * orphaned the real temp file on disk while the error output read as if
 * cleanup had happened.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runStripRepack } from '../../../../Doors/ami-stripper/strip-repack';

describe('AmiStripper door: runStripRepack temp-file lifecycle', () => {
  let dir: string;
  let archivePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ami-stripper-repack-'));
    archivePath = path.join(dir, 'MyDoor.lha');
    fs.writeFileSync(archivePath, Buffer.alloc(4096, 0x41));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Mimics stripArchive's real contract: forces a .zip extension onto the
   *  requested out path and reports where it actually wrote. */
  function fakeStripArchive(zipBytes: Buffer = Buffer.alloc(1024, 0x42)) {
    return async (_archive: string, outPath: string) => {
      const outputPath = outPath + '.zip';
      fs.writeFileSync(outputPath, zipBytes);
      return { outputPath };
    };
  }

  it('removes the ACTUALLY produced temp zip when finalization fails after repack', async () => {
    // Force the finalize step to throw: finalPath (MyDoor.zip) exists as a
    // non-empty DIRECTORY, so rmSync without recursive throws after the
    // temp zip has already been written.
    const finalPath = path.join(dir, 'MyDoor.zip');
    fs.mkdirSync(finalPath);
    fs.writeFileSync(path.join(finalPath, 'occupant.txt'), 'x');

    const producedPath = archivePath + '.strip_tmp.zip';
    const outcome = await runStripRepack(fakeStripArchive(), archivePath);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/^Repack failed: /);
    // The regression: this file used to be orphaned because cleanup only
    // checked the literal <archive>.strip_tmp path.
    expect(fs.existsSync(producedPath)).toBe(false);
    // Original archive is never touched.
    expect(fs.statSync(archivePath).size).toBe(4096);
  });

  it('renames the produced zip to <name>.zip and leaves the original archive untouched', async () => {
    const outcome = await runStripRepack(fakeStripArchive(), archivePath);

    expect(outcome.ok).toBe(true);
    expect(outcome.finalPath).toBe(path.join(dir, 'MyDoor.zip'));
    expect(fs.existsSync(outcome.finalPath)).toBe(true);
    expect(outcome.origSize).toBe(4096);
    expect(outcome.newSize).toBe(1024);
    expect(fs.existsSync(archivePath + '.strip_tmp')).toBe(false);
    expect(fs.existsSync(archivePath + '.strip_tmp.zip')).toBe(false);
    expect(fs.statSync(archivePath).size).toBe(4096);
  });

  it('reports the error and leaves no temp files when stripArchive itself throws', async () => {
    const outcome = await runStripRepack(async () => {
      throw new Error('unsupported archive format');
    }, archivePath);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe('Repack failed: unsupported archive format');
    expect(fs.readdirSync(dir)).toEqual(['MyDoor.lha']);
  });

  it('fails cleanly when stripArchive reports success but wrote nothing', async () => {
    const outcome = await runStripRepack(
      async (_a: string, outPath: string) => ({ outputPath: outPath + '.zip' }),
      archivePath,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe('Repack produced unexpected output.');
    expect(fs.readdirSync(dir)).toEqual(['MyDoor.lha']);
  });
});
