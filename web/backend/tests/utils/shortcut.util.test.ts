/**
 * Unit tests for shortcut.util.ts
 * Tests menu shortcut handling from .keys files
 *
 * ShortcutMap handles loading menu shortcuts (express.e:6567-6575, 28469-28479)
 * Maps single keys to full commands for quick menu navigation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ShortcutMap } from '../../src/utils/shortcut.util';

describe('ShortcutMap (Menu Shortcut Handling)', () => {
  let testDir: string;
  let shortcutMap: ShortcutMap;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortcut-test-'));
    shortcutMap = new ShortcutMap();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('clear', () => {
    it('should clear all shortcuts', () => {
      const keysFile = path.join(testDir, 'test.keys');
      fs.writeFileSync(keysFile, 'F=FILES\nM=MAIL');

      shortcutMap.load(keysFile);
      expect(shortcutMap.get('F')).toBe('FILES');

      shortcutMap.clear();
      expect(shortcutMap.get('F')).toBeUndefined();
      expect(shortcutMap.entries()).toHaveLength(0);
    });
  });

  describe('load', () => {
    it('should load shortcuts with KEY=COMMAND format', () => {
      const keysFile = path.join(testDir, 'menu.keys');
      fs.writeFileSync(
        keysFile,
        'F=FILES\nM=MAIL\nD=DOORS\nL=LOGOUT\nC=CHAT'
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('M')).toBe('MAIL');
      expect(shortcutMap.get('D')).toBe('DOORS');
      expect(shortcutMap.get('L')).toBe('LOGOUT');
      expect(shortcutMap.get('C')).toBe('CHAT');
    });

    it('should handle shortcuts without = (key maps to itself)', () => {
      const keysFile = path.join(testDir, 'simple.keys');
      fs.writeFileSync(keysFile, 'FILES\nMAIL\nDOORS');

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('FILES')).toBe('FILES');
      expect(shortcutMap.get('MAIL')).toBe('MAIL');
      expect(shortcutMap.get('DOORS')).toBe('DOORS');
    });

    it('should uppercase keys for case-insensitive matching', () => {
      const keysFile = path.join(testDir, 'case.keys');
      fs.writeFileSync(keysFile, 'f=FILES\nm=MAIL\nD=DOORS');

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('f')).toBe('FILES');
      expect(shortcutMap.get('M')).toBe('MAIL');
      expect(shortcutMap.get('m')).toBe('MAIL');
      expect(shortcutMap.get('D')).toBe('DOORS');
      expect(shortcutMap.get('d')).toBe('DOORS');
    });

    it('should handle empty lines', () => {
      const keysFile = path.join(testDir, 'empty.keys');
      fs.writeFileSync(
        keysFile,
        'F=FILES\n\n\nM=MAIL\n\nD=DOORS\n\n'
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('M')).toBe('MAIL');
      expect(shortcutMap.get('D')).toBe('DOORS');
      expect(shortcutMap.entries()).toHaveLength(3);
    });

    it('should handle whitespace-only lines', () => {
      const keysFile = path.join(testDir, 'whitespace.keys');
      fs.writeFileSync(
        keysFile,
        'F=FILES\n   \n\t\nM=MAIL\n  \t  \nD=DOORS'
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.entries()).toHaveLength(3);
    });

    it('should trim whitespace from keys and commands', () => {
      const keysFile = path.join(testDir, 'trim.keys');
      fs.writeFileSync(
        keysFile,
        '  F  =  FILES  \n\tM\t=\tMAIL\t\n D = DOORS '
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('M')).toBe('MAIL');
      expect(shortcutMap.get('D')).toBe('DOORS');
    });

    it('should handle Windows line endings (CRLF)', () => {
      const keysFile = path.join(testDir, 'crlf.keys');
      fs.writeFileSync(keysFile, 'F=FILES\r\nM=MAIL\r\nD=DOORS\r\n');

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('M')).toBe('MAIL');
      expect(shortcutMap.get('D')).toBe('DOORS');
    });

    it('should handle Unix line endings (LF)', () => {
      const keysFile = path.join(testDir, 'lf.keys');
      fs.writeFileSync(keysFile, 'F=FILES\nM=MAIL\nD=DOORS\n');

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('M')).toBe('MAIL');
      expect(shortcutMap.get('D')).toBe('DOORS');
    });

    it('should handle commands with spaces', () => {
      const keysFile = path.join(testDir, 'spaces.keys');
      fs.writeFileSync(
        keysFile,
        'G=GO FILES\nD=DOOR MENU\nL=LOG OUT'
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('G')).toBe('GO FILES');
      expect(shortcutMap.get('D')).toBe('DOOR MENU');
      expect(shortcutMap.get('L')).toBe('LOG OUT');
    });

    it('should handle commands with special characters', () => {
      const keysFile = path.join(testDir, 'special.keys');
      fs.writeFileSync(
        keysFile,
        'F=FILES/DOWNLOAD\nM=MAIL-READ\nD=DOOR_MENU'
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILES/DOWNLOAD');
      expect(shortcutMap.get('M')).toBe('MAIL-READ');
      expect(shortcutMap.get('D')).toBe('DOOR_MENU');
    });

    it('should handle multi-character keys', () => {
      const keysFile = path.join(testDir, 'multi.keys');
      fs.writeFileSync(
        keysFile,
        'F1=FILES\nESC=MAIN MENU\nF10=LOGOUT'
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F1')).toBe('FILES');
      expect(shortcutMap.get('ESC')).toBe('MAIN MENU');
      expect(shortcutMap.get('F10')).toBe('LOGOUT');
    });

    it('should overwrite duplicate keys with last value', () => {
      const keysFile = path.join(testDir, 'duplicate.keys');
      fs.writeFileSync(
        keysFile,
        'F=FILES\nF=FORUMS\nF=FILE AREA'
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILE AREA');
    });

    it('should clear previous shortcuts when loading new file', () => {
      const keysFile1 = path.join(testDir, 'first.keys');
      const keysFile2 = path.join(testDir, 'second.keys');

      fs.writeFileSync(keysFile1, 'F=FILES\nM=MAIL');
      fs.writeFileSync(keysFile2, 'D=DOORS\nC=CHAT');

      shortcutMap.load(keysFile1);
      expect(shortcutMap.get('F')).toBe('FILES');

      shortcutMap.load(keysFile2);
      expect(shortcutMap.get('F')).toBeUndefined();
      expect(shortcutMap.get('D')).toBe('DOORS');
      expect(shortcutMap.get('C')).toBe('CHAT');
    });

    it('should handle empty file', () => {
      const keysFile = path.join(testDir, 'empty.keys');
      fs.writeFileSync(keysFile, '');

      shortcutMap.load(keysFile);

      expect(shortcutMap.entries()).toHaveLength(0);
    });

    it('should handle file with only whitespace', () => {
      const keysFile = path.join(testDir, 'whitespace-only.keys');
      fs.writeFileSync(keysFile, '   \n\t\n  \n');

      shortcutMap.load(keysFile);

      expect(shortcutMap.entries()).toHaveLength(0);
    });
  });

  describe('get', () => {
    beforeEach(() => {
      const keysFile = path.join(testDir, 'test.keys');
      fs.writeFileSync(
        keysFile,
        'F=FILES\nM=MAIL\nD=DOORS\nESC=MAIN MENU'
      );
      shortcutMap.load(keysFile);
    });

    it('should return command for existing key', () => {
      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('M')).toBe('MAIL');
      expect(shortcutMap.get('D')).toBe('DOORS');
    });

    it('should return undefined for non-existent key', () => {
      expect(shortcutMap.get('Z')).toBeUndefined();
      expect(shortcutMap.get('X')).toBeUndefined();
      expect(shortcutMap.get('INVALID')).toBeUndefined();
    });

    it('should be case-insensitive', () => {
      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('f')).toBe('FILES');
      expect(shortcutMap.get('M')).toBe('MAIL');
      expect(shortcutMap.get('m')).toBe('MAIL');
    });

    it('should handle multi-character keys case-insensitively', () => {
      expect(shortcutMap.get('ESC')).toBe('MAIN MENU');
      expect(shortcutMap.get('esc')).toBe('MAIN MENU');
      expect(shortcutMap.get('Esc')).toBe('MAIN MENU');
    });

    it('should return undefined for empty string', () => {
      expect(shortcutMap.get('')).toBeUndefined();
    });
  });

  describe('entries', () => {
    it('should return all shortcuts as key-value pairs', () => {
      const keysFile = path.join(testDir, 'test.keys');
      fs.writeFileSync(
        keysFile,
        'F=FILES\nM=MAIL\nD=DOORS'
      );

      shortcutMap.load(keysFile);
      const entries = shortcutMap.entries();

      expect(entries).toHaveLength(3);
      expect(entries).toContainEqual(['F', 'FILES']);
      expect(entries).toContainEqual(['M', 'MAIL']);
      expect(entries).toContainEqual(['D', 'DOORS']);
    });

    it('should return empty array when no shortcuts loaded', () => {
      expect(shortcutMap.entries()).toHaveLength(0);
    });

    it('should return keys in uppercase', () => {
      const keysFile = path.join(testDir, 'test.keys');
      fs.writeFileSync(keysFile, 'f=FILES\nm=MAIL');

      shortcutMap.load(keysFile);
      const entries = shortcutMap.entries();

      expect(entries).toContainEqual(['F', 'FILES']);
      expect(entries).toContainEqual(['M', 'MAIL']);
      expect(entries).not.toContainEqual(['f', 'FILES']);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical BBS main menu shortcuts', () => {
      const keysFile = path.join(testDir, 'mainmenu.keys');
      fs.writeFileSync(
        keysFile,
        `F=FILES
M=MAIL
D=DOORS
C=CHAT
B=BULLETINS
L=LASTCALLERS
U=USERLIST
S=STATS
X=EXPERT
G=GOODBYE`
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('M')).toBe('MAIL');
      expect(shortcutMap.get('D')).toBe('DOORS');
      expect(shortcutMap.get('C')).toBe('CHAT');
      expect(shortcutMap.get('B')).toBe('BULLETINS');
      expect(shortcutMap.get('L')).toBe('LASTCALLERS');
      expect(shortcutMap.get('U')).toBe('USERLIST');
      expect(shortcutMap.get('S')).toBe('STATS');
      expect(shortcutMap.get('X')).toBe('EXPERT');
      expect(shortcutMap.get('G')).toBe('GOODBYE');
      expect(shortcutMap.entries()).toHaveLength(10);
    });

    it('should handle function key shortcuts', () => {
      const keysFile = path.join(testDir, 'funckeys.keys');
      fs.writeFileSync(
        keysFile,
        `F1=HELP
F2=MENU
F3=FILES
F4=MAIL
F5=DOORS
F6=CHAT
F7=WHO
F8=PAGE SYSOP
F9=STATS
F10=LOGOUT`
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F1')).toBe('HELP');
      expect(shortcutMap.get('F5')).toBe('DOORS');
      expect(shortcutMap.get('F10')).toBe('LOGOUT');
    });

    it('should handle conference/area navigation shortcuts', () => {
      const keysFile = path.join(testDir, 'conf.keys');
      fs.writeFileSync(
        keysFile,
        `J=JOIN CONFERENCE
N=NEW SCAN
S=SCAN
R=READ
P=POST
L=LIST CONFERENCES
Q=QUIT`
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('J')).toBe('JOIN CONFERENCE');
      expect(shortcutMap.get('N')).toBe('NEW SCAN');
      expect(shortcutMap.get('S')).toBe('SCAN');
    });

    it('should handle mixed format shortcuts', () => {
      const keysFile = path.join(testDir, 'mixed.keys');
      fs.writeFileSync(
        keysFile,
        `F=FILES
MAIL
D=DOORS
CHAT
ESC=MAIN MENU`
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('FILES');
      expect(shortcutMap.get('MAIL')).toBe('MAIL');
      expect(shortcutMap.get('D')).toBe('DOORS');
      expect(shortcutMap.get('CHAT')).toBe('CHAT');
      expect(shortcutMap.get('ESC')).toBe('MAIN MENU');
    });
  });

  describe('Edge cases', () => {
    it('should handle = in command value', () => {
      const keysFile = path.join(testDir, 'equals.keys');
      fs.writeFileSync(keysFile, 'F=SET VAR=VALUE');

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('F')).toBe('SET VAR=VALUE');
    });

    it('should handle numeric keys', () => {
      const keysFile = path.join(testDir, 'numeric.keys');
      fs.writeFileSync(
        keysFile,
        '1=CONFERENCE 1\n2=CONFERENCE 2\n3=CONFERENCE 3'
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('1')).toBe('CONFERENCE 1');
      expect(shortcutMap.get('2')).toBe('CONFERENCE 2');
      expect(shortcutMap.get('3')).toBe('CONFERENCE 3');
    });

    it('should handle symbols as keys', () => {
      const keysFile = path.join(testDir, 'symbols.keys');
      fs.writeFileSync(
        keysFile,
        '?=HELP\n!=ALERT\n@=SYSOP'
      );

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('?')).toBe('HELP');
      expect(shortcutMap.get('!')).toBe('ALERT');
      expect(shortcutMap.get('@')).toBe('SYSOP');
    });

    it('should handle very long commands', () => {
      const keysFile = path.join(testDir, 'long.keys');
      const longCommand = 'A'.repeat(500);
      fs.writeFileSync(keysFile, `L=${longCommand}`);

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('L')).toBe(longCommand);
    });

    it('should handle 0-length key after trim', () => {
      const keysFile = path.join(testDir, 'empty-key.keys');
      fs.writeFileSync(keysFile, '=COMMAND');

      shortcutMap.load(keysFile);

      expect(shortcutMap.get('')).toBe('COMMAND');
    });
  });
});
