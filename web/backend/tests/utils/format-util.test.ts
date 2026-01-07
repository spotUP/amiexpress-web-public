/**
 * Format Utility Unit Tests
 *
 * Tests all formatting functions for proper output formatting.
 * Validates numeric formatting, size conversions, and text alignment.
 */

import {
  formatIP,
  formatSpaceValue,
  formatAmigaSize,
  formatNumber,
  formatPercentage,
  formatBaudRate,
  formatPhoneNumber,
  formatCallerID,
  formatUptime,
  formatRatio,
  padNumber,
  formatYesNo,
  formatOnOff,
  formatEnabled,
  formatTransferSpeed,
  formatCPS,
  formatSecurityLevel,
  formatCredits,
  centerText,
} from '../../src/utils/format-util';

describe('Format Utility Functions', () => {
  describe('formatIP', () => {
    it('should return string IPs as-is', () => {
      expect(formatIP('192.168.1.1')).toBe('192.168.1.1');
      expect(formatIP('10.0.0.1')).toBe('10.0.0.1');
    });

    it('should convert 32-bit number to dotted decimal', () => {
      expect(formatIP(0xC0A80101)).toBe('192.168.1.1'); // 192.168.1.1
      expect(formatIP(0x0A000001)).toBe('10.0.0.1');    // 10.0.0.1
      expect(formatIP(0x7F000001)).toBe('127.0.0.1');   // 127.0.0.1
    });

    it('should handle zero IP', () => {
      expect(formatIP(0)).toBe('0.0.0.0');
    });

    it('should handle max IP', () => {
      expect(formatIP(0xFFFFFFFF)).toBe('255.255.255.255');
    });
  });

  describe('formatSpaceValue', () => {
    it('should format bytes', () => {
      expect(formatSpaceValue(0)).toBe('0 B');
      expect(formatSpaceValue(512)).toBe('512.00 B');
    });

    it('should format kilobytes', () => {
      expect(formatSpaceValue(1024)).toBe('1.00 KB');
      expect(formatSpaceValue(2048)).toBe('2.00 KB');
      expect(formatSpaceValue(1536)).toBe('1.50 KB');
    });

    it('should format megabytes', () => {
      expect(formatSpaceValue(1024 * 1024)).toBe('1.00 MB');
      expect(formatSpaceValue(1024 * 1024 * 1.5)).toBe('1.50 MB');
    });

    it('should format gigabytes', () => {
      expect(formatSpaceValue(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatSpaceValue(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB');
    });

    it('should respect decimal places', () => {
      expect(formatSpaceValue(1536, 0)).toBe('2 KB');
      expect(formatSpaceValue(1536, 1)).toBe('1.5 KB');
      expect(formatSpaceValue(1536, 3)).toBe('1.500 KB');
    });

    it('should format terabytes', () => {
      expect(formatSpaceValue(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB');
    });
  });

  describe('formatAmigaSize', () => {
    it('should format bytes without unit', () => {
      expect(formatAmigaSize(0)).toBe('0');
      expect(formatAmigaSize(512)).toBe('512');
      expect(formatAmigaSize(1023)).toBe('1023');
    });

    it('should format kilobytes with K', () => {
      expect(formatAmigaSize(1024)).toBe('1K');
      expect(formatAmigaSize(2048)).toBe('2K');
      expect(formatAmigaSize(1536)).toBe('1.5K');
    });

    it('should format megabytes with M', () => {
      expect(formatAmigaSize(1024 * 1024)).toBe('1M');
      expect(formatAmigaSize(1024 * 1024 * 2.5)).toBe('2.5M');
    });

    it('should remove unnecessary decimals', () => {
      expect(formatAmigaSize(1024)).toBe('1K'); // Not "1.0K"
      expect(formatAmigaSize(1024 * 1024)).toBe('1M'); // Not "1.0M"
    });

    it('should format gigabytes with G', () => {
      expect(formatAmigaSize(1024 * 1024 * 1024)).toBe('1G');
    });
  });

  describe('formatNumber', () => {
    it('should add thousands separator', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1234567)).toBe('1,234,567');
      expect(formatNumber(1000000)).toBe('1,000,000');
    });

    it('should handle numbers without thousands', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(123)).toBe('123');
      expect(formatNumber(999)).toBe('999');
    });

    it('should support custom separator', () => {
      expect(formatNumber(1000, '.')).toBe('1.000');
      expect(formatNumber(1234567, ' ')).toBe('1 234 567');
    });

    it('should handle negative numbers', () => {
      expect(formatNumber(-1000)).toBe('-1,000');
      expect(formatNumber(-1234567)).toBe('-1,234,567');
    });
  });

  describe('formatPercentage', () => {
    it('should calculate and format percentage', () => {
      expect(formatPercentage(50, 100)).toBe('50.0%');
      expect(formatPercentage(75, 100)).toBe('75.0%');
      expect(formatPercentage(33, 100)).toBe('33.0%');
    });

    it('should handle zero total', () => {
      expect(formatPercentage(50, 0)).toBe('0%');
    });

    it('should respect decimal places', () => {
      expect(formatPercentage(50, 100, 0)).toBe('50%');
      expect(formatPercentage(50, 100, 2)).toBe('50.00%');
    });

    it('should handle values over 100%', () => {
      expect(formatPercentage(150, 100)).toBe('150.0%');
    });

    it('should handle fractional percentages', () => {
      expect(formatPercentage(1, 3, 2)).toBe('33.33%');
    });
  });

  describe('formatBaudRate', () => {
    it('should format low baud rates as-is', () => {
      expect(formatBaudRate(300)).toBe('300');
      expect(formatBaudRate(1200)).toBe('1200');
      expect(formatBaudRate(2400)).toBe('2400');
      expect(formatBaudRate(9600)).toBe('9600');
    });

    it('should format high baud rates with K suffix', () => {
      expect(formatBaudRate(14400)).toBe('14.4K');
      expect(formatBaudRate(28800)).toBe('28.8K');
      expect(formatBaudRate(56000)).toBe('56K');
    });

    it('should remove unnecessary decimals for exact thousands', () => {
      expect(formatBaudRate(56000)).toBe('56K');
      expect(formatBaudRate(33600)).toBe('33.6K');
    });
  });

  describe('formatPhoneNumber', () => {
    it('should format 10-digit US phone numbers', () => {
      expect(formatPhoneNumber('5551234567')).toBe('(555) 123-4567');
      expect(formatPhoneNumber('1234567890')).toBe('(123) 456-7890');
    });

    it('should format 7-digit local numbers', () => {
      expect(formatPhoneNumber('5551234')).toBe('555-1234');
    });

    it('should strip non-digit characters', () => {
      expect(formatPhoneNumber('(555) 123-4567')).toBe('(555) 123-4567');
      expect(formatPhoneNumber('555-123-4567')).toBe('(555) 123-4567');
    });

    it('should return as-is for other lengths', () => {
      expect(formatPhoneNumber('12345')).toBe('12345');
      expect(formatPhoneNumber('123456789012')).toBe('123456789012');
    });

    it('should handle empty string', () => {
      expect(formatPhoneNumber('')).toBe('');
      expect(formatPhoneNumber(null as any)).toBe('');
    });
  });

  describe('formatCallerID', () => {
    it('should combine name and location', () => {
      expect(formatCallerID('John Doe', 'New York, NY')).toBe('John Doe (New York, NY)');
    });

    it('should handle missing location', () => {
      expect(formatCallerID('John Doe', '')).toBe('John Doe');
      expect(formatCallerID('John Doe', null as any)).toBe('John Doe');
    });

    it('should handle missing name', () => {
      expect(formatCallerID('', 'New York, NY')).toBe('New York, NY');
      expect(formatCallerID(null as any, 'New York, NY')).toBe('New York, NY');
    });

    it('should handle both missing', () => {
      expect(formatCallerID('', '')).toBe('Unknown');
      expect(formatCallerID(null as any, null as any)).toBe('Unknown');
    });
  });

  describe('formatUptime', () => {
    it('should format seconds only', () => {
      expect(formatUptime(0)).toBe('0m');
      expect(formatUptime(30)).toBe('0m');
      expect(formatUptime(59)).toBe('0m');
    });

    it('should format minutes', () => {
      expect(formatUptime(60)).toBe('1m');
      expect(formatUptime(300)).toBe('5m');
      expect(formatUptime(2700)).toBe('45m');
    });

    it('should format hours and minutes', () => {
      expect(formatUptime(3600)).toBe('1h'); // Zero minutes omitted
      expect(formatUptime(3660)).toBe('1h 1m');
      expect(formatUptime(5400)).toBe('1h 30m');
    });

    it('should format days, hours, and minutes', () => {
      expect(formatUptime(86400)).toBe('1d'); // Zero hours/minutes omitted
      expect(formatUptime(90000)).toBe('1d 1h');
      expect(formatUptime(93600)).toBe('1d 2h');
    });

    it('should omit zero components (except when all zero)', () => {
      expect(formatUptime(86460)).toBe('1d 1m'); // Zero hours omitted
      expect(formatUptime(3660)).toBe('1h 1m');
    });
  });

  describe('formatRatio', () => {
    it('should format 1:1 ratio', () => {
      expect(formatRatio(1024, 1024)).toBe('1.0:1');
    });

    it('should format upload-heavy ratios', () => {
      expect(formatRatio(2048, 1024)).toBe('2.0:1');
      expect(formatRatio(3072, 1024)).toBe('3.0:1');
    });

    it('should format download-heavy ratios', () => {
      expect(formatRatio(1024, 2048)).toBe('1:2.0');
      expect(formatRatio(1024, 3072)).toBe('1:3.0');
    });

    it('should handle zero downloaded', () => {
      expect(formatRatio(1024, 0)).toBe('Inf:1');
      expect(formatRatio(0, 0)).toBe('0:0');
    });

    it('should handle zero uploaded', () => {
      expect(formatRatio(0, 1024)).toBe('1:Infinity');
    });
  });

  describe('padNumber', () => {
    it('should pad with leading zeros', () => {
      expect(padNumber(5, 3)).toBe('005');
      expect(padNumber(42, 4)).toBe('0042');
    });

    it('should not truncate if already wide enough', () => {
      expect(padNumber(123, 2)).toBe('123');
    });

    it('should handle exact width', () => {
      expect(padNumber(100, 3)).toBe('100');
    });
  });

  describe('formatYesNo', () => {
    it('should return Yes for true', () => {
      expect(formatYesNo(true)).toBe('Yes');
    });

    it('should return No for false', () => {
      expect(formatYesNo(false)).toBe('No');
    });
  });

  describe('formatOnOff', () => {
    it('should return On for true', () => {
      expect(formatOnOff(true)).toBe('On');
    });

    it('should return Off for false', () => {
      expect(formatOnOff(false)).toBe('Off');
    });
  });

  describe('formatEnabled', () => {
    it('should return Enabled for true', () => {
      expect(formatEnabled(true)).toBe('Enabled');
    });

    it('should return Disabled for false', () => {
      expect(formatEnabled(false)).toBe('Disabled');
    });
  });

  describe('formatTransferSpeed', () => {
    it('should format bytes per second', () => {
      expect(formatTransferSpeed(512)).toBe('512.0 B/s');
    });

    it('should format kilobytes per second', () => {
      expect(formatTransferSpeed(1024)).toBe('1.0 KB/s');
      expect(formatTransferSpeed(15360)).toBe('15.0 KB/s');
    });

    it('should format megabytes per second', () => {
      expect(formatTransferSpeed(1024 * 1024)).toBe('1.0 MB/s');
      expect(formatTransferSpeed(1024 * 1024 * 2.5)).toBe('2.5 MB/s');
    });
  });

  describe('formatCPS', () => {
    it('should format characters per second', () => {
      expect(formatCPS(1200)).toBe('1200 cps');
      expect(formatCPS(2400)).toBe('2400 cps');
    });
  });

  describe('formatSecurityLevel', () => {
    it('should label sysop levels', () => {
      expect(formatSecurityLevel(255)).toBe('255 (Sysop)');
      expect(formatSecurityLevel(250)).toBe('250 (Sysop)');
    });

    it('should label co-sysop levels', () => {
      expect(formatSecurityLevel(200)).toBe('200 (Co-Sysop)');
      expect(formatSecurityLevel(225)).toBe('225 (Co-Sysop)');
    });

    it('should label staff levels', () => {
      expect(formatSecurityLevel(100)).toBe('100 (Staff)');
      expect(formatSecurityLevel(150)).toBe('150 (Staff)');
    });

    it('should label privileged levels', () => {
      expect(formatSecurityLevel(50)).toBe('50 (Privileged)');
      expect(formatSecurityLevel(75)).toBe('75 (Privileged)');
    });

    it('should label user levels', () => {
      expect(formatSecurityLevel(0)).toBe('0 (User)');
      expect(formatSecurityLevel(25)).toBe('25 (User)');
      expect(formatSecurityLevel(49)).toBe('49 (User)');
    });
  });

  describe('formatCredits', () => {
    it('should format with default unit', () => {
      expect(formatCredits(100)).toBe('100 credits');
    });

    it('should support custom units', () => {
      expect(formatCredits(60, 'minutes')).toBe('60 minutes');
      expect(formatCredits(5, 'downloads')).toBe('5 downloads');
    });

    it('should handle zero', () => {
      expect(formatCredits(0)).toBe('0 credits');
    });
  });

  describe('centerText', () => {
    it('should center text with spaces', () => {
      expect(centerText('test', 10)).toBe('   test   ');
    });

    it('should handle odd padding', () => {
      expect(centerText('test', 9)).toBe('  test   ');
    });

    it('should not truncate long text', () => {
      expect(centerText('longtext', 5)).toBe('longtext');
    });

    it('should handle exact width', () => {
      expect(centerText('test', 4)).toBe('test');
    });

    it('should support custom fill character', () => {
      expect(centerText('test', 10, '-')).toBe('---test---');
      expect(centerText('test', 10, '*')).toBe('***test***');
    });

    it('should handle single character text', () => {
      expect(centerText('X', 5)).toBe('  X  ');
    });

    it('should handle empty text', () => {
      expect(centerText('', 5)).toBe('     ');
    });
  });
});
