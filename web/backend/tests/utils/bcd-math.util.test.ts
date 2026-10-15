/**
 * Unit tests for BCD Math Utilities
 * Tests precise byte tracking arithmetic using BigInt
 */

import {
  addBCD,
  addBCD2,
  convertFromBCD,
  convertToBCD,
  initBCD,
  formatBCD,
  bcdToKB,
  bcdToMB,
  compareBCD,
  subtractBCD,
  calculateRatio,
} from '../../src/utils/bcd-math.util';

describe('BCD Math Utilities', () => {
  describe('initBCD', () => {
    it('should initialize to zero', () => {
      const result = initBCD();
      expect(result).toBe(0n);
    });
  });

  describe('convertToBCD', () => {
    it('should convert number to BCD', () => {
      expect(convertToBCD(100)).toBe(100n);
      expect(convertToBCD(1234567)).toBe(1234567n);
    });

    it('should convert bigint to BCD', () => {
      expect(convertToBCD(9007199254740991n)).toBe(9007199254740991n);
    });

    it('should floor decimal values', () => {
      expect(convertToBCD(123.45)).toBe(123n);
      expect(convertToBCD(999.99)).toBe(999n);
    });

    it('should handle zero', () => {
      expect(convertToBCD(0)).toBe(0n);
    });

    it('should handle large numbers', () => {
      const large = 999999999999n;
      expect(convertToBCD(large)).toBe(large);
    });
  });

  describe('convertFromBCD', () => {
    it('should convert BCD to number', () => {
      expect(convertFromBCD(100n)).toBe(100);
      expect(convertFromBCD(1234567n)).toBe(1234567);
    });

    it('should handle zero', () => {
      expect(convertFromBCD(0n)).toBe(0);
    });

    it('should handle large values within safe integer range', () => {
      const safe = 9007199254740991n; // Number.MAX_SAFE_INTEGER
      expect(convertFromBCD(safe)).toBe(9007199254740991);
    });

    it('should convert very large values (may lose precision)', () => {
      const veryLarge = 999999999999999999n;
      const result = convertFromBCD(veryLarge);
      expect(typeof result).toBe('number');
      // Precision loss expected for values > MAX_SAFE_INTEGER
    });
  });

  describe('addBCD', () => {
    it('should add number to BCD value', () => {
      const bcd = 1000n;
      expect(addBCD(bcd, 500)).toBe(1500n);
    });

    it('should add bigint to BCD value', () => {
      const bcd = 1000n;
      expect(addBCD(bcd, 500n)).toBe(1500n);
    });

    it('should add to zero', () => {
      expect(addBCD(0n, 123)).toBe(123n);
    });

    it('should handle large additions', () => {
      const bcd = 1000000000000n;
      const result = addBCD(bcd, 999999999999n);
      expect(result).toBe(1999999999999n);
    });

    it('should add zero without changing value', () => {
      const bcd = 12345n;
      expect(addBCD(bcd, 0)).toBe(12345n);
    });
  });

  describe('addBCD2', () => {
    it('should add two BCD values', () => {
      expect(addBCD2(1000n, 500n)).toBe(1500n);
    });

    it('should add with zero', () => {
      expect(addBCD2(1234n, 0n)).toBe(1234n);
      expect(addBCD2(0n, 5678n)).toBe(5678n);
    });

    it('should handle large values', () => {
      const val1 = 999999999999n;
      const val2 = 888888888888n;
      expect(addBCD2(val1, val2)).toBe(1888888888887n);
    });
  });

  describe('subtractBCD', () => {
    it('should subtract number from BCD', () => {
      const bcd = 1000n;
      expect(subtractBCD(bcd, 300)).toBe(700n);
    });

    it('should subtract bigint from BCD', () => {
      const bcd = 1000n;
      expect(subtractBCD(bcd, 300n)).toBe(700n);
    });

    it('should not go negative (floor at 0)', () => {
      const bcd = 100n;
      expect(subtractBCD(bcd, 500)).toBe(0n);
    });

    it('should handle exact subtraction to zero', () => {
      const bcd = 1000n;
      expect(subtractBCD(bcd, 1000)).toBe(0n);
    });

    it('should subtract zero without changing value', () => {
      const bcd = 12345n;
      expect(subtractBCD(bcd, 0)).toBe(12345n);
    });
  });

  describe('compareBCD', () => {
    it('should return -1 when first is less than second', () => {
      expect(compareBCD(100n, 200n)).toBe(-1);
    });

    it('should return 0 when values are equal', () => {
      expect(compareBCD(100n, 100n)).toBe(0);
    });

    it('should return 1 when first is greater than second', () => {
      expect(compareBCD(200n, 100n)).toBe(1);
    });

    it('should compare zero correctly', () => {
      expect(compareBCD(0n, 0n)).toBe(0);
      expect(compareBCD(0n, 100n)).toBe(-1);
      expect(compareBCD(100n, 0n)).toBe(1);
    });

    it('should compare large values', () => {
      const large1 = 999999999999n;
      const large2 = 888888888888n;
      expect(compareBCD(large1, large2)).toBe(1);
    });
  });

  describe('formatBCD', () => {
    it('should format with thousands separators', () => {
      expect(formatBCD(1234567n)).toBe('1,234,567');
    });

    it('should format small numbers without commas', () => {
      expect(formatBCD(999n)).toBe('999');
    });

    it('should format numbers at threshold', () => {
      expect(formatBCD(1000n)).toBe('1,000');
    });

    it('should format zero', () => {
      expect(formatBCD(0n)).toBe('0');
    });

    it('should format large numbers', () => {
      expect(formatBCD(1234567890123n)).toBe('1,234,567,890,123');
    });
  });

  describe('bcdToKB', () => {
    it('should convert bytes to kilobytes', () => {
      expect(bcdToKB(1024n)).toBe(1);
      expect(bcdToKB(2048n)).toBe(2);
    });

    it('should round down for fractional KB', () => {
      expect(bcdToKB(1536n)).toBe(1); // 1.5 KB -> 1
      expect(bcdToKB(2560n)).toBe(2); // 2.5 KB -> 2
    });

    it('should handle zero', () => {
      expect(bcdToKB(0n)).toBe(0);
    });

    it('should handle large values', () => {
      const oneGB = 1024n * 1024n * 1024n;
      expect(bcdToKB(oneGB)).toBe(1024 * 1024); // 1 GB in KB
    });

    it('should handle values less than 1 KB', () => {
      expect(bcdToKB(500n)).toBe(0);
      expect(bcdToKB(1023n)).toBe(0);
    });
  });

  describe('bcdToMB', () => {
    it('should convert bytes to megabytes', () => {
      const oneMB = 1024n * 1024n;
      expect(bcdToMB(oneMB)).toBe(1);
      expect(bcdToMB(oneMB * 2n)).toBe(2);
    });

    it('should round down for fractional MB', () => {
      const oneMB = 1024n * 1024n;
      const onePointFiveMB = oneMB + (oneMB / 2n);
      expect(bcdToMB(onePointFiveMB)).toBe(1);
    });

    it('should handle zero', () => {
      expect(bcdToMB(0n)).toBe(0);
    });

    it('should handle large values', () => {
      const tenGB = 10n * 1024n * 1024n * 1024n;
      expect(bcdToMB(tenGB)).toBe(10 * 1024); // 10 GB in MB
    });

    it('should handle values less than 1 MB', () => {
      expect(bcdToMB(500n * 1024n)).toBe(0); // 500 KB
    });
  });

  describe('calculateRatio', () => {
    it('should calculate upload/download ratio', () => {
      expect(calculateRatio(1000n, 500n)).toBe(2.0); // 2:1 ratio
      expect(calculateRatio(500n, 1000n)).toBe(0.5); // 0.5:1 ratio
    });

    it('should return 1.0 when both are zero', () => {
      expect(calculateRatio(0n, 0n)).toBe(1.0);
    });

    it('should return Infinity when downloads are zero but uploads are not', () => {
      expect(calculateRatio(1000n, 0n)).toBe(Infinity);
    });

    it('should handle equal values', () => {
      expect(calculateRatio(1000n, 1000n)).toBe(1.0);
    });

    it('should handle large values', () => {
      const uploads = 1000000n;
      const downloads = 500000n;
      expect(calculateRatio(uploads, downloads)).toBe(2.0);
    });

    it('should handle typical BBS ratios', () => {
      // User uploaded 10 MB, downloaded 5 MB
      const upload10MB = 10n * 1024n * 1024n;
      const download5MB = 5n * 1024n * 1024n;
      expect(calculateRatio(upload10MB, download5MB)).toBe(2.0);
    });
  });

  describe('Real-world BBS scenarios', () => {
    it('should track file upload/download bytes accurately', () => {
      let uploadBCD = initBCD();
      let downloadBCD = initBCD();

      // User uploads 3 files
      uploadBCD = addBCD(uploadBCD, 1024 * 500); // 500 KB
      uploadBCD = addBCD(uploadBCD, 1024 * 1024); // 1 MB
      uploadBCD = addBCD(uploadBCD, 1024 * 300); // 300 KB

      // User downloads 2 files
      downloadBCD = addBCD(downloadBCD, 1024 * 1024 * 2); // 2 MB
      downloadBCD = addBCD(downloadBCD, 1024 * 750); // 750 KB

      // Verify totals
      expect(bcdToKB(uploadBCD)).toBe(1824); // 1.78 MB = 1824 KB
      expect(bcdToMB(downloadBCD)).toBe(2); // 2.73 MB = 2 MB (rounded)

      // Calculate ratio
      const ratio = calculateRatio(uploadBCD, downloadBCD);
      expect(ratio).toBeCloseTo(0.65, 2); // User downloaded more than uploaded
    });

    it('should handle daily statistics accumulation', () => {
      let dailyUploadBCD = initBCD();

      // Simulate a busy day
      for (let i = 0; i < 100; i++) {
        dailyUploadBCD = addBCD(dailyUploadBCD, 1024 * 1024); // 1 MB each
      }

      expect(bcdToMB(dailyUploadBCD)).toBe(100); // 100 MB total
      expect(formatBCD(dailyUploadBCD)).toBe('104,857,600'); // Formatted bytes
    });

    it('should maintain precision for large cumulative values', () => {
      // User has been on BBS for years
      const totalUploadedGB = 500n * 1024n * 1024n * 1024n; // 500 GB
      const totalDownloadedGB = 250n * 1024n * 1024n * 1024n; // 250 GB

      const ratio = calculateRatio(totalUploadedGB, totalDownloadedGB);
      expect(ratio).toBe(2.0); // Consistent 2:1 ratio

      // Verify conversions
      expect(bcdToMB(totalUploadedGB)).toBe(500 * 1024); // 512000 MB
    });

    it('should handle user credit system calculations', () => {
      const uploadBytes = 10n * 1024n * 1024n; // 10 MB uploaded
      const downloadBytes = 5n * 1024n * 1024n; // 5 MB downloaded

      // Calculate if user has sufficient upload credits
      const ratio = calculateRatio(uploadBytes, downloadBytes);
      const hasGoodRatio = ratio >= 1.0;

      expect(hasGoodRatio).toBe(true);
      expect(ratio).toBe(2.0);
    });
  });

  describe('Edge cases and boundaries', () => {
    it('should handle Number.MAX_SAFE_INTEGER boundary', () => {
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      const converted = convertFromBCD(maxSafe);
      expect(converted).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle operations at 1 KB boundary', () => {
      expect(bcdToKB(1023n)).toBe(0);
      expect(bcdToKB(1024n)).toBe(1);
      expect(bcdToKB(1025n)).toBe(1);
    });

    it('should handle operations at 1 MB boundary', () => {
      const oneMB = 1024n * 1024n;
      expect(bcdToMB(oneMB - 1n)).toBe(0);
      expect(bcdToMB(oneMB)).toBe(1);
      expect(bcdToMB(oneMB + 1n)).toBe(1);
    });

    it('should maintain accuracy across multiple operations', () => {
      let value = convertToBCD(1000);
      value = addBCD(value, 500);
      value = subtractBCD(value, 300);
      value = addBCD2(value, 100n);

      expect(value).toBe(1300n);
      expect(convertFromBCD(value)).toBe(1300);
    });
  });
});
