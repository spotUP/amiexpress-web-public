import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getArchiveChecksums, _clearChecksumCacheForTests } from '../../src/doors/door-repo-checksums';

describe('door-repo checksums', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-'));
  const file = path.join(tmp, 'a.lha');
  beforeEach(() => { _clearChecksumCacheForTests(); });
  afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('computes md5 and sha256 of file bytes', () => {
    fs.writeFileSync(file, Buffer.from('hello'));
    const c = getArchiveChecksums(file);
    expect(c.md5).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(c.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('returns cached result for unchanged file, recomputes after change', () => {
    fs.writeFileSync(file, Buffer.from('hello'));
    const a = getArchiveChecksums(file);
    const b = getArchiveChecksums(file);
    expect(b).toBe(a); // same object => cache hit
    fs.writeFileSync(file, Buffer.from('world'));
    const c = getArchiveChecksums(file);
    expect(c.md5).not.toBe(a.md5);
  });

  it('throws on missing file', () => {
    expect(() => getArchiveChecksums(path.join(tmp, 'nope.lha'))).toThrow();
  });
});
