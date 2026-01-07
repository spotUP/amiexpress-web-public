/**
 * Unit tests for screen-security.util.ts
 * Tests screen file discovery with security level variants
 *
 * 1:1 port from express.e:6246-6310 findSecurityScreen()
 * Handles security-aware screen finding (e.g., Bull5.TXT, Bull10.TXT, Bull.TXT)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  findSecurityScreen,
  findBulletinFile,
  findBullHelpFile,
} from '../../src/utils/screen-security.util';

describe('Screen Security Utility (Security-Aware Screen Finding)', () => {
  let testDir: string;
  let screensDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-sec-test-'));
    screensDir = path.join(testDir, 'Screens');
    fs.mkdirSync(screensDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('findSecurityScreen', () => {
    describe('Basic .TXT file finding', () => {
      it('should find .TXT file', () => {
        const screenPath = path.join(screensDir, 'Test');
        fs.writeFileSync(`${screenPath}.TXT`, 'Test screen');

        const result = findSecurityScreen(screenPath, 0, null, false, false);

        expect(result).toBe(`${screenPath}.TXT`);
      });

      it('should find lowercase .txt file', () => {
        const screenPath = path.join(screensDir, 'Test');
        fs.writeFileSync(`${screenPath}.txt`, 'Test screen');

        const result = findSecurityScreen(screenPath, 0, null, false, false);

        expect(result).toBe(`${screenPath}.txt`);
      });

      it('should return null if no file found', () => {
        const screenPath = path.join(screensDir, 'NotExist');

        const result = findSecurityScreen(screenPath, 0, null, false, false);

        expect(result).toBeNull();
      });

      it('should handle case-insensitive matching', () => {
        const screenPath = path.join(screensDir, 'test'); // lowercase path
        fs.writeFileSync(path.join(screensDir, 'Test.TXT'), 'Test'); // uppercase file

        const result = findSecurityScreen(screenPath, 0, null, false, false);

        expect(result).not.toBeNull();
        expect(result).toContain('Test.TXT');
      });
    });

    describe('Security level screening', () => {
      it('should find exact security level match', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}10.TXT`, 'Security 10');

        const result = findSecurityScreen(basePath, 10, null, false, false);

        expect(result).toBe(`${basePath}10.TXT`);
      });

      it('should round down to nearest 5', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}10.TXT`, 'Security 10');

        // User level 12 should round down to 10
        const result = findSecurityScreen(basePath, 12, null, false, false);

        expect(result).toBe(`${basePath}10.TXT`);
      });

      it('should check lower security levels if higher not found', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}5.TXT`, 'Security 5');
        fs.writeFileSync(`${basePath}10.TXT`, 'Security 10');

        // User level 20 - should check 20, 15, then find 10
        const result = findSecurityScreen(basePath, 20, null, false, false);

        expect(result).toBe(`${basePath}10.TXT`);
      });

      it('should check security levels from high to low in steps of 5', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}5.TXT`, 'Security 5');
        fs.writeFileSync(`${basePath}15.TXT`, 'Security 15');
        fs.writeFileSync(`${basePath}25.TXT`, 'Security 25');

        // User level 30 - check 30, 25(found!)
        const result = findSecurityScreen(basePath, 30, null, false, false);

        expect(result).toBe(`${basePath}25.TXT`);
      });

      it('should stop at minimum level 5', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}5.TXT`, 'Security 5');

        // User level 50 - should eventually find level 5
        const result = findSecurityScreen(basePath, 50, null, false, false);

        expect(result).toBe(`${basePath}5.TXT`);
      });

      it('should not check security level 0', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}0.TXT`, 'Security 0'); // Should not be checked

        const result = findSecurityScreen(basePath, 3, null, false, false);

        // Security 0 not checked (minimum is 5), should return null
        expect(result).toBeNull();
      });
    });

    describe('DEF_SCREENS mode', () => {
      it('should check non-security screen first when DEF_SCREENS=true', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT`, 'Non-security');
        fs.writeFileSync(`${basePath}10.TXT`, 'Security 10');

        const result = findSecurityScreen(basePath, 10, null, false, true);

        // DEF_SCREENS=true: non-security checked first
        expect(result).toBe(`${basePath}.TXT`);
      });

      it('should check security screens if non-security not found (DEF_SCREENS=true)', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}10.TXT`, 'Security 10');

        const result = findSecurityScreen(basePath, 10, null, false, true);

        // No non-security file, fall back to security
        expect(result).toBe(`${basePath}10.TXT`);
      });

      it('should check security screens first when DEF_SCREENS=false', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT`, 'Non-security');
        fs.writeFileSync(`${basePath}10.TXT`, 'Security 10');

        const result = findSecurityScreen(basePath, 10, null, false, false);

        // DEF_SCREENS=false: security checked first
        expect(result).toBe(`${basePath}10.TXT`);
      });

      it('should check non-security screen last when DEF_SCREENS=false', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT`, 'Non-security');

        const result = findSecurityScreen(basePath, 10, null, false, false);

        // No security files, fall back to non-security
        expect(result).toBe(`${basePath}.TXT`);
      });
    });

    describe('Screen type preferences', () => {
      it('should prefer user screen type over .TXT', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT`, 'Plain text');
        fs.writeFileSync(`${basePath}.TXT.GR`, 'Graphics');

        const result = findSecurityScreen(basePath, 0, '.TXT.GR', false, false);

        expect(result).toBe(`${basePath}.TXT.GR`);
      });

      it('should add dot prefix to screen type if missing', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.IBM`, 'IBM ANSI');

        const result = findSecurityScreen(basePath, 0, 'IBM', false, false);

        expect(result).toBe(`${basePath}.IBM`);
      });

      it('should handle screen type with dot prefix', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT.GR`, 'Graphics');

        const result = findSecurityScreen(basePath, 0, '.TXT.GR', false, false);

        expect(result).toBe(`${basePath}.TXT.GR`);
      });

      it('should fall back to .TXT if screen type not found', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT`, 'Plain text');

        const result = findSecurityScreen(basePath, 0, '.TXT.GR', false, false);

        // .TXT.GR not found, fall back to .TXT
        expect(result).toBe(`${basePath}.TXT`);
      });
    });

    describe('RIP mode', () => {
      it('should prefer .RIP file when RIP mode enabled', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT`, 'Plain text');
        fs.writeFileSync(`${basePath}.RIP`, 'RIP graphics');

        const result = findSecurityScreen(basePath, 0, null, true, false);

        expect(result).toBe(`${basePath}.RIP`);
      });

      it('should fall back to screen type if .RIP not found', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.IBM`, 'IBM ANSI');

        const result = findSecurityScreen(basePath, 0, 'IBM', true, false);

        // No .RIP, use screen type
        expect(result).toBe(`${basePath}.IBM`);
      });

      it('should fall back to .TXT if .RIP and screen type not found', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT`, 'Plain text');

        const result = findSecurityScreen(basePath, 0, '.TXT.GR', true, false);

        // No .RIP or .TXT.GR, use .TXT
        expect(result).toBe(`${basePath}.TXT`);
      });

      it('should check RIP for security levels too', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}10.RIP`, 'Security 10 RIP');
        fs.writeFileSync(`${basePath}10.TXT`, 'Security 10 TXT');

        const result = findSecurityScreen(basePath, 10, null, true, false);

        expect(result).toBe(`${basePath}10.RIP`);
      });
    });

    describe('Combined scenarios', () => {
      it('should handle complex priority: RIP > ScreenType > TXT', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT`, 'Plain text');
        fs.writeFileSync(`${basePath}.TXT.GR`, 'Graphics');
        fs.writeFileSync(`${basePath}.RIP`, 'RIP');

        // RIP mode, screen type .TXT.GR
        const result = findSecurityScreen(basePath, 0, '.TXT.GR', true, false);

        expect(result).toBe(`${basePath}.RIP`); // RIP wins
      });

      it('should handle security + screen type + DEF_SCREENS', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}.TXT.GR`, 'Non-sec graphics');
        fs.writeFileSync(`${basePath}10.TXT.GR`, 'Sec 10 graphics');

        // DEF_SCREENS=true: check non-security first
        const result = findSecurityScreen(basePath, 10, '.TXT.GR', false, true);

        expect(result).toBe(`${basePath}.TXT.GR`);
      });

      it('should handle all features: RIP + security + screen type', () => {
        const basePath = path.join(screensDir, 'Menu');
        fs.writeFileSync(`${basePath}10.RIP`, 'Sec 10 RIP');
        fs.writeFileSync(`${basePath}10.TXT.GR`, 'Sec 10 GR');
        fs.writeFileSync(`${basePath}10.TXT`, 'Sec 10 TXT');

        const result = findSecurityScreen(basePath, 12, '.TXT.GR', true, false);

        // RIP mode, level 12 (rounds to 10)
        expect(result).toBe(`${basePath}10.RIP`);
      });
    });
  });

  describe('findBulletinFile', () => {
    let conf1Dir: string;
    let bulletinsDir: string;

    beforeEach(() => {
      conf1Dir = path.join(testDir, 'Conf1');
      bulletinsDir = path.join(conf1Dir, 'Screens', 'Bulletins');
      fs.mkdirSync(bulletinsDir, { recursive: true });
    });

    it('should find bulletin file', () => {
      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.TXT'), 'Bulletin 1');

      const result = findBulletinFile(testDir, 'Conf1', 1);

      expect(result).not.toBeNull();
      expect(result).toContain('Bull1.TXT');
    });

    it('should handle different bulletin numbers', () => {
      fs.writeFileSync(path.join(bulletinsDir, 'Bull5.TXT'), 'Bulletin 5');

      const result = findBulletinFile(testDir, 'Conf1', 5);

      expect(result).not.toBeNull();
      expect(result).toContain('Bull5.TXT');
    });

    it('should find security-level bulletin', () => {
      fs.writeFileSync(path.join(bulletinsDir, 'Bull110.TXT'), 'Bull1 for level 10');

      const result = findBulletinFile(testDir, 'Conf1', 1, 10);

      expect(result).not.toBeNull();
      expect(result).toContain('Bull110.TXT');
    });

    it('should respect screen type preference', () => {
      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.TXT'), 'Plain');
      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.IBM'), 'IBM');

      const result = findBulletinFile(testDir, 'Conf1', 1, 0, 'IBM');

      expect(result).not.toBeNull();
      expect(result!.toLowerCase()).toContain('bull1.ibm');
    });

    it('should handle RIP mode', () => {
      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.RIP'), 'RIP');
      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.TXT'), 'TXT');

      const result = findBulletinFile(testDir, 'Conf1', 1, 0, null, true);

      expect(result).not.toBeNull();
      expect(result!.toLowerCase()).toContain('bull1.rip');
    });

    it('should return null if bulletin not found', () => {
      const result = findBulletinFile(testDir, 'Conf1', 99);

      expect(result).toBeNull();
    });

    it('should handle different conference directories', () => {
      const conf2Dir = path.join(testDir, 'Conf2');
      const conf2Bulletins = path.join(conf2Dir, 'Screens', 'Bulletins');
      fs.mkdirSync(conf2Bulletins, { recursive: true });
      fs.writeFileSync(path.join(conf2Bulletins, 'Bull1.TXT'), 'Conf2 Bull1');

      const result = findBulletinFile(testDir, 'Conf2', 1);

      expect(result).not.toBeNull();
      expect(result).toContain('Conf2');
    });
  });

  describe('findBullHelpFile', () => {
    let conf1Dir: string;
    let bulletinsDir: string;

    beforeEach(() => {
      conf1Dir = path.join(testDir, 'Conf1');
      bulletinsDir = path.join(conf1Dir, 'Screens', 'Bulletins');
      fs.mkdirSync(bulletinsDir, { recursive: true });
    });

    it('should find BullHelp file', () => {
      fs.writeFileSync(path.join(bulletinsDir, 'BullHelp.TXT'), 'Help text');

      const result = findBullHelpFile(testDir, 'Conf1');

      expect(result).not.toBeNull();
      expect(result).toContain('BullHelp.TXT');
    });

    it('should find security-level BullHelp', () => {
      fs.writeFileSync(path.join(bulletinsDir, 'BullHelp10.TXT'), 'Help for level 10');

      const result = findBullHelpFile(testDir, 'Conf1', 10);

      expect(result).not.toBeNull();
      expect(result).toContain('BullHelp10.TXT');
    });

    it('should respect screen type', () => {
      fs.writeFileSync(path.join(bulletinsDir, 'BullHelp.TXT'), 'Plain');
      fs.writeFileSync(path.join(bulletinsDir, 'BullHelp.IBM'), 'IBM');

      const result = findBullHelpFile(testDir, 'Conf1', 0, 'IBM');

      expect(result).not.toBeNull();
      expect(result!.toLowerCase()).toContain('bullhelp.ibm');
    });

    it('should handle RIP mode', () => {
      fs.writeFileSync(path.join(bulletinsDir, 'BullHelp.RIP'), 'RIP');
      fs.writeFileSync(path.join(bulletinsDir, 'BullHelp.TXT'), 'TXT');

      const result = findBullHelpFile(testDir, 'Conf1', 0, null, true);

      expect(result).not.toBeNull();
      expect(result!.toLowerCase()).toContain('bullhelp.rip');
    });

    it('should return null if not found', () => {
      const result = findBullHelpFile(testDir, 'Conf1');

      expect(result).toBeNull();
    });
  });

  describe('Real-world BBS scenarios', () => {
    it('should handle typical bulletin hierarchy', () => {
      const conf1Bulletins = path.join(testDir, 'Conf1', 'Screens', 'Bulletins');
      fs.mkdirSync(conf1Bulletins, { recursive: true });

      fs.writeFileSync(path.join(conf1Bulletins, 'Bull1.TXT'), 'Welcome');
      fs.writeFileSync(path.join(conf1Bulletins, 'Bull2.TXT'), 'Rules');
      fs.writeFileSync(path.join(conf1Bulletins, 'Bull310.TXT'), 'SysOp contact (level 10+)');
      fs.writeFileSync(path.join(conf1Bulletins, 'BullHelp.TXT'), 'Help');

      expect(findBulletinFile(testDir, 'Conf1', 1)).toContain('Bull1.TXT');
      expect(findBulletinFile(testDir, 'Conf1', 2)).toContain('Bull2.TXT');
      expect(findBulletinFile(testDir, 'Conf1', 3, 10)).toContain('Bull310.TXT');
      expect(findBullHelpFile(testDir, 'Conf1')).toContain('BullHelp.TXT');
    });

    it('should handle multi-level security bulletins', () => {
      const bulletinsDir = path.join(testDir, 'Conf1', 'Screens', 'Bulletins');
      fs.mkdirSync(bulletinsDir, { recursive: true });

      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.TXT'), 'Public');
      fs.writeFileSync(path.join(bulletinsDir, 'Bull15.TXT'), 'Level 5');
      fs.writeFileSync(path.join(bulletinsDir, 'Bull110.TXT'), 'Level 10');
      fs.writeFileSync(path.join(bulletinsDir, 'Bull150.TXT'), 'Level 50 (SysOp)');

      // Low user - gets public
      expect(findBulletinFile(testDir, 'Conf1', 1, 3)).toContain('Bull1.TXT');

      // Level 7 user - gets level 5
      expect(findBulletinFile(testDir, 'Conf1', 1, 7)).toContain('Bull15.TXT');

      // Level 15 user - gets level 10 (rounds down)
      expect(findBulletinFile(testDir, 'Conf1', 1, 15)).toContain('Bull110.TXT');

      // SysOp level 255 - gets level 50
      expect(findBulletinFile(testDir, 'Conf1', 1, 255)).toContain('Bull150.TXT');
    });

    it('should handle mixed screen types', () => {
      const bulletinsDir = path.join(testDir, 'Conf1', 'Screens', 'Bulletins');
      fs.mkdirSync(bulletinsDir, { recursive: true });

      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.TXT'), 'Plain');
      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.IBM'), 'IBM ANSI');
      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.TXT.GR'), 'Graphics');
      fs.writeFileSync(path.join(bulletinsDir, 'Bull1.RIP'), 'RIP graphics');

      // Plain text user
      expect(findBulletinFile(testDir, 'Conf1', 1, 0, null, false)).toContain('Bull1.TXT');

      // IBM ANSI user
      expect(findBulletinFile(testDir, 'Conf1', 1, 0, 'IBM', false)).toContain('Bull1.IBM');

      // Graphics user
      expect(findBulletinFile(testDir, 'Conf1', 1, 0, '.TXT.GR', false)).toContain('Bull1.TXT.GR');

      // RIP user
      expect(findBulletinFile(testDir, 'Conf1', 1, 0, null, true)).toContain('Bull1.RIP');
    });
  });

  describe('Edge cases', () => {
    it('should handle non-existent directory', () => {
      const result = findSecurityScreen('/nonexistent/path/Menu', 0, null, false, false);
      expect(result).toBeNull();
    });

    it('should handle very high security level', () => {
      const basePath = path.join(screensDir, 'Menu');
      fs.writeFileSync(`${basePath}5.TXT`, 'Minimum');

      const result = findSecurityScreen(basePath, 255, null, false, false);

      // Should eventually find level 5
      expect(result).toBe(`${basePath}5.TXT`);
    });

    it('should handle security level exactly 5', () => {
      const basePath = path.join(screensDir, 'Menu');
      fs.writeFileSync(`${basePath}5.TXT`, 'Level 5');

      const result = findSecurityScreen(basePath, 5, null, false, false);

      expect(result).toBe(`${basePath}5.TXT`);
    });

    it('should handle paths with spaces', () => {
      const specialDir = path.join(testDir, 'Special Screens');
      fs.mkdirSync(specialDir, { recursive: true });
      const basePath = path.join(specialDir, 'My Menu');
      fs.writeFileSync(`${basePath}.TXT`, 'Menu');

      const result = findSecurityScreen(basePath, 0, null, false, false);

      expect(result).toBe(`${basePath}.TXT`);
    });

    it('should handle unicode in paths', () => {
      const unicodeDir = path.join(testDir, 'Экраны');
      fs.mkdirSync(unicodeDir, { recursive: true });
      const basePath = path.join(unicodeDir, 'Menu');
      fs.writeFileSync(`${basePath}.TXT`, 'Menu');

      const result = findSecurityScreen(basePath, 0, null, false, false);

      expect(result).toBe(`${basePath}.TXT`);
    });
  });
});
