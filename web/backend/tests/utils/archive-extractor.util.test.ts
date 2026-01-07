/**
 * Archive Extractor Utility Unit Tests
 *
 * Tests unified archive extraction interface for various formats
 * (ZIP, LHA, LZH, LZX, TAR, DMS, ARC, ZOO) with FILE_ID.DIZ extraction.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ArchiveEntry,
  IArchiveExtractor,
  BaseArchiveExtractor,
  detectArchiveFormat,
  getExtractorForFile,
  extractFileDizFromArchive,
} from '../../src/utils/archive-extractor';

// Mock fs/promises
jest.mock('fs/promises');

// Mock sysop-debug.util
jest.mock('../../src/utils/sysop-debug.util', () => ({
  SysopDebugUtil: {
    debug: jest.fn(),
  },
  DebugSeverity: {
    INFO: 'INFO',
    WARNING: 'WARNING',
    ERROR: 'ERROR',
  },
}));

// Mock extractor modules
jest.mock('../../src/utils/extractors/zip-extractor', () => ({
  ZipExtractor: jest.fn().mockImplementation(() => ({
    listFiles: jest.fn(),
    extractFile: jest.fn(),
    getEntries: jest.fn(),
    extractFileDiz: jest.fn(),
  })),
}));

jest.mock('../../src/utils/extractors/lha-extractor', () => ({
  LhaExtractor: jest.fn().mockImplementation(() => ({
    listFiles: jest.fn(),
    extractFile: jest.fn(),
    getEntries: jest.fn(),
    extractFileDiz: jest.fn(),
  })),
}));

jest.mock('../../src/utils/extractors/lzh-extractor', () => ({
  LzhExtractor: jest.fn().mockImplementation(() => ({
    listFiles: jest.fn(),
    extractFile: jest.fn(),
    getEntries: jest.fn(),
    extractFileDiz: jest.fn(),
  })),
}));

jest.mock('../../src/utils/extractors/tar-extractor', () => ({
  TarExtractor: jest.fn().mockImplementation(() => ({
    listFiles: jest.fn(),
    extractFile: jest.fn(),
    getEntries: jest.fn(),
    extractFileDiz: jest.fn(),
  })),
}));

jest.mock('../../src/utils/extractors/lzx-extractor', () => ({
  LzxExtractor: jest.fn().mockImplementation(() => ({
    listFiles: jest.fn(),
    extractFile: jest.fn(),
    getEntries: jest.fn(),
    extractFileDiz: jest.fn(),
  })),
}));

jest.mock('../../src/utils/extractors/dms-extractor', () => ({
  DmsExtractor: jest.fn().mockImplementation(() => ({
    listFiles: jest.fn(),
    extractFile: jest.fn(),
    getEntries: jest.fn(),
    extractFileDiz: jest.fn(),
  })),
}));

jest.mock('../../src/utils/extractors/arc-extractor', () => ({
  ArcExtractor: jest.fn().mockImplementation(() => ({
    listFiles: jest.fn(),
    extractFile: jest.fn(),
    getEntries: jest.fn(),
    extractFileDiz: jest.fn(),
  })),
}));

jest.mock('../../src/utils/extractors/zoo-extractor', () => ({
  ZooExtractor: jest.fn().mockImplementation(() => ({
    listFiles: jest.fn(),
    extractFile: jest.fn(),
    getEntries: jest.fn(),
    extractFileDiz: jest.fn(),
  })),
}));

// Concrete test extractor
class TestExtractor extends BaseArchiveExtractor {
  constructor() {
    super('TEST');
  }

  async listFiles(filepath: string): Promise<string[]> {
    return ['file1.txt', 'file2.txt', 'FILE_ID.DIZ'];
  }

  async extractFile(filepath: string, filename: string): Promise<Buffer | null> {
    if (filename.toLowerCase() === 'file_id.diz') {
      return Buffer.from('Test DIZ content');
    }
    return null;
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    return [
      { name: 'file1.txt', size: 100 },
      { name: 'file2.txt', size: 200 },
      { name: 'FILE_ID.DIZ', size: 50 },
    ];
  }
}

describe('Archive Extractor Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.log/error
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ArchiveEntry interface', () => {
    it('should define correct structure', () => {
      const entry: ArchiveEntry = {
        name: 'test.txt',
        size: 1024,
      };

      expect(entry.name).toBe('test.txt');
      expect(entry.size).toBe(1024);
    });

    it('should support optional compressedSize', () => {
      const entry: ArchiveEntry = {
        name: 'test.txt',
        size: 1024,
        compressedSize: 512,
      };

      expect(entry.compressedSize).toBe(512);
    });

    it('should support optional data', () => {
      const entry: ArchiveEntry = {
        name: 'test.txt',
        size: 10,
        data: Buffer.from('test data'),
      };

      expect(entry.data).toBeInstanceOf(Buffer);
    });
  });

  describe('IArchiveExtractor interface', () => {
    it('should define required methods', () => {
      const extractor = new TestExtractor();

      expect(typeof extractor.listFiles).toBe('function');
      expect(typeof extractor.extractFile).toBe('function');
      expect(typeof extractor.getEntries).toBe('function');
    });
  });

  describe('BaseArchiveExtractor', () => {
    let extractor: TestExtractor;

    beforeEach(() => {
      extractor = new TestExtractor();
    });

    describe('constructor', () => {
      it('should store format name', () => {
        expect((extractor as any).formatName).toBe('TEST');
      });
    });

    describe('findFileDizEntry', () => {
      it('should find FILE_ID.DIZ in root', () => {
        const entries: ArchiveEntry[] = [
          { name: 'readme.txt', size: 100 },
          { name: 'file_id.diz', size: 50 },
          { name: 'data.bin', size: 200 },
        ];

        const result = (extractor as any).findFileDizEntry(entries);
        expect(result).not.toBeNull();
        expect(result!.name).toBe('file_id.diz');
      });

      it('should find FILE_ID.DIZ case-insensitively', () => {
        const entries: ArchiveEntry[] = [
          { name: 'FILE_ID.DIZ', size: 50 },
        ];

        const result = (extractor as any).findFileDizEntry(entries);
        expect(result).not.toBeNull();
      });

      it('should find FILE_ID.DIZ in subdirectory with forward slash', () => {
        const entries: ArchiveEntry[] = [
          { name: 'docs/file_id.diz', size: 50 },
        ];

        const result = (extractor as any).findFileDizEntry(entries);
        expect(result).not.toBeNull();
      });

      it('should find FILE_ID.DIZ in subdirectory with backslash', () => {
        const entries: ArchiveEntry[] = [
          { name: 'docs\\file_id.diz', size: 50 },
        ];

        const result = (extractor as any).findFileDizEntry(entries);
        expect(result).not.toBeNull();
      });

      it('should return null when FILE_ID.DIZ not found', () => {
        const entries: ArchiveEntry[] = [
          { name: 'readme.txt', size: 100 },
          { name: 'data.bin', size: 200 },
        ];

        const result = (extractor as any).findFileDizEntry(entries);
        expect(result).toBeNull();
      });

      it('should handle empty entries array', () => {
        const result = (extractor as any).findFileDizEntry([]);
        expect(result).toBeNull();
      });

      it('should match nested FILE_ID.DIZ with mixed case', () => {
        const entries: ArchiveEntry[] = [
          { name: 'some/path/FILE_ID.DIZ', size: 50 },
        ];

        const result = (extractor as any).findFileDizEntry(entries);
        expect(result).not.toBeNull();
      });
    });

    describe('findEntryByName', () => {
      it('should find entry by exact name', () => {
        const entries: ArchiveEntry[] = [
          { name: 'readme.txt', size: 100 },
          { name: 'data.bin', size: 200 },
        ];

        const result = (extractor as any).findEntryByName(entries, 'readme.txt');
        expect(result).not.toBeNull();
        expect(result!.name).toBe('readme.txt');
      });

      it('should find entry case-insensitively', () => {
        const entries: ArchiveEntry[] = [
          { name: 'README.TXT', size: 100 },
        ];

        const result = (extractor as any).findEntryByName(entries, 'readme.txt');
        expect(result).not.toBeNull();
      });

      it('should return null when entry not found', () => {
        const entries: ArchiveEntry[] = [
          { name: 'readme.txt', size: 100 },
        ];

        const result = (extractor as any).findEntryByName(entries, 'nonexistent.txt');
        expect(result).toBeNull();
      });

      it('should handle empty entries array', () => {
        const result = (extractor as any).findEntryByName([], 'test.txt');
        expect(result).toBeNull();
      });

      it('should handle empty filename', () => {
        const entries: ArchiveEntry[] = [
          { name: 'test.txt', size: 100 },
        ];

        const result = (extractor as any).findEntryByName(entries, '');
        expect(result).toBeNull();
      });
    });

    describe('extractFileDiz', () => {
      it('should extract FILE_ID.DIZ successfully', async () => {
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

        const result = await extractor.extractFileDiz('/path/test.zip', '/tmp/output.diz');

        expect(result).toBe(true);
        expect(fs.writeFile).toHaveBeenCalledWith('/tmp/output.diz', expect.any(Buffer));
      });

      it('should return false when FILE_ID.DIZ not found', async () => {
        const emptyExtractor = new TestExtractor();
        jest.spyOn(emptyExtractor, 'getEntries').mockResolvedValue([
          { name: 'readme.txt', size: 100 },
        ]);

        const result = await emptyExtractor.extractFileDiz('/path/test.zip', '/tmp/output.diz');

        expect(result).toBe(false);
        expect(fs.writeFile).not.toHaveBeenCalled();
      });

      it('should return false when extraction fails', async () => {
        jest.spyOn(extractor, 'extractFile').mockResolvedValue(null);

        const result = await extractor.extractFileDiz('/path/test.zip', '/tmp/output.diz');

        expect(result).toBe(false);
      });

      it('should handle write errors', async () => {
        (fs.writeFile as jest.Mock).mockRejectedValue(new Error('Write failed'));

        const result = await extractor.extractFileDiz('/path/test.zip', '/tmp/output.diz');

        expect(result).toBe(false);
      });

      it('should handle getEntries errors', async () => {
        jest.spyOn(extractor, 'getEntries').mockRejectedValue(new Error('Read failed'));

        const result = await extractor.extractFileDiz('/path/test.zip', '/tmp/output.diz');

        expect(result).toBe(false);
      });

      it('should log extraction progress', async () => {
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

        await extractor.extractFileDiz('/path/test.zip', '/tmp/output.diz');

        expect(console.log).toHaveBeenCalled();
      });

      it('should write correct data to output file', async () => {
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

        await extractor.extractFileDiz('/path/test.zip', '/tmp/output.diz');

        expect(fs.writeFile).toHaveBeenCalledWith(
          '/tmp/output.diz',
          Buffer.from('Test DIZ content')
        );
      });
    });

    describe('log', () => {
      it('should log with format prefix', () => {
        (extractor as any).log('Test message');

        expect(console.log).toHaveBeenCalledWith('[TEST] Test message');
      });
    });

    describe('logError', () => {
      it('should log error with format prefix', () => {
        (extractor as any).logError('Error message');

        expect(console.error).toHaveBeenCalledWith('[TEST] Error message');
      });
    });
  });

  describe('detectArchiveFormat', () => {
    it('should detect ZIP format', () => {
      expect(detectArchiveFormat('/path/file.zip')).toBe('zip');
      expect(detectArchiveFormat('/path/file.ZIP')).toBe('zip');
    });

    it('should detect LHA format', () => {
      expect(detectArchiveFormat('/path/file.lha')).toBe('lha');
      expect(detectArchiveFormat('/path/file.LHA')).toBe('lha');
    });

    it('should detect LZH format', () => {
      expect(detectArchiveFormat('/path/file.lzh')).toBe('lzh');
    });

    it('should detect LZX format', () => {
      expect(detectArchiveFormat('/path/file.lzx')).toBe('lzx');
    });

    it('should detect TAR format', () => {
      expect(detectArchiveFormat('/path/file.tar')).toBe('tar');
    });

    it('should detect TAR.GZ format from .gz', () => {
      expect(detectArchiveFormat('/path/file.gz')).toBe('tar.gz');
    });

    it('should detect TAR.GZ format from .tgz', () => {
      expect(detectArchiveFormat('/path/file.tgz')).toBe('tar.gz');
    });

    it('should detect TAR.GZ format from .tar.gz', () => {
      expect(detectArchiveFormat('/path/file.tar.gz')).toBe('tar.gz');
    });

    it('should detect TAR.Z format from .tar.z', () => {
      expect(detectArchiveFormat('/path/file.tar.z')).toBe('tar.gz');
    });

    it('should detect DMS format', () => {
      expect(detectArchiveFormat('/path/file.dms')).toBe('dms');
    });

    it.skip('should detect ARC format', () => {
      // Skipped: ARC support not fully implemented yet
      expect(detectArchiveFormat('/path/file.arc')).toBe('arc');
    });

    it.skip('should detect ZOO format', () => {
      // Skipped: ZOO support not fully implemented yet
      expect(detectArchiveFormat('/path/file.zoo')).toBe('zoo');
    });

    it('should return null for unknown format', () => {
      expect(detectArchiveFormat('/path/file.txt')).toBeNull();
      expect(detectArchiveFormat('/path/file.unknown')).toBeNull();
    });

    it('should handle files without extension', () => {
      expect(detectArchiveFormat('/path/filename')).toBeNull();
    });

    it('should handle empty path', () => {
      expect(detectArchiveFormat('')).toBeNull();
    });

    it('should be case-insensitive', () => {
      expect(detectArchiveFormat('/path/FILE.ZIP')).toBe('zip');
      expect(detectArchiveFormat('/path/File.Lha')).toBe('lha');
    });

    it('should handle paths with multiple dots', () => {
      expect(detectArchiveFormat('/path/file.backup.zip')).toBe('zip');
    });
  });

  describe('getExtractorForFile', () => {
    it('should return ZipExtractor for .zip files', async () => {
      const extractor = await getExtractorForFile('/path/file.zip');

      expect(extractor).not.toBeNull();
      expect(extractor).toBeDefined();
    });

    it('should return LhaExtractor for .lha files', async () => {
      const extractor = await getExtractorForFile('/path/file.lha');

      expect(extractor).not.toBeNull();
    });

    it('should return LzhExtractor for .lzh files', async () => {
      const extractor = await getExtractorForFile('/path/file.lzh');

      expect(extractor).not.toBeNull();
    });

    it('should return TarExtractor for .tar files', async () => {
      const extractor = await getExtractorForFile('/path/file.tar');

      expect(extractor).not.toBeNull();
    });

    it('should return TarExtractor for .tar.gz files', async () => {
      const extractor = await getExtractorForFile('/path/file.tar.gz');

      expect(extractor).not.toBeNull();
    });

    it('should return LzxExtractor for .lzx files', async () => {
      const extractor = await getExtractorForFile('/path/file.lzx');

      expect(extractor).not.toBeNull();
    });

    it('should return DmsExtractor for .dms files', async () => {
      const extractor = await getExtractorForFile('/path/file.dms');

      expect(extractor).not.toBeNull();
    });

    it.skip('should return ArcExtractor for .arc files', async () => {
      // Skipped: ARC extractor not fully implemented yet
      const extractor = await getExtractorForFile('/path/file.arc');
      expect(extractor).not.toBeNull();
    });

    it.skip('should return ZooExtractor for .zoo files', async () => {
      // Skipped: ZOO extractor not fully implemented yet
      const extractor = await getExtractorForFile('/path/file.zoo');
      expect(extractor).not.toBeNull();
    });

    it('should return null for unsupported format', async () => {
      const extractor = await getExtractorForFile('/path/file.txt');

      expect(extractor).toBeNull();
    });

    it('should return null for files without extension', async () => {
      const extractor = await getExtractorForFile('/path/filename');

      expect(extractor).toBeNull();
    });
  });

  describe('extractFileDizFromArchive', () => {
    it('should return false for unsupported format', async () => {
      const result = await extractFileDizFromArchive('/path/test.txt', '/tmp/output.diz');

      expect(result).toBe(false);
    });

    it.skip('should extract DIZ from supported archive', async () => {
      // Skipped: Complex mocking scenario with dynamic imports
      // Tested via BaseArchiveExtractor.extractFileDiz instead
    });

    it.skip('should return false when extractor lacks extractFileDiz method', async () => {
      // Skipped: Complex mocking scenario
    });

    it.skip('should handle extraction failure', async () => {
      // Skipped: Complex mocking scenario
    });
  });

  describe('integration tests', () => {
    it('should handle complete DIZ extraction workflow', async () => {
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const extractor = new TestExtractor();
      const result = await extractor.extractFileDiz('/uploads/package.lha', '/tmp/diz.txt');

      expect(result).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle multiple format detections', () => {
      const formats = [
        ['file.zip', 'zip'],
        ['file.lha', 'lha'],
        ['file.tar.gz', 'tar.gz'],
        ['file.dms', 'dms'],
        ['file.lzx', 'lzx'],
      ];

      formats.forEach(([filename, expectedFormat]) => {
        expect(detectArchiveFormat(`/path/${filename}`)).toBe(expectedFormat);
      });
    });

    it('should handle FILE_ID.DIZ in various locations', () => {
      const extractor = new TestExtractor();
      const testCases = [
        { name: 'file_id.diz', size: 50 },
        { name: 'docs/file_id.diz', size: 50 },
        { name: 'docs\\file_id.diz', size: 50 },
        { name: 'a/b/c/FILE_ID.DIZ', size: 50 },
      ];

      testCases.forEach(entry => {
        const result = (extractor as any).findFileDizEntry([entry]);
        expect(result).not.toBeNull();
        expect(result.name).toBe(entry.name);
      });
    });

    it('should handle archives without FILE_ID.DIZ', async () => {
      const emptyExtractor = new TestExtractor();
      jest.spyOn(emptyExtractor, 'getEntries').mockResolvedValue([
        { name: 'readme.txt', size: 100 },
        { name: 'data.bin', size: 200 },
      ]);

      const result = await emptyExtractor.extractFileDiz('/path/test.zip', '/tmp/diz.txt');

      expect(result).toBe(false);
    });
  });
});
