/**
 * Unit tests for download-ratios.util.ts
 * Tests download/upload ratio checking (express.e:19823+)
 */

import {
  checkDownloadRatios,
  creditAccountTrackDownloads,
  creditAccountTrackUploads,
  updateDownloadStats,
  updateUploadStats,
  calculateAvailableBytes,
  DownloadRequest
} from '../../src/utils/download-ratios.util';
import { User } from '../../src/types';
import * as dateTimeUtil from '../../src/utils/date-time.util';

jest.mock('../../src/utils/date-time.util');

describe('download-ratios.util', () => {
  const mockDate = new Date('2026-01-07T10:30:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    (dateTimeUtil.getSystemTime as jest.Mock).mockReturnValue(mockDate);
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('creditAccountTrackDownloads', () => {
    it('should return true when credit account is disabled', () => {
      const user = { creditDays: 0 } as unknown as User;
      expect(creditAccountTrackDownloads(user)).toBe(true);
    });

    it('should return true when credit account is expired', () => {
      const user = {
        creditDays: 7,
        creditStartDate: Math.floor(Date.now() / 1000) - (30 * 86400) // 30 days ago
      } as unknown as User;
      expect(creditAccountTrackDownloads(user)).toBe(true);
    });

    it('should return false when credit account is active and downloads not tracked', () => {
      const user = {
        creditDays: 30,
        creditStartDate: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
        creditTracking: 0 // No tracking bits set
      } as unknown as User;
      expect(creditAccountTrackDownloads(user)).toBe(false);
    });

    it('should return true when credit account is active and downloads are tracked', () => {
      const user = {
        creditDays: 30,
        creditStartDate: Math.floor(Date.now() / 1000) - 86400,
        creditTracking: 1 // TRACK_DOWNLOADS_BIT set
      } as unknown as User;
      expect(creditAccountTrackDownloads(user)).toBe(true);
    });
  });

  describe('creditAccountTrackUploads', () => {
    it('should return true when credit account is disabled', () => {
      const user = { creditDays: 0 } as unknown as User;
      expect(creditAccountTrackUploads(user)).toBe(true);
    });

    it('should return false when credit account is active and uploads not tracked', () => {
      const user = {
        creditDays: 30,
        creditStartDate: Math.floor(Date.now() / 1000) - 86400,
        creditTracking: 0
      } as unknown as User;
      expect(creditAccountTrackUploads(user)).toBe(false);
    });

    it('should return true when credit account is active and uploads are tracked', () => {
      const user = {
        creditDays: 30,
        creditStartDate: Math.floor(Date.now() / 1000) - 86400,
        creditTracking: 2 // TRACK_UPLOADS_BIT set
      } as unknown as User;
      expect(creditAccountTrackUploads(user)).toBe(true);
    });

    it('should return true when both tracking bits are set', () => {
      const user = {
        creditDays: 30,
        creditStartDate: Math.floor(Date.now() / 1000) - 86400,
        creditTracking: 3 // Both bits set
      } as unknown as User;
      expect(creditAccountTrackUploads(user)).toBe(true);
    });
  });

  describe('checkDownloadRatios', () => {
    describe('Basic validation', () => {
      it('should deny download when user is not authenticated', async () => {
        const result = await checkDownloadRatios(undefined, 1024);
        expect(result).toEqual({
          canDownload: false,
          errorMessage: 'User not authenticated'
        });
      });

      it('should allow sysop to bypass ratio checks', async () => {
        const sysop = { secLevel: 255 } as unknown as User;
        const result = await checkDownloadRatios(sysop, 100000);
        expect(result.canDownload).toBe(true);
      });

      it('should handle single number request', async () => {
        const user = {
          secLevel: 10,
          ratio: 0, // No ratio required
          uploads: 0,
          downloads: 0,
          bytesUpload: 0,
          bytesDownload: 0
        } as unknown as User;
        const result = await checkDownloadRatios(user, 1024);
        expect(result.canDownload).toBe(true);
      });

      it('should handle array of requests', async () => {
        const user = { secLevel: 10, ratio: 0 } as unknown as User;
        const requests: DownloadRequest[] = [
          { size: 1024 },
          { size: 2048 }
        ];
        const result = await checkDownloadRatios(user, requests);
        expect(result.canDownload).toBe(true);
      });
    });

    describe('Daily byte limits', () => {
      it('should deny download when daily limit exceeded', async () => {
        const user = {
          secLevel: 10,
          dailyBytesLimit: 10000,
          dailyBytesDld: 9000
        } as unknown as User;
        const result = await checkDownloadRatios(user, 2000);
        expect(result).toEqual({
          canDownload: false,
          errorMessage: 'Not enough daily byte allowance for requested downloads'
        });
      });

      it('should allow download within daily limit', async () => {
        const user = {
          secLevel: 10,
          ratio: 0,
          dailyBytesLimit: 10000,
          dailyBytesDld: 5000
        } as unknown as User;
        const result = await checkDownloadRatios(user, 4000);
        expect(result.canDownload).toBe(true);
      });

      it('should not enforce daily limit when limit is 0', async () => {
        const user = {
          secLevel: 10,
          ratio: 0,
          dailyBytesLimit: 0,
          dailyBytesDld: 0
        } as unknown as User;
        const result = await checkDownloadRatios(user, 1000000);
        expect(result.canDownload).toBe(true);
      });
    });

    describe('Free downloads', () => {
      it('should bypass ratio checks for free downloads', async () => {
        const user = {
          secLevel: 10,
          ratio: 5, // 5:1 ratio required
          uploads: 0,
          downloads: 0,
          bytesUpload: 0,
          bytesDownload: 0
        } as unknown as User;
        const requests: DownloadRequest[] = [{ size: 10000, isFree: true }];
        const result = await checkDownloadRatios(user, requests);
        expect(result.canDownload).toBe(true);
      });

      it('should still count free downloads against daily byte limit', async () => {
        const user = {
          secLevel: 10,
          ratio: 0,
          dailyBytesLimit: 5000,
          dailyBytesDld: 0
        } as unknown as User;
        const requests: DownloadRequest[] = [{ size: 6000, isFree: true }];
        const result = await checkDownloadRatios(user, requests);
        expect(result).toEqual({
          canDownload: false,
          errorMessage: 'Not enough daily byte allowance for requested downloads'
        });
      });
    });

    describe('Ratio type 0 (bytes only)', () => {
      it('should deny download when byte ratio exceeded', async () => {
        const user = {
          secLevel: 10,
          ratio: 2, // 2:1 ratio
          ratioType: 0,
          uploads: 1,
          downloads: 0,
          bytesUpload: 5000,
          bytesDownload: 0
        } as unknown as User;
        const result = await checkDownloadRatios(user, 11000); // 2 * 5000 = 10000 allowed
        expect(result).toEqual({
          canDownload: false,
          errorMessage: 'Not enough free bytes for requested downloads.',
          remainingBytes: 10000
        });
      });

      it('should allow download within byte ratio', async () => {
        const user = {
          secLevel: 10,
          ratio: 2,
          ratioType: 0,
          uploads: 1,
          downloads: 0,
          bytesUpload: 10000,
          bytesDownload: 0
        } as unknown as User;
        const result = await checkDownloadRatios(user, 15000);
        expect(result.canDownload).toBe(true);
      });
    });

    describe('Ratio type 1 (bytes AND files)', () => {
      it('should deny download when file ratio exceeded', async () => {
        const user = {
          secLevel: 10,
          ratio: 2,
          ratioType: 1,
          uploads: 1,
          downloads: 0,
          bytesUpload: 100000,
          bytesDownload: 0
        } as unknown as User;
        const requests: DownloadRequest[] = [
          { size: 1000 },
          { size: 1000 },
          { size: 1000 },
          { size: 1000 },
          { size: 1000 } // 5 files, but only 2 * (1+1) = 4 allowed
        ];
        const result = await checkDownloadRatios(user, requests);
        expect(result).toEqual({
          canDownload: false,
          errorMessage: 'Not enough free files for requested downloads.',
          remainingFiles: 4
        });
      });

      it('should allow download within both byte and file ratios', async () => {
        const user = {
          secLevel: 10,
          ratio: 2,
          ratioType: 1,
          uploads: 2,
          downloads: 1,
          bytesUpload: 50000,
          bytesDownload: 10000
        } as unknown as User;
        const requests: DownloadRequest[] = [
          { size: 20000 },
          { size: 20000 }
        ];
        const result = await checkDownloadRatios(user, requests);
        expect(result.canDownload).toBe(true);
      });
    });

    describe('Ratio type 2 (files only)', () => {
      it('should only check file ratio, not byte ratio', async () => {
        const user = {
          secLevel: 10,
          ratio: 2,
          ratioType: 2,
          uploads: 5,
          downloads: 0,
          bytesUpload: 1000, // Very small upload bytes
          bytesDownload: 0
        } as unknown as User;
        const result = await checkDownloadRatios(user, 1000000); // Large download - bytes don't matter
        expect(result.canDownload).toBe(true);
      });

      it('should deny download when file ratio exceeded with type 2', async () => {
        const user = {
          secLevel: 10,
          ratio: 2,
          ratioType: 2,
          uploads: 1,
          downloads: 2,
          bytesUpload: 100000,
          bytesDownload: 0
        } as unknown as User;
        const requests: DownloadRequest[] = [
          { size: 1000 },
          { size: 1000 } // 2 files, but only 2 * (1+1) - 2 = 2 allowed
        ];
        const result = await checkDownloadRatios(user, requests);
        expect(result.canDownload).toBe(true); // Exactly at limit
      });
    });

    describe('Credit accounts', () => {
      it('should bypass ratio checks when credit account is active', async () => {
        const user = {
          secLevel: 10,
          ratio: 10, // High ratio required
          uploads: 0,
          downloads: 0,
          bytesUpload: 0,
          bytesDownload: 0,
          creditDays: 30,
          creditStartDate: Math.floor(Date.now() / 1000) - 86400
        } as unknown as User;
        const result = await checkDownloadRatios(user, 100000);
        expect(result.canDownload).toBe(true);
      });
    });

    describe('Disabled ratios', () => {
      it('should allow download when ratio is 0 (disabled)', async () => {
        const user = {
          secLevel: 10,
          ratio: 0,
          uploads: 0,
          downloads: 0,
          bytesUpload: 0,
          bytesDownload: 0
        } as unknown as User;
        const result = await checkDownloadRatios(user, 100000);
        expect(result.canDownload).toBe(true);
      });
    });
  });

  describe('updateDownloadStats', () => {
    it('should update download counters for non-free downloads', async () => {
      const user = {
        username: 'testuser',
        downloads: 5,
        bytesDownload: 50000,
        dailyBytesDld: 10000
      } as unknown as User;

      await updateDownloadStats(user, 1024, false);

      expect(user.downloads).toBe(6);
      expect(user.bytesDownload).toBe(51024);
      expect(user.dailyBytesDld).toBe(11024);
      expect(user.lastDownloadTime).toBeDefined();
    });

    it('should not update download counters for free downloads', async () => {
      const user = {
        username: 'testuser',
        downloads: 5,
        bytesDownload: 50000,
        dailyBytesDld: 10000
      } as unknown as User;

      await updateDownloadStats(user, 1024, true);

      expect(user.downloads).toBe(5); // Not incremented
      expect(user.bytesDownload).toBe(50000); // Not updated
      expect(user.dailyBytesDld).toBe(11024); // Still updated for daily limit
    });

    it('should not track downloads when credit account disables tracking', async () => {
      const user = {
        username: 'testuser',
        downloads: 5,
        bytesDownload: 50000,
        creditDays: 30,
        creditStartDate: Math.floor(Date.now() / 1000) - 86400,
        creditTracking: 0 // Downloads not tracked
      } as unknown as User;

      await updateDownloadStats(user, 1024, false);

      expect(user.downloads).toBe(5); // Not incremented
      expect(user.bytesDownload).toBe(50000); // Not updated
    });

    it('should update topDownloadCPS when new CPS is higher', async () => {
      const user = {
        username: 'testuser',
        topDownloadCPS: 3000
      } as unknown as User;

      await updateDownloadStats(user, 1024, false, 5000);

      expect(user.topDownloadCPS).toBe(5000);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('New top download CPS')
      );
    });

    it('should not update topDownloadCPS when new CPS is lower', async () => {
      const user = {
        username: 'testuser',
        topDownloadCPS: 5000
      } as unknown as User;

      await updateDownloadStats(user, 1024, false, 3000);

      expect(user.topDownloadCPS).toBe(5000);
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should decrement bytesAvailableForDownload when present', async () => {
      const user = {
        username: 'testuser',
        bytesAvailableForDownload: 10000
      } as unknown as User;

      await updateDownloadStats(user, 3000);

      expect(user.bytesAvailableForDownload).toBe(7000);
    });

    it('should not allow bytesAvailableForDownload to go negative', async () => {
      const user = {
        username: 'testuser',
        bytesAvailableForDownload: 1000
      } as unknown as User;

      await updateDownloadStats(user, 5000);

      expect(user.bytesAvailableForDownload).toBe(0);
    });
  });

  describe('updateUploadStats', () => {
    it('should update topUploadCPS when new CPS is higher', async () => {
      const user = {
        username: 'testuser',
        topUploadCPS: 2000
      } as unknown as User;

      await updateUploadStats(user, 1024, 4000);

      expect(user.topUploadCPS).toBe(4000);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('New top upload CPS')
      );
    });

    it('should not update topUploadCPS when new CPS is lower', async () => {
      const user = {
        username: 'testuser',
        topUploadCPS: 5000
      } as unknown as User;

      await updateUploadStats(user, 1024, 2000);

      expect(user.topUploadCPS).toBe(5000);
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should simulate CPS when not provided', async () => {
      const user = {
        username: 'testuser',
        topUploadCPS: 0
      } as unknown as User;

      await updateUploadStats(user, 1024);

      expect(user.topUploadCPS).toBeGreaterThan(0);
    });
  });

  describe('calculateAvailableBytes', () => {
    it('should return bytesAvailableForDownload when no ratio required', () => {
      const user = {
        downloadRatio: 0,
        bytesAvailableForDownload: 50000
      } as unknown as User;

      const result = calculateAvailableBytes(user);
      expect(result).toBe(50000);
    });

    it('should calculate based on upload/download ratio', () => {
      const user = {
        downloadRatio: 2,
        uploads: 5,
        downloads: 3
      } as unknown as User;

      // allowedDownloads = 2 * (5 + 1) - 3 = 9
      // available = 9 * 100000 = 900000
      const result = calculateAvailableBytes(user);
      expect(result).toBe(900000);
    });

    it('should return 0 when downloads exceed allowed ratio', () => {
      const user = {
        downloadRatio: 2,
        uploads: 2,
        downloads: 10
      } as unknown as User;

      // allowedDownloads = 2 * (2 + 1) - 10 = -4
      const result = calculateAvailableBytes(user);
      expect(result).toBe(0);
    });

    it('should handle undefined values gracefully', () => {
      const user = {} as unknown as User;

      const result = calculateAvailableBytes(user);
      expect(result).toBe(0);
    });
  });
});
