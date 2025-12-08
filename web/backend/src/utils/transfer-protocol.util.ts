/**
 * Transfer Protocol Utilities
 *
 * Shared utilities for XMODEM, YMODEM, and ZMODEM file transfer protocols.
 * Extracted from xmodem-transfer.service.ts and ymodem-transfer.service.ts
 * to eliminate duplicate CRC-16 calculation code.
 */

/**
 * CRC-16 polynomial used in XMODEM/YMODEM
 * Standard CRC-16-CCITT polynomial
 */
export const CRC_POLY = 0x1021;

/**
 * Protocol control characters used in XMODEM/YMODEM/ZMODEM
 * These are standard ASCII control codes used for block transfer protocols
 */
export const CONTROL_CHARS = {
  SOH: 0x01,  // Start of 128-byte block
  STX: 0x02,  // Start of 1024-byte block
  EOT: 0x04,  // End of transmission
  ACK: 0x06,  // Acknowledge
  NAK: 0x15,  // Negative acknowledge
  CAN: 0x18,  // Cancel
  SUB: 0x1A   // Substitute/EOF
} as const;

/**
 * Calculate CRC-16 checksum for data block
 *
 * Uses CRC-16-CCITT algorithm with polynomial 0x1021.
 * This is the standard CRC used in XMODEM-CRC and YMODEM protocols.
 *
 * @param data - Buffer containing data to checksum
 * @returns CRC-16 value (16-bit unsigned integer)
 *
 * Algorithm:
 * 1. Initialize CRC to 0x0000
 * 2. For each byte:
 *    - XOR byte with high byte of CRC (shifted left 8 bits)
 *    - For each of 8 bits:
 *      - If high bit set: shift left and XOR with polynomial
 *      - Else: just shift left
 * 3. Return final CRC value
 */
export function calculateCRC16(data: Buffer): number {
  let crc = 0x0000;

  for (let i = 0; i < data.length; i++) {
    crc ^= (data[i] << 8);

    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ CRC_POLY) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return crc;
}

/**
 * Calculate simple checksum (sum of bytes mod 256)
 * Used in basic XMODEM (non-CRC mode)
 *
 * @param data - Buffer containing data to checksum
 * @returns Checksum value (8-bit unsigned integer)
 */
export function calculateChecksum(data: Buffer): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) & 0xFF;
  }
  return sum;
}
