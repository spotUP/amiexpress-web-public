/**
 * BCD (Binary Coded Decimal) Math Utilities
 * 1:1 port from AmiExpress express.e:16822
 *
 * AmiExpress uses BCD format for precise byte tracking to avoid floating point errors
 * BCD stores each decimal digit in 4 bits, allowing exact decimal arithmetic
 *
 * In the original E code:
 * - uploadBytesBCD[8] - 8-byte BCD array for upload bytes
 * - downloadBytesBCD[8] - 8-byte BCD array for download bytes
 *
 * For our TypeScript implementation, we use BigInt which provides:
 * - Arbitrary precision integer arithmetic (no overflow)
 * - No floating point errors
 * - Same precision as BCD but simpler implementation
 */

/**
 * BCD value type - using BigInt for precision
 * In express.e this is an 8-byte BCD array
 * We use BigInt for equivalent precision without BCD complexity
 */
export type BCDValue = bigint;

/**
 * Add value to BCD number
 * Express.e:16822 - addBCD(uTBT, filesize)
 *
 * @param bcdValue Current BCD value
 * @param addend Value to add
 * @returns New BCD value
 */
export function addBCD(bcdValue: BCDValue, addend: number | bigint): BCDValue {
  const addendBig = typeof addend === 'bigint' ? addend : BigInt(addend);
  return bcdValue + addendBig;
}

/**
 * Add two BCD values together
 * Express.e uses addBCD2() for combining BCD arrays
 *
 * @param bcdValue1 First BCD value
 * @param bcdValue2 Second BCD value
 * @returns Sum as BCD
 */
export function addBCD2(bcdValue1: BCDValue, bcdValue2: BCDValue): BCDValue {
  return bcdValue1 + bcdValue2;
}

/**
 * Convert BCD value to regular number
 * Express.e - convertFromBCD(loggedOnUserMisc.uploadBytesBCD)
 *
 * @param bcdValue BCD value
 * @returns Regular number (may lose precision for very large values)
 */
export function convertFromBCD(bcdValue: BCDValue): number {
  // Convert BigInt to number
  // Note: May lose precision if value > Number.MAX_SAFE_INTEGER (2^53-1)
  return Number(bcdValue);
}

/**
 * Convert regular number to BCD value
 * Express.e - convertToBCD(0, dTBT)
 *
 * @param value Regular number
 * @returns BCD value
 */
export function convertToBCD(value: number | bigint): BCDValue {
  return typeof value === 'bigint' ? value : BigInt(Math.floor(value));
}

/**
 * Initialize BCD value to zero
 * Express.e - convertToBCD(0, uTBT)
 *
 * @returns Zero as BCD
 */
export function initBCD(): BCDValue {
  return 0n;  // BigInt zero
}

/**
 * Format BCD value as string with thousands separators
 * Useful for displaying byte counts
 *
 * @param bcdValue BCD value to format
 * @returns Formatted string (e.g., "1,234,567")
 */
export function formatBCD(bcdValue: BCDValue): string {
  return bcdValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Convert BCD to kilobytes (for display)
 * Express.e often displays in KB
 *
 * @param bcdValue BCD byte value
 * @returns KB value
 */
export function bcdToKB(bcdValue: BCDValue): number {
  return Number(bcdValue / 1024n);
}

/**
 * Convert BCD to megabytes (for display)
 *
 * @param bcdValue BCD byte value
 * @returns MB value
 */
export function bcdToMB(bcdValue: BCDValue): number {
  return Number(bcdValue / (1024n * 1024n));
}

/**
 * Compare two BCD values
 *
 * @param bcd1 First BCD value
 * @param bcd2 Second BCD value
 * @returns -1 if bcd1 < bcd2, 0 if equal, 1 if bcd1 > bcd2
 */
export function compareBCD(bcd1: BCDValue, bcd2: BCDValue): number {
  if (bcd1 < bcd2) return -1;
  if (bcd1 > bcd2) return 1;
  return 0;
}

/**
 * Subtract BCD values (for ratio calculations)
 *
 * @param bcdValue BCD value
 * @param subtrahend Value to subtract
 * @returns Result (minimum 0)
 */
export function subtractBCD(bcdValue: BCDValue, subtrahend: number | bigint): BCDValue {
  const subtrahendBig = typeof subtrahend === 'bigint' ? subtrahend : BigInt(subtrahend);
  const result = bcdValue - subtrahendBig;
  return result < 0n ? 0n : result;  // Don't go negative
}

/**
 * Calculate upload/download ratio
 * Express.e uses BCD for precise ratio calculations
 *
 * @param uploadBytes Upload bytes (BCD)
 * @param downloadBytes Download bytes (BCD)
 * @returns Ratio as decimal (e.g., 1.5 means 1.5:1 upload ratio)
 */
export function calculateRatio(uploadBytes: BCDValue, downloadBytes: BCDValue): number {
  if (downloadBytes === 0n) {
    return uploadBytes === 0n ? 1.0 : Infinity;
  }

  // Convert to numbers for division (ratio doesn't need full precision)
  const upload = Number(uploadBytes);
  const download = Number(downloadBytes);

  return upload / download;
}

/**
 * Example usage and migration guide:
 *
 * // Express.e pattern:
 * // DEF uploadBytesBCD[8]:ARRAY OF CHAR
 * // addBCD(uploadBytesBCD, filesize)
 * // total := convertFromBCD(uploadBytesBCD)
 *
 * // TypeScript equivalent:
 * let uploadBytesBCD: BCDValue = initBCD();  // 0n
 * uploadBytesBCD = addBCD(uploadBytesBCD, filesize);
 * const total = convertFromBCD(uploadBytesBCD);
 *
 * // Database storage:
 * // PostgreSQL bigint maps perfectly to TypeScript BigInt
 * await db.query(
 *   'UPDATE user_stats SET bytes_uploaded = $1 WHERE user_id = $2',
 *   [uploadBytesBCD.toString(), userId]  // BigInt to string for PostgreSQL
 * );
 */
