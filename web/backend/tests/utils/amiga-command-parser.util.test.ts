/**
 * Unit tests for Amiga Command Parser Utilities
 * Tests parsing of .info files (tooltypes) and .CMD files
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseInfoFile,
  parseCmdFile,
  loadCommandFromInfo,
  scanCommandDirectory,
  findCommand,
  DoorType,
  CommandType,
  CommandDefinition,
} from '../../src/utils/amiga-command-parser.util';

describe('Amiga Command Parser Utilities', () => {
  const testDir = path.join(__dirname, '../fixtures/amiga-commands');

  beforeAll(() => {
    // Create test directory structure
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create test subdirectories
    const dirs = [
      'Commands/BBSCmd',
      'Commands/SysCmd',
      'Conf1/Commands/BBSCmd',
      'Node1/Commands/BBSCmd',
    ];

    for (const dir of dirs) {
      const fullPath = path.join(testDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  });

  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('parseInfoFile', () => {
    it('should return empty map for non-existent file', () => {
      const result = parseInfoFile('/nonexistent/file.info');
      expect(result.size).toBe(0);
    });

    it('should return empty map for too-small file', () => {
      const smallFile = path.join(testDir, 'tiny.info');
      fs.writeFileSync(smallFile, 'x');

      const result = parseInfoFile(smallFile);
      expect(result.size).toBe(0);
    });

    it('should parse simple key=value tooltypes', () => {
      const infoFile = path.join(testDir, 'simple.info');
      // Create a binary .info file with embedded strings
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/test/test.xim', 50, 'ascii');
      buffer.write('ACCESS=100', 90, 'ascii');
      buffer.write('TYPE=XIM', 120, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = parseInfoFile(infoFile);

      expect(result.get('LOCATION')).toBe('doors/test/test.xim');
      expect(result.get('ACCESS')).toBe('100');
      expect(result.get('TYPE')).toBe('XIM');
    });

    it('should parse flag-only tooltypes (no value)', () => {
      const infoFile = path.join(testDir, 'flags.info');
      const buffer = Buffer.alloc(200);
      buffer.write('MULTINODE', 50, 'ascii');
      buffer.write('RESIDENT', 80, 'ascii');
      buffer.write('LOCATION=doors/test', 110, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = parseInfoFile(infoFile);

      expect(result.get('MULTINODE')).toBe('YES');
      expect(result.get('RESIDENT')).toBe('YES');
      expect(result.get('LOCATION')).toBe('doors/test');
    });

    it('should skip commented tooltypes', () => {
      const infoFile = path.join(testDir, 'comments.info');
      const buffer = Buffer.alloc(300);
      buffer.write('LOCATION=doors/valid', 50, 'ascii');
      buffer.write('(COMMENTED=value)', 90, 'ascii');
      buffer.write('!DISABLED=value', 120, 'ascii');
      buffer.write('ACCESS=50', 150, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = parseInfoFile(infoFile);

      expect(result.get('LOCATION')).toBe('doors/valid');
      expect(result.get('ACCESS')).toBe('50');
      expect(result.has('COMMENTED')).toBe(false);
      expect(result.has('DISABLED')).toBe(false);
    });

    it('should strip leading non-alphanumeric characters', () => {
      const infoFile = path.join(testDir, 'special.info');
      const buffer = Buffer.alloc(200);
      buffer.write('*LOCATION=doors/test', 50, 'ascii');
      buffer.write('$ACCESS=100', 90, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = parseInfoFile(infoFile);

      expect(result.get('LOCATION')).toBe('doors/test');
      expect(result.get('ACCESS')).toBe('100');
    });

    it('should uppercase keys', () => {
      const infoFile = path.join(testDir, 'lowercase.info');
      const buffer = Buffer.alloc(200);
      buffer.write('location=doors/test', 50, 'ascii');
      buffer.write('Access=50', 90, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = parseInfoFile(infoFile);

      expect(result.get('LOCATION')).toBe('doors/test');
      expect(result.get('ACCESS')).toBe('50');
    });

    it('should validate key format (alphanumeric+underscore, 2-32 chars)', () => {
      const infoFile = path.join(testDir, 'validation.info');
      const buffer = Buffer.alloc(300);
      buffer.write('LOCATION=valid', 50, 'ascii'); // Valid
      buffer.write('A=invalid', 90, 'ascii'); // Too short
      buffer.write('VERY_LONG_KEY_NAME_THAT_EXCEEDS_32_CHARACTERS=invalid', 120, 'ascii'); // Too long
      buffer.write('BAD-KEY=invalid', 160, 'ascii'); // Invalid character
      buffer.write('GOOD_KEY_123=valid', 200, 'ascii'); // Valid
      fs.writeFileSync(infoFile, buffer);

      const result = parseInfoFile(infoFile);

      expect(result.get('LOCATION')).toBe('valid');
      expect(result.get('GOOD_KEY_123')).toBe('valid');
      expect(result.has('A')).toBe(false);
      expect(result.has('VERY_LONG_KEY_NAME_THAT_EXCEEDS_32_CHARACTERS')).toBe(false);
      expect(result.has('BAD-KEY')).toBe(false);
    });
  });

  describe('parseCmdFile', () => {
    it('should return null for non-existent file', () => {
      const result = parseCmdFile('/nonexistent/file.cmd');
      expect(result).toBeNull();
    });

    it('should parse basic CMD file format', () => {
      const cmdFile = path.join(testDir, 'test.cmd');
      fs.writeFileSync(cmdFile, '*WHO XIM050 Doors:who/who');

      const result = parseCmdFile(cmdFile);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('WHO');
      expect(result!.type).toBe(DoorType.XIM);
      expect(result!.access).toBe(50);
      expect(result!.location).toBe('doors/who/who');
    });

    it('should parse CMD with embedded location', () => {
      const cmdFile = path.join(testDir, 'embedded.cmd');
      fs.writeFileSync(cmdFile, '*WEEK XM050Doors:WeekConfTop/WeekConfTop.XIM');

      const result = parseCmdFile(cmdFile);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('WEEK');
      expect(result!.type).toBe(DoorType.XIM);
      expect(result!.access).toBe(50);
      expect(result!.location).toBe('doors/WeekConfTop/WeekConfTop.XIM');
    });

    it('should skip empty lines and comments', () => {
      const cmdFile = path.join(testDir, 'comments.cmd');
      fs.writeFileSync(cmdFile, `
# Comment

*WHO XIM050 Doors:who/who
      `);

      const result = parseCmdFile(cmdFile);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('WHO');
    });

    it('should parse different door types', () => {
      const tests = [
        { input: '*TEST AIM100 Doors:test', type: DoorType.AIM },
        { input: '*TEST SIM100 Doors:test', type: DoorType.SIM },
        { input: '*TEST TIM100 Doors:test', type: DoorType.TIM },
        { input: '*TEST IIM100 Doors:test', type: DoorType.IIM },
        { input: '*TEST MCI100 Doors:test', type: DoorType.MCI },
      ];

      for (const test of tests) {
        const cmdFile = path.join(testDir, `type-${test.type}.cmd`);
        fs.writeFileSync(cmdFile, test.input);

        const result = parseCmdFile(cmdFile);
        expect(result!.type).toBe(test.type);
      }
    });

    it('should parse short type codes', () => {
      const tests = [
        { input: '*TEST XM100 Doors:test', type: DoorType.XIM },
        { input: '*TEST XI100 Doors:test', type: DoorType.XIM },
        { input: '*TEST AM100 Doors:test', type: DoorType.AIM },
        { input: '*TEST AI100 Doors:test', type: DoorType.AIM },
        { input: '*TEST SM100 Doors:test', type: DoorType.SIM },
        { input: '*TEST SI100 Doors:test', type: DoorType.SIM },
      ];

      for (const test of tests) {
        const cmdFile = path.join(testDir, `short-${test.type}.cmd`);
        fs.writeFileSync(cmdFile, test.input);

        const result = parseCmdFile(cmdFile);
        expect(result!.type).toBe(test.type);
      }
    });

    it('should parse access level correctly', () => {
      const cmdFile = path.join(testDir, 'access.cmd');
      fs.writeFileSync(cmdFile, '*SYSOP XIM255 Doors:admin/sysop');

      const result = parseCmdFile(cmdFile);

      expect(result!.access).toBe(255);
    });

    it('should handle zero access level', () => {
      const cmdFile = path.join(testDir, 'access-zero.cmd');
      fs.writeFileSync(cmdFile, '*PUBLIC XIM000 Doors:public/public');

      const result = parseCmdFile(cmdFile);

      expect(result!.access).toBe(0);
    });

    it('should convert DOORS: prefix to doors/', () => {
      const cmdFile = path.join(testDir, 'prefix.cmd');
      fs.writeFileSync(cmdFile, '*TEST XIM050 DOORS:test/test');

      const result = parseCmdFile(cmdFile);

      expect(result!.location).toBe('doors/test/test');
    });

    it('should convert colons to slashes in path', () => {
      const cmdFile = path.join(testDir, 'colons.cmd');
      fs.writeFileSync(cmdFile, '*TEST XIM050 Doors:Path:To:Door');

      const result = parseCmdFile(cmdFile);

      expect(result!.location).toBe('doors/Path/To/Door');
    });
  });

  describe('loadCommandFromInfo', () => {
    it('should return null for file with no tooltypes', () => {
      const infoFile = path.join(testDir, 'empty.info');
      fs.writeFileSync(infoFile, Buffer.alloc(100));

      const result = loadCommandFromInfo(infoFile);
      expect(result).toBeNull();
    });

    it('should return null if LOCATION is missing', () => {
      const infoFile = path.join(testDir, 'no-location.info');
      const buffer = Buffer.alloc(200);
      buffer.write('TYPE=XIM', 50, 'ascii');
      buffer.write('ACCESS=100', 90, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);
      expect(result).toBeNull();
    });

    it('should use BBSCMD tooltype for command name', () => {
      const infoFile = path.join(testDir, 'bbscmd-name.info');
      const buffer = Buffer.alloc(300);
      buffer.write('BBSCMD=CUSTOMNAME', 50, 'ascii');
      buffer.write('LOCATION=doors/test', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.name).toBe('CUSTOMNAME');
    });

    it('should use SYSCMD tooltype for command name', () => {
      const infoFile = path.join(testDir, 'syscmd-name.info');
      const buffer = Buffer.alloc(300);
      buffer.write('SYSCMD=SYSNAME', 50, 'ascii');
      buffer.write('LOCATION=doors/test', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.name).toBe('SYSNAME');
    });

    it('should fall back to filename for command name', () => {
      const infoFile = path.join(testDir, 'WHO.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/who', 50, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.name).toBe('WHO');
    });

    it('should uppercase command name', () => {
      const infoFile = path.join(testDir, 'lowercase.info');
      const buffer = Buffer.alloc(200);
      buffer.write('bbscmd=lowername', 50, 'ascii');
      buffer.write('LOCATION=doors/test', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.name).toBe('LOWERNAME');
    });

    it('should default type to SIM if not specified', () => {
      const infoFile = path.join(testDir, 'no-type.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.type).toBe(DoorType.SIM);
    });

    it('should parse all door types', () => {
      const types = Object.keys(DoorType);

      for (const type of types) {
        const infoFile = path.join(testDir, `type-${type}.info`);
        const buffer = Buffer.alloc(300);
        buffer.write(`TYPE=${type}`, 50, 'ascii');
        buffer.write('LOCATION=doors/test', 100, 'ascii');
        fs.writeFileSync(infoFile, buffer);

        const result = loadCommandFromInfo(infoFile);
        expect(result!.type).toBe(DoorType[type as keyof typeof DoorType]);
      }
    });

    it('should parse PATH as alias for LOCATION', () => {
      const infoFile = path.join(testDir, 'path.info');
      const buffer = Buffer.alloc(200);
      buffer.write('PATH=doors/test', 50, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.location).toBe('doors/test');
    });

    it('should convert DOORS: prefix to doors/', () => {
      const infoFile = path.join(testDir, 'doors-prefix.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=DOORS:test/test', 50, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.location).toBe('doors/test/test');
    });

    it('should convert colons to slashes in location', () => {
      const infoFile = path.join(testDir, 'colon-path.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors:path:to:door', 50, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.location).toBe('doors/path/to/door');
    });

    it('should parse ACCESS level', () => {
      const infoFile = path.join(testDir, 'access-level.info');
      const buffer = Buffer.alloc(300);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('ACCESS=150', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.access).toBe(150);
    });

    it('should parse PASSWORD', () => {
      const infoFile = path.join(testDir, 'password.info');
      const buffer = Buffer.alloc(300);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('PASSWORD=secret123', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.password).toBe('secret123');
    });

    it('should parse PRIORITY', () => {
      const infoFile = path.join(testDir, 'priority.info');
      const buffer = Buffer.alloc(300);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('PRIORITY=5', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.priority).toBe('5');
    });

    it('should parse STACK size', () => {
      const infoFile = path.join(testDir, 'stack.info');
      const buffer = Buffer.alloc(300);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('STACK=8192', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.stack).toBe(8192);
    });

    it('should parse boolean flags', () => {
      const infoFile = path.join(testDir, 'flags.info');
      const buffer = Buffer.alloc(500);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('RESIDENT=YES', 100, 'ascii');
      buffer.write('EXPERT_MODE', 150, 'ascii'); // Flag mode
      buffer.write('TRAPON=YES', 200, 'ascii');
      buffer.write('SILENT=YES', 250, 'ascii');
      buffer.write('MULTINODE=YES', 300, 'ascii');
      buffer.write('QUICKMODE=YES', 350, 'ascii');
      buffer.write('SCRIPTCHECK=YES', 400, 'ascii');
      buffer.write('LOG_INPUTS=YES', 450, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.resident).toBe(true);
      expect(result!.expertMode).toBe(true);
      expect(result!.trapOn).toBe(true);
      expect(result!.silent).toBe(true);
      expect(result!.multiNode).toBe(true);
      expect(result!.quickMode).toBe(true);
      expect(result!.scriptCheck).toBe(true);
      expect(result!.logInputs).toBe(true);
    });

    it('should parse BANNER', () => {
      const infoFile = path.join(testDir, 'banner.info');
      const buffer = Buffer.alloc(300);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('BANNER=Screens/TestBanner', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.banner).toBe('Screens/TestBanner');
    });

    it('should parse MIMICVER', () => {
      const infoFile = path.join(testDir, 'mimicver.info');
      const buffer = Buffer.alloc(300);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('MIMICVER=2.53', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.mimicVer).toBe('2.53');
    });

    it('should parse INTERNAL and PASS_PARAMETERS', () => {
      const infoFile = path.join(testDir, 'internal.info');
      const buffer = Buffer.alloc(400);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('INTERNAL=WHO', 100, 'ascii');
      buffer.write('PASS_PARAMETERS=2', 150, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.internal).toBe('WHO');
      expect(result!.passParameters).toBe(2);
    });

    it('should parse MCI_TEXT for MCI type doors', () => {
      const infoFile = path.join(testDir, 'mci.info');
      const buffer = Buffer.alloc(400);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('TYPE=MCI', 100, 'ascii');
      buffer.write('MCI_TEXT=~5SWelcome~5N', 150, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.type).toBe(DoorType.MCI);
      expect(result!.mciText).toBe('~5SWelcome~5N');
    });

    it('should ignore MCI_TEXT for non-MCI doors', () => {
      const infoFile = path.join(testDir, 'non-mci.info');
      const buffer = Buffer.alloc(400);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('TYPE=XIM', 100, 'ascii');
      buffer.write('MCI_TEXT=Ignored', 150, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.type).toBe(DoorType.XIM);
      expect(result!.mciText).toBeUndefined();
    });

    it('should parse ARGS', () => {
      const infoFile = path.join(testDir, 'args.info');
      const buffer = Buffer.alloc(300);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('ARGS=-v --debug', 100, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.args).toBe('-v --debug');
    });

    it('should parse OVERCLOCK factor', () => {
      const tests = [
        { value: '0', expected: 0 },   // Auto
        { value: '10', expected: 10 }, // Specific multiplier
        { value: '-1', expected: -1 }, // Disabled
      ];

      for (const test of tests) {
        const infoFile = path.join(testDir, `overclock-${test.expected}.info`);
        const buffer = Buffer.alloc(300);
        buffer.write('LOCATION=doors/test', 50, 'ascii');
        buffer.write(`OVERCLOCK=${test.value}`, 100, 'ascii');
        fs.writeFileSync(infoFile, buffer);

        const result = loadCommandFromInfo(infoFile);
        expect(result!.overclockFactor).toBe(test.expected);
      }
    });

    it('should parse PAGINATION', () => {
      const tests = [
        { value: '0', expected: 0 },   // Door handles pagination
        { value: '23', expected: 23 }, // Auto-pause at 23 lines
        { value: '-1', expected: -1 }, // Use user setting
      ];

      for (const test of tests) {
        const infoFile = path.join(testDir, `pagination-${test.expected}.info`);
        const buffer = Buffer.alloc(300);
        buffer.write('LOCATION=doors/test', 50, 'ascii');
        buffer.write(`PAGINATION=${test.value}`, 100, 'ascii');
        fs.writeFileSync(infoFile, buffer);

        const result = loadCommandFromInfo(infoFile);
        expect(result!.pagination).toBe(test.expected);
      }
    });

    it('should preserve all tooltypes in toolTypes object', () => {
      const infoFile = path.join(testDir, 'tooltypes.info');
      const buffer = Buffer.alloc(400);
      buffer.write('LOCATION=doors/test', 50, 'ascii');
      buffer.write('CUSTOM_FIELD=value1', 100, 'ascii');
      buffer.write('ANOTHER_FIELD=value2', 150, 'ascii');
      fs.writeFileSync(infoFile, buffer);

      const result = loadCommandFromInfo(infoFile);

      expect(result!.toolTypes).toBeDefined();
      expect(result!.toolTypes!['LOCATION']).toBe('doors/test');
      expect(result!.toolTypes!['CUSTOM_FIELD']).toBe('value1');
      expect(result!.toolTypes!['ANOTHER_FIELD']).toBe('value2');
    });
  });

  describe('scanCommandDirectory', () => {
    beforeEach(() => {
      // Create test .info files
      const globalBBSCmd = path.join(testDir, 'Commands/BBSCmd/WHO.info');
      const buffer1 = Buffer.alloc(200);
      buffer1.write('LOCATION=doors/who', 50, 'ascii');
      buffer1.write('TYPE=XIM', 100, 'ascii');
      fs.writeFileSync(globalBBSCmd, buffer1);

      const conf1BBSCmd = path.join(testDir, 'Conf1/Commands/BBSCmd/CONFCMD.info');
      const buffer2 = Buffer.alloc(200);
      buffer2.write('LOCATION=doors/conf', 50, 'ascii');
      buffer2.write('TYPE=XIM', 100, 'ascii');
      fs.writeFileSync(conf1BBSCmd, buffer2);

      const node1BBSCmd = path.join(testDir, 'Node1/Commands/BBSCmd/NODECMD.info');
      const buffer3 = Buffer.alloc(200);
      buffer3.write('LOCATION=doors/node', 50, 'ascii');
      buffer3.write('TYPE=XIM', 100, 'ascii');
      fs.writeFileSync(node1BBSCmd, buffer3);
    });

    it('should scan global BBSCMD directory', () => {
      const commands = scanCommandDirectory(testDir, CommandType.BBSCMD);

      expect(commands.has('WHO')).toBe(true);
      expect(commands.get('WHO')!.location).toBe('doors/who');
    });

    it('should scan conference-specific commands', () => {
      const commands = scanCommandDirectory(testDir, CommandType.BBSCMD, 1);

      expect(commands.has('CONFCMD')).toBe(true);
      expect(commands.get('CONFCMD')!.location).toBe('doors/conf');
    });

    it('should scan node-specific commands', () => {
      const commands = scanCommandDirectory(testDir, CommandType.BBSCMD, undefined, 1);

      expect(commands.has('NODECMD')).toBe(true);
      expect(commands.get('NODECMD')!.location).toBe('doors/node');
    });

    it('should prioritize conference commands over global', () => {
      // Create duplicate command in conference
      const confWho = path.join(testDir, 'Conf1/Commands/BBSCmd/WHO.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/conf-who', 50, 'ascii');
      buffer.write('TYPE=XIM', 100, 'ascii');
      fs.writeFileSync(confWho, buffer);

      const commands = scanCommandDirectory(testDir, CommandType.BBSCMD, 1);

      expect(commands.get('WHO')!.location).toBe('doors/conf-who');
    });

    it('should prioritize node commands over global', () => {
      // Create duplicate command in node
      const nodeWho = path.join(testDir, 'Node1/Commands/BBSCmd/WHO.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/node-who', 50, 'ascii');
      buffer.write('TYPE=XIM', 100, 'ascii');
      fs.writeFileSync(nodeWho, buffer);

      const commands = scanCommandDirectory(testDir, CommandType.BBSCMD, undefined, 1);

      expect(commands.get('WHO')!.location).toBe('doors/node-who');
    });

    it('should handle non-existent directories gracefully', () => {
      const commands = scanCommandDirectory('/nonexistent/path', CommandType.BBSCMD);

      expect(commands.size).toBe(0);
    });

    it('should scan SYSCMD directories', () => {
      const sysCmd = path.join(testDir, 'Commands/SysCmd/SYSOP.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/sysop', 50, 'ascii');
      buffer.write('TYPE=XIM', 100, 'ascii');
      fs.writeFileSync(sysCmd, buffer);

      const commands = scanCommandDirectory(testDir, CommandType.SYSCMD);

      expect(commands.has('SYSOP')).toBe(true);
    });

    it('should handle .Info extension (case-insensitive)', () => {
      const mixedCase = path.join(testDir, 'Commands/BBSCmd/MIXED.Info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/mixed', 50, 'ascii');
      fs.writeFileSync(mixedCase, buffer);

      const commands = scanCommandDirectory(testDir, CommandType.BBSCMD);

      expect(commands.has('MIXED')).toBe(true);
    });
  });

  describe('findCommand', () => {
    beforeEach(() => {
      // Create test commands
      const who = path.join(testDir, 'Commands/BBSCmd/WHO.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/who', 50, 'ascii');
      fs.writeFileSync(who, buffer);
    });

    it('should find existing command', () => {
      const cmd = findCommand(testDir, 'WHO', CommandType.BBSCMD);

      expect(cmd).not.toBeNull();
      expect(cmd!.name).toBe('WHO');
      expect(cmd!.location).toBe('doors/who');
    });

    it('should return null for non-existent command', () => {
      const cmd = findCommand(testDir, 'NONEXISTENT', CommandType.BBSCMD);

      expect(cmd).toBeNull();
    });

    it('should be case-insensitive', () => {
      const cmd = findCommand(testDir, 'who', CommandType.BBSCMD);

      expect(cmd).not.toBeNull();
      expect(cmd!.name).toBe('WHO');
    });

    it('should respect conference context', () => {
      const confWho = path.join(testDir, 'Conf1/Commands/BBSCmd/WHO.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/conf-who', 50, 'ascii');
      fs.writeFileSync(confWho, buffer);

      const cmd = findCommand(testDir, 'WHO', CommandType.BBSCMD, 1);

      expect(cmd!.location).toBe('doors/conf-who');
    });

    it('should respect node context', () => {
      const nodeWho = path.join(testDir, 'Node1/Commands/BBSCmd/WHO.info');
      const buffer = Buffer.alloc(200);
      buffer.write('LOCATION=doors/node-who', 50, 'ascii');
      fs.writeFileSync(nodeWho, buffer);

      const cmd = findCommand(testDir, 'WHO', CommandType.BBSCMD, undefined, 1);

      expect(cmd!.location).toBe('doors/node-who');
    });
  });
});
