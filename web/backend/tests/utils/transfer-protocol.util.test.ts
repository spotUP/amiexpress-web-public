/**
 * Unit tests for transfer-protocol.util.ts
 * Tests CRC-16 and checksum calculations for XMODEM/YMODEM/ZMODEM protocols
 *
 * CRC-16-CCITT algorithm used for error detection in file transfers
 * Polynomial: 0x1021 (x^16 + x^12 + x^5 + 1)
 */

import {
  calculateCRC16,
  calculateChecksum,
  CRC_POLY,
  CONTROL_CHARS,
} from '../../src/utils/transfer-protocol.util';

describe('Transfer Protocol Utility (XMODEM/YMODEM/ZMODEM)', () => {
  describe('Constants', () => {
    describe('CRC_POLY', () => {
      it('should have correct CRC-16-CCITT polynomial', () => {
        expect(CRC_POLY).toBe(0x1021);
      });
    });

    describe('CONTROL_CHARS', () => {
      it('should have SOH (Start of 128-byte block)', () => {
        expect(CONTROL_CHARS.SOH).toBe(0x01);
      });

      it('should have STX (Start of 1024-byte block)', () => {
        expect(CONTROL_CHARS.STX).toBe(0x02);
      });

      it('should have EOT (End of transmission)', () => {
        expect(CONTROL_CHARS.EOT).toBe(0x04);
      });

      it('should have ACK (Acknowledge)', () => {
        expect(CONTROL_CHARS.ACK).toBe(0x06);
      });

      it('should have NAK (Negative acknowledge)', () => {
        expect(CONTROL_CHARS.NAK).toBe(0x15);
      });

      it('should have CAN (Cancel)', () => {
        expect(CONTROL_CHARS.CAN).toBe(0x18);
      });

      it('should have SUB (Substitute/EOF)', () => {
        expect(CONTROL_CHARS.SUB).toBe(0x1A);
      });

      it('should have all required control characters', () => {
        expect(Object.keys(CONTROL_CHARS)).toHaveLength(7);
        expect(CONTROL_CHARS).toHaveProperty('SOH');
        expect(CONTROL_CHARS).toHaveProperty('STX');
        expect(CONTROL_CHARS).toHaveProperty('EOT');
        expect(CONTROL_CHARS).toHaveProperty('ACK');
        expect(CONTROL_CHARS).toHaveProperty('NAK');
        expect(CONTROL_CHARS).toHaveProperty('CAN');
        expect(CONTROL_CHARS).toHaveProperty('SUB');
      });
    });
  });

  describe('calculateCRC16', () => {
    describe('Known test vectors', () => {
      it('should calculate CRC-16 for empty buffer', () => {
        const data = Buffer.alloc(0);
        const crc = calculateCRC16(data);
        expect(crc).toBe(0x0000);
      });

      it('should calculate CRC-16 for single zero byte', () => {
        const data = Buffer.from([0x00]);
        const crc = calculateCRC16(data);
        expect(crc).toBe(0x0000);
      });

      it('should calculate CRC-16 for single byte (0x41 = "A")', () => {
        const data = Buffer.from([0x41]);
        const crc = calculateCRC16(data);
        // CRC should be non-zero and 16-bit
        expect(crc).toBeGreaterThan(0);
        expect(crc).toBeLessThanOrEqual(0xFFFF);
      });

      it('should calculate CRC-16 for "123456789" test vector', () => {
        // Standard CRC-16-CCITT test vector
        const data = Buffer.from('123456789', 'ascii');
        const crc = calculateCRC16(data);
        expect(crc).toBe(0x31C3);
      });

      it('should calculate CRC-16 for "The quick brown fox"', () => {
        const data = Buffer.from('The quick brown fox', 'ascii');
        const crc = calculateCRC16(data);
        // CRC should be consistent
        expect(crc).toBeGreaterThan(0);
        expect(calculateCRC16(data)).toBe(crc); // Consistent
      });

      it('should calculate CRC-16 for all zeros (128 bytes)', () => {
        const data = Buffer.alloc(128, 0x00);
        const crc = calculateCRC16(data);
        expect(crc).toBe(0x0000);
      });

      it('should calculate CRC-16 for all 0xFF bytes', () => {
        const data = Buffer.alloc(128, 0xFF);
        const crc = calculateCRC16(data);
        // Should be consistent and non-zero
        expect(crc).toBeGreaterThan(0);
        expect(calculateCRC16(data)).toBe(crc);
      });

      it('should calculate CRC-16 for incrementing sequence', () => {
        const data = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
        const crc = calculateCRC16(data);
        // Should be consistent
        expect(crc).toBeGreaterThan(0);
        expect(calculateCRC16(data)).toBe(crc);
      });
    });

    describe('XMODEM block sizes', () => {
      it('should calculate CRC-16 for 128-byte block (SOH)', () => {
        const data = Buffer.alloc(128);
        for (let i = 0; i < 128; i++) {
          data[i] = i % 256;
        }
        const crc = calculateCRC16(data);
        expect(crc).toBeGreaterThan(0);
        expect(crc).toBeLessThanOrEqual(0xFFFF);
      });

      it('should calculate CRC-16 for 1024-byte block (STX)', () => {
        const data = Buffer.alloc(1024);
        for (let i = 0; i < 1024; i++) {
          data[i] = i % 256;
        }
        const crc = calculateCRC16(data);
        expect(crc).toBeGreaterThan(0);
        expect(crc).toBeLessThanOrEqual(0xFFFF);
      });
    });

    describe('Different data patterns', () => {
      it('should calculate different CRCs for different data', () => {
        const data1 = Buffer.from([0x01, 0x02, 0x03]);
        const data2 = Buffer.from([0x03, 0x02, 0x01]);

        const crc1 = calculateCRC16(data1);
        const crc2 = calculateCRC16(data2);

        expect(crc1).not.toBe(crc2);
      });

      it('should calculate same CRC for same data', () => {
        const data = Buffer.from('Test data', 'ascii');

        const crc1 = calculateCRC16(data);
        const crc2 = calculateCRC16(data);

        expect(crc1).toBe(crc2);
      });

      it('should be order-sensitive', () => {
        const data1 = Buffer.from('abc', 'ascii');
        const data2 = Buffer.from('bac', 'ascii');

        const crc1 = calculateCRC16(data1);
        const crc2 = calculateCRC16(data2);

        expect(crc1).not.toBe(crc2);
      });

      it('should detect single-bit errors', () => {
        const data1 = Buffer.from([0x00]);
        const data2 = Buffer.from([0x01]); // Single bit changed

        const crc1 = calculateCRC16(data1);
        const crc2 = calculateCRC16(data2);

        expect(crc1).not.toBe(crc2);
      });
    });

    describe('Binary data', () => {
      it('should handle binary data with all byte values', () => {
        const data = Buffer.alloc(256);
        for (let i = 0; i < 256; i++) {
          data[i] = i;
        }
        const crc = calculateCRC16(data);
        expect(crc).toBeGreaterThan(0);
        expect(crc).toBeLessThanOrEqual(0xFFFF);
      });

      it('should handle control characters', () => {
        const data = Buffer.from([
          CONTROL_CHARS.SOH,
          CONTROL_CHARS.STX,
          CONTROL_CHARS.EOT,
          CONTROL_CHARS.ACK,
          CONTROL_CHARS.NAK
        ]);
        const crc = calculateCRC16(data);
        expect(crc).toBeGreaterThan(0);
      });
    });

    describe('Return value constraints', () => {
      it('should always return 16-bit value', () => {
        const data = Buffer.alloc(1024, 0xFF);
        const crc = calculateCRC16(data);
        expect(crc).toBeGreaterThanOrEqual(0x0000);
        expect(crc).toBeLessThanOrEqual(0xFFFF);
      });

      it('should return integer', () => {
        const data = Buffer.from('test', 'ascii');
        const crc = calculateCRC16(data);
        expect(Number.isInteger(crc)).toBe(true);
      });
    });

    describe('Edge cases', () => {
      it('should handle very long data', () => {
        const data = Buffer.alloc(10000, 0xAB);
        const crc = calculateCRC16(data);
        expect(crc).toBeGreaterThan(0);
        expect(crc).toBeLessThanOrEqual(0xFFFF);
      });

      it('should handle alternating pattern', () => {
        const data = Buffer.alloc(128);
        for (let i = 0; i < 128; i++) {
          data[i] = i % 2 === 0 ? 0x55 : 0xAA;
        }
        const crc = calculateCRC16(data);
        expect(crc).toBeGreaterThan(0);
      });
    });
  });

  describe('calculateChecksum', () => {
    describe('Basic checksums', () => {
      it('should calculate checksum for empty buffer', () => {
        const data = Buffer.alloc(0);
        const checksum = calculateChecksum(data);
        expect(checksum).toBe(0);
      });

      it('should calculate checksum for single byte', () => {
        const data = Buffer.from([0x42]);
        const checksum = calculateChecksum(data);
        expect(checksum).toBe(0x42);
      });

      it('should calculate checksum for multiple bytes', () => {
        const data = Buffer.from([0x01, 0x02, 0x03]);
        const checksum = calculateChecksum(data);
        expect(checksum).toBe(0x06); // 1 + 2 + 3 = 6
      });

      it('should calculate checksum for "123456789"', () => {
        const data = Buffer.from('123456789', 'ascii');
        const checksum = calculateChecksum(data);
        // Sum of ASCII values: 49+50+51+52+53+54+55+56+57 = 477 mod 256 = 221
        expect(checksum).toBe(221);
      });
    });

    describe('Modulo 256 behavior', () => {
      it('should wrap at 256', () => {
        const data = Buffer.from([0xFF, 0x02]);
        const checksum = calculateChecksum(data);
        expect(checksum).toBe(0x01); // 255 + 2 = 257 mod 256 = 1
      });

      it('should handle sum exactly 256', () => {
        const data = Buffer.from([0x80, 0x80]);
        const checksum = calculateChecksum(data);
        expect(checksum).toBe(0x00); // 128 + 128 = 256 mod 256 = 0
      });

      it('should handle large sum', () => {
        const data = Buffer.alloc(128, 0xFF);
        const checksum = calculateChecksum(data);
        // 255 * 128 = 32640 mod 256 = 128
        expect(checksum).toBe(128);
      });
    });

    describe('XMODEM block sizes', () => {
      it('should calculate checksum for 128-byte block', () => {
        const data = Buffer.alloc(128, 0x41); // All 'A' characters
        const checksum = calculateChecksum(data);
        // 65 * 128 = 8320 mod 256 = 128
        expect(checksum).toBe(128);
      });

      it('should calculate checksum for incrementing 128-byte block', () => {
        const data = Buffer.alloc(128);
        for (let i = 0; i < 128; i++) {
          data[i] = i;
        }
        const checksum = calculateChecksum(data);
        // Sum = 0+1+2+...+127 = 127*128/2 = 8128 mod 256 = 192
        expect(checksum).toBe(192);
      });
    });

    describe('Return value constraints', () => {
      it('should always return 8-bit value', () => {
        const data = Buffer.alloc(1000, 0xFF);
        const checksum = calculateChecksum(data);
        expect(checksum).toBeGreaterThanOrEqual(0x00);
        expect(checksum).toBeLessThanOrEqual(0xFF);
      });

      it('should return integer', () => {
        const data = Buffer.from('test', 'ascii');
        const checksum = calculateChecksum(data);
        expect(Number.isInteger(checksum)).toBe(true);
      });
    });

    describe('Consistency', () => {
      it('should calculate same checksum for same data', () => {
        const data = Buffer.from('Test data', 'ascii');

        const cs1 = calculateChecksum(data);
        const cs2 = calculateChecksum(data);

        expect(cs1).toBe(cs2);
      });

      it('should calculate different checksums for different data', () => {
        const data1 = Buffer.from([0x01, 0x02, 0x03]);
        const data2 = Buffer.from([0x04, 0x05, 0x06]);

        const cs1 = calculateChecksum(data1);
        const cs2 = calculateChecksum(data2);

        expect(cs1).not.toBe(cs2);
      });

      it('should be commutative (order independent for same bytes)', () => {
        // Note: checksum IS order-independent if bytes are the same
        const data1 = Buffer.from([0x01, 0x02, 0x03]);
        const data2 = Buffer.from([0x03, 0x02, 0x01]);

        const cs1 = calculateChecksum(data1);
        const cs2 = calculateChecksum(data2);

        // Both sum to 6
        expect(cs1).toBe(cs2);
      });
    });

    describe('Binary data', () => {
      it('should handle all byte values', () => {
        const data = Buffer.alloc(256);
        for (let i = 0; i < 256; i++) {
          data[i] = i;
        }
        const checksum = calculateChecksum(data);
        // Sum = 0+1+2+...+255 = 255*256/2 = 32640 mod 256 = 128
        expect(checksum).toBe(128);
      });

      it('should handle control characters', () => {
        const data = Buffer.from([
          CONTROL_CHARS.SOH,
          CONTROL_CHARS.ACK,
          CONTROL_CHARS.NAK
        ]);
        const checksum = calculateChecksum(data);
        // 0x01 + 0x06 + 0x15 = 0x1C = 28
        expect(checksum).toBe(28);
      });
    });
  });

  describe('Real-world XMODEM/YMODEM scenarios', () => {
    describe('XMODEM packet validation', () => {
      it('should validate 128-byte data block with CRC', () => {
        // Typical XMODEM-CRC packet data
        const data = Buffer.alloc(128, 0x41); // All 'A' characters
        const crc = calculateCRC16(data);

        expect(crc).toBeGreaterThan(0);
        expect(crc).toBeLessThanOrEqual(0xFFFF);

        // CRC should be same if recalculated
        const crcVerify = calculateCRC16(data);
        expect(crcVerify).toBe(crc);
      });

      it('should validate 128-byte data block with checksum', () => {
        // Original XMODEM with simple checksum
        const data = Buffer.alloc(128, 0x41);
        const checksum = calculateChecksum(data);

        expect(checksum).toBeGreaterThanOrEqual(0);
        expect(checksum).toBeLessThanOrEqual(0xFF);
      });
    });

    describe('YMODEM 1024-byte blocks', () => {
      it('should validate 1024-byte data block', () => {
        const data = Buffer.alloc(1024);
        for (let i = 0; i < 1024; i++) {
          data[i] = i % 256;
        }

        const crc = calculateCRC16(data);
        expect(crc).toBeGreaterThan(0);
        expect(crc).toBeLessThanOrEqual(0xFFFF);
      });
    });

    describe('Error detection', () => {
      it('should detect corrupted data (CRC)', () => {
        const original = Buffer.from('Important file data', 'ascii');
        const corrupted = Buffer.from('Important file datu', 'ascii'); // 'a' changed to 'u'

        const originalCrc = calculateCRC16(original);
        const corruptedCrc = calculateCRC16(corrupted);

        expect(originalCrc).not.toBe(corruptedCrc);
      });

      it('should detect corrupted data (checksum)', () => {
        const original = Buffer.from([0x01, 0x02, 0x03, 0x04]);
        const corrupted = Buffer.from([0x01, 0x02, 0x03, 0x05]); // Last byte changed

        const originalCs = calculateChecksum(original);
        const corruptedCs = calculateChecksum(corrupted);

        expect(originalCs).not.toBe(corruptedCs);
      });
    });

    describe('Padding scenarios', () => {
      it('should handle padded block (SUB character)', () => {
        const data = Buffer.alloc(128, CONTROL_CHARS.SUB);
        data.write('Short file', 0, 'ascii');

        const crc = calculateCRC16(data);
        expect(crc).toBeGreaterThan(0);

        const checksum = calculateChecksum(data);
        expect(checksum).toBeGreaterThanOrEqual(0);
      });

      it('should handle partial block with padding', () => {
        const data = Buffer.alloc(128);
        const content = Buffer.from('Small', 'ascii');
        content.copy(data, 0);
        // Rest is zeros (padding)

        const crc = calculateCRC16(data);
        const checksum = calculateChecksum(data);

        expect(crc).toBeGreaterThan(0);
        expect(checksum).toBeGreaterThan(0);
      });
    });

    describe('File transfer workflow', () => {
      it('should calculate CRC for consecutive blocks', () => {
        const block1 = Buffer.alloc(128, 0x41);
        const block2 = Buffer.alloc(128, 0x42);
        const block3 = Buffer.alloc(128, 0x43);

        const crc1 = calculateCRC16(block1);
        const crc2 = calculateCRC16(block2);
        const crc3 = calculateCRC16(block3);

        // Each block should have different CRC
        expect(crc1).not.toBe(crc2);
        expect(crc2).not.toBe(crc3);
        expect(crc1).not.toBe(crc3);
      });

      it('should handle retransmitted block', () => {
        const block = Buffer.alloc(128, 0xAB);

        const crc1 = calculateCRC16(block);
        const crc2 = calculateCRC16(block); // Retransmit same block

        expect(crc1).toBe(crc2); // Same data = same CRC
      });
    });
  });

  describe('Performance characteristics', () => {
    it('should handle large transfers efficiently', () => {
      // Simulate 1 MB transfer (1024 x 1KB blocks)
      const block = Buffer.alloc(1024);

      const start = Date.now();
      for (let i = 0; i < 1024; i++) {
        calculateCRC16(block);
      }
      const elapsed = Date.now() - start;

      // Should complete 1024 CRC calculations in reasonable time
      expect(elapsed).toBeLessThan(1000); // Less than 1 second
    });

    it('should handle checksums efficiently', () => {
      const block = Buffer.alloc(128);

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        calculateChecksum(block);
      }
      const elapsed = Date.now() - start;

      // Checksums should be very fast
      expect(elapsed).toBeLessThan(100); // Less than 100ms for 10k calculations
    });
  });
});
