/**
 * Unit tests for files-bbs.util.ts
 * Tests FILES.BBS format writing for BBS file areas
 *
 * FILES.BBS is a standard BBS file listing format used by third-party doors
 * Format: FILENAME.EXT  STATUS  SIZE  DATE  Description
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getFilesBBSPath, writeToFilesBBS, filesBBSExists } from '../../src/utils/files-bbs.util';

describe('FILES.BBS Utility (BBS File Listing Format)', () => {
  let testDir: string;
  let confPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-bbs-test-'));
    confPath = path.join(testDir, 'Conf1');
    fs.mkdirSync(confPath, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getFilesBBSPath', () => {
    it('should return correct FILES.BBS path with default upload dir', () => {
      const result = getFilesBBSPath(confPath);
      expect(result).toBe(path.join(confPath, 'Upload', 'FILES.BBS'));
    });

    it('should return correct FILES.BBS path with custom upload dir', () => {
      const result = getFilesBBSPath(confPath, 'Uploads');
      expect(result).toBe(path.join(confPath, 'Uploads', 'FILES.BBS'));
    });

    it('should handle various upload directory names', () => {
      expect(getFilesBBSPath(confPath, 'Upload')).toContain('Upload/FILES.BBS');
      expect(getFilesBBSPath(confPath, 'New')).toContain('New/FILES.BBS');
    });
  });

  describe('filesBBSExists', () => {
    it('should return false when FILES.BBS does not exist', async () => {
      const result = await filesBBSExists(confPath);
      expect(result).toBe(false);
    });

    it('should return true when FILES.BBS exists', async () => {
      const uploadDir = path.join(confPath, 'Upload');
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, 'FILES.BBS'), 'test');

      const result = await filesBBSExists(confPath);
      expect(result).toBe(true);
    });

    it('should check custom upload directory', async () => {
      const customUploadDir = path.join(confPath, 'CustomUpload');
      fs.mkdirSync(customUploadDir, { recursive: true });
      fs.writeFileSync(path.join(customUploadDir, 'FILES.BBS'), 'test');

      const defaultResult = await filesBBSExists(confPath);
      const customResult = await filesBBSExists(confPath, 'CustomUpload');

      expect(defaultResult).toBe(false);
      expect(customResult).toBe(true);
    });
  });

  describe('writeToFilesBBS', () => {
    beforeEach(() => {
      const uploadDir = path.join(confPath, 'Upload');
      fs.mkdirSync(uploadDir, { recursive: true });
    });

    it('should create FILES.BBS if it does not exist', async () => {
      await writeToFilesBBS(confPath, 'test.zip', 1024000, new Date(), 'Test', 'P', 'user');
      expect(await filesBBSExists(confPath)).toBe(true);
    });

    it('should write file entry with all required data', async () => {
      await writeToFilesBBS(confPath, 'demo.zip', 2048000, new Date('2024-01-15'), 'Demo archive', 'P', 'johndoe');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('demo.zip');
      expect(content).toContain('P');
      expect(content).toContain('K'); // Size in KB
      expect(content).toContain('Demo archive');
      expect(content).toContain('Sent by: johndoe');
    });

    it('should handle multi-line descriptions', async () => {
      await writeToFilesBBS(confPath, 'file.zip', 1024000, new Date(), 'Line 1\nLine 2\nLine 3', 'P', 'user');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('Line 1');
      expect(content).toContain('Line 2');
      expect(content).toContain('Line 3');
    });

    it('should handle different status markers', async () => {
      await writeToFilesBBS(confPath, 'passed.zip', 1024, new Date(), 'Passed', 'P', 'user');
      await writeToFilesBBS(confPath, 'failed.zip', 1024, new Date(), 'Failed', 'F', 'user');
      await writeToFilesBBS(confPath, 'nottested.zip', 1024, new Date(), 'Not tested', 'N', 'user');
      await writeToFilesBBS(confPath, 'duplicate.zip', 1024, new Date(), 'Duplicate', 'D', 'user');

      const content = fs.readFileSync(path.join(confPath, 'Upload', 'FILES.BBS'), 'utf-8');
      expect(content).toContain('passed.zip');
      expect(content).toContain('failed.zip');
      expect(content).toContain('nottested.zip');
      expect(content).toContain('duplicate.zip');
    });

    it('should respect addSentBy parameter', async () => {
      await writeToFilesBBS(confPath, 'with-sentby.zip', 1024, new Date(), 'With', 'P', 'user1', true);
      await writeToFilesBBS(confPath, 'without-sentby.zip', 1024, new Date(), 'Without', 'P', 'user2', false);

      const content = fs.readFileSync(path.join(confPath, 'Upload', 'FILES.BBS'), 'utf-8');

      // First file should have "Sent by:"
      const withSection = content.substring(0, content.indexOf('without-sentby.zip'));
      expect(withSection).toContain('Sent by: user1');

      // Second file should NOT have "Sent by: user2"
      const withoutSection = content.substring(content.indexOf('without-sentby.zip'));
      expect(withoutSection).not.toContain('Sent by: user2');
    });

    it('should use custom upload subdirectory', async () => {
      const customUploadDir = path.join(confPath, 'CustomUpload');
      fs.mkdirSync(customUploadDir, { recursive: true });

      await writeToFilesBBS(confPath, 'custom.zip', 1024, new Date(), 'Custom', 'P', 'user', true, 'CustomUpload');

      const customPath = path.join(customUploadDir, 'FILES.BBS');
      const defaultPath = path.join(confPath, 'Upload', 'FILES.BBS');

      expect(fs.existsSync(customPath)).toBe(true);
      expect(fs.existsSync(defaultPath)).toBe(false);

      const content = fs.readFileSync(customPath, 'utf-8');
      expect(content).toContain('custom.zip');
    });

    it('should append multiple entries', async () => {
      await writeToFilesBBS(confPath, 'file1.zip', 1024, new Date(), 'File 1', 'P', 'user1');
      await writeToFilesBBS(confPath, 'file2.zip', 2048, new Date(), 'File 2', 'P', 'user2');
      await writeToFilesBBS(confPath, 'file3.zip', 3072, new Date(), 'File 3', 'P', 'user3');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('file1.zip');
      expect(content).toContain('file2.zip');
      expect(content).toContain('file3.zip');
      expect(content).toContain('Sent by: user1');
      expect(content).toContain('Sent by: user2');
      expect(content).toContain('Sent by: user3');
    });

    it('should handle various file sizes', async () => {
      await writeToFilesBBS(confPath, 'tiny.txt', 512, new Date(), 'Tiny', 'P', 'user');
      await writeToFilesBBS(confPath, 'small.zip', 10240, new Date(), 'Small', 'P', 'user');
      await writeToFilesBBS(confPath, 'large.zip', 10240000, new Date(), 'Large', 'P', 'user');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      // Just verify all filenames are present and have 'K' suffix for sizes
      expect(content).toContain('tiny.txt');
      expect(content).toContain('small.zip');
      expect(content).toContain('large.zip');
      expect(content).toMatch(/\d+K/); // At least one size in KB format
    });

    it('should handle special characters in filenames', async () => {
      await writeToFilesBBS(confPath, 'file_under.zip', 1024, new Date(), 'Test', 'P', 'user');
      await writeToFilesBBS(confPath, 'file-dash.zip', 1024, new Date(), 'Test', 'P', 'user');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('file_under.zip');
      expect(content).toContain('file-dash.zip');
    });

    it('should not throw on write errors', async () => {
      const uploadDir = path.join(confPath, 'Upload');
      try {
        fs.chmodSync(uploadDir, 0o444);

        await expect(writeToFilesBBS(confPath, 'test.zip', 1024, new Date(), 'Test', 'P', 'user'))
          .resolves.not.toThrow();

        fs.chmodSync(uploadDir, 0o755);
      } catch (error) {
        fs.chmodSync(uploadDir, 0o755);
      }
    });
  });

  describe('Real-world scenarios', () => {
    beforeEach(() => {
      const uploadDir = path.join(confPath, 'Upload');
      fs.mkdirSync(uploadDir, { recursive: true });
    });

    it('should handle typical upload workflow', async () => {
      await writeToFilesBBS(
        confPath,
        'game.zip',
        5242880,
        new Date(),
        'Awesome retro game\nAmiga port of classic',
        'P',
        'retrouser'
      );

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('game.zip');
      expect(content).toContain('P');
      expect(content).toContain('K');
      expect(content).toContain('Awesome retro game');
      expect(content).toContain('Amiga port of classic');
      expect(content).toContain('Sent by: retrouser');
    });

    it('should handle multiple uploads from different users', async () => {
      const today = new Date();

      await writeToFilesBBS(confPath, 'utils.zip', 1024000, today, 'Utilities', 'P', 'alice');
      await writeToFilesBBS(confPath, 'docs.zip', 512000, today, 'Docs', 'P', 'bob');
      await writeToFilesBBS(confPath, 'demo.zip', 2048000, today, 'Demo', 'P', 'charlie');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('utils.zip');
      expect(content).toContain('docs.zip');
      expect(content).toContain('demo.zip');
      expect(content).toContain('Sent by: alice');
      expect(content).toContain('Sent by: bob');
      expect(content).toContain('Sent by: charlie');
    });

    it('should handle upload status tracking', async () => {
      await writeToFilesBBS(confPath, 'passed.zip', 1024, new Date(), 'Passed scan', 'P', 'user');
      await writeToFilesBBS(confPath, 'failed.zip', 1024, new Date(), 'Failed scan', 'F', 'user');
      await writeToFilesBBS(confPath, 'duplicate.zip', 1024, new Date(), 'Duplicate', 'D', 'user');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('passed.zip');
      expect(content).toContain('failed.zip');
      expect(content).toContain('duplicate.zip');
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      const uploadDir = path.join(confPath, 'Upload');
      fs.mkdirSync(uploadDir, { recursive: true });
    });

    it('should handle very long filenames', async () => {
      const longFilename = 'a'.repeat(50) + '.zip';

      await writeToFilesBBS(confPath, longFilename, 1024, new Date(), 'Long filename', 'P', 'user');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain(longFilename);
    });

    it('should handle very long descriptions', async () => {
      const longDesc = 'Description line. '.repeat(20);

      await writeToFilesBBS(confPath, 'test.zip', 1024, new Date(), longDesc, 'P', 'user');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain(longDesc.trim());
    });

    it('should handle zero-byte files', async () => {
      await writeToFilesBBS(confPath, 'empty.txt', 0, new Date(), 'Empty', 'P', 'user');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('empty.txt');
      expect(content).toContain('K'); // Should still have size marker
    });

    it('should handle large file sizes', async () => {
      await writeToFilesBBS(confPath, 'huge.iso', 4294967296, new Date(), 'Large ISO', 'P', 'user');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('huge.iso');
      expect(content).toContain('K'); // Size in KB
    });

    it('should handle empty description', async () => {
      await writeToFilesBBS(confPath, 'nodesc.zip', 1024, new Date(), '', 'P', 'user');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('nodesc.zip');
    });

    it('should handle empty username', async () => {
      await writeToFilesBBS(confPath, 'test.zip', 1024, new Date(), 'Test', 'P', '');

      const content = fs.readFileSync(getFilesBBSPath(confPath), 'utf-8');
      expect(content).toContain('test.zip');
      expect(content).toContain('Sent by:');
    });
  });
});
