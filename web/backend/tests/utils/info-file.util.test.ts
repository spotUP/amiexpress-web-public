// @ts-nocheck
/**
 * Unit tests for info-file.util.ts
 * Tests Amiga .info file parsing and tooltype management
 */

import * as os from 'os';
import * as realFs from 'fs';
import * as path from 'path';
import type {
  InfoFile,
  Tooltype,
} from '../../src/utils/info-file.util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let parseInfoFile: any;
let writeInfoFile: any;
let TooltypeEditor: any;
let updateTooltype: any;
let addTooltype: any;
let toggleTooltypeComment: any;
let removeTooltype: any;

describe('info-file.util', () => {
  let testDir: string;

  beforeAll(() => {
    ({ parseInfoFile, writeInfoFile, TooltypeEditor, updateTooltype, addTooltype,
       toggleTooltypeComment, removeTooltype } = require('../../src/utils/info-file.util'));
  });

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation();
    testDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'info-file-test-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (realFs.existsSync(testDir)) {
      realFs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Helper: write a buffer to a temp file and return the path
  function writeTestFile(name: string, data: Buffer): string {
    const filePath = path.join(testDir, name);
    realFs.writeFileSync(filePath, data);
    return filePath;
  }

  // Helper: read a temp file
  function readTestFile(filePath: string): Buffer {
    return realFs.readFileSync(filePath);
  }

  describe('parseInfoFile - Binary .info files', () => {
    it('should parse binary .info file with magic bytes', () => {
      const buf = Buffer.alloc(100);
      buf[0] = 0xe3;
      buf[1] = 0x10;
      buf.write('DOORTYPE=XIM', 78, 'utf8');
      const filePath = writeTestFile('door.info', buf);

      const result = parseInfoFile(filePath);

      expect(result.isBinary).toBe(true);
      expect(result.filePath).toBe(filePath);
      expect(result.rawBuffer).toEqual(buf);
    });

    it('should extract tooltypes from binary file', () => {
      const buf = Buffer.alloc(120);
      buf[0] = 0xe3;
      buf[1] = 0x10;
      buf.write('DOORTYPE=XIM\0LOCATION=doors/\0', 80, 'utf8');
      const filePath = writeTestFile('door.info', buf);

      const result = parseInfoFile(filePath);

      expect(result.tooltypes.length).toBeGreaterThan(0);
      expect(result.tooltypes.some(tt => tt.key === 'DOORTYPE')).toBe(true);
    });

    it('should split diskObject and iconData correctly', () => {
      const buf = Buffer.alloc(200);
      buf[0] = 0xe3;
      buf[1] = 0x10;
      buf.write('KEY=VALUE', 100, 'utf8');
      const filePath = writeTestFile('door.info', buf);

      const result = parseInfoFile(filePath);

      expect(result.diskObject.length).toBeGreaterThan(0);
      // diskObject + iconData covers the full file
      expect(result.diskObject.length + result.iconData.length).toBe(buf.length);
    });

    it('should handle binary file with no tooltypes', () => {
      const buf = Buffer.alloc(100);
      buf[0] = 0xe3;
      buf[1] = 0x10;
      const filePath = writeTestFile('door.info', buf);

      const result = parseInfoFile(filePath);

      expect(result.isBinary).toBe(true);
      expect(result.tooltypes).toEqual([]);
      // diskObject + iconData should cover the full buffer
      expect(result.diskObject.length + result.iconData.length).toBe(buf.length);
    });
  });

  describe('parseInfoFile - Text .info files', () => {
    it('should parse text .info file', () => {
      const filePath = writeTestFile('door.info', Buffer.from('DOORTYPE=XIM\nLOCATION=doors/', 'utf8'));
      const result = parseInfoFile(filePath);
      expect(result.isBinary).toBe(false);
      expect(result.diskObject.length).toBe(0);
    });

    it('should extract FORM trailer from text file', () => {
      const filePath = writeTestFile('door.info', Buffer.from('KEY=VALUE\nFORM', 'utf8'));
      const result = parseInfoFile(filePath);
      expect(result.iconData.length).toBeGreaterThan(0);
      expect(result.iconData.toString()).toContain('FORM');
    });

    it('should handle text file without FORM trailer', () => {
      const filePath = writeTestFile('door.info', Buffer.from('KEY=VALUE', 'utf8'));
      const result = parseInfoFile(filePath);
      expect(result.iconData.length).toBe(0);
    });
  });

  describe('parseInfoFile - Tooltype extraction', () => {
    function textFile(content: string) {
      return writeTestFile('door.info', Buffer.from(content, 'utf8'));
    }

    it('should extract simple key=value tooltypes', () => {
      const result = parseInfoFile(textFile('DOORTYPE=XIM'));
      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.value).toBe('XIM');
      expect(tt!.commented).toBe(false);
    });

    it('should extract flag-style tooltypes without value', () => {
      const result = parseInfoFile(textFile('PRELOADER'));
      const tt = result.tooltypes.find(t => t.key === 'PRELOADER');
      expect(tt).toBeDefined();
      expect(tt!.value).toBe('');
    });

    it('should handle commented tooltypes with !', () => {
      const result = parseInfoFile(textFile('!DOORTYPE=XIM'));
      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.commented).toBe(true);
    });

    it('should handle commented tooltypes with ()', () => {
      const result = parseInfoFile(textFile('(DOORTYPE=XIM)'));
      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.commented).toBe(true);
    });

    it('should handle Amiga prefix #', () => {
      const result = parseInfoFile(textFile('#DOORTYPE=XIM'));
      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.prefix).toBe('#');
    });

    it('should handle Amiga prefix +', () => {
      const result = parseInfoFile(textFile('+DOORTYPE=XIM'));
      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.prefix).toBe('+');
    });

    it('should handle Amiga prefix %', () => {
      const result = parseInfoFile(textFile('%DOORTYPE=XIM'));
      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.prefix).toBe('%');
    });

    it('should handle Amiga prefix apostrophe', () => {
      const result = parseInfoFile(textFile("'DOORTYPE=XIM"));
      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.prefix).toBe("'");
    });

    it('should convert keys to uppercase', () => {
      const result = parseInfoFile(textFile('doortype=xim'));
      const tt = result.tooltypes.find(t => t.key === 'DOORTYPE');
      expect(tt).toBeDefined();
      expect(tt!.key).toBe('DOORTYPE');
    });

    it('should accept hyphenated keys (hyphens are valid per VALID_KEY_RE)', () => {
      // VALID_KEY_RE allows '!' through '~' excluding '=' — hyphens (0x2D) are valid
      const result = parseInfoFile(textFile('DOOR-TYPE=XIM'));
      const tt = result.tooltypes.find((t: any) => t.key === 'DOOR-TYPE');
      expect(tt).toBeDefined();
    });

    it('should allow underscores and dots in keys', () => {
      const result = parseInfoFile(textFile('DOOR_TYPE.V2=XIM'));
      const tt = result.tooltypes.find(t => t.key === 'DOOR_TYPE.V2');
      expect(tt).toBeDefined();
    });
  });

  describe('writeInfoFile - Binary mode', () => {
    it('should write binary .info file', () => {
      const filePath = path.join(testDir, 'door.info');
      const info: InfoFile = {
        filePath,
        isBinary: true,
        diskObject: Buffer.from([0xe3, 0x10, 0x00, 0x00]),
        iconData: Buffer.from([0xff, 0xff]),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: false, prefix: '', originalLine: 'DOORTYPE=XIM' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      writeInfoFile(info);

      expect(realFs.existsSync(filePath)).toBe(true);
      const written = readTestFile(filePath);
      expect(written.length).toBeGreaterThan(0);
    });

    it('should include null terminators in binary tooltypes', () => {
      const filePath = path.join(testDir, 'door.info');
      const info: InfoFile = {
        filePath,
        isBinary: true,
        diskObject: Buffer.alloc(4),
        iconData: Buffer.alloc(2),
        tooltypes: [
          { key: 'KEY', value: 'VALUE', commented: false, prefix: '', originalLine: 'KEY=VALUE' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      writeInfoFile(info);

      const written = readTestFile(filePath);
      expect(written.indexOf(0)).toBeGreaterThan(-1); // Contains null bytes
    });

    it('should write commented tooltypes with !', () => {
      const filePath = path.join(testDir, 'door.info');
      const info: InfoFile = {
        filePath,
        isBinary: true,
        diskObject: Buffer.alloc(4),
        iconData: Buffer.alloc(2),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: true, prefix: '', originalLine: '!DOORTYPE=XIM' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      writeInfoFile(info);

      const written = readTestFile(filePath);
      expect(written.toString()).toContain('!DOORTYPE=XIM');
    });

    it('should write prefix in tooltypes', () => {
      const filePath = path.join(testDir, 'door.info');
      const info: InfoFile = {
        filePath,
        isBinary: true,
        diskObject: Buffer.alloc(4),
        iconData: Buffer.alloc(2),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: false, prefix: '#', originalLine: '#DOORTYPE=XIM' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      writeInfoFile(info);

      const written = readTestFile(filePath);
      expect(written.toString()).toContain('#DOORTYPE=XIM');
    });

    /**
     * Regression: handoff #2 — info-editor delete reported [OK] but
     * the tooltype persisted on Doors/5D-User/5D-User.info because the
     * file's tooltype array structure couldn't be located, so parseInfoFile
     * tagged it _fallback and writeInfoFile silently wrote rawBuffer back
     * unchanged. Now writeInfoFile throws InfoFileWriteError so callers
     * (info-editor CLI, web admin, door manager UI) report the failure
     * honestly instead of claiming success.
     */
    it('throws InfoFileWriteError when called on a _fallback file', () => {
      // Build a binary .info that the locator can't parse: magic header,
      // some icon data, and a stray "OVERCLOCK=100\0" string preceded by a
      // bogus length prefix (matches the 5D-User.info shape we saw).
      const buf = Buffer.alloc(60);
      buf[0] = 0xe3;
      buf[1] = 0x10;
      // Bogus length prefix (4 instead of 14) followed by the tooltype string.
      // No surrounding count field — locateTooltypeArray gives up.
      buf.writeUInt32BE(4, 40);
      buf.write('OVERCLOCK=100\0', 44, 'latin1');
      const filePath = writeTestFile('malformed.info', buf);

      const info = parseInfoFile(filePath);
      expect(info.isBinary).toBe(true);
      // Sanity: the heuristic scan picks up OVERCLOCK; that's how the silent-
      // success bug fooled users in the first place.
      expect(info.tooltypes.some(tt => tt.key === 'OVERCLOCK')).toBe(true);

      // Pretend the user deleted OVERCLOCK.
      info.tooltypes = info.tooltypes.filter(tt => tt.key !== 'OVERCLOCK');

      const { InfoFileWriteError } = require('../../src/utils/info-file.util');
      expect(() => writeInfoFile(info)).toThrow(InfoFileWriteError);
      expect(() => writeInfoFile(info)).toThrow(/non-standard or corrupted/);

      // And the on-disk file is unchanged (write was rejected, not partially
      // applied — caller still has the original to retry/report).
      const onDisk = readTestFile(filePath);
      expect(onDisk).toEqual(buf);
    });
  });

  describe('writeInfoFile - Text mode', () => {
    it('should write text .info file', () => {
      const filePath = path.join(testDir, 'door.info');
      const info: InfoFile = {
        filePath,
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: false, prefix: '', originalLine: 'DOORTYPE=XIM' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      writeInfoFile(info);

      const written = readTestFile(filePath);
      expect(written.toString()).toContain('DOORTYPE=XIM\n');
    });

    it('should write multiple tooltypes with newlines', () => {
      const filePath = path.join(testDir, 'door.info');
      const info: InfoFile = {
        filePath,
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'DOORTYPE', value: 'XIM', commented: false, prefix: '', originalLine: 'DOORTYPE=XIM' },
          { key: 'LOCATION', value: 'doors/', commented: false, prefix: '', originalLine: 'LOCATION=doors/' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      writeInfoFile(info);

      const written = readTestFile(filePath);
      expect(written.toString()).toContain('DOORTYPE=XIM\n');
      expect(written.toString()).toContain('LOCATION=doors/\n');
    });
  });

  describe('TooltypeEditor', () => {
    let editorFilePath: string;

    beforeEach(() => {
      const buf = Buffer.alloc(100);
      buf.write('DOORTYPE=XIM', 50, 'utf8');
      editorFilePath = writeTestFile('door.info', buf);
    });

    it('should create editor and read tooltypes', () => {
      const editor = new TooltypeEditor(editorFilePath);
      const tooltypes = editor.getTooltypes();
      expect(tooltypes).toBeDefined();
      expect(Array.isArray(tooltypes)).toBe(true);
    });

    it('should set tooltype value', () => {
      const editor = new TooltypeEditor(editorFilePath);
      editor.set('NEWKEY', 'NEWVALUE');
      const tt = editor.getTooltypes().find(t => t.key === 'NEWKEY');
      expect(tt).toBeDefined();
      expect(tt!.value).toBe('NEWVALUE');
    });

    it('should add tooltype value', () => {
      const editor = new TooltypeEditor(editorFilePath);
      editor.add('ADDEDKEY', 'ADDEDVALUE');
      const tt = editor.getTooltypes().find(t => t.key === 'ADDEDKEY');
      expect(tt).toBeDefined();
    });

    it('should remove tooltype', () => {
      const editor = new TooltypeEditor(editorFilePath);
      editor.set('TEMPKEY', 'VALUE');
      editor.remove('TEMPKEY');
      expect(editor.getTooltypes().find(t => t.key === 'TEMPKEY')).toBeUndefined();
    });

    it('should toggle tooltype comment', () => {
      const editor = new TooltypeEditor(editorFilePath);
      editor.set('KEY', 'VALUE', false);
      editor.toggle('KEY');
      expect(editor.getTooltypes().find(t => t.key === 'KEY')!.commented).toBe(true);
      editor.toggle('KEY');
      expect(editor.getTooltypes().find(t => t.key === 'KEY')!.commented).toBe(false);
    });

    it('should support method chaining', () => {
      const editor = new TooltypeEditor(editorFilePath);
      editor.set('KEY1', 'VALUE1').set('KEY2', 'VALUE2').remove('KEY1').add('KEY3', 'VALUE3');
      const tooltypes = editor.getTooltypes();
      expect(tooltypes.find(t => t.key === 'KEY1')).toBeUndefined();
      expect(tooltypes.find(t => t.key === 'KEY2')).toBeDefined();
      expect(tooltypes.find(t => t.key === 'KEY3')).toBeDefined();
    });

    it('should save changes to file', () => {
      const editor = new TooltypeEditor(editorFilePath);
      editor.set('KEY', 'VALUE');
      editor.save();
      // Verify the file was written with the new key
      const written = readTestFile(editorFilePath);
      expect(written.toString()).toContain('KEY');
    });

    it('should return InfoFile from getInfo', () => {
      const editor = new TooltypeEditor(editorFilePath);
      const info = editor.getInfo();
      expect(info).toBeDefined();
      expect(info.filePath).toBe(editorFilePath);
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
      const filePath = writeTestFile('empty.info', Buffer.alloc(0));
      const result = parseInfoFile(filePath);
      expect(result.tooltypes).toEqual([]);
    });

    it('should handle very small file', () => {
      const filePath = writeTestFile('small.info', Buffer.alloc(10));
      const result = parseInfoFile(filePath);
      expect(result.tooltypes).toEqual([]);
    });

    it('should throw for non-existent file', () => {
      const filePath = path.join(testDir, 'nonexistent.info');
      expect(() => parseInfoFile(filePath)).toThrow();
    });

    it('should handle tooltypes with spaces in values', () => {
      const buf = Buffer.alloc(100);
      buf.write('DESCRIPTION=This is a test', 50, 'utf8');
      const filePath = writeTestFile('door.info', buf);

      const result = parseInfoFile(filePath);
      const tt = result.tooltypes.find(t => t.key === 'DESCRIPTION');
      expect(tt).toBeDefined();
      expect(tt!.value).toContain(' ');
    });

    it('should handle flag tooltypes (no =)', () => {
      const filePath = path.join(testDir, 'test.info');
      const info: InfoFile = {
        filePath,
        isBinary: false,
        diskObject: Buffer.alloc(0),
        iconData: Buffer.alloc(0),
        tooltypes: [
          { key: 'PRELOADER', value: '', commented: false, prefix: '', originalLine: 'PRELOADER' }
        ],
        rawBuffer: Buffer.alloc(0)
      };

      writeInfoFile(info);

      const written = readTestFile(filePath);
      expect(written.toString()).toContain('PRELOADER\n');
      expect(written.toString()).not.toContain('PRELOADER=');
    });
  });
});
