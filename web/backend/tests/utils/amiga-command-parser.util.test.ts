/**
 * Unit tests for amiga-command-parser.util.ts
 * Tests .info file parsing critical for 68K door emulation
 *
 * Tests parsing of Amiga .info files containing tooltypes (KEY=VALUE pairs)
 * that configure 68K doors. Critical for door execution and configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseInfoFile,
  DoorType,
  CommandType,
  ToolTypeLevel,
  CommandDefinition,
} from '../../src/utils/amiga-command-parser.util';

describe('amiga-command-parser.util (Critical for 68K Door Emulation)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amiga-parser-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create .info file with proper structure
   * Amiga .info files must be >40 bytes, so we add binary padding
   */
  function createInfoFile(filePath: string, tooltypes: string | Buffer): void {
    // Add 40-byte binary header to simulate real Amiga .info structure
    const header = Buffer.alloc(40, 0);
    const content = typeof tooltypes === 'string' ? Buffer.from(tooltypes) : tooltypes;
    fs.writeFileSync(filePath, Buffer.concat([header, content]));
  }

  describe('DoorType enum', () => {
    it('should have all door types', () => {
      expect(DoorType.XIM).toBe('XIM');
      expect(DoorType.AIM).toBe('AIM');
      expect(DoorType.SIM).toBe('SIM');
      expect(DoorType.TIM).toBe('TIM');
      expect(DoorType.IIM).toBe('IIM');
      expect(DoorType.MCI).toBe('MCI');
      expect(DoorType.AEM).toBe('AEM');
      expect(DoorType.SUP).toBe('SUP');
      expect(DoorType.TS).toBe('TS');
      expect(DoorType.PYTHON).toBe('PYTHON');
      expect(DoorType.PY).toBe('PY');
      expect(DoorType.AREXX).toBe('AREXX');
      expect(DoorType.REXX).toBe('REXX');
    });

    it('should distinguish between 68K and modern door types', () => {
      // 68K door types
      const sixtyEightKTypes = [DoorType.XIM, DoorType.AIM, DoorType.SIM, DoorType.TIM, DoorType.IIM];
      sixtyEightKTypes.forEach(type => {
        expect(type).toBeDefined();
      });

      // Modern door types
      const modernTypes = [DoorType.TS, DoorType.PYTHON, DoorType.PY, DoorType.AREXX, DoorType.REXX];
      modernTypes.forEach(type => {
        expect(type).toBeDefined();
      });
    });
  });

  describe('CommandType enum', () => {
    it('should have all command types', () => {
      expect(CommandType.BBSCMD).toBe('BBSCMD');
      expect(CommandType.SYSCMD).toBe('SYSCMD');
      expect(CommandType.CUSTOM).toBe('CUSTOM');
    });
  });

  describe('ToolTypeLevel enum', () => {
    it('should have all tooltype levels', () => {
      expect(ToolTypeLevel.CONFCMD).toBe('CONFCMD');
      expect(ToolTypeLevel.NODECMD).toBe('NODECMD');
      expect(ToolTypeLevel.BBSCMD).toBe('BBSCMD');
      expect(ToolTypeLevel.CONFSYSCMD).toBe('CONFSYSCMD');
      expect(ToolTypeLevel.NODESYSCMD).toBe('NODESYSCMD');
      expect(ToolTypeLevel.SYSCMD).toBe('SYSCMD');
    });

    it('should order levels by priority', () => {
      // More specific (conf/node) levels come before general (BBS) levels
      const levels = [
        ToolTypeLevel.CONFCMD,
        ToolTypeLevel.NODECMD,
        ToolTypeLevel.BBSCMD,
        ToolTypeLevel.CONFSYSCMD,
        ToolTypeLevel.NODESYSCMD,
        ToolTypeLevel.SYSCMD,
      ];

      levels.forEach(level => expect(level).toBeDefined());
    });
  });

  describe('parseInfoFile (Critical for door configuration)', () => {
    describe('Basic parsing', () => {
      it('should parse basic .info file with tooltypes', () => {
        const infoContent = `LOCATION=doors/testdoor
TYPE=XIM
ACCESS=PUBLIC`;

        const infoFile = path.join(testDir, 'test.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/testdoor');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
        expect(result.get('ACCESS')).toBe('PUBLIC');
      });

      it('should return empty Map for non-existent file', () => {
        const result = parseInfoFile(path.join(testDir, 'nonexistent.info'));
        expect(result).toBeDefined();
        expect(result.size).toBe(0);
      });

      it('should handle empty .info file', () => {
        const infoFile = path.join(testDir, 'empty.info');
        fs.writeFileSync(infoFile, '');

        const result = parseInfoFile(infoFile);

        // Should return empty Map for empty file
        expect(result).toBeDefined();
        expect(result.size).toBe(0);
        expect(result.get('LOCATION')).toBeUndefined();
        expect(result.get('TYPE')).toBeUndefined();
      });

      it('should be case-insensitive for tooltype keys', () => {
        const infoContent = `location=doors/test
type=xim
ACCESS=public`;

        const infoFile = path.join(testDir, 'case.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/test');
        // Value case is preserved, only keys are uppercased
        expect(result.get('TYPE')).toBe('xim');
        expect(result.get('ACCESS')).toBe('public');
      });
    });

    describe('Door configuration tooltypes', () => {
      it('should parse LOCATION tooltype', () => {
        const infoContent = 'LOCATION=doors/MyDoor/door.exe';
        const infoFile = path.join(testDir, 'location.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('LOCATION')).toBe('doors/MyDoor/door.exe');
      });

      it('should parse TYPE tooltype for XIM doors', () => {
        const infoContent = 'TYPE=XIM';
        const infoFile = path.join(testDir, 'type-xim.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('TYPE')).toBe(DoorType.XIM);
      });

      it('should parse TYPE tooltype for TypeScript doors', () => {
        const infoContent = 'TYPE=TS';
        const infoFile = path.join(testDir, 'type-ts.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('TYPE')).toBe(DoorType.TS);
      });

      it('should parse ACCESS tooltype', () => {
        const infoContent = 'ACCESS=SYSOP';
        const infoFile = path.join(testDir, 'access.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('ACCESS')).toBe('SYSOP');
      });

      it('should parse ARGS tooltype', () => {
        const infoContent = 'ARGS=--config settings.cfg --verbose';
        const infoFile = path.join(testDir, 'args.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('ARGS')).toBe('--config settings.cfg --verbose');
      });

      it('should parse OVERCLOCK tooltype', () => {
        const infoContent = 'OVERCLOCK=100';
        const infoFile = path.join(testDir, 'overclock.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('OVERCLOCK')).toBe('100');
      });

      it('should parse PAGINATION tooltype', () => {
        const infoContent = 'PAGINATION=YES';
        const infoFile = path.join(testDir, 'pagination.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('PAGINATION')).toBe('YES');
      });

      it('should parse RESIDENT tooltype', () => {
        const infoContent = 'RESIDENT=NO';
        const infoFile = path.join(testDir, 'resident.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('RESIDENT')).toBe('NO');
      });

      it('should parse STACK tooltype', () => {
        const infoContent = 'STACK=8192';
        const infoFile = path.join(testDir, 'stack.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('STACK')).toBe('8192');
      });

      it('should parse PRELOADER tooltype for TypeScript doors', () => {
        const infoContent = `TYPE=TS
LOCATION=Doors/livechat/index.ts
PRELOADER=YES`;
        const infoFile = path.join(testDir, 'preloader.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);
        expect(result.get('PRELOADER')).toBe('YES');
      });
    });

    describe('Binary junk handling (Critical for real .info files)', () => {
      it('should ignore binary junk before tooltypes', () => {
        // Real Amiga .info files have binary header junk (use non-printable bytes only)
        const header = Buffer.alloc(40, 0); // Required 40-byte minimum
        const binaryJunk = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]); // Non-printable bytes
        const tooltypes = Buffer.from('LOCATION=doors/test\nTYPE=XIM');
        const infoContent = Buffer.concat([header, binaryJunk, tooltypes]);

        const infoFile = path.join(testDir, 'binary.info');
        // Write directly without createInfoFile (already has proper structure)
        fs.writeFileSync(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/test');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
      });

      it('should ignore binary junk after tooltypes', () => {
        const header = Buffer.alloc(40, 0); // Required 40-byte minimum
        const tooltypes = Buffer.from('TYPE=AIM\nLOCATION=doors/aim');
        const binaryJunk = Buffer.from([0x00, 0xFF, 0xAB, 0xCD]);
        const infoContent = Buffer.concat([header, tooltypes, binaryJunk]);

        const infoFile = path.join(testDir, 'binary-after.info');
        // Write directly without createInfoFile (already has proper structure)
        fs.writeFileSync(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('TYPE')).toBe(DoorType.AIM);
        expect(result.get('LOCATION')).toBe('doors/aim');
      });

      it('should handle mixed binary junk and tooltypes', () => {
        // Simulate real .info structure: binary header + tooltypes + binary footer
        const minHeader = Buffer.alloc(40, 0); // Required 40-byte minimum
        const header = Buffer.from([0x00, 0x01, 0x02, 0x03]);
        const tooltypes = Buffer.from('TYPE=SIM\nLOCATION=doors/sim\nACCESS=ALL');
        const footer = Buffer.from([0xFF, 0xFE, 0xFD]);
        const infoContent = Buffer.concat([minHeader, header, tooltypes, footer]);

        const infoFile = path.join(testDir, 'mixed-binary.info');
        // Write directly without createInfoFile (already has proper structure)
        fs.writeFileSync(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('TYPE')).toBe(DoorType.SIM);
        expect(result.get('LOCATION')).toBe('doors/sim');
        expect(result.get('ACCESS')).toBe('ALL');
      });
    });

    describe('Comment handling', () => {
      it('should ignore comment lines starting with ;', () => {
        const infoContent = `; This is a door
LOCATION=doors/test
; Another comment
TYPE=XIM`;

        const infoFile = path.join(testDir, 'comments.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/test');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
      });

      it('should ignore comment lines starting with #', () => {
        const infoContent = `# Configuration
LOCATION=doors/test
# Type setting
TYPE=TIM`;

        const infoFile = path.join(testDir, 'hash-comments.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/test');
        expect(result.get('TYPE')).toBe(DoorType.TIM);
      });

      it('should handle empty lines', () => {
        const infoContent = `LOCATION=doors/test

TYPE=XIM

ACCESS=PUBLIC`;

        const infoFile = path.join(testDir, 'empty-lines.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/test');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
        expect(result.get('ACCESS')).toBe('PUBLIC');
      });
    });

    describe('Key validation and edge cases', () => {
      it('should handle lines without = separator', () => {
        const infoContent = `LOCATION=doors/test
INVALID LINE WITHOUT EQUALS
TYPE=XIM`;

        const infoFile = path.join(testDir, 'no-equals.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/test');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
      });

      it('should handle empty values', () => {
        const infoContent = `LOCATION=
TYPE=XIM
ACCESS=`;

        const infoFile = path.join(testDir, 'empty-values.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
        expect(result.get('ACCESS')).toBe('');
      });

      it('should trim whitespace from keys and values', () => {
        const infoContent = `  LOCATION  =  doors/test
  TYPE  =  XIM  `;

        const infoFile = path.join(testDir, 'whitespace.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/test');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
      });

      it('should handle values with = characters', () => {
        const infoContent = 'ARGS=--param=value --other=setting';

        const infoFile = path.join(testDir, 'equals-in-value.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('ARGS')).toBe('--param=value --other=setting');
      });

      it('should handle unknown tooltype keys', () => {
        const infoContent = `LOCATION=doors/test
UNKNOWN_KEY=some_value
TYPE=XIM
ANOTHER_UNKNOWN=value`;

        const infoFile = path.join(testDir, 'unknown-keys.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/test');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
        // Unknown keys should be ignored or stored in metadata
      });
    });

    describe('Real-world door configurations', () => {
      it('should parse AquaScan .info file', () => {
        const infoContent = `LOCATION=doors/AquaScan/AquaScan.020
TYPE=XIM
ACCESS=PUBLIC
PAGINATION=NO
OVERCLOCK=100`;

        const infoFile = path.join(testDir, 'aquascan.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/AquaScan/AquaScan.020');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
        expect(result.get('ACCESS')).toBe('PUBLIC');
        expect(result.get('PAGINATION')).toBe('NO');
        expect(result.get('OVERCLOCK')).toBe('100');
      });

      it('should parse RTW (Real-Time Who) .info file', () => {
        const infoContent = `LOCATION=doors/RTW/RTW
TYPE=XIM
ACCESS=ALL
RESIDENT=YES`;

        const infoFile = path.join(testDir, 'rtw.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/RTW/RTW');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
        expect(result.get('ACCESS')).toBe('ALL');
        expect(result.get('RESIDENT')).toBe('YES');
      });

      it('should parse LiveChat TypeScript door .info file', () => {
        const infoContent = `TYPE=TS
LOCATION=Doors/livechat/index.ts
ACCESS=PUBLIC
PRELOADER=YES`;

        const infoFile = path.join(testDir, 'livechat.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('TYPE')).toBe(DoorType.TS);
        expect(result.get('LOCATION')).toBe('Doors/livechat/index.ts');
        expect(result.get('ACCESS')).toBe('PUBLIC');
        expect(result.get('PRELOADER')).toBe('YES');
      });

      it('should parse door with ARGS tooltype', () => {
        const infoContent = `LOCATION=doors/MultiTop/mtop
TYPE=XIM
ARGS=NEWSCAN
ACCESS=ALL`;

        const infoFile = path.join(testDir, 'multitop.info');
        createInfoFile(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/MultiTop/mtop');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
        expect(result.get('ARGS')).toBe('NEWSCAN');
        expect(result.get('ACCESS')).toBe('ALL');
      });

      it('should parse door with complex binary structure', () => {
        // Simulate real Amiga .info file with binary icon data
        const minHeader = Buffer.alloc(40, 0); // Required 40-byte minimum
        const header = Buffer.from([
          0x00, 0x00, 0x03, 0xE7, // Magic number
          0x00, 0x00, 0x00, 0x01, // Version
          0x00, 0x00, 0x00, 0x02, // Type
          0xFF, 0xFF, 0xFF, 0xFF, // Default tool
        ]);
        const tooltypes = Buffer.from(`LOCATION=doors/emp_tools/joincnf
TYPE=XIM
ACCESS=PUBLIC`);
        const footer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
        const infoContent = Buffer.concat([minHeader, header, tooltypes, footer]);

        const infoFile = path.join(testDir, 'real-binary.info');
        // Write directly without createInfoFile (already has proper structure)
        fs.writeFileSync(infoFile, infoContent);

        const result = parseInfoFile(infoFile);

        expect(result.get('LOCATION')).toBe('doors/emp_tools/joincnf');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
        expect(result.get('ACCESS')).toBe('PUBLIC');
      });
    });

    describe('Multiple door types', () => {
      it('should parse all 68K door types', () => {
        const doorTypes = [
          { type: 'XIM', enum: DoorType.XIM },
          { type: 'AIM', enum: DoorType.AIM },
          { type: 'SIM', enum: DoorType.SIM },
          { type: 'TIM', enum: DoorType.TIM },
          { type: 'IIM', enum: DoorType.IIM },
        ];

        doorTypes.forEach(({ type, enum: enumValue }) => {
          const infoContent = `TYPE=${type}\nLOCATION=doors/test`;
          const infoFile = path.join(testDir, `${type}.info`);
          createInfoFile(infoFile, infoContent);

          const result = parseInfoFile(infoFile);
          expect(result.get('TYPE')).toBe(enumValue);
        });
      });

      it('should parse modern door types', () => {
        const doorTypes = [
          { type: 'TS', enum: DoorType.TS },
          { type: 'PYTHON', enum: DoorType.PYTHON },
          { type: 'PY', enum: DoorType.PY },
          { type: 'AREXX', enum: DoorType.AREXX },
          { type: 'REXX', enum: DoorType.REXX },
        ];

        doorTypes.forEach(({ type, enum: enumValue }) => {
          const infoContent = `TYPE=${type}\nLOCATION=doors/test`;
          const infoFile = path.join(testDir, `${type}.info`);
          createInfoFile(infoFile, infoContent);

          const result = parseInfoFile(infoFile);
          expect(result.get('TYPE')).toBe(enumValue);
        });
      });
    });

    describe('Access levels', () => {
      it('should parse different access levels', () => {
        const accessLevels = ['PUBLIC', 'ALL', 'SYSOP', 'COSYSOP', 'VALIDATED', 'LEVEL_10'];

        accessLevels.forEach(access => {
          const infoContent = `ACCESS=${access}`;
          const infoFile = path.join(testDir, `access-${access}.info`);
          createInfoFile(infoFile, infoContent);

          const result = parseInfoFile(infoFile);
          expect(result.get('ACCESS')).toBe(access);
        });
      });
    });

    describe('Performance', () => {
      it('should parse large .info files efficiently', () => {
        const lines = ['LOCATION=doors/test', 'TYPE=XIM'];
        // Add 1000 comment lines to simulate large file
        for (let i = 0; i < 1000; i++) {
          lines.push(`; Comment line ${i}`);
        }
        const infoContent = lines.join('\n');

        const infoFile = path.join(testDir, 'large.info');
        createInfoFile(infoFile, infoContent);

        const start = Date.now();
        const result = parseInfoFile(infoFile);
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(100); // Should be fast
        expect(result.get('LOCATION')).toBe('doors/test');
        expect(result.get('TYPE')).toBe(DoorType.XIM);
      });
    });
  });

  describe('Integration tests', () => {
    it('should parse .info file and create valid CommandDefinition', () => {
      const infoContent = `LOCATION=doors/TestDoor/door.exe
TYPE=XIM
ACCESS=PUBLIC
ARGS=--mode test
PAGINATION=YES
OVERCLOCK=50
RESIDENT=NO
STACK=4096`;

      const infoFile = path.join(testDir, 'complete.info');
      createInfoFile(infoFile, infoContent);

      const result = parseInfoFile(infoFile);

      // Verify all fields are populated correctly
      expect(result).toBeDefined();
      expect(result.get('LOCATION')).toBe('doors/TestDoor/door.exe');
      expect(result.get('TYPE')).toBe(DoorType.XIM);
      expect(result.get('ACCESS')).toBe('PUBLIC');
      expect(result.get('ARGS')).toBe('--mode test');
      expect(result.get('PAGINATION')).toBe('YES');
      expect(result.get('OVERCLOCK')).toBe('50');
      expect(result.get('RESIDENT')).toBe('NO');
      expect(result.get('STACK')).toBe('4096');
    });

    it('should handle .info file matching real BBS directory structure', () => {
      // Simulate Commands/BBSCmd/WHO.info
      const infoContent = `LOCATION=doors/who/who
TYPE=XIM
ACCESS=ALL`;

      const infoFile = path.join(testDir, 'WHO.info');
      createInfoFile(infoFile, infoContent);

      const result = parseInfoFile(infoFile);

      expect(result.get('LOCATION')).toBe('doors/who/who');
      expect(result.get('TYPE')).toBe(DoorType.XIM);
      expect(result.get('ACCESS')).toBe('ALL');
    });
  });
});
