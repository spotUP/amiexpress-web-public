/**
 * utility.library Implementation
 *
 * Provides utility functions like tag processing, date conversion,
 * string comparison, and mathematical operations.
 *
 * Reference: NDK3.2R4/Include_I/lvo/utility_lib.i
 * Autodocs: NDK3.2R4/Autodocs/utility.doc
 */

import type { MoiraEmulator } from '../cpu/MoiraEmulator';

export class UtilityLibrary {
  private emulator: MoiraEmulator;
  private socket: any;

  constructor(emulator: MoiraEmulator, socket: any) {
    this.emulator = emulator;
    this.socket = socket;
  }

  /**
   * Stricmp() - Case-insensitive string comparison
   * LVO: -162 (0xFF5E)
   *
   * Parameters:
   *   A0 = string1
   *   A1 = string2
   *
   * Returns:
   *   D0 = 0 if equal, <0 if string1<string2, >0 if string1>string2
   */
  stricmp(): number {
    const string1Addr = this.emulator.getRegister(8);  // A0
    const string2Addr = this.emulator.getRegister(9);  // A1

    const str1 = this.emulator.readString(string1Addr).toLowerCase();
    const str2 = this.emulator.readString(string2Addr).toLowerCase();

console.log(`[UtilityLibrary] Stricmp("${str1}", "${str2}")`);

    if (str1 === str2) return 0;
    return str1 < str2 ? -1 : 1;
  }

  /**
   * Strnicmp() - Case-insensitive string comparison with length limit
   * LVO: -168 (0xFF58)
   *
   * Parameters:
   *   A0 = string1
   *   A1 = string2
   *   D0 = length
   *
   * Returns:
   *   D0 = comparison result
   */
  strnicmp(): number {
    const string1Addr = this.emulator.getRegister(8);  // A0
    const string2Addr = this.emulator.getRegister(9);  // A1
    const length = this.emulator.getRegister(0);       // D0

    const str1 = this.emulator.readString(string1Addr).substring(0, length).toLowerCase();
    const str2 = this.emulator.readString(string2Addr).substring(0, length).toLowerCase();

console.log(`[UtilityLibrary] Strnicmp("${str1}", "${str2}", ${length})`);

    if (str1 === str2) return 0;
    return str1 < str2 ? -1 : 1;
  }

  /**
   * ToUpper() - Convert character to uppercase
   * LVO: -174 (0xFF52)
   *
   * Parameters:
   *   D0 = character
   *
   * Returns:
   *   D0 = uppercase character
   */
  toUpper(): number {
    const ch = this.emulator.getRegister(0) & 0xFF;  // D0
    const upper = String.fromCharCode(ch).toUpperCase().charCodeAt(0);

console.log(`[UtilityLibrary] ToUpper('${String.fromCharCode(ch)}') = '${String.fromCharCode(upper)}'`);

    return upper;
  }

  /**
   * ToLower() - Convert character to lowercase
   * LVO: -180 (0xFF4C)
   *
   * Parameters:
   *   D0 = character
   *
   * Returns:
   *   D0 = lowercase character
   */
  toLower(): number {
    const ch = this.emulator.getRegister(0) & 0xFF;  // D0
    const lower = String.fromCharCode(ch).toLowerCase().charCodeAt(0);

console.log(`[UtilityLibrary] ToLower('${String.fromCharCode(ch)}') = '${String.fromCharCode(lower)}'`);

    return lower;
  }

  /**
   * SMult32() - Signed 32-bit multiplication
   * LVO: -138 (0xFF76)
   *
   * Parameters:
   *   D0 = arg1
   *   D1 = arg2
   *
   * Returns:
   *   D0 = result
   */
  sMult32(): number {
    const arg1 = this.emulator.getRegister(0) | 0;  // D0 (signed)
    const arg2 = this.emulator.getRegister(1) | 0;  // D1 (signed)

    const result = (arg1 * arg2) | 0;  // Keep as 32-bit signed

console.log(`[UtilityLibrary] SMult32(${arg1}, ${arg2}) = ${result}`);

    return result >>> 0;  // Return as unsigned for register
  }

  /**
   * UMult32() - Unsigned 32-bit multiplication
   * LVO: -144 (0xFF70)
   *
   * Parameters:
   *   D0 = arg1
   *   D1 = arg2
   *
   * Returns:
   *   D0 = result
   */
  uMult32(): number {
    const arg1 = this.emulator.getRegister(0) >>> 0;  // D0 (unsigned)
    const arg2 = this.emulator.getRegister(1) >>> 0;  // D1 (unsigned)

    const result = (arg1 * arg2) >>> 0;

console.log(`[UtilityLibrary] UMult32(${arg1}, ${arg2}) = ${result}`);

    return result;
  }

  /**
   * GetUniqueID() - Get a unique 32-bit ID
   * LVO: -270 (0xFEF2)
   *
   * Returns:
   *   D0 = unique ID
   */
  getUniqueID(): number {
    // Simple implementation: use timestamp + counter
    const id = Date.now() & 0xFFFFFFFF;

console.log(`[UtilityLibrary] GetUniqueID() = 0x${id.toString(16)}`);

    return id;
  }

  /**
   * Stub for unimplemented functions
   */
  stub(functionName: string, offset: number): number {
console.log(`[UtilityLibrary] STUB: ${functionName} (offset ${offset}) - returning 0`);
    return 0;
  }
}
