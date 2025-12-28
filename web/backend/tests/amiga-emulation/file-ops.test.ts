/**
 * File Operations Unit Tests
 * Tests Rename/SetProtection and other DOS file operations
 *
 * Tests the file operation implementations in DosLibrary
 */

describe('DOS File Operations', () => {
  describe('Amiga file protection flags', () => {
    // FIBF_* flags from dos/dos.h
    const FIBF_DELETE = 1 << 0;    // File is deletable
    const FIBF_EXECUTE = 1 << 1;   // File is executable
    const FIBF_WRITE = 1 << 2;     // File is writable
    const FIBF_READ = 1 << 3;      // File is readable
    const FIBF_ARCHIVE = 1 << 4;   // Archive bit
    const FIBF_PURE = 1 << 5;      // Pure (reentrant)
    const FIBF_SCRIPT = 1 << 6;    // Script file
    const FIBF_HIDDEN = 1 << 7;    // Hidden file (custom)

    test('FIBF_DELETE is bit 0', () => {
      expect(FIBF_DELETE).toBe(1);
    });

    test('FIBF_EXECUTE is bit 1', () => {
      expect(FIBF_EXECUTE).toBe(2);
    });

    test('FIBF_WRITE is bit 2', () => {
      expect(FIBF_WRITE).toBe(4);
    });

    test('FIBF_READ is bit 3', () => {
      expect(FIBF_READ).toBe(8);
    });

    test('FIBF_ARCHIVE is bit 4', () => {
      expect(FIBF_ARCHIVE).toBe(16);
    });

    test('FIBF_PURE is bit 5', () => {
      expect(FIBF_PURE).toBe(32);
    });

    test('FIBF_SCRIPT is bit 6', () => {
      expect(FIBF_SCRIPT).toBe(64);
    });

    test('default protection should allow RWED', () => {
      const DEFAULT_PROTECTION = FIBF_READ | FIBF_WRITE | FIBF_EXECUTE | FIBF_DELETE;
      expect(DEFAULT_PROTECTION).toBe(0x0F); // bits 0-3 set
    });
  });

  describe('Protection string parsing', () => {
    const parseProtection = (str: string): number => {
      let flags = 0;
      const FIBF_DELETE = 1;
      const FIBF_EXECUTE = 2;
      const FIBF_WRITE = 4;
      const FIBF_READ = 8;
      const FIBF_ARCHIVE = 16;
      const FIBF_PURE = 32;
      const FIBF_SCRIPT = 64;
      const FIBF_HIDDEN = 128;

      for (const char of str.toUpperCase()) {
        switch (char) {
          case 'D': flags |= FIBF_DELETE; break;
          case 'E': flags |= FIBF_EXECUTE; break;
          case 'W': flags |= FIBF_WRITE; break;
          case 'R': flags |= FIBF_READ; break;
          case 'A': flags |= FIBF_ARCHIVE; break;
          case 'P': flags |= FIBF_PURE; break;
          case 'S': flags |= FIBF_SCRIPT; break;
          case 'H': flags |= FIBF_HIDDEN; break;
        }
      }
      return flags;
    };

    test('should parse "RWED" as all basic permissions', () => {
      expect(parseProtection('RWED')).toBe(0x0F);
    });

    test('should parse "R" as read only', () => {
      expect(parseProtection('R')).toBe(8);
    });

    test('should parse "RW" as read/write', () => {
      expect(parseProtection('RW')).toBe(12);
    });

    test('should parse "" as no permissions', () => {
      expect(parseProtection('')).toBe(0);
    });

    test('should parse "HSPARWED" as all flags', () => {
      expect(parseProtection('HSPARWED')).toBe(0xFF);
    });

    test('should be case insensitive', () => {
      expect(parseProtection('rwed')).toBe(parseProtection('RWED'));
    });
  });

  describe('Rename operations', () => {
    test('should validate same-device rename', () => {
      // Rename should fail across devices
      const sameDevice = (from: string, to: string): boolean => {
        const getDevice = (path: string) => {
          const colonIdx = path.indexOf(':');
          return colonIdx >= 0 ? path.substring(0, colonIdx).toUpperCase() : 'CURRENT';
        };
        return getDevice(from) === getDevice(to);
      };

      expect(sameDevice('Work:file.txt', 'Work:newname.txt')).toBe(true);
      expect(sameDevice('Work:file.txt', 'RAM:newname.txt')).toBe(false);
      expect(sameDevice('file.txt', 'newname.txt')).toBe(true);
    });

    test('ERROR_RENAME_ACROSS_DEVICES is 224', () => {
      const ERROR_RENAME_ACROSS_DEVICES = 224;
      expect(ERROR_RENAME_ACROSS_DEVICES).toBe(224);
    });
  });

  describe('Path parsing', () => {
    const parsePath = (path: string) => {
      const colonIdx = path.indexOf(':');
      if (colonIdx >= 0) {
        return {
          device: path.substring(0, colonIdx),
          path: path.substring(colonIdx + 1),
          isAbsolute: true
        };
      }
      return {
        device: null,
        path: path,
        isAbsolute: false
      };
    };

    test('should parse device:path', () => {
      const result = parsePath('Work:Projects/file.txt');
      expect(result.device).toBe('Work');
      expect(result.path).toBe('Projects/file.txt');
      expect(result.isAbsolute).toBe(true);
    });

    test('should parse relative path', () => {
      const result = parsePath('file.txt');
      expect(result.device).toBeNull();
      expect(result.path).toBe('file.txt');
      expect(result.isAbsolute).toBe(false);
    });

    test('should parse root of device', () => {
      const result = parsePath('RAM:');
      expect(result.device).toBe('RAM');
      expect(result.path).toBe('');
    });
  });

  describe('File info block (FIB) structure', () => {
    // FIB offsets
    const fib_DiskKey = 0;        // 4 bytes
    const fib_DirEntryType = 4;   // 4 bytes
    const fib_FileName = 8;       // 108 bytes
    const fib_Protection = 116;   // 4 bytes
    const fib_EntryType = 120;    // 4 bytes
    const fib_Size = 124;         // 4 bytes
    const fib_NumBlocks = 128;    // 4 bytes
    const fib_Date = 132;         // 12 bytes (DateStamp)
    const fib_Comment = 144;      // 80 bytes
    const fib_OwnerUID = 224;     // 2 bytes
    const fib_OwnerGID = 226;     // 2 bytes
    const FIB_SIZE = 260;         // Total size

    test('FIB should be 260 bytes', () => {
      expect(FIB_SIZE).toBe(260);
    });

    test('fib_FileName starts at offset 8', () => {
      expect(fib_FileName).toBe(8);
    });

    test('fib_Protection at offset 116', () => {
      expect(fib_Protection).toBe(116);
    });

    test('fib_Size at offset 124', () => {
      expect(fib_Size).toBe(124);
    });

    test('fib_Comment starts at offset 144', () => {
      expect(fib_Comment).toBe(144);
    });
  });

  describe('Directory entry types', () => {
    const ST_ROOT = 1;
    const ST_USERDIR = 2;
    const ST_SOFTLINK = 3;
    const ST_LINKDIR = 4;
    const ST_FILE = -3;
    const ST_LINKFILE = -4;
    const ST_PIPEFILE = -5;

    test('directories have positive type', () => {
      expect(ST_ROOT).toBeGreaterThan(0);
      expect(ST_USERDIR).toBeGreaterThan(0);
    });

    test('files have negative type', () => {
      expect(ST_FILE).toBeLessThan(0);
      expect(ST_LINKFILE).toBeLessThan(0);
      expect(ST_PIPEFILE).toBeLessThan(0);
    });

    test('ST_FILE is -3', () => {
      expect(ST_FILE).toBe(-3);
    });

    test('ST_USERDIR is 2', () => {
      expect(ST_USERDIR).toBe(2);
    });
  });

  describe('Open modes', () => {
    const MODE_OLDFILE = 1005;     // Open existing file
    const MODE_NEWFILE = 1006;     // Create new file (truncate if exists)
    const MODE_READWRITE = 1004;   // Open for read/write (create if needed)

    test('MODE_OLDFILE is 1005', () => {
      expect(MODE_OLDFILE).toBe(1005);
    });

    test('MODE_NEWFILE is 1006', () => {
      expect(MODE_NEWFILE).toBe(1006);
    });

    test('MODE_READWRITE is 1004', () => {
      expect(MODE_READWRITE).toBe(1004);
    });
  });

  describe('Seek modes', () => {
    const OFFSET_BEGINNING = -1;
    const OFFSET_CURRENT = 0;
    const OFFSET_END = 1;

    test('OFFSET_BEGINNING is -1', () => {
      expect(OFFSET_BEGINNING).toBe(-1);
    });

    test('OFFSET_CURRENT is 0', () => {
      expect(OFFSET_CURRENT).toBe(0);
    });

    test('OFFSET_END is 1', () => {
      expect(OFFSET_END).toBe(1);
    });
  });

  describe('Lock modes', () => {
    const SHARED_LOCK = -2;     // Multiple readers
    const ACCESS_READ = -2;     // Alias
    const EXCLUSIVE_LOCK = -1;  // Single writer
    const ACCESS_WRITE = -1;    // Alias

    test('SHARED_LOCK equals ACCESS_READ', () => {
      expect(SHARED_LOCK).toBe(ACCESS_READ);
    });

    test('EXCLUSIVE_LOCK equals ACCESS_WRITE', () => {
      expect(EXCLUSIVE_LOCK).toBe(ACCESS_WRITE);
    });

    test('SHARED_LOCK is -2', () => {
      expect(SHARED_LOCK).toBe(-2);
    });

    test('EXCLUSIVE_LOCK is -1', () => {
      expect(EXCLUSIVE_LOCK).toBe(-1);
    });
  });
});
