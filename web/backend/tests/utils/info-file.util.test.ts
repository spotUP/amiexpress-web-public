/**
 * Unit tests for info-file.util.ts
 * Tests Amiga .info file parsing and tooltype management
 */

// Mock dependencies - MUST be before imports for hoisting
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockExistsSync = jest.fn();

jest.mock('fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
}));

import * as fs from 'fs';
import {
  parseInfoFile,
  writeInfoFile,
  TooltypeEditor,
  updateTooltype,
  addTooltype,
  toggleTooltypeComment,
  removeTooltype,
  InfoFile,
  Tooltype
} from '../../src/utils/info-file.util';

describe('info-file.util', () => {
  let mockFs: Map<string, Buffer>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation();

    // Create mock file system
    mockFs = new Map();

    // Mock fs functions with full implementations
    mockExistsSync.mockImplementation((path: string) => {
      return mockFs.has(path);
    });

    mockReadFileSync.mockImplementation((path: string) => {
      console.log(`[MOCK] readFileSync called with: ${path}`);
      console.log(`[MOCK] mockFs has ${mockFs.size} entries`);
      const content = mockFs.get(path);
      if (!content) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return content;
    });

    mockWriteFileSync.mockImplementation((path: string, content: Buffer | string) => {
      const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
      mockFs.set(path, buffer);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Don't restore mocks - we set them up in beforeEach
  });

  describe('parseInfoFile - Binary .info files', () => {
    it('should parse binary .info file with magic bytes', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer[0] = 0xe3;
      mockBuffer[1] = 0x10;

      // Add a simple tooltype "DOORTYPE=XIM"
      const tooltypeStr = 'DOORTYPE=XIM';
      mockBuffer.write(tooltypeStr, 78, 'utf8');

      // Add to mock filesystem
      mockFs.set('/test/door.info', mockBuffer);

      // Verify mock is set up
      expect(mockFs.has('/test/door.info')).toBe(true);
      expect(fs.readFileSync).toBeDefined();

      const result = parseInfoFile('/test/door.info');

      expect(result.isBinary).toBe(true);
      expect(result.filePath).toBe('/test/door.info');
      expect(result.rawBuffer).toEqual(mockBuffer);
    });

    it('should extract tooltypes from binary file', () => {
      const mockBuffer = Buffer.alloc(120);
      mockBuffer[0] = 0xe3;
      mockBuffer[1] = 0x10;

      const tooltypes = 'DOORTYPE=XIM\0LOCATION=doors/\0';
      mockBuffer.write(tooltypes, 80, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);

      const result = parseInfoFile('/test/door.info');

      expect(result.tooltypes.length).toBeGreaterThan(0);
      const doortypeFound = result.tooltypes.some(tt => tt.key === 'DOORTYPE');
      expect(doortypeFound).toBe(true);
    });

    it('should split diskObject and iconData correctly', () => {
      const mockBuffer = Buffer.alloc(200);
      mockBuffer[0] = 0xe3;
      mockBuffer[1] = 0x10;

      const tooltypeStr = 'KEY=VALUE';
      const tooltypeOffset = 100;
      mockBuffer.write(tooltypeStr, tooltypeOffset, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);

      const result = parseInfoFile('/test/door.info');

      expect(result.diskObject.length).toBeGreaterThan(0);
      expect(result.diskObject.length).toBeLessThan(mockBuffer.length);
    });

    it('should handle binary file with no tooltypes', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer[0] = 0xe3;
      mockBuffer[1] = 0x10;

      mockFs.set('/test/door.info', mockBuffer);

      const result = parseInfoFile('/test/door.info');

      expect(result.isBinary).toBe(true);
      expect(result.tooltypes).toEqual([]);
      expect(result.diskObject).toEqual(mockBuffer.slice(0, 78));
      expect(result.iconData).toEqual(mockBuffer.slice(78));
    });
  });

  describe('parseInfoFile - Text .info files', () => {
    it('should parse text .info file', () => {
      const textContent = 'DOORTYPE=XIM\nLOCATION=doors/';
      const mockBuffer = Buffer.from(textContent, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);

      const result = parseInfoFile('/test/door.info');

      expect(result.isBinary).toBe(false);
      expect(result.diskObject.length).toBe(0);
    });

    it('should extract FORM trailer from text file', () => {
      const textContent = 'KEY=VALUE\nFORM';
      const mockBuffer = Buffer.from(textContent, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);

      const result = parseInfoFile('/test/door.info');

      expect(result.iconData.length).toBeGreaterThan(0);
      expect(result.iconData.toString()).toContain('FORM');
    });

    it('should handle text file without FORM trailer', () => {
      const textContent = 'KEY=VALUE';
      const mockBuffer = Buffer.from(textContent, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);

      const result = parseInfoFile('/test/door.info');

      expect(result.iconData.length).toBe(0);
    });
  });

  describe('parseInfoFile - Tooltype extraction', () => {
    it('should extract simple key=value tooltypes', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('DOORTYPE=XIM', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.value).toBe('XIM');
      expect(tt!.commented).toBe(false);
    });

    it('should extract flag-style tooltypes without value', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('PRELOADER', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'PRELOADER');
      expect(tt).toBeDefined();
      expect(tt!.value).toBe('');
    });

    it('should handle commented tooltypes with !', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('!DOORTYPE=XIM', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.commented).toBe(true);
    });

    it('should handle commented tooltypes with ()', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('(DOORTYPE=XIM)', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.commented).toBe(true);
    });

    it('should handle Amiga prefix #', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('#DOORTYPE=XIM', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.prefix).toBe('#');
    });

    it('should handle Amiga prefix +', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('+DOORTYPE=XIM', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.prefix).toBe('+');
    });

    it('should handle Amiga prefix %', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('%DOORTYPE=XIM', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.prefix).toBe('%');
    });

    it('should handle Amiga prefix apostrophe', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write("'DOORTYPE=XIM", 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.prefix).toBe("'");
    });

    it('should convert keys to uppercase', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('doortype=xim', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.key).toBe('DOORTYPE');
    });

    it('should reject keys with invalid characters', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('DOOR-TYPE=XIM', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key.includes('DOOR'));
      expect(tt).toBeUndefined();
    });

    it('should allow underscores and dots in keys', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('DOOR_TYPE.V2=XIM', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DOOR_TYPE.V2');
      expect(tt).toBeDefined();
    });
  });

  describe('writeInfoFile - Binary mode', () => {
    it('should write binary .info file', () => {
      const info: InfoFile = {
        filePath: '/test/door.info',
        isBinary: true,
        diskObject: Buffer.from([0xe3, 0x10, 0x00, 0x00]),
        iconData: Buffer.from([0xff, 0xff]),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: false, prefix: '', originalLine: 'DOORTYPE=XIM' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      writeInfoFile(info);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/door.info',
        expect.any(Buffer)
      );
    });

    it('should include null terminators in binary tooltypes', () => {
      const info: InfoFile = {
        filePath: '/test/door.info',
        isBinary: true,
        diskObject: Buffer.alloc(4),
        iconData: Buffer.alloc(2),
        tooltypes: [
          { key: 'KEY', value: 'VALUE', commented: false, prefix: '', originalLine: 'KEY=VALUE' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      let writtenBuffer: Buffer | undefined;
      (fs.writeFileSync as jest.Mock).mockImplementation((path, buffer) => {
        writtenBuffer = buffer;
      });

      writeInfoFile(info);

      expect(writtenBuffer).toBeDefined();
      expect(writtenBuffer!.indexOf(0)).toBeGreaterThan(-1); // Contains null bytes
    });

    it('should write commented tooltypes with !', () => {
      const info: InfoFile = {
        filePath: '/test/door.info',
        isBinary: true,
        diskObject: Buffer.alloc(4),
        iconData: Buffer.alloc(2),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: true, prefix: '', originalLine: '!DOORTYPE=XIM' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      let writtenBuffer: Buffer | undefined;
      (fs.writeFileSync as jest.Mock).mockImplementation((path, buffer) => {
        writtenBuffer = buffer;
      });

      writeInfoFile(info);

      expect(writtenBuffer).toBeDefined();
      expect(writtenBuffer!.toString()).toContain('!DOORTYPE=XIM');
    });

    it('should write prefix in tooltypes', () => {
      const info: InfoFile = {
        filePath: '/test/door.info',
        isBinary: true,
        diskObject: Buffer.alloc(4),
        iconData: Buffer.alloc(2),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: false, prefix: '#', originalLine: '#DOORTYPE=XIM' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      let writtenBuffer: Buffer | undefined;
      (fs.writeFileSync as jest.Mock).mockImplementation((path, buffer) => {
        writtenBuffer = buffer;
      });

      writeInfoFile(info);

      expect(writtenBuffer).toBeDefined();
      expect(writtenBuffer!.toString()).toContain('#DOORTYPE=XIM');
    });
  });

  describe('writeInfoFile - Text mode', () => {
    it('should write text .info file', () => {
      const info: InfoFile = {
        filePath: '/test/door.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: false, prefix: '', originalLine: 'DOORTYPE=XIM' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      let writtenBuffer: Buffer | undefined;
      (fs.writeFileSync as jest.Mock).mockImplementation((path, buffer) => {
        writtenBuffer = buffer;
      });

      writeInfoFile(info);

      expect(writtenBuffer).toBeDefined();
      expect(writtenBuffer!.toString()).toContain('DOORTYPE=XIM\n');
    });

    it('should write multiple tooltypes with newlines', () => {
      const info: InfoFile = {
        filePath: '/test/door.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: false, prefix: '', originalLine: 'DOORTYPE=XIM' },
          { key: 'LOCATION', value: 'doors/', commented: false, prefix: '', originalLine: 'LOCATION=doors/' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      let writtenBuffer: Buffer | undefined;
      (fs.writeFileSync as jest.Mock).mockImplementation((path, buffer) => {
        writtenBuffer = buffer;
      });

      writeInfoFile(info);

      expect(writtenBuffer).toBeDefined();
      expect(writtenBuffer!.toString()).toContain('DOORTYPE=XIM\n');
      expect(writtenBuffer!.toString()).toContain('LOCATION=doors/\n');
    });
  });

  describe('TooltypeEditor', () => {
    beforeEach(() => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('DOORTYPE=XIM', 50, 'utf8');
      mockFs.set('/test/door.info', mockBuffer);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    });

    it('should create editor and read tooltypes', () => {
      const editor = new TooltypeEditor('/test/door.info');
      const tooltypes = editor.getTooltypes();

      expect(tooltypes).toBeDefined();
      expect(Array.isArray(tooltypes)).toBe(true);
    });

    it('should set tooltype value', () => {
      const editor = new TooltypeEditor('/test/door.info');
      editor.set('NEWKEY', 'NEWVALUE');

      const tooltypes = editor.getTooltypes();
      const tt = tooltypes.find(t => t.key === 'NEWKEY');

      expect(tt).toBeDefined();
      expect(tt!.value).toBe('NEWVALUE');
    });

    it('should add tooltype value', () => {
      const editor = new TooltypeEditor('/test/door.info');
      editor.add('ADDEDKEY', 'ADDEDVALUE');

      const tooltypes = editor.getTooltypes();
      const tt = tooltypes.find(t => t.key === 'ADDEDKEY');

      expect(tt).toBeDefined();
    });

    it('should remove tooltype', () => {
      const editor = new TooltypeEditor('/test/door.info');
      editor.set('TEMPKEY', 'VALUE');
      editor.remove('TEMPKEY');

      const tooltypes = editor.getTooltypes();
      const tt = tooltypes.find(t => t.key === 'TEMPKEY');

      expect(tt).toBeUndefined();
    });

    it('should toggle tooltype comment', () => {
      const editor = new TooltypeEditor('/test/door.info');
      editor.set('KEY', 'VALUE', false);
      editor.toggle('KEY');

      const tooltypes = editor.getTooltypes();
      const tt = tooltypes.find(t => t.key === 'KEY');

      expect(tt!.commented).toBe(true);

      editor.toggle('KEY');
      const tt2 = editor.getTooltypes().find(t => t.key === 'KEY');
      expect(tt2!.commented).toBe(false);
    });

    it('should support method chaining', () => {
      const editor = new TooltypeEditor('/test/door.info');

      editor
        .set('KEY1', 'VALUE1')
        .set('KEY2', 'VALUE2')
        .remove('KEY1')
        .add('KEY3', 'VALUE3');

      const tooltypes = editor.getTooltypes();

      expect(tooltypes.find(t => t.key === 'KEY1')).toBeUndefined();
      expect(tooltypes.find(t => t.key === 'KEY2')).toBeDefined();
      expect(tooltypes.find(t => t.key === 'KEY3')).toBeDefined();
    });

    it('should save changes to file', () => {
      const editor = new TooltypeEditor('/test/door.info');
      editor.set('KEY', 'VALUE');
      editor.save();

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should return InfoFile from getInfo', () => {
      const editor = new TooltypeEditor('/test/door.info');
      const info = editor.getInfo();

      expect(info).toBeDefined();
      expect(info.filePath).toBe('/test/door.info');
      expect(info.tooltypes).toBeDefined();
    });
  });

  describe('updateTooltype', () => {
    it('should update existing tooltype', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'KEY', value: 'OLDVALUE', commented: false, prefix: '', originalLine: 'KEY=OLDVALUE' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      const result = updateTooltype(info, 'KEY', 'NEWVALUE', false);

      expect(result.tooltypes[0].value).toBe('NEWVALUE');
    });

    it('should add new tooltype if not exists', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [],
        rawBuffer: Buffer.alloc(0)
      };

      const result = updateTooltype(info, 'NEWKEY', 'NEWVALUE', false);

      expect(result.tooltypes.length).toBe(1);
      expect(result.tooltypes[0].key).toBe('NEWKEY');
    });

    it('should preserve existing prefix if not provided', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'KEY', value: 'VALUE', commented: false, prefix: '#', originalLine: '#KEY=VALUE' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      const result = updateTooltype(info, 'KEY', 'NEWVALUE', false);

      expect(result.tooltypes[0].prefix).toBe('#');
    });

    it('should override prefix if provided', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'KEY', value: 'VALUE', commented: false, prefix: '#', originalLine: '#KEY=VALUE' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      const result = updateTooltype(info, 'KEY', 'NEWVALUE', false, '+');

      expect(result.tooltypes[0].prefix).toBe('+');
    });
  });

  describe('addTooltype', () => {
    it('should add new tooltype', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [],
        rawBuffer: Buffer.alloc(0)
      };

      const result = addTooltype(info, 'KEY', 'VALUE');

      expect(result.tooltypes.length).toBe(1);
      expect(result.tooltypes[0].key).toBe('KEY');
    });

    it('should throw error if tooltype already exists', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'KEY', value: 'VALUE', commented: false, prefix: '', originalLine: 'KEY=VALUE' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      expect(() => addTooltype(info, 'KEY', 'NEWVALUE')).toThrow('Tooltype KEY already exists');
    });
  });

  describe('toggleTooltypeComment', () => {
    it('should toggle comment from false to true', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'KEY', value: 'VALUE', commented: false, prefix: '', originalLine: 'KEY=VALUE' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      const result = toggleTooltypeComment(info, 'KEY');

      expect(result.tooltypes[0].commented).toBe(true);
      expect(result.tooltypes[0].originalLine).toContain('!');
    });

    it('should toggle comment from true to false', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'KEY', value: 'VALUE', commented: true, prefix: '', originalLine: '!KEY=VALUE' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      const result = toggleTooltypeComment(info, 'KEY');

      expect(result.tooltypes[0].commented).toBe(false);
      expect(result.tooltypes[0].originalLine).not.toContain('!');
    });

    it('should do nothing if key not found', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [],
        rawBuffer: Buffer.alloc(0)
      };

      const result = toggleTooltypeComment(info, 'NONEXISTENT');

      expect(result.tooltypes.length).toBe(0);
    });
  });

  describe('removeTooltype', () => {
    it('should remove existing tooltype', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'KEY1', value: 'VALUE1', commented: false, prefix: '', originalLine: 'KEY1=VALUE1' },
          { key: 'KEY2', value: 'VALUE2', commented: false, prefix: '', originalLine: 'KEY2=VALUE2' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      const result = removeTooltype(info, 'KEY1');

      expect(result.tooltypes.length).toBe(1);
      expect(result.tooltypes[0].key).toBe('KEY2');
    });

    it('should handle removing non-existent tooltype', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'KEY1', value: 'VALUE1', commented: false, prefix: '', originalLine: 'KEY1=VALUE1' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      const result = removeTooltype(info, 'NONEXISTENT');

      expect(result.tooltypes.length).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty file', () => {
      mockFs.set('/test/empty.info', Buffer.alloc(0));

      const result = parseInfoFile('/test/empty.info');

      expect(result.tooltypes).toEqual([]);
    });

    it('should handle very small file', () => {
      mockFs.set('/test/small.info', Buffer.alloc(10));

      const result = parseInfoFile('/test/small.info');

      expect(result.tooltypes).toEqual([]);
    });

    it('should handle non-existent file', () => {
      // Don't add to mockFs - file doesn't exist

      const result = parseInfoFile('/test/nonexistent.info');

      expect(result.tooltypes).toEqual([]);
    });

    it('should handle tooltypes with spaces in values', () => {
      const mockBuffer = Buffer.alloc(100);
      mockBuffer.write('DESCRIPTION=This is a test', 50, 'utf8');

      mockFs.set('/test/door.info', mockBuffer);

      const result = parseInfoFile('/test/door.info');

      const tt = result.tooltypes.find(t => t.key === 'DESCRIPTION');
      expect(tt).toBeDefined();
      expect(tt!.value).toContain(' ');
    });

    it('should handle flag tooltypes (no =)', () => {
      const info: InfoFile = {
        filePath: '/test.info',
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'PRELOADER', value: '', commented: false, prefix: '', originalLine: 'PRELOADER' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      writeInfoFile(info);

      const writtenBuffer = mockFs.get('/test.info');
      expect(writtenBuffer).toBeDefined();
      expect(writtenBuffer!.toString()).toContain('PRELOADER\n');
      expect(writtenBuffer!.toString()).not.toContain('PRELOADER=');
    });
  });
});
