/**
 * Regression: the "Restricted" download gate (express.e checkFIBForFileSize)
 * was dead in every download path because the file resolvers never populated
 * a comment, so Restricted files were downloadable by anyone. This util is the
 * single source of truth that resolves the DIR description and applies the gate.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  isRestrictedComment,
  resolveFileDescription,
  isFileRestricted,
} from '../../src/utils/file-restriction.util';

describe('file-restriction util', () => {
  describe('isRestrictedComment', () => {
    it('flags descriptions starting "Restricted" (case-insensitive)', () => {
      expect(isRestrictedComment('Restricted sysop-only tool')).toBe(true);
      expect(isRestrictedComment('restricted')).toBe(true);
      expect(isRestrictedComment('  RESTRICTED area')).toBe(true);
    });
    it('does not flag ordinary descriptions', () => {
      expect(isRestrictedComment('A great demo')).toBe(false);
      expect(isRestrictedComment('Not restricted at all')).toBe(false);
      expect(isRestrictedComment('')).toBe(false);
      expect(isRestrictedComment(undefined)).toBe(false);
      expect(isRestrictedComment(null)).toBe(false);
    });
  });

  describe('resolveFileDescription / isFileRestricted', () => {
    let bbsPath: string;

    beforeEach(() => {
      bbsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'filerestrict-test-'));
      const confDir = path.join(bbsPath, 'Conf1');
      fs.mkdirSync(confDir, { recursive: true });
      // DIR format: filename(13, padded) + status(1) + size + date + description
      const dir1 =
        'secret.lha   P  100K  01-Jan-25  Restricted sysop tool\n' +
        'public.lha   P  200K  02-Feb-25  A friendly public file\n';
      fs.writeFileSync(path.join(confDir, 'DIR1'), dir1);
    });

    afterEach(() => {
      if (fs.existsSync(bbsPath)) fs.rmSync(bbsPath, { recursive: true, force: true });
    });

    it('resolves the DIR description for a file (case-insensitive filename)', async () => {
      expect(await resolveFileDescription(1, bbsPath, 'secret.lha')).toMatch(/^Restricted/);
      expect(await resolveFileDescription(1, bbsPath, 'SECRET.LHA')).toMatch(/^Restricted/);
      expect(await resolveFileDescription(1, bbsPath, 'public.lha')).toMatch(/friendly/);
    });

    it('returns empty description for unknown files', async () => {
      expect(await resolveFileDescription(1, bbsPath, 'nope.lha')).toBe('');
    });

    it('isFileRestricted gates the restricted file and passes the public one', async () => {
      expect(await isFileRestricted(1, bbsPath, 'secret.lha')).toBe(true);
      expect(await isFileRestricted(1, bbsPath, 'public.lha')).toBe(false);
      // Unknown file: no DIR entry -> not restricted (findFiles path decides existence)
      expect(await isFileRestricted(1, bbsPath, 'nope.lha')).toBe(false);
    });
  });
});
