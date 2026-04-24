/**
 * Unit tests for download-logging.util.ts
 * Tests download/upload activity logging (express.e:9475+)
 */

// Prevent DB init: mocking fs/path breaks better-sqlite3 bindings.getRoot
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';
import { logDownload, logUpload, logDivider } from '../../src/utils/download-logging.util';
import { User } from '../../src/types';
import * as acsUtil from '../../src/utils/acs.util';
import * as dateTimeUtil from '../../src/utils/date-time.util';
import { config } from '../../src/config';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/utils/acs.util');
jest.mock('../../src/utils/date-time.util');
jest.mock('../../src/config', () => ({
  config: {
    get: jest.fn((key: string) => {
      if (key === 'dataDir') return '/data';
      return undefined;
    })
  }
}));

describe('download-logging.util', () => {
  const mockUser: User = {
    username: 'testuser'
  } as unknown as User;

  const mockDate = new Date('2026-01-07T10:30:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock getSystemTime to return consistent date
    (dateTimeUtil.getSystemTime as jest.Mock).mockReturnValue(mockDate);

    // Mock ACS config - logging enabled by default
    (acsUtil.getACSConfig as jest.Mock).mockReturnValue({
      acLvl: {
        [acsUtil.LevelFlags.DO_UD_LOG]: true,
        [acsUtil.LevelFlags.DO_CALLERSLOG]: true
      }
    });

    // Mock path.join
    (path.join as jest.Mock).mockImplementation((...args: string[]) => args.join('/'));

    // Mock fs operations
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.appendFileSync as jest.Mock).mockReturnValue(undefined);

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logDownload', () => {
    it('should log regular download', async () => {
      await logDownload(mockUser, 'test.zip', 1024);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[DOWNLOAD]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('testuser')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Downloading test.zip 1024 bytes')
      );
    });

    it('should log free download', async () => {
      await logDownload(mockUser, 'freeware.zip', 2048, true);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Downloading Free freeware.zip 2048 bytes')
      );
    });

    it('should include timestamp in log message', async () => {
      await logDownload(mockUser, 'test.zip', 1024);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('2026-01-07T10:30:00.000Z')
      );
    });

    it('should write to UDLog file when logging enabled', async () => {
      await logDownload(mockUser, 'test.zip', 1024, false, 1);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        '/data/Node1/UDLog',
        expect.stringContaining('testuser - Downloading test.zip 1024 bytes\n')
      );
    });

    it('should write to CallersLog when logging enabled', async () => {
      await logDownload(mockUser, 'test.zip', 1024, false, 1);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        '/data/Node1/CallersLog',
        expect.stringContaining('testuser:')
      );
    });

    it('should use Node0 as default node', async () => {
      await logDownload(mockUser, 'test.zip', 1024);

      expect(path.join).toHaveBeenCalledWith('/data', 'Node0');
    });

    it('should use specified node ID', async () => {
      await logDownload(mockUser, 'test.zip', 1024, false, 3);

      expect(path.join).toHaveBeenCalledWith('/data', 'Node3');
    });

    it('should handle user without username', async () => {
      const userNoName = { username: undefined } as unknown as User;
      await logDownload(userNoName, 'test.zip', 1024);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Unknown')
      );
    });

    it('should handle empty username', async () => {
      const userEmptyName = { username: '' } as unknown as User;
      await logDownload(userEmptyName, 'test.zip', 1024);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Unknown')
      );
    });

    it('should handle large file sizes', async () => {
      await logDownload(mockUser, 'bigfile.zip', 1073741824); // 1GB

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('1073741824 bytes')
      );
    });

    it('should handle zero byte files', async () => {
      await logDownload(mockUser, 'empty.txt', 0);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('0 bytes')
      );
    });

    it('should handle special characters in filename', async () => {
      await logDownload(mockUser, 'test [v1.0].zip', 1024);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('test [v1.0].zip')
      );
    });
  });

  describe('logUpload', () => {
    it('should log regular upload', async () => {
      await logUpload(mockUser, 'myfile.zip', 2048);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[UPLOAD]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Uploading myfile.zip 2048 bytes')
      );
    });

    it('should log resumed upload', async () => {
      await logUpload(mockUser, 'bigfile.zip', 5120, true);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Resuming upload bigfile.zip 5120 bytes')
      );
    });

    it('should include timestamp in log message', async () => {
      await logUpload(mockUser, 'test.zip', 1024);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('2026-01-07T10:30:00.000Z')
      );
    });

    it('should write to UDLog file when logging enabled', async () => {
      await logUpload(mockUser, 'test.zip', 1024, false, 2);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        '/data/Node2/UDLog',
        expect.stringContaining('testuser - Uploading test.zip 1024 bytes\n')
      );
    });

    it('should write to CallersLog when logging enabled', async () => {
      await logUpload(mockUser, 'test.zip', 1024, false, 2);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        '/data/Node2/CallersLog',
        expect.stringContaining('testuser:')
      );
    });

    it('should use Node0 as default node', async () => {
      await logUpload(mockUser, 'test.zip', 1024);

      expect(path.join).toHaveBeenCalledWith('/data', 'Node0');
    });

    it('should use specified node ID', async () => {
      await logUpload(mockUser, 'test.zip', 1024, false, 5);

      expect(path.join).toHaveBeenCalledWith('/data', 'Node5');
    });

    it('should handle user without username', async () => {
      const userNoName = { username: undefined } as unknown as User;
      await logUpload(userNoName, 'test.zip', 1024);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Unknown')
      );
    });

    it('should handle large file sizes', async () => {
      await logUpload(mockUser, 'bigfile.zip', 2147483648); // 2GB

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('2147483648 bytes')
      );
    });

    it('should handle zero byte files', async () => {
      await logUpload(mockUser, 'empty.txt', 0);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('0 bytes')
      );
    });
  });

  describe('logDivider', () => {
    it('should write divider to UDLog', async () => {
      await logDivider();

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('**************************************************************\n')
      );
    });

    it('should use Node0 for divider', async () => {
      await logDivider();

      expect(path.join).toHaveBeenCalledWith('/data', 'Node0');
    });

    it('should respect UDLog enabled flag', async () => {
      (acsUtil.getACSConfig as jest.Mock).mockReturnValue({
        acLvl: {
          [acsUtil.LevelFlags.DO_UD_LOG]: false,
          [acsUtil.LevelFlags.DO_CALLERSLOG]: true
        }
      });

      await logDivider();

      expect(fs.appendFileSync).not.toHaveBeenCalled();
    });
  });

  describe('Log directory creation', () => {
    it('should create logs directory if it does not exist', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // nodeDir exists
        .mockReturnValueOnce(false); // logDir does not exist

      await logDownload(mockUser, 'test.zip', 1024);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      );
    });

    it('should not create directory if it already exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await logDownload(mockUser, 'test.zip', 1024);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should fall back to logs directory if node directory does not exist', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(false)  // nodeDir does not exist
        .mockReturnValueOnce(true);  // fallback logDir exists

      await logDownload(mockUser, 'test.zip', 1024, false, 1);

      expect(path.join).toHaveBeenCalledWith(expect.any(String), 'logs');
    });
  });

  describe('ACS flag control', () => {
    it('should not write to UDLog when DO_UD_LOG is false', async () => {
      (acsUtil.getACSConfig as jest.Mock).mockReturnValue({
        acLvl: {
          [acsUtil.LevelFlags.DO_UD_LOG]: false,
          [acsUtil.LevelFlags.DO_CALLERSLOG]: true
        }
      });

      await logDownload(mockUser, 'test.zip', 1024);

      // Should not write to UDLog
      const udLogCalls = (fs.appendFileSync as jest.Mock).mock.calls
        .filter(call => call[0].includes('UDLog'));
      expect(udLogCalls).toHaveLength(0);

      // But should still write to CallersLog
      const callersLogCalls = (fs.appendFileSync as jest.Mock).mock.calls
        .filter(call => call[0].includes('CallersLog'));
      expect(callersLogCalls.length).toBeGreaterThan(0);
    });

    it('should not write to CallersLog when DO_CALLERSLOG is false', async () => {
      (acsUtil.getACSConfig as jest.Mock).mockReturnValue({
        acLvl: {
          [acsUtil.LevelFlags.DO_UD_LOG]: true,
          [acsUtil.LevelFlags.DO_CALLERSLOG]: false
        }
      });

      await logDownload(mockUser, 'test.zip', 1024);

      // Should write to UDLog
      const udLogCalls = (fs.appendFileSync as jest.Mock).mock.calls
        .filter(call => call[0].includes('UDLog'));
      expect(udLogCalls.length).toBeGreaterThan(0);

      // But should not write to CallersLog
      const callersLogCalls = (fs.appendFileSync as jest.Mock).mock.calls
        .filter(call => call[0].includes('CallersLog'));
      expect(callersLogCalls).toHaveLength(0);
    });

    it('should not write to any log when both flags are false', async () => {
      (acsUtil.getACSConfig as jest.Mock).mockReturnValue({
        acLvl: {
          [acsUtil.LevelFlags.DO_UD_LOG]: false,
          [acsUtil.LevelFlags.DO_CALLERSLOG]: false
        }
      });

      await logDownload(mockUser, 'test.zip', 1024);

      expect(fs.appendFileSync).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle UDLog write errors gracefully', async () => {
      (fs.appendFileSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      await expect(logDownload(mockUser, 'test.zip', 1024)).resolves.not.toThrow();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[UDLOG]'),
        expect.any(Error)
      );
    });

    it('should handle CallersLog write errors gracefully', async () => {
      (fs.appendFileSync as jest.Mock)
        .mockImplementationOnce(() => undefined)  // UDLog succeeds
        .mockImplementationOnce(() => {           // CallersLog fails
          throw new Error('Disk full');
        });

      await expect(logDownload(mockUser, 'test.zip', 1024)).resolves.not.toThrow();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[CALLERSLOG]'),
        expect.any(Error)
      );
    });

    it('should handle directory creation errors gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(false);
      (fs.mkdirSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      await expect(logDownload(mockUser, 'test.zip', 1024)).resolves.not.toThrow();
    });

    it('should continue logging to console even if file writes fail', async () => {
      (fs.appendFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File error');
      });

      await logDownload(mockUser, 'test.zip', 1024);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[DOWNLOAD]')
      );
    });
  });

  describe('File format', () => {
    it('should append newline to UDLog entries', async () => {
      await logDownload(mockUser, 'test.zip', 1024);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('UDLog'),
        expect.stringMatching(/\n$/)
      );
    });

    it('should append newline to CallersLog entries', async () => {
      await logDownload(mockUser, 'test.zip', 1024);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('CallersLog'),
        expect.stringMatching(/\n$/)
      );
    });

    it('should prefix CallersLog entries with username', async () => {
      await logDownload(mockUser, 'test.zip', 1024);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('CallersLog'),
        expect.stringMatching(/^testuser:/)
      );
    });
  });

  describe('Multiple operations', () => {
    it('should log multiple downloads to same file', async () => {
      await logDownload(mockUser, 'file1.zip', 1024);
      await logDownload(mockUser, 'file2.zip', 2048);
      await logDownload(mockUser, 'file3.zip', 4096);

      expect(fs.appendFileSync).toHaveBeenCalledTimes(6); // 3 downloads x 2 logs each
    });

    it('should log mixed downloads and uploads', async () => {
      await logDownload(mockUser, 'download.zip', 1024);
      await logUpload(mockUser, 'upload.zip', 2048);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[DOWNLOAD]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[UPLOAD]')
      );
    });

    it('should maintain separate logs per node', async () => {
      await logDownload(mockUser, 'test.zip', 1024, false, 1);
      await logDownload(mockUser, 'test.zip', 1024, false, 2);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        '/data/Node1/UDLog',
        expect.any(String)
      );
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        '/data/Node2/UDLog',
        expect.any(String)
      );
    });
  });
});
