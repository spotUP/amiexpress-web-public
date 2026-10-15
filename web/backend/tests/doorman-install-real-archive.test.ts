/**
 * End-to-end regression test: DOORMAN's extractArchiveTo() against a real
 * LHA archive, through the real (non-stubbed) archive-extractor factory.
 *
 * This is also the regression test for a bug found while writing it: the
 * pure-JS LHA reader (src/utils/lha.js) declared `var directory` once per
 * extended-header-parsing block, but `var` doesn't reset on re-execution —
 * an entry with no directory extended header (type 2) silently inherited
 * the PREVIOUS entry's directory and got its name wrongly prefixed with it.
 * tests/fixtures/archives/tiny-nested.lha has exactly that shape: a nested
 * file followed by a root-level file with no directory header of its own
 * (mirrors real FAME door packs, which mix a nested binary with root-level
 * FILE_ID.DIZ/docs) — before the fix, root.txt extracted as
 * "nested/dir/root.txt" instead of "root.txt".
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractArchiveTo, findExtractedBinary } from '../../../Doors/door-manager/app';

// Force the real archive-extractor module to be loaded (and thus visible to
// extractArchiveTo's require.cache-based getExtractorFactory) before any
// test runs, the same way it ends up loaded in the real backend process.
import '../src/utils/archive-extractor';

const FIXTURE = path.join(__dirname, 'fixtures', 'archives', 'tiny-nested.lha');

describe('DOORMAN: extractArchiveTo against a real LHA archive', () => {
  let destDir: string;

  beforeEach(() => {
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-real-extract-'));
  });

  afterEach(() => {
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it('extracts a root-level file and a nested file to their correct real paths', async () => {
    const result = await extractArchiveTo(FIXTURE, destDir);

    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(2);

    // Root-level file must land at destDir/root.txt, NOT under the other
    // entry's directory (the lha.js `directory` state-bleed regression).
    expect(fs.readFileSync(path.join(destDir, 'root.txt'), 'utf8')).toBe('hello from root');
    expect(fs.readFileSync(path.join(destDir, 'nested', 'dir', 'mydoor.fim'), 'utf8'))
      .toBe('nested binary bytes');
  });

  it('findExtractedBinary locates the nested binary after a real extraction', async () => {
    const result = await extractArchiveTo(FIXTURE, destDir);
    expect(result.ok).toBe(true);

    expect(findExtractedBinary(destDir, 'mydoor.fim')).toBe('nested/dir/mydoor.fim');
  });
});
