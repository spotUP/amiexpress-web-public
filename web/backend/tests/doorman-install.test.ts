/**
 * Regression tests for DOORMAN's repo-install rewrite (portable extraction,
 * correct TYPE=, nested binary discovery). Previously install shelled out
 * to a macOS-only `lha` CLI, hardcoded TYPE=XIM regardless of the catalog's
 * detected door_type, and pointed LOCATION at the archive's bare binary
 * basename even when the binary is nested several directories deep inside
 * the archive (as most FAME door packs are) — none of which worked on the
 * live Linux container.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// See fixtures/fake-archive-extractor.ts for why this is a real stand-in
// module rather than a jest.mock: extractArchiveTo() discovers its
// extractor via a require.cache scan (getExtractorFactory), which only
// sees genuinely require()'d modules, not jest.mock's mock registry.
import { __setStubExtractor } from './fixtures/fake-archive-extractor';
import {
  buildDoorInfoContent,
  extractArchiveTo,
  findExtractedBinary,
} from '../../../Doors/door-manager/app';

describe('DOORMAN: buildDoorInfoContent', () => {
  it('writes the catalog door_type into TYPE= instead of hardcoding XIM', () => {
    expect(buildDoorInfoContent('FIM', 'SYSOP', '5d!sysop')).toBe(
      'TYPE=FIM\nLOCATION=Doors:SYSOP/5d!sysop\nSTACK=65536\nACCESS=0\n'
    );
  });

  it('still supports XIM (the historical default)', () => {
    expect(buildDoorInfoContent('XIM', 'TRIVIA', 'TRIVIA')).toBe(
      'TYPE=XIM\nLOCATION=Doors:TRIVIA/TRIVIA\nSTACK=65536\nACCESS=0\n'
    );
  });
});

describe('DOORMAN: findExtractedBinary', () => {
  let destDir: string;

  beforeEach(() => {
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-find-binary-'));
  });

  afterEach(() => {
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it('finds a binary nested several directories deep (FAME door-pack layout)', () => {
    const nestedDir = path.join(destDir, 'add_2_fame', 'doors', '5d', '5d!sysop');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, '5d!sysop'), 'binary-bytes');
    // Decoy at the root with a different name — must not match.
    fs.writeFileSync(path.join(destDir, 'readme.txt'), 'not it');

    expect(findExtractedBinary(destDir, '5d!sysop')).toBe('add_2_fame/doors/5d/5d!sysop/5d!sysop');
  });

  it('matches case-insensitively', () => {
    fs.mkdirSync(path.join(destDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(destDir, 'sub', 'MyDoor.FIM'), 'x');
    expect(findExtractedBinary(destDir, 'mydoor.fim')).toBe('sub/MyDoor.FIM');
  });

  it('returns null when the binary is not found anywhere in the tree', () => {
    fs.writeFileSync(path.join(destDir, 'other.bin'), 'x');
    expect(findExtractedBinary(destDir, 'missing.bin')).toBeNull();
  });

  it('returns null for a null/undefined binary name', () => {
    expect(findExtractedBinary(destDir, null)).toBeNull();
    expect(findExtractedBinary(destDir, undefined)).toBeNull();
  });
});

describe('DOORMAN: extractArchiveTo', () => {
  let destDir: string;

  beforeEach(() => {
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-extract-'));
    __setStubExtractor(null);
  });

  afterEach(() => {
    fs.rmSync(destDir, { recursive: true, force: true });
    __setStubExtractor(null);
  });

  it('writes every archive member to disk, preserving nested paths', async () => {
    __setStubExtractor({
      getEntries: async () => [
        { name: 'a.txt', size: 3 },
        { name: 'dir/', size: 0 }, // directory marker — no data to write
        { name: 'dir/b.txt', size: 1 },
      ],
      extractFile: async (_fp: string, name: string) => {
        if (name === 'a.txt') return Buffer.from('AAA');
        if (name === 'dir/b.txt') return Buffer.from('B');
        return null;
      },
    });

    const result = await extractArchiveTo('/whatever/archive.lha', destDir);

    expect(result.ok).toBe(true);
    expect(result.fileCount).toBe(2);
    expect(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf8')).toBe('AAA');
    expect(fs.readFileSync(path.join(destDir, 'dir', 'b.txt'), 'utf8')).toBe('B');
  });

  it('reports failure (not a thrown exception) when the archive is empty/unreadable', async () => {
    __setStubExtractor({
      getEntries: async () => [],
      extractFile: async () => null,
    });

    const result = await extractArchiveTo('/whatever/empty.lha', destDir);
    expect(result.ok).toBe(false);
    expect(result.fileCount).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('reports failure when the format is unsupported (factory returns null)', async () => {
    __setStubExtractor(null);
    const result = await extractArchiveTo('/whatever/archive.unknown', destDir);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported/i);
  });

  it('does not write outside destDir for a zip-slip-style entry name', async () => {
    __setStubExtractor({
      getEntries: async () => [{ name: '../../etc/evil', size: 3 }],
      extractFile: async () => Buffer.from('bad'),
    });

    const result = await extractArchiveTo('/whatever/archive.lha', destDir);
    expect(result.ok).toBe(false); // the only entry was rejected, so nothing was written
    expect(fs.existsSync(path.join(path.dirname(destDir), 'etc', 'evil'))).toBe(false);
  });
});
