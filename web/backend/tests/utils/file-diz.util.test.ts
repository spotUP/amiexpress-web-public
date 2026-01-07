/**
 * Unit tests for file-diz.util.ts
 * Tests FILE_ID.DIZ extraction and reading (express.e:19258-19370)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  runExamineCommands,
  extractFileDizBuiltin,
  readFileDiz,
  cleanupDizFiles,
  extractAndReadDiz
} from '../../src/utils/file-diz.util';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('path');
jest.mock('../../src/utils/lha-extractor');
jest.mock('../../src/utils/zip-extractor');
jest.mock('../../src/utils/tar-extractor');
jest.mock('../../src/utils/dms-extractor');
jest.mock('../../src/utils/lzx-extractor');
jest.mock('../../src/utils/examine-runner.util');

// Mock adm-zip (dynamically required)
const mockZipEntries = jest.fn();
jest.mock('adm-zip', () => {
  return jest.fn().mockImplementation(() => ({
    getEntries: mockZipEntries
  }));
});

describe('file-diz.util', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Mock path.join
    (path.join as jest.Mock).mockImplementation((...args: string[]) => args.join('/'));

    // Mock path.extname
    (path.extname as jest.Mock).mockImplementation((p: string) => {
      const match = p.match(/\.[^.]+$/);
      return match ? match[0] : '';
    });

    // Mock path.basename
    (path.basename as jest.Mock).mockImplementation((p: string, ext?: string) => {
      const base = p.split('/').pop() || '';
      if (ext && base.endsWith(ext)) {
        return base.slice(0, -ext.length);
      }
      return base;
    });

    // Mock path.dirname
    (path.dirname as jest.Mock).mockImplementation((p: string) => {
      const parts = p.split('/');
      parts.pop();
      return parts.join('/') || '/';
    });

    // Mock fs operations - default to rejection (file not found)
    // Tests should explicitly mock success cases
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockRejectedValue(new Error('Not found'));
    (fs.readFile as jest.Mock).mockResolvedValue('');
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.copyFile as jest.Mock).mockResolvedValue(undefined);
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('runExamineCommands', () => {
    it('should delegate to runExamineCommandsForDiz', async () => {
      const { runExamineCommandsForDiz } = require('../../src/utils/examine-runner.util');
      (runExamineCommandsForDiz as jest.Mock).mockResolvedValue(true);

      const result = await runExamineCommands(
        '/path/file.zip',
        '/work',
        ['unzip -j %f FILE_ID.DIZ -d %w']
      );

      expect(result).toBe(true);
      expect(runExamineCommandsForDiz).toHaveBeenCalledWith(
        '/path/file.zip',
        '/work',
        ['unzip -j %f FILE_ID.DIZ -d %w']
      );
    });

    it('should handle extraction failure', async () => {
      const { runExamineCommandsForDiz } = require('../../src/utils/examine-runner.util');
      (runExamineCommandsForDiz as jest.Mock).mockResolvedValue(false);

      const result = await runExamineCommands('/path/file.zip', '/work', ['bad command']);

      expect(result).toBe(false);
    });
  });

  describe('extractFileDizBuiltin - ZIP files', () => {
    it('should extract FILE_ID.DIZ from ZIP archive', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([
        { entryName: 'README.TXT' },
        { entryName: 'FILE_ID.DIZ' },
        { entryName: 'program.exe' }
      ]);

      const result = await extractFileDizBuiltin('/upload/file.zip', '/work');

      expect(result).toBe(true);
      expect(extractFileDizFromZip).toHaveBeenCalledWith('/upload/file.zip', '/work/FILE_ID.DIZ');
    });

    it('should find FILE_ID.DIZ case-insensitively in ZIP', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([
        { entryName: 'readme.txt' },
        { entryName: 'file_id.diz' },  // Lowercase
        { entryName: 'program.exe' }
      ]);

      const result = await extractFileDizBuiltin('/upload/file.zip', '/work');

      expect(result).toBe(true);
      expect(extractFileDizFromZip).toHaveBeenCalled();
    });

    it('should handle FILE_ID.DIZ in subdirectory', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([
        { entryName: 'docs/FILE_ID.DIZ' },
        { entryName: 'program.exe' }
      ]);

      const result = await extractFileDizBuiltin('/upload/file.zip', '/work');

      expect(result).toBe(true);
    });

    it('should return false when no FILE_ID.DIZ in ZIP', async () => {
      mockZipEntries.mockReturnValue([
        { entryName: 'README.TXT' },
        { entryName: 'program.exe' }
      ]);

      const result = await extractFileDizBuiltin('/upload/file.zip', '/work');

      expect(result).toBe(false);
    });

    it('should handle ZIP extraction failure', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockRejectedValue(new Error('Corrupt ZIP'));

      mockZipEntries.mockReturnValue([
        { entryName: 'FILE_ID.DIZ' }
      ]);

      const result = await extractFileDizBuiltin('/upload/file.zip', '/work');

      expect(result).toBe(false);
    });
  });

  describe('extractFileDizBuiltin - LHA files', () => {
    it('should extract FILE_ID.DIZ from LHA archive', async () => {
      const { listLhaFiles } = require('../../src/utils/lha-extractor');
      const { extractFileDizFromLha } = require('../../src/utils/lha-extractor');

      (listLhaFiles as jest.Mock).mockResolvedValue(['README.TXT', 'FILE_ID.DIZ', 'program']);
      (extractFileDizFromLha as jest.Mock).mockResolvedValue(true);

      const result = await extractFileDizBuiltin('/upload/file.lha', '/work');

      expect(result).toBe(true);
      expect(extractFileDizFromLha).toHaveBeenCalledWith('/upload/file.lha', '/work/FILE_ID.DIZ');
    });

    it('should handle .lzh extension', async () => {
      const { listLhaFiles } = require('../../src/utils/lha-extractor');
      const { extractFileDizFromLha } = require('../../src/utils/lha-extractor');

      (listLhaFiles as jest.Mock).mockResolvedValue(['FILE_ID.DIZ']);
      (extractFileDizFromLha as jest.Mock).mockResolvedValue(true);

      const result = await extractFileDizBuiltin('/upload/file.lzh', '/work');

      expect(result).toBe(true);
    });

    it('should find FILE_ID.DIZ case-insensitively in LHA', async () => {
      const { listLhaFiles } = require('../../src/utils/lha-extractor');
      const { extractFileDizFromLha } = require('../../src/utils/lha-extractor');

      (listLhaFiles as jest.Mock).mockResolvedValue(['File_Id.Diz']);  // Mixed case
      (extractFileDizFromLha as jest.Mock).mockResolvedValue(true);

      const result = await extractFileDizBuiltin('/upload/file.lha', '/work');

      expect(result).toBe(true);
    });

    it('should return false when no FILE_ID.DIZ in LHA', async () => {
      const { listLhaFiles } = require('../../src/utils/lha-extractor');
      (listLhaFiles as jest.Mock).mockResolvedValue(['README.TXT', 'program']);

      const result = await extractFileDizBuiltin('/upload/file.lha', '/work');

      expect(result).toBe(false);
    });
  });

  describe('extractFileDizBuiltin - LZX files', () => {
    it('should extract FILE_ID.DIZ from LZX archive', async () => {
      const { listLzxFiles } = require('../../src/utils/lzx-extractor');
      const { extractFileDizFromLzx } = require('../../src/utils/lzx-extractor');

      (listLzxFiles as jest.Mock).mockResolvedValue(['FILE_ID.DIZ']);
      (extractFileDizFromLzx as jest.Mock).mockResolvedValue(true);

      const result = await extractFileDizBuiltin('/upload/file.lzx', '/work');

      expect(result).toBe(true);
      expect(extractFileDizFromLzx).toHaveBeenCalledWith('/upload/file.lzx', '/work/FILE_ID.DIZ');
    });

    it('should return false when no FILE_ID.DIZ in LZX', async () => {
      const { listLzxFiles } = require('../../src/utils/lzx-extractor');
      (listLzxFiles as jest.Mock).mockResolvedValue(['README']);

      const result = await extractFileDizBuiltin('/upload/file.lzx', '/work');

      expect(result).toBe(false);
    });
  });

  describe('extractFileDizBuiltin - DMS files', () => {
    it('should return false for DMS files (not supported by findDizInArchive)', async () => {
      // DMS files hit findDizInArchive which returns null for unsupported formats
      // This causes the function to return false before reaching dms extraction code
      const result = await extractFileDizBuiltin('/upload/file.dms', '/work');

      expect(result).toBe(false);
    });
  });

  describe('extractFileDizBuiltin - TAR files', () => {
    it('should return false for TAR files (not supported by findDizInArchive)', async () => {
      // TAR files hit findDizInArchive which returns null for unsupported formats
      // This causes the function to return false before reaching tar extraction code
      const result = await extractFileDizBuiltin('/upload/file.tar', '/work');

      expect(result).toBe(false);
    });

    it('should return false for .tgz files (not supported by findDizInArchive)', async () => {
      const result = await extractFileDizBuiltin('/upload/file.tgz', '/work');

      expect(result).toBe(false);
    });

    it('should return false for .gz files (not supported by findDizInArchive)', async () => {
      const result = await extractFileDizBuiltin('/upload/file.gz', '/work');

      expect(result).toBe(false);
    });
  });

  describe('extractFileDizBuiltin - TXT files with tags', () => {
    it('should extract FILE_ID.DIZ from .txt file with tags', async () => {
      const txtContent = `Random text here
@BEGIN_FILE_ID.DIZ
Amazing Program v1.0
by John Doe
This is a cool program
@END_FILE_ID.DIZ
More text after`;

      (fs.readFile as jest.Mock).mockResolvedValue(txtContent);

      const result = await extractFileDizBuiltin('/upload/file.txt', '/work');

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/work/FILE_ID.DIZ',
        expect.stringContaining('Amazing Program v1.0'),
        'latin1'
      );
    });

    it('should limit to 10 lines from .txt file', async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      const txtContent = `@BEGIN_FILE_ID.DIZ
${lines.join('\n')}
@END_FILE_ID.DIZ`;

      (fs.readFile as jest.Mock).mockResolvedValue(txtContent);

      const result = await extractFileDizBuiltin('/upload/file.txt', '/work');

      expect(result).toBe(true);
      const writtenContent = (fs.writeFile as jest.Mock).mock.calls[0][1] as string;
      const writtenLines = writtenContent.split('\n');
      expect(writtenLines.length).toBeLessThanOrEqual(10);
    });

    it('should truncate lines to 44 characters from .txt file', async () => {
      const longLine = 'A'.repeat(100);
      const txtContent = `@BEGIN_FILE_ID.DIZ
${longLine}
@END_FILE_ID.DIZ`;

      (fs.readFile as jest.Mock).mockResolvedValue(txtContent);

      const result = await extractFileDizBuiltin('/upload/file.txt', '/work');

      expect(result).toBe(true);
      const writtenContent = (fs.writeFile as jest.Mock).mock.calls[0][1] as string;
      expect(writtenContent.length).toBeLessThanOrEqual(44);
    });

    it('should return false when no tags in .txt file', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue('Just regular text without tags');

      const result = await extractFileDizBuiltin('/upload/file.txt', '/work');

      expect(result).toBe(false);
    });

    it('should return false when only BEGIN tag in .txt file', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue('@BEGIN_FILE_ID.DIZ\nSome text');

      const result = await extractFileDizBuiltin('/upload/file.txt', '/work');

      expect(result).toBe(false);
    });

    it('should return false when only END tag in .txt file', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue('Some text\n@END_FILE_ID.DIZ');

      const result = await extractFileDizBuiltin('/upload/file.txt', '/work');

      expect(result).toBe(false);
    });

    it('should return false when tags in wrong order', async () => {
      const txtContent = `@END_FILE_ID.DIZ
Some text
@BEGIN_FILE_ID.DIZ`;

      (fs.readFile as jest.Mock).mockResolvedValue(txtContent);

      const result = await extractFileDizBuiltin('/upload/file.txt', '/work');

      expect(result).toBe(false);
    });
  });

  describe('extractFileDizBuiltin - companion .diz files', () => {
    it('should copy companion .diz file (file.dat.diz)', async () => {
      // First check (file.dat.diz) fails, second check (file.diz) succeeds
      (fs.access as jest.Mock)
        .mockRejectedValueOnce(new Error('Not found'))  // First companion check fails
        .mockResolvedValueOnce(undefined);  // Second companion check succeeds

      const result = await extractFileDizBuiltin('/upload/file.dat', '/work');

      expect(result).toBe(true);
      expect(fs.copyFile).toHaveBeenCalled();
    });

    it('should copy base .diz file (file.diz)', async () => {
      // First check (file.dat.diz) succeeds
      (fs.access as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await extractFileDizBuiltin('/upload/file.dat', '/work');

      expect(result).toBe(true);
      expect(fs.copyFile).toHaveBeenCalled();
    });

    it('should continue to archive extraction if no companion .diz', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([{ entryName: 'FILE_ID.DIZ' }]);

      // Default mock already rejects, no need to override

      const result = await extractFileDizBuiltin('/upload/file.zip', '/work');

      expect(result).toBe(true);
      expect(extractFileDizFromZip).toHaveBeenCalled();
    });
  });

  describe('extractFileDizBuiltin - unsupported formats', () => {
    it('should return false for unsupported file types', async () => {
      // Default mock already rejects companion files, which is correct

      const result = await extractFileDizBuiltin('/upload/file.rar', '/work');

      expect(result).toBe(false);
    });

    it('should return false for files without extension', async () => {
      // Default mock already rejects companion files, which is correct

      const result = await extractFileDizBuiltin('/upload/file', '/work');

      expect(result).toBe(false);
    });
  });

  describe('extractFileDizBuiltin - directory creation', () => {
    it('should create work directory if it does not exist', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([{ entryName: 'FILE_ID.DIZ' }]);

      await extractFileDizBuiltin('/upload/file.zip', '/work');

      expect(fs.mkdir).toHaveBeenCalledWith('/work', { recursive: true });
    });
  });

  describe('readFileDiz', () => {
    it('should read FILE_ID.DIZ content', async () => {
      const dizContent = `Amazing Program v1.0
by John Doe
Freeware`;

      (fs.access as jest.Mock).mockResolvedValue(undefined);  // FILE_ID.DIZ exists
      (fs.readFile as jest.Mock).mockResolvedValue(dizContent);

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toEqual([
        'Amazing Program v1.0',
        'by John Doe',
        'Freeware'
      ]);
    });

    it('should return null when FILE_ID.DIZ does not exist', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('Not found'));

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toBeNull();
    });

    it('should limit to maxLines', async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(lines.join('\n'));

      const result = await readFileDiz('file.zip', '/work', 5);

      expect(result).toHaveLength(5);
      expect(result).toEqual(['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5']);
    });

    it('should truncate lines to 44 characters', async () => {
      const longLine = 'A'.repeat(100);
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(longLine);

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toHaveLength(1);
      expect(result![0]).toHaveLength(44);
    });

    it('should remove empty lines', async () => {
      const dizContent = `Line 1

Line 2

Line 3`;

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(dizContent);

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should trim trailing whitespace', async () => {
      const dizContent = `Line 1
Line 2\t\t
Line 3     `;

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(dizContent);

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should use Latin-1 encoding', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue('Content');

      await readFileDiz('file.zip', '/work', 10);

      expect(fs.readFile).toHaveBeenCalledWith('/work/FILE_ID.DIZ', 'latin1');
    });

    it('should return null for empty FILE_ID.DIZ', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue('');

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toBeNull();
    });

    it('should return null for FILE_ID.DIZ with only whitespace', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue('   \n\n   \n');

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toBeNull();
    });

    it('should handle read errors gracefully', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toBeNull();
    });

    it('should handle CRLF and LF line endings', async () => {
      const dizContent = 'Line 1\r\nLine 2\nLine 3\r\n';

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(dizContent);

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });
  });

  describe('cleanupDizFiles', () => {
    it('should delete FILE_ID.DIZ', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      await cleanupDizFiles('/work');

      expect(fs.unlink).toHaveBeenCalledWith('/work/FILE_ID.DIZ');
    });

    it('should not fail if FILE_ID.DIZ does not exist', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('Not found'));

      await expect(cleanupDizFiles('/work')).resolves.not.toThrow();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should handle deletion errors gracefully', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.unlink as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      await expect(cleanupDizFiles('/work')).resolves.not.toThrow();
    });
  });

  describe('extractAndReadDiz', () => {
    it('should use EXAMINE commands first', async () => {
      const { runExamineCommandsForDiz } = require('../../src/utils/examine-runner.util');
      (runExamineCommandsForDiz as jest.Mock).mockResolvedValue(true);

      (fs.access as jest.Mock).mockResolvedValue(undefined);  // FILE_ID.DIZ exists after extraction
      const dizContent = 'Program v1.0';
      (fs.readFile as jest.Mock).mockResolvedValue(dizContent);

      const result = await extractAndReadDiz(
        '/upload/file.zip',
        '/work',
        ['unzip -j %f FILE_ID.DIZ -d %w'],
        10
      );

      expect(result).toEqual(['Program v1.0']);
      expect(runExamineCommandsForDiz).toHaveBeenCalled();
    });

    it('should fallback to builtin extraction if EXAMINE fails', async () => {
      const { runExamineCommandsForDiz } = require('../../src/utils/examine-runner.util');
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');

      (runExamineCommandsForDiz as jest.Mock).mockResolvedValue(false);
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([{ entryName: 'FILE_ID.DIZ' }]);

      // Mock: companion checks fail (2x), FILE_ID.DIZ exists after extraction (1x)
      (fs.access as jest.Mock)
        .mockRejectedValueOnce(new Error('Not found'))  // companion 1
        .mockRejectedValueOnce(new Error('Not found'))  // companion 2
        .mockResolvedValueOnce(undefined);  // FILE_ID.DIZ exists

      const dizContent = 'Program v1.0';
      (fs.readFile as jest.Mock).mockResolvedValue(dizContent);

      const result = await extractAndReadDiz(
        '/upload/file.zip',
        '/work',
        ['bad command'],
        10
      );

      expect(result).toEqual(['Program v1.0']);
      expect(extractFileDizFromZip).toHaveBeenCalled();
    });

    it('should use builtin extraction when no EXAMINE commands', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([{ entryName: 'FILE_ID.DIZ' }]);

      // Mock: companion checks fail (2x), FILE_ID.DIZ exists after extraction (1x)
      (fs.access as jest.Mock)
        .mockRejectedValueOnce(new Error('Not found'))  // companion 1
        .mockRejectedValueOnce(new Error('Not found'))  // companion 2
        .mockResolvedValueOnce(undefined);  // FILE_ID.DIZ exists

      const dizContent = 'Program v1.0';
      (fs.readFile as jest.Mock).mockResolvedValue(dizContent);

      const result = await extractAndReadDiz('/upload/file.zip', '/work', [], 10);

      expect(result).toEqual(['Program v1.0']);
      expect(extractFileDizFromZip).toHaveBeenCalled();
    });

    it('should return null when extraction fails', async () => {
      mockZipEntries.mockReturnValue([]);  // No FILE_ID.DIZ

      const result = await extractAndReadDiz('/upload/file.zip', '/work', [], 10);

      expect(result).toBeNull();
    });

    it('should return null when FILE_ID.DIZ is empty', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([{ entryName: 'FILE_ID.DIZ' }]);

      (fs.access as jest.Mock)
        .mockRejectedValueOnce(new Error('Not found'))  // companion 1
        .mockRejectedValueOnce(new Error('Not found'))  // companion 2
        .mockResolvedValueOnce(undefined);  // FILE_ID.DIZ exists

      (fs.readFile as jest.Mock).mockResolvedValue('');

      const result = await extractAndReadDiz('/upload/file.zip', '/work', [], 10);

      expect(result).toBeNull();
    });

    it('should pass maxLines to readFileDiz', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([{ entryName: 'FILE_ID.DIZ' }]);

      (fs.access as jest.Mock)
        .mockRejectedValueOnce(new Error('Not found'))  // companion 1
        .mockRejectedValueOnce(new Error('Not found'))  // companion 2
        .mockResolvedValueOnce(undefined);  // FILE_ID.DIZ exists

      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      (fs.readFile as jest.Mock).mockResolvedValue(lines.join('\n'));

      const result = await extractAndReadDiz('/upload/file.zip', '/work', [], 3);

      expect(result).toHaveLength(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle paths with special characters', async () => {
      const { extractFileDizFromZip } = require('../../src/utils/zip-extractor');
      (extractFileDizFromZip as jest.Mock).mockResolvedValue(true);

      mockZipEntries.mockReturnValue([{ entryName: 'FILE_ID.DIZ' }]);

      // Default mock already rejects companion files, which is correct

      await extractFileDizBuiltin('/upload/file [v1.0].zip', '/work dir');

      expect(extractFileDizFromZip).toHaveBeenCalled();
    });

    it('should handle FILE_ID.DIZ with Amiga characters', async () => {
      // Amiga extended ASCII characters
      const dizContent = 'Äöü Program v1.0 ©';

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(dizContent);

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toEqual(['Äöü Program v1.0 ©']);
    });

    it('should handle FILE_ID.DIZ with box drawing characters', async () => {
      const dizContent = '╔══════════════╗\n║ Program v1.0 ║\n╚══════════════╝';

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(dizContent);

      const result = await readFileDiz('file.zip', '/work', 10);

      expect(result).toHaveLength(3);
    });
  });
});
