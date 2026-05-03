/**
 * Conference Tooltypes Utility Unit Tests
 *
 * Tests conference tooltype flag parsing from .info files and database
 */

// Prevent DB init: mocking fs breaks better-sqlite3 bindings.getRoot
process.env.SKIP_DB_INIT = '1';

// Mock dependencies BEFORE imports
jest.mock('fs');
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));
jest.mock('../../src/utils/amigafs');
jest.mock('../../src/config', () => ({
  config: {
    getConfig: jest.fn(),
  },
}));
jest.mock('../../src/database', () => ({
  db: {
    getConfigRepository: jest.fn(),
  },
}));
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

import * as conferenceTooltypes from '../../src/utils/conference-tooltypes.util';
import type { ConferenceToolFlags } from '../../src/utils/conference-tooltypes.util';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import * as amigafs from '../../src/utils/amigafs';
import { config } from '../../src/config';
import { db } from '../../src/database';

describe('Conference Tooltypes Utility', () => {
  const mockConfigGetConfig = config.getConfig as jest.MockedFunction<typeof config.getConfig>;
  const mockDbGetConfigRepository = db.getConfigRepository as jest.MockedFunction<
    typeof db.getConfigRepository
  >;
  const mockAmigafsExistsSync = amigafs.existsSync as jest.MockedFunction<
    typeof amigafs.existsSync
  >;
  const mockFsReadFileSync = fs.readFileSync as jest.Mock;
  const mockExecSync = childProcess.execSync as jest.MockedFunction<typeof childProcess.execSync>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset fs mock to prevent bleed from previous test implementations
    mockFsReadFileSync.mockReset();

    // Default mock implementations
    mockConfigGetConfig.mockReturnValue({
      dataDir: '/test/bbs',
    } as any);

    mockDbGetConfigRepository.mockReturnValue(null as any);
    mockAmigafsExistsSync.mockReturnValue(false);
  });

  describe('getConferenceToolFlags', () => {
    describe('default flags', () => {
      it('should return default flags when no DB or icon file exists', () => {
        const flags = conferenceTooltypes.getConferenceToolFlags(1);

        expect(flags).toEqual({
          forceNewscan: false,
          noNewscan: false,
          showNewFiles: false,
          noNewFiles: false,
          forceMenus: false,
          noBulls: false,
          noConfBulls: false,
          freeDownloads: false,
          menuPrompt: '',
          requireUsername: false,
          requireRealname: false,
          requireUsernameMsgBases: new Set<number>(),
          requireRealnameMsgBases: new Set<number>(),
          forwardMail: '',
          extSendMsgBases: new Set<number>(),
        });
      });

      it('should use cache on subsequent calls', () => {
        const flags1 = conferenceTooltypes.getConferenceToolFlags(2);
        const flags2 = conferenceTooltypes.getConferenceToolFlags(2);

        expect(flags1).toBe(flags2); // Same reference
        expect(mockConfigGetConfig).toHaveBeenCalledTimes(1);
      });

      it('should have separate cache entries for different conferences', () => {
        const flags1 = conferenceTooltypes.getConferenceToolFlags(1);
        const flags2 = conferenceTooltypes.getConferenceToolFlags(2);

        expect(flags1).not.toBe(flags2); // Different references
      });
    });

    describe('database flags', () => {
      it('should read force_newscan from database', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            force_newscan: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(3);

        expect(flags.forceNewscan).toBe(true);
        expect(mockRepo.getConferenceConfig).toHaveBeenCalledWith(3);
      });

      it('should read no_newscan from database', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            no_newscan: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(4);

        expect(flags.noNewscan).toBe(true);
      });

      it('should read show_new_files from database', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            show_new_files: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(5);

        expect(flags.showNewFiles).toBe(true);
      });

      it('should read no_new_files from database', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            no_new_files: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(6);

        expect(flags.noNewFiles).toBe(true);
      });

      it('should read no_bulls from database', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            no_bulls: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(7);

        expect(flags.noBulls).toBe(true);
      });

      it('should read no_conf_bulls from database', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            no_conf_bulls: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(8);

        expect(flags.noConfBulls).toBe(true);
      });

      it('should read free_downloads from database', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            free_downloads: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(9);

        expect(flags.freeDownloads).toBe(true);
      });

      it('should read multiple flags from database', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            force_newscan: true,
            no_new_files: true,
            no_bulls: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(10);

        expect(flags.forceNewscan).toBe(true);
        expect(flags.noNewFiles).toBe(true);
        expect(flags.noBulls).toBe(true);
        expect(flags.noNewscan).toBe(false);
      });

      it('should handle null conference config from database', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue(null),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(11);

        expect(flags).toEqual(expect.objectContaining({
          forceNewscan: false,
          noNewscan: false,
        }));
      });

      it('should handle database error gracefully', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockImplementation(() => {
            throw new Error('Database error');
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(12);

        // Should return defaults when DB fails
        expect(flags.forceNewscan).toBe(false);
      });

      it('should handle missing config repository', () => {
        mockDbGetConfigRepository.mockReturnValue(null as any);

        const flags = conferenceTooltypes.getConferenceToolFlags(13);

        expect(flags.forceNewscan).toBe(false);
      });
    });

    describe('icon file tooltypes', () => {
      // Production code uses fs.readFileSync to read the binary .info file,
      // then scans for printable ASCII strings (charCodes 32-126).
      function makeBuf(...keys: string[]): Buffer {
        // Wrap each key in null bytes so the parser extracts them cleanly
        return Buffer.from('\x00' + keys.join('\x00') + '\x00');
      }

      it('should read FORCE_NEWSCAN from icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('FORCE_NEWSCAN'));

        const flags = conferenceTooltypes.getConferenceToolFlags(20);

        expect(flags.forceNewscan).toBe(true);
        expect(mockAmigafsExistsSync).toHaveBeenCalledWith('/test/bbs/Conf20.info');
      });

      it('should read NO_NEWSCAN from icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('NO_NEWSCAN'));

        const flags = conferenceTooltypes.getConferenceToolFlags(21);

        expect(flags.noNewscan).toBe(true);
      });

      it('should read SHOW_NEW_FILES from icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('SHOW_NEW_FILES'));

        const flags = conferenceTooltypes.getConferenceToolFlags(22);

        expect(flags.showNewFiles).toBe(true);
      });

      it('should read NO_NEW_FILES from icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('NO_NEW_FILES'));

        const flags = conferenceTooltypes.getConferenceToolFlags(23);

        expect(flags.noNewFiles).toBe(true);
      });

      it('should read FORCE_MENUS from icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('FORCE_MENUS'));

        const flags = conferenceTooltypes.getConferenceToolFlags(24);

        expect(flags.forceMenus).toBe(true);
      });

      it('should read NO_BULLS from icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('NO_BULLS'));

        const flags = conferenceTooltypes.getConferenceToolFlags(25);

        expect(flags.noBulls).toBe(true);
      });

      it('should read NO_CONF_BULLS from icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('NO_CONF_BULLS'));

        const flags = conferenceTooltypes.getConferenceToolFlags(26);

        expect(flags.noConfBulls).toBe(true);
      });

      it('should read FREEDOWNLOADS from icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('FREEDOWNLOADS'));

        const flags = conferenceTooltypes.getConferenceToolFlags(27);

        expect(flags.freeDownloads).toBe(true);
      });

      it('should read multiple tooltypes from icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('FORCE_NEWSCAN', 'NO_NEW_FILES', 'NO_BULLS'));

        const flags = conferenceTooltypes.getConferenceToolFlags(28);

        expect(flags.forceNewscan).toBe(true);
        expect(flags.noNewFiles).toBe(true);
        expect(flags.noBulls).toBe(true);
        expect(flags.noNewscan).toBe(false);
      });

      it('should handle tooltypes with # prefix', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('#FORCE_NEWSCAN'));

        const flags = conferenceTooltypes.getConferenceToolFlags(29);

        expect(flags.forceNewscan).toBe(true);
      });

      it('should handle tooltypes with + prefix', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('+NO_NEWSCAN'));

        const flags = conferenceTooltypes.getConferenceToolFlags(30);

        expect(flags.noNewscan).toBe(true);
      });

      it("should handle tooltypes with ' prefix", () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf("'SHOW_NEW_FILES"));

        const flags = conferenceTooltypes.getConferenceToolFlags(31);

        expect(flags.showNewFiles).toBe(true);
      });

      it('should handle tooltypes with = assignment', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('FORCE_NEWSCAN=YES'));

        const flags = conferenceTooltypes.getConferenceToolFlags(32);

        expect(flags.forceNewscan).toBe(true);
      });

      it('should ignore short strings (< 2 chars)', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        // 'A' is only 1 char and is ignored; 'FORCE_NEWSCAN' is kept
        mockFsReadFileSync.mockReturnValue(makeBuf('A', 'FORCE_NEWSCAN'));

        const flags = conferenceTooltypes.getConferenceToolFlags(33);

        expect(flags.forceNewscan).toBe(true);
      });

      it('should handle binary data with non-printable characters', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        // Embed the key within binary-looking data
        mockFsReadFileSync.mockReturnValue(
          Buffer.from([0x01, 0x02, ...Buffer.from('FORCE_NEWSCAN'), 0x03, 0x04])
        );

        const flags = conferenceTooltypes.getConferenceToolFlags(34);

        expect(flags.forceNewscan).toBe(true);
      });

      it('should handle icon file not found', () => {
        mockAmigafsExistsSync.mockReturnValue(false);

        const flags = conferenceTooltypes.getConferenceToolFlags(35);

        expect(flags.forceNewscan).toBe(false);
        expect(mockFsReadFileSync).not.toHaveBeenCalled();
      });

      it('should handle icon file read error gracefully', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockImplementation(() => {
          throw new Error('File read error');
        });

        const flags = conferenceTooltypes.getConferenceToolFlags(36);

        // Should return defaults when icon read fails
        expect(flags.forceNewscan).toBe(false);
      });

      it('should handle case-insensitive tooltype matching', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(makeBuf('force_newscan')); // lowercase

        const flags = conferenceTooltypes.getConferenceToolFlags(37);

        expect(flags.forceNewscan).toBe(true);
      });
    });

    describe('priority and merging', () => {
      it('should merge DB and icon flags (both set)', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            force_newscan: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(Buffer.from('\x00NO_NEW_FILES\x00'));

        const flags = conferenceTooltypes.getConferenceToolFlags(40);

        expect(flags.forceNewscan).toBe(true);
        expect(flags.noNewFiles).toBe(true);
      });

      it('should prioritize icon flags over DB flags', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            force_newscan: false,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(Buffer.from('\x00FORCE_NEWSCAN\x00'));

        const flags = conferenceTooltypes.getConferenceToolFlags(41);

        // Icon file should override DB
        expect(flags.forceNewscan).toBe(true);
      });

      it('should use DB flags when icon file not found', () => {
        const mockRepo = {
          getConferenceConfig: jest.fn().mockReturnValue({
            force_newscan: true,
            no_new_files: true,
          }),
        };
        mockDbGetConfigRepository.mockReturnValue(mockRepo as any);
        mockAmigafsExistsSync.mockReturnValue(false);

        const flags = conferenceTooltypes.getConferenceToolFlags(42);

        expect(flags.forceNewscan).toBe(true);
        expect(flags.noNewFiles).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle conference number 0', () => {
        const flags = conferenceTooltypes.getConferenceToolFlags(0);

        expect(flags).toBeDefined();
        expect(mockConfigGetConfig).toHaveBeenCalled();
      });

      it('should handle large conference numbers', () => {
        const flags = conferenceTooltypes.getConferenceToolFlags(9999);

        expect(flags).toBeDefined();
        expect(mockAmigafsExistsSync).toHaveBeenCalledWith('/test/bbs/Conf9999.info');
      });

      it('should handle empty icon file', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(Buffer.alloc(0));

        const flags = conferenceTooltypes.getConferenceToolFlags(50);

        expect(flags.forceNewscan).toBe(false);
      });

      it('should handle icon file with only non-printable characters', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(Buffer.from([0x01, 0x02, 0x03, 0x04]));

        const flags = conferenceTooltypes.getConferenceToolFlags(51);

        expect(flags.forceNewscan).toBe(false);
      });

      it('should handle conflicting flags (force and no)', () => {
        mockAmigafsExistsSync.mockReturnValue(true);
        mockFsReadFileSync.mockReturnValue(Buffer.from('\x00FORCE_NEWSCAN\x00NO_NEWSCAN\x00'));

        const flags = conferenceTooltypes.getConferenceToolFlags(52);

        // Both should be set if both tooltypes present
        expect(flags.forceNewscan).toBe(true);
        expect(flags.noNewscan).toBe(true);
      });
    });
  });
});
