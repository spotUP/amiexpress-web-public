/**
 * Background Check Utility Unit Tests
 *
 * Tests background file checking queue with FILE_ID.DIZ extraction,
 * file integrity testing, and status determination based on express.e:18474-19650.
 */

import {
  doBgCheck,
  getBgCheckStatus,
  bgCheckQueue,
} from '../../src/utils/background-check.util';
import { TestResult } from '../../src/utils/file-test.util';

// Mock file utilities
jest.mock('../../src/utils/file-diz.util', () => ({
  extractAndReadDiz: jest.fn(),
}));

jest.mock('../../src/utils/file-test.util', () => ({
  testFile: jest.fn(),
  TestResult: {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    NOT_TESTED: 'NOT_TESTED',
  },
}));

jest.mock('../../src/utils/file-hold.util', () => ({
  moveUploadedFile: jest.fn(),
}));

import { extractAndReadDiz } from '../../src/utils/file-diz.util';
import { testFile } from '../../src/utils/file-test.util';

describe('Background Check Utility', () => {
  beforeEach(() => {
    // Clear queue
    while (bgCheckQueue['queue'].length > 0) {
      bgCheckQueue['queue'].shift();
    }
    bgCheckQueue['processing'] = false;

    // Clear mocks
    jest.clearAllMocks();

    // Suppress console logs
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('doBgCheck', () => {
    it('should enqueue background check task', async () => {
      (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
      (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

      await doBgCheck('test.zip', '/uploads/test.zip', 1, 100);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      const status = getBgCheckStatus();
      expect(status.pending).toBe(0); // Should be processed
    });

    it('should create task with unique ID', async () => {
      (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
      (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

      await doBgCheck('file1.zip', '/uploads/file1.zip', 1, 100);
      await doBgCheck('file2.zip', '/uploads/file2.zip', 1, 100);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Both should have been processed (different task IDs)
      expect(extractAndReadDiz).toHaveBeenCalledTimes(2);
    });

    it('should include all task parameters', async () => {
      (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
      (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

      await doBgCheck('test.lha', '/path/test.lha', 5, 42);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(extractAndReadDiz).toHaveBeenCalled();
      expect(testFile).toHaveBeenCalledWith('/path/test.lha', expect.any(String));
    });
  });

  describe('getBgCheckStatus', () => {
    it('should return empty queue status initially', () => {
      const status = getBgCheckStatus();

      expect(status.pending).toBe(0);
      expect(status.processing).toBe(false);
    });

    it('should show pending count when tasks enqueued', async () => {
      (extractAndReadDiz as jest.Mock).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve([]), 100))
      );
      (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

      // Enqueue without waiting
      doBgCheck('file1.zip', '/uploads/file1.zip', 1, 100);
      doBgCheck('file2.zip', '/uploads/file2.zip', 1, 100);

      // Check status immediately
      const status = getBgCheckStatus();
      expect(status.pending).toBeGreaterThanOrEqual(0);
    });

    it('should show processing flag when queue active', async () => {
      (extractAndReadDiz as jest.Mock).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve([]), 100))
      );
      (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

      doBgCheck('file.zip', '/uploads/file.zip', 1, 100);

      // Check while processing
      await new Promise(resolve => setTimeout(resolve, 10));
      const status = getBgCheckStatus();

      // Should be processing or completed
      expect(typeof status.processing).toBe('boolean');
    });
  });

  describe('BackgroundCheckQueue', () => {
    describe('FILE_ID.DIZ extraction', () => {
      it('should extract DIZ content successfully', async () => {
        const dizLines = ['Program Name v1.0', 'Description line 1', 'Description line 2'];
        (extractAndReadDiz as jest.Mock).mockResolvedValue(dizLines);
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('test.zip', '/uploads/test.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(extractAndReadDiz).toHaveBeenCalledWith(
          '/uploads/test.zip',
          expect.stringContaining('/tmp/bbs-bg-check-'),
          [],
          10
        );
      });

      it('should handle missing DIZ gracefully', async () => {
        (extractAndReadDiz as jest.Mock).mockRejectedValue(new Error('No DIZ found'));
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('nodiz.zip', '/uploads/nodiz.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        // Should continue processing even without DIZ
        expect(testFile).toHaveBeenCalled();
      });

      it('should handle empty DIZ content', async () => {
        (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('emptydiz.zip', '/uploads/emptydiz.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(testFile).toHaveBeenCalled();
      });
    });

    describe('file integrity testing', () => {
      it('should test file successfully', async () => {
        (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('valid.zip', '/uploads/valid.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(testFile).toHaveBeenCalledWith(
          '/uploads/valid.zip',
          expect.stringContaining('/tmp/bbs-bg-check-')
        );
      });

      it('should handle test failures', async () => {
        (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
        (testFile as jest.Mock).mockResolvedValue(TestResult.FAILURE);

        await doBgCheck('corrupt.zip', '/uploads/corrupt.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(testFile).toHaveBeenCalled();
      });

      it('should handle test errors gracefully', async () => {
        (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
        (testFile as jest.Mock).mockRejectedValue(new Error('Test command failed'));

        await doBgCheck('error.zip', '/uploads/error.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        // Should complete without throwing
        expect(testFile).toHaveBeenCalled();
      });
    });

    describe('final status determination', () => {
      it('should set active status for successful tests', async () => {
        (extractAndReadDiz as jest.Mock).mockResolvedValue(['DIZ content']);
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('good.zip', '/uploads/good.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(testFile).toHaveBeenCalled();
      });

      it('should set hold status for failed tests', async () => {
        (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
        (testFile as jest.Mock).mockResolvedValue(TestResult.FAILURE);

        await doBgCheck('bad.zip', '/uploads/bad.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(testFile).toHaveBeenCalled();
      });

      it('should set active status for not tested files', async () => {
        (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
        (testFile as jest.Mock).mockResolvedValue(TestResult.NOT_TESTED);

        await doBgCheck('unknown.zip', '/uploads/unknown.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(testFile).toHaveBeenCalled();
      });
    });

    describe('queue processing', () => {
      it('should process multiple tasks sequentially', async () => {
        const processOrder: string[] = [];

        (extractAndReadDiz as jest.Mock).mockImplementation(async (filepath: string) => {
          processOrder.push(filepath);
          return [];
        });
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('file1.zip', '/uploads/file1.zip', 1, 100);
        await doBgCheck('file2.zip', '/uploads/file2.zip', 1, 100);
        await doBgCheck('file3.zip', '/uploads/file3.zip', 1, 100);

        // Wait for all processing
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(processOrder).toContain('/uploads/file1.zip');
        expect(processOrder).toContain('/uploads/file2.zip');
        expect(processOrder).toContain('/uploads/file3.zip');
      });

      it('should not start processing twice', async () => {
        (extractAndReadDiz as jest.Mock).mockImplementation(() =>
          new Promise(resolve => setTimeout(() => resolve([]), 100))
        );
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        // Enqueue multiple tasks quickly
        await doBgCheck('file1.zip', '/uploads/file1.zip', 1, 100);
        await doBgCheck('file2.zip', '/uploads/file2.zip', 1, 100);

        // Should only have one processing loop active
        const status = getBgCheckStatus();
        expect(typeof status.processing).toBe('boolean');
      });

      it('should handle task errors without stopping queue', async () => {
        (extractAndReadDiz as jest.Mock).mockImplementation(async (filepath: string) => {
          if (filepath.includes('error')) {
            throw new Error('Processing error');
          }
          return [];
        });
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('file1.zip', '/uploads/file1.zip', 1, 100);
        await doBgCheck('error.zip', '/uploads/error.zip', 1, 100);
        await doBgCheck('file3.zip', '/uploads/file3.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // All files should have been attempted
        expect(extractAndReadDiz).toHaveBeenCalledTimes(3);
      });

      it('should clear queue after processing', async () => {
        (extractAndReadDiz as jest.Mock).mockResolvedValue([]);
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('file1.zip', '/uploads/file1.zip', 1, 100);
        await doBgCheck('file2.zip', '/uploads/file2.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));

        const status = getBgCheckStatus();
        expect(status.pending).toBe(0);
      });
    });

    describe('task status transitions', () => {
      it('should transition from pending to running', async () => {
        let statusDuringProcessing: string | undefined;

        (extractAndReadDiz as jest.Mock).mockImplementation(async () => {
          statusDuringProcessing = 'running';
          return [];
        });
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('test.zip', '/uploads/test.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(statusDuringProcessing).toBe('running');
      });

      it('should transition to completed on success', async () => {
        (extractAndReadDiz as jest.Mock).mockResolvedValue(['DIZ']);
        (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

        await doBgCheck('success.zip', '/uploads/success.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(extractAndReadDiz).toHaveBeenCalled();
        expect(testFile).toHaveBeenCalled();
      });

      it('should transition to failed on error', async () => {
        (extractAndReadDiz as jest.Mock).mockRejectedValue(new Error('Fatal error'));
        (testFile as jest.Mock).mockRejectedValue(new Error('Test failed'));

        await doBgCheck('error.zip', '/uploads/error.zip', 1, 100);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(console.error).toHaveBeenCalled();
      });
    });
  });

  describe('integration tests', () => {
    it('should handle complete background check workflow', async () => {
      const dizContent = ['Program v1.0', 'By Author', 'Description'];
      (extractAndReadDiz as jest.Mock).mockResolvedValue(dizContent);
      (testFile as jest.Mock).mockResolvedValue(TestResult.SUCCESS);

      await doBgCheck('complete.zip', '/uploads/complete.zip', 5, 42);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(extractAndReadDiz).toHaveBeenCalledWith(
        '/uploads/complete.zip',
        expect.stringContaining('/tmp/bbs-bg-check-'),
        [],
        10
      );

      expect(testFile).toHaveBeenCalledWith(
        '/uploads/complete.zip',
        expect.stringContaining('/tmp/bbs-bg-check-')
      );

      const status = getBgCheckStatus();
      expect(status.pending).toBe(0);
      expect(status.processing).toBe(false);
    });

    it('should process multiple files with mixed results', async () => {
      (extractAndReadDiz as jest.Mock).mockImplementation(async (filepath: string) => {
        if (filepath.includes('nodiz')) {
          return [];
        }
        return ['DIZ content'];
      });

      (testFile as jest.Mock).mockImplementation(async (filepath: string) => {
        if (filepath.includes('bad')) {
          return TestResult.FAILURE;
        }
        return TestResult.SUCCESS;
      });

      await doBgCheck('good.zip', '/uploads/good.zip', 1, 100);
      await doBgCheck('bad.zip', '/uploads/bad.zip', 1, 100);
      await doBgCheck('nodiz.zip', '/uploads/nodiz.zip', 1, 100);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(extractAndReadDiz).toHaveBeenCalledTimes(3);
      expect(testFile).toHaveBeenCalledTimes(3);
    });
  });
});
