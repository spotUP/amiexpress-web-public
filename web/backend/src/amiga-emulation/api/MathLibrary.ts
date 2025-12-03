/**
 * MathLibrary.ts - Amiga Math Library Implementations
 *
 * Implements:
 * - mathffp.library (Fast Floating Point basic math)
 * - mathtrans.library (Transcendental math functions)
 * - mathieeedoubbas.library (IEEE double-precision basic)
 * - mathieeedoubtrans.library (IEEE double-precision transcendental)
 * - mathieeesingbas.library (IEEE single-precision basic)
 * - mathieeesingtrans.library (IEEE single-precision transcendental)
 *
 * FFP Format (Motorola Fast Floating Point):
 * - 32-bit value
 * - Byte 3 (LSB): Sign bit (7) + 7-bit exponent (excess-64)
 * - Bytes 0-2 (MSB): 24-bit mantissa with implied leading 1
 *
 * IEEE Single Format:
 * - Bit 31: Sign
 * - Bits 30-23: 8-bit exponent (excess-127)
 * - Bits 22-0: 23-bit mantissa with implied leading 1
 */

import type { MoiraEmulator } from "../cpu/MoiraEmulator.js";

/**
 * Convert Amiga FFP (Fast Floating Point) to JavaScript number
 * FFP format: mantissa (24 bits) in high bytes, sign+exponent in low byte
 */
export function ffpToNumber(ffp: number): number {
  if (ffp === 0) return 0;

  // Extract components
  const signExp = ffp & 0xff; // Low byte: sign (bit 7) + exponent (bits 0-6)
  const mantissa = (ffp >>> 8) & 0xffffff; // High 3 bytes: mantissa

  const sign = (signExp & 0x80) ? -1 : 1;
  const exponent = (signExp & 0x7f) - 64; // Excess-64 encoding

  if (mantissa === 0) return 0;

  // Mantissa has implied leading 1, so it's 1.xxxxx in binary
  // The mantissa represents the fractional part after the implied 1
  const mantissaValue = (0x800000 + mantissa) / 0x1000000; // 1.mantissa

  return sign * mantissaValue * Math.pow(2, exponent);
}

/**
 * Convert JavaScript number to Amiga FFP format
 */
export function numberToFfp(num: number): number {
  if (num === 0 || !isFinite(num)) return 0;

  const sign = num < 0 ? 0x80 : 0;
  num = Math.abs(num);

  // Find exponent such that 0.5 <= num * 2^(-exp) < 1
  let exponent = 0;
  let mantissaValue = num;

  if (mantissaValue >= 1) {
    while (mantissaValue >= 1) {
      mantissaValue /= 2;
      exponent++;
    }
  } else if (mantissaValue < 0.5) {
    while (mantissaValue < 0.5 && exponent > -64) {
      mantissaValue *= 2;
      exponent--;
    }
  }

  // Now 0.5 <= mantissaValue < 1
  // Convert to 24-bit integer (with implied leading 1)
  const mantissa = Math.round(mantissaValue * 0x1000000) & 0xffffff;

  // Exponent is excess-64
  const expByte = ((exponent + 64) & 0x7f) | sign;

  // Check for overflow/underflow
  if (exponent + 64 > 127) return sign ? 0xff800000 : 0x7f800000; // Max value
  if (exponent + 64 < 0) return 0; // Underflow to zero

  return ((mantissa & 0xffffff) << 8) | expByte;
}

/**
 * Convert IEEE single-precision float to JavaScript number
 */
export function ieeeSpToNumber(ieee: number): number {
  // Use DataView to interpret as IEEE 754 float
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, ieee, false); // Big-endian
  return view.getFloat32(0, false);
}

/**
 * Convert JavaScript number to IEEE single-precision float
 */
export function numberToIeeeSp(num: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, num, false); // Big-endian
  return view.getUint32(0, false);
}

/**
 * Convert IEEE double-precision float to JavaScript number
 * IEEE double is passed as two 32-bit registers (D0:D1 = high:low)
 */
export function ieeeDpToNumber(high: number, low: number): number {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, high, false); // High 32 bits
  view.setUint32(4, low, false); // Low 32 bits
  return view.getFloat64(0, false);
}

/**
 * Convert JavaScript number to IEEE double-precision float
 * Returns { high, low } for D0:D1
 */
export function numberToIeeeDp(num: number): { high: number; low: number } {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, num, false);
  return {
    high: view.getUint32(0, false),
    low: view.getUint32(4, false),
  };
}

/**
 * Set condition codes based on comparison result
 * For SPCmp, SPTst, etc.
 */
export function setMathConditionCodes(emu: MoiraEmulator, value: number): void {
  let sr = emu.getRegister(16) & 0xfff0; // Clear NZVC
  if (value === 0) {
    sr |= 0x0004; // Z flag
  } else if (value < 0) {
    sr |= 0x0008; // N flag
  }
  emu.setRegister(16, sr);
}

/**
 * MathFFPLibrary - mathffp.library implementation
 */
export class MathFFPLibrary {
  constructor(private emulator: MoiraEmulator) {}

  /**
   * SPFix (-30): Convert FFP to integer
   * Input: D0 = FFP number
   * Output: D0 = integer
   */
  spFix(): number {
    const ffp = this.emulator.getRegister(0);
    const result = Math.trunc(ffpToNumber(ffp));
    console.log(`[MathFFP] SPFix(0x${ffp.toString(16)}) = ${result}`);
    return result;
  }

  /**
   * SPFlt (-36): Convert integer to FFP
   * Input: D0 = integer
   * Output: D0 = FFP number
   */
  spFlt(): number {
    const inum = this.emulator.getRegister(0) | 0; // Signed
    const result = numberToFfp(inum);
    console.log(`[MathFFP] SPFlt(${inum}) = 0x${result.toString(16)}`);
    return result;
  }

  /**
   * SPCmp (-42): Compare two FFP numbers
   * Input: D0 = fnum1, D1 = fnum2
   * Output: D0 = -1/0/+1, condition codes set
   */
  spCmp(): number {
    const fnum1 = ffpToNumber(this.emulator.getRegister(0));
    const fnum2 = ffpToNumber(this.emulator.getRegister(1));

    let result: number;
    if (fnum1 > fnum2) result = 1;
    else if (fnum1 < fnum2) result = -1;
    else result = 0;

    // Set condition codes for fnum2 vs fnum1 comparison
    setMathConditionCodes(this.emulator, fnum2 - fnum1);

    console.log(`[MathFFP] SPCmp(${fnum1}, ${fnum2}) = ${result}`);
    return result;
  }

  /**
   * SPTst (-48): Test FFP number
   * Input: D0 = FFP number
   * Output: D0 = -1/0/+1, condition codes set
   */
  spTst(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));

    let result: number;
    if (fnum > 0) result = 1;
    else if (fnum < 0) result = -1;
    else result = 0;

    setMathConditionCodes(this.emulator, fnum);

    console.log(`[MathFFP] SPTst(${fnum}) = ${result}`);
    return result;
  }

  /**
   * SPAbs (-54): Absolute value
   * Input: D0 = FFP number
   * Output: D0 = |FFP|
   */
  spAbs(): number {
    const ffp = this.emulator.getRegister(0);
    // Just clear the sign bit (bit 7 of low byte)
    const result = ffp & 0xffffff7f;
    console.log(`[MathFFP] SPAbs(0x${ffp.toString(16)}) = 0x${result.toString(16)}`);
    return result;
  }

  /**
   * SPNeg (-60): Negate
   * Input: D0 = FFP number
   * Output: D0 = -FFP
   */
  spNeg(): number {
    const ffp = this.emulator.getRegister(0);
    if (ffp === 0) return 0;
    // Toggle the sign bit (bit 7 of low byte)
    const result = ffp ^ 0x80;
    console.log(`[MathFFP] SPNeg(0x${ffp.toString(16)}) = 0x${result.toString(16)}`);
    return result;
  }

  /**
   * SPAdd (-66): Add two FFP numbers
   * Input: D0 = fnum2, D1 = fnum1
   * Output: D0 = fnum1 + fnum2
   */
  spAdd(): number {
    const fnum1 = ffpToNumber(this.emulator.getRegister(1));
    const fnum2 = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(fnum1 + fnum2);
    console.log(`[MathFFP] SPAdd(${fnum1}, ${fnum2}) = 0x${result.toString(16)}`);
    return result;
  }

  /**
   * SPSub (-72): Subtract FFP numbers
   * Input: D0 = fnum2, D1 = fnum1
   * Output: D0 = fnum1 - fnum2
   */
  spSub(): number {
    const fnum1 = ffpToNumber(this.emulator.getRegister(1));
    const fnum2 = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(fnum1 - fnum2);
    console.log(`[MathFFP] SPSub(${fnum1}, ${fnum2}) = 0x${result.toString(16)}`);
    return result;
  }

  /**
   * SPMul (-78): Multiply FFP numbers
   * Input: D0 = fnum2, D1 = fnum1
   * Output: D0 = fnum1 * fnum2
   */
  spMul(): number {
    const fnum1 = ffpToNumber(this.emulator.getRegister(1));
    const fnum2 = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(fnum1 * fnum2);
    console.log(`[MathFFP] SPMul(${fnum1}, ${fnum2}) = 0x${result.toString(16)}`);
    return result;
  }

  /**
   * SPDiv (-84): Divide FFP numbers
   * Input: D0 = fnum2, D1 = fnum1
   * Output: D0 = fnum1 / fnum2
   */
  spDiv(): number {
    const fnum1 = ffpToNumber(this.emulator.getRegister(1));
    const fnum2 = ffpToNumber(this.emulator.getRegister(0));
    if (fnum2 === 0) {
      console.log(`[MathFFP] SPDiv - division by zero!`);
      return 0;
    }
    const result = numberToFfp(fnum1 / fnum2);
    console.log(`[MathFFP] SPDiv(${fnum1}, ${fnum2}) = 0x${result.toString(16)}`);
    return result;
  }

  /**
   * SPFloor (-90): Floor function
   * Input: D0 = FFP number
   * Output: D0 = floor(FFP)
   */
  spFloor(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.floor(fnum));
    console.log(`[MathFFP] SPFloor(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /**
   * SPCeil (-96): Ceiling function
   * Input: D0 = FFP number
   * Output: D0 = ceil(FFP)
   */
  spCeil(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.ceil(fnum));
    console.log(`[MathFFP] SPCeil(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }
}

/**
 * MathTransLibrary - mathtrans.library implementation (transcendental functions)
 */
export class MathTransLibrary {
  constructor(private emulator: MoiraEmulator) {}

  /** SPAtan (-30): Arc tangent */
  spAtan(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.atan(fnum));
    console.log(`[MathTrans] SPAtan(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPSin (-36): Sine (input in radians) */
  spSin(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.sin(fnum));
    console.log(`[MathTrans] SPSin(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPCos (-42): Cosine (input in radians) */
  spCos(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.cos(fnum));
    console.log(`[MathTrans] SPCos(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPTan (-48): Tangent (input in radians) */
  spTan(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.tan(fnum));
    console.log(`[MathTrans] SPTan(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPSincos (-54): Sin and Cos simultaneously
   * Input: D0 = angle in radians, A0 = pointer to store cosine
   * Output: D0 = sin, *A0 = cos
   */
  spSincos(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const cosPtr = this.emulator.getRegister(8); // A0

    const sinResult = numberToFfp(Math.sin(fnum));
    const cosResult = numberToFfp(Math.cos(fnum));

    // Store cosine at A0
    if (cosPtr !== 0) {
      this.emulator.writeMemory32(cosPtr, cosResult);
    }

    console.log(`[MathTrans] SPSincos(${fnum}) = sin:0x${sinResult.toString(16)}, cos:0x${cosResult.toString(16)}`);
    return sinResult;
  }

  /** SPSinh (-60): Hyperbolic sine */
  spSinh(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.sinh(fnum));
    console.log(`[MathTrans] SPSinh(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPCosh (-66): Hyperbolic cosine */
  spCosh(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.cosh(fnum));
    console.log(`[MathTrans] SPCosh(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPTanh (-72): Hyperbolic tangent */
  spTanh(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.tanh(fnum));
    console.log(`[MathTrans] SPTanh(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPExp (-78): e^x */
  spExp(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.exp(fnum));
    console.log(`[MathTrans] SPExp(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPLog (-84): Natural logarithm */
  spLog(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.log(fnum));
    console.log(`[MathTrans] SPLog(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPPow (-90): x^y
   * Input: D0 = base, D1 = exponent
   */
  spPow(): number {
    const base = ffpToNumber(this.emulator.getRegister(0));
    const exp = ffpToNumber(this.emulator.getRegister(1));
    const result = numberToFfp(Math.pow(base, exp));
    console.log(`[MathTrans] SPPow(${base}, ${exp}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPSqrt (-96): Square root */
  spSqrt(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.sqrt(fnum));
    console.log(`[MathTrans] SPSqrt(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPTieee (-102): Convert FFP to IEEE single */
  spTieee(): number {
    const ffp = this.emulator.getRegister(0);
    const num = ffpToNumber(ffp);
    const result = numberToIeeeSp(num);
    console.log(`[MathTrans] SPTieee(0x${ffp.toString(16)}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPFieee (-108): Convert IEEE single to FFP */
  spFieee(): number {
    const ieee = this.emulator.getRegister(0);
    const num = ieeeSpToNumber(ieee);
    const result = numberToFfp(num);
    console.log(`[MathTrans] SPFieee(0x${ieee.toString(16)}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPAsin (-114): Arc sine */
  spAsin(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.asin(fnum));
    console.log(`[MathTrans] SPAsin(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPAcos (-120): Arc cosine */
  spAcos(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.acos(fnum));
    console.log(`[MathTrans] SPAcos(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }

  /** SPLog10 (-126): Base-10 logarithm */
  spLog10(): number {
    const fnum = ffpToNumber(this.emulator.getRegister(0));
    const result = numberToFfp(Math.log10(fnum));
    console.log(`[MathTrans] SPLog10(${fnum}) = 0x${result.toString(16)}`);
    return result;
  }
}

/**
 * MathIEEEDoubBasLibrary - mathieeedoubbas.library (IEEE double basic)
 */
export class MathIEEEDoubBasLibrary {
  constructor(private emulator: MoiraEmulator) {}

  /** IEEEDPFix (-30): Convert IEEE double to integer */
  ieeeDpFix(): number {
    const high = this.emulator.getRegister(0);
    const low = this.emulator.getRegister(1);
    const num = ieeeDpToNumber(high, low);
    const result = Math.trunc(num);
    console.log(`[MathIEEEDP] IEEEDPFix(${num}) = ${result}`);
    return result;
  }

  /** IEEEDPFlt (-36): Convert integer to IEEE double */
  ieeeDpFlt(): number {
    const inum = this.emulator.getRegister(0) | 0;
    const { high, low } = numberToIeeeDp(inum);
    this.emulator.setRegister(1, low); // D1 = low
    console.log(`[MathIEEEDP] IEEEDPFlt(${inum}) = 0x${high.toString(16)}:0x${low.toString(16)}`);
    return high; // D0 = high
  }

  /** IEEEDPCmp (-42): Compare two IEEE doubles */
  ieeeDpCmp(): number {
    const high1 = this.emulator.getRegister(0);
    const low1 = this.emulator.getRegister(1);
    const high2 = this.emulator.getRegister(2);
    const low2 = this.emulator.getRegister(3);

    const num1 = ieeeDpToNumber(high1, low1);
    const num2 = ieeeDpToNumber(high2, low2);

    let result: number;
    if (num1 > num2) result = 1;
    else if (num1 < num2) result = -1;
    else result = 0;

    setMathConditionCodes(this.emulator, num2 - num1);
    console.log(`[MathIEEEDP] IEEEDPCmp(${num1}, ${num2}) = ${result}`);
    return result;
  }

  /** IEEEDPTst (-48): Test IEEE double */
  ieeeDpTst(): number {
    const high = this.emulator.getRegister(0);
    const low = this.emulator.getRegister(1);
    const num = ieeeDpToNumber(high, low);

    let result: number;
    if (num > 0) result = 1;
    else if (num < 0) result = -1;
    else result = 0;

    setMathConditionCodes(this.emulator, num);
    console.log(`[MathIEEEDP] IEEEDPTst(${num}) = ${result}`);
    return result;
  }

  /** IEEEDPAbs (-54): Absolute value */
  ieeeDpAbs(): number {
    const high = this.emulator.getRegister(0);
    const low = this.emulator.getRegister(1);
    // Clear sign bit (bit 31 of high word)
    const resultHigh = high & 0x7fffffff;
    this.emulator.setRegister(1, low);
    console.log(`[MathIEEEDP] IEEEDPAbs() = 0x${resultHigh.toString(16)}:0x${low.toString(16)}`);
    return resultHigh;
  }

  /** IEEEDPNeg (-60): Negate */
  ieeeDpNeg(): number {
    const high = this.emulator.getRegister(0);
    const low = this.emulator.getRegister(1);
    // Toggle sign bit
    const resultHigh = high ^ 0x80000000;
    this.emulator.setRegister(1, low);
    console.log(`[MathIEEEDP] IEEEDPNeg() = 0x${resultHigh.toString(16)}:0x${low.toString(16)}`);
    return resultHigh;
  }

  /** IEEEDPAdd (-66): Add */
  ieeeDpAdd(): number {
    const high1 = this.emulator.getRegister(0);
    const low1 = this.emulator.getRegister(1);
    const high2 = this.emulator.getRegister(2);
    const low2 = this.emulator.getRegister(3);

    const num1 = ieeeDpToNumber(high1, low1);
    const num2 = ieeeDpToNumber(high2, low2);
    const { high, low } = numberToIeeeDp(num1 + num2);

    this.emulator.setRegister(1, low);
    console.log(`[MathIEEEDP] IEEEDPAdd(${num1}, ${num2}) = ${num1 + num2}`);
    return high;
  }

  /** IEEEDPSub (-72): Subtract */
  ieeeDpSub(): number {
    const high1 = this.emulator.getRegister(0);
    const low1 = this.emulator.getRegister(1);
    const high2 = this.emulator.getRegister(2);
    const low2 = this.emulator.getRegister(3);

    const num1 = ieeeDpToNumber(high1, low1);
    const num2 = ieeeDpToNumber(high2, low2);
    const { high, low } = numberToIeeeDp(num1 - num2);

    this.emulator.setRegister(1, low);
    console.log(`[MathIEEEDP] IEEEDPSub(${num1}, ${num2}) = ${num1 - num2}`);
    return high;
  }

  /** IEEEDPMul (-78): Multiply */
  ieeeDpMul(): number {
    const high1 = this.emulator.getRegister(0);
    const low1 = this.emulator.getRegister(1);
    const high2 = this.emulator.getRegister(2);
    const low2 = this.emulator.getRegister(3);

    const num1 = ieeeDpToNumber(high1, low1);
    const num2 = ieeeDpToNumber(high2, low2);
    const { high, low } = numberToIeeeDp(num1 * num2);

    this.emulator.setRegister(1, low);
    console.log(`[MathIEEEDP] IEEEDPMul(${num1}, ${num2}) = ${num1 * num2}`);
    return high;
  }

  /** IEEEDPDiv (-84): Divide */
  ieeeDpDiv(): number {
    const high1 = this.emulator.getRegister(0);
    const low1 = this.emulator.getRegister(1);
    const high2 = this.emulator.getRegister(2);
    const low2 = this.emulator.getRegister(3);

    const num1 = ieeeDpToNumber(high1, low1);
    const num2 = ieeeDpToNumber(high2, low2);

    if (num2 === 0) {
      console.log(`[MathIEEEDP] IEEEDPDiv - division by zero!`);
      this.emulator.setRegister(1, 0);
      return 0;
    }

    const { high, low } = numberToIeeeDp(num1 / num2);
    this.emulator.setRegister(1, low);
    console.log(`[MathIEEEDP] IEEEDPDiv(${num1}, ${num2}) = ${num1 / num2}`);
    return high;
  }

  /** IEEEDPFloor (-90): Floor */
  ieeeDpFloor(): number {
    const high = this.emulator.getRegister(0);
    const low = this.emulator.getRegister(1);
    const num = ieeeDpToNumber(high, low);
    const { high: rh, low: rl } = numberToIeeeDp(Math.floor(num));
    this.emulator.setRegister(1, rl);
    console.log(`[MathIEEEDP] IEEEDPFloor(${num}) = ${Math.floor(num)}`);
    return rh;
  }

  /** IEEEDPCeil (-96): Ceiling */
  ieeeDpCeil(): number {
    const high = this.emulator.getRegister(0);
    const low = this.emulator.getRegister(1);
    const num = ieeeDpToNumber(high, low);
    const { high: rh, low: rl } = numberToIeeeDp(Math.ceil(num));
    this.emulator.setRegister(1, rl);
    console.log(`[MathIEEEDP] IEEEDPCeil(${num}) = ${Math.ceil(num)}`);
    return rh;
  }
}

/**
 * MathIEEEDoubTransLibrary - mathieeedoubtrans.library
 */
export class MathIEEEDoubTransLibrary {
  constructor(private emulator: MoiraEmulator) {}

  private getDouble(): number {
    return ieeeDpToNumber(this.emulator.getRegister(0), this.emulator.getRegister(1));
  }

  private setDouble(num: number): number {
    const { high, low } = numberToIeeeDp(num);
    this.emulator.setRegister(1, low);
    return high;
  }

  /** IEEEDPAtan (-30) */
  ieeeDpAtan(): number {
    const num = this.getDouble();
    const result = Math.atan(num);
    console.log(`[MathIEEEDPTrans] IEEEDPAtan(${num}) = ${result}`);
    return this.setDouble(result);
  }

  /** IEEEDPSin (-36) */
  ieeeDpSin(): number {
    const num = this.getDouble();
    const result = Math.sin(num);
    console.log(`[MathIEEEDPTrans] IEEEDPSin(${num}) = ${result}`);
    return this.setDouble(result);
  }

  /** IEEEDPCos (-42) */
  ieeeDpCos(): number {
    const num = this.getDouble();
    const result = Math.cos(num);
    console.log(`[MathIEEEDPTrans] IEEEDPCos(${num}) = ${result}`);
    return this.setDouble(result);
  }

  /** IEEEDPTan (-48) */
  ieeeDpTan(): number {
    const num = this.getDouble();
    const result = Math.tan(num);
    console.log(`[MathIEEEDPTrans] IEEEDPTan(${num}) = ${result}`);
    return this.setDouble(result);
  }

  /** IEEEDPSincos (-54) */
  ieeeDpSincos(): number {
    const num = this.getDouble();
    const cosPtr = this.emulator.getRegister(8); // A0

    const sinResult = numberToIeeeDp(Math.sin(num));
    const cosResult = numberToIeeeDp(Math.cos(num));

    if (cosPtr !== 0) {
      this.emulator.writeMemory32(cosPtr, cosResult.high);
      this.emulator.writeMemory32(cosPtr + 4, cosResult.low);
    }

    this.emulator.setRegister(1, sinResult.low);
    console.log(`[MathIEEEDPTrans] IEEEDPSincos(${num})`);
    return sinResult.high;
  }

  /** IEEEDPSinh (-60) */
  ieeeDpSinh(): number {
    const num = this.getDouble();
    return this.setDouble(Math.sinh(num));
  }

  /** IEEEDPCosh (-66) */
  ieeeDpCosh(): number {
    const num = this.getDouble();
    return this.setDouble(Math.cosh(num));
  }

  /** IEEEDPTanh (-72) */
  ieeeDpTanh(): number {
    const num = this.getDouble();
    return this.setDouble(Math.tanh(num));
  }

  /** IEEEDPExp (-78) */
  ieeeDpExp(): number {
    const num = this.getDouble();
    return this.setDouble(Math.exp(num));
  }

  /** IEEEDPLog (-84) */
  ieeeDpLog(): number {
    const num = this.getDouble();
    return this.setDouble(Math.log(num));
  }

  /** IEEEDPPow (-90) */
  ieeeDpPow(): number {
    const base = ieeeDpToNumber(this.emulator.getRegister(0), this.emulator.getRegister(1));
    const exp = ieeeDpToNumber(this.emulator.getRegister(2), this.emulator.getRegister(3));
    return this.setDouble(Math.pow(base, exp));
  }

  /** IEEEDPSqrt (-96) */
  ieeeDpSqrt(): number {
    const num = this.getDouble();
    return this.setDouble(Math.sqrt(num));
  }

  /** IEEEDPTieee (-102): Convert IEEE double to IEEE single */
  ieeeDpTieee(): number {
    const num = this.getDouble();
    const result = numberToIeeeSp(num);
    console.log(`[MathIEEEDPTrans] IEEEDPTieee(${num}) = 0x${result.toString(16)}`);
    return result;
  }

  /** IEEEDPFieee (-108): Convert IEEE single to IEEE double */
  ieeeDpFieee(): number {
    const ieee = this.emulator.getRegister(0);
    const num = ieeeSpToNumber(ieee);
    const { high, low } = numberToIeeeDp(num);
    this.emulator.setRegister(1, low);
    console.log(`[MathIEEEDPTrans] IEEEDPFieee(0x${ieee.toString(16)}) = ${num}`);
    return high;
  }

  /** IEEEDPAsin (-114) */
  ieeeDpAsin(): number {
    const num = this.getDouble();
    return this.setDouble(Math.asin(num));
  }

  /** IEEEDPAcos (-120) */
  ieeeDpAcos(): number {
    const num = this.getDouble();
    return this.setDouble(Math.acos(num));
  }

  /** IEEEDPLog10 (-126) */
  ieeeDpLog10(): number {
    const num = this.getDouble();
    return this.setDouble(Math.log10(num));
  }
}

/**
 * MathIEEESingBasLibrary - mathieeesingbas.library
 * IEEE single-precision basic math (same API as FFP but IEEE format)
 */
export class MathIEEESingBasLibrary {
  constructor(private emulator: MoiraEmulator) {}

  ieeeSPFix(): number {
    const ieee = this.emulator.getRegister(0);
    return Math.trunc(ieeeSpToNumber(ieee));
  }

  ieeeSPFlt(): number {
    const inum = this.emulator.getRegister(0) | 0;
    return numberToIeeeSp(inum);
  }

  ieeeSPCmp(): number {
    const num1 = ieeeSpToNumber(this.emulator.getRegister(0));
    const num2 = ieeeSpToNumber(this.emulator.getRegister(1));
    setMathConditionCodes(this.emulator, num2 - num1);
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
    return 0;
  }

  ieeeSPTst(): number {
    const num = ieeeSpToNumber(this.emulator.getRegister(0));
    setMathConditionCodes(this.emulator, num);
    if (num > 0) return 1;
    if (num < 0) return -1;
    return 0;
  }

  ieeeSPAbs(): number {
    return this.emulator.getRegister(0) & 0x7fffffff;
  }

  ieeeSPNeg(): number {
    return this.emulator.getRegister(0) ^ 0x80000000;
  }

  ieeeSPAdd(): number {
    const num1 = ieeeSpToNumber(this.emulator.getRegister(1));
    const num2 = ieeeSpToNumber(this.emulator.getRegister(0));
    return numberToIeeeSp(num1 + num2);
  }

  ieeeSPSub(): number {
    const num1 = ieeeSpToNumber(this.emulator.getRegister(1));
    const num2 = ieeeSpToNumber(this.emulator.getRegister(0));
    return numberToIeeeSp(num1 - num2);
  }

  ieeeSPMul(): number {
    const num1 = ieeeSpToNumber(this.emulator.getRegister(1));
    const num2 = ieeeSpToNumber(this.emulator.getRegister(0));
    return numberToIeeeSp(num1 * num2);
  }

  ieeeSPDiv(): number {
    const num1 = ieeeSpToNumber(this.emulator.getRegister(1));
    const num2 = ieeeSpToNumber(this.emulator.getRegister(0));
    if (num2 === 0) return 0;
    return numberToIeeeSp(num1 / num2);
  }

  ieeeSPFloor(): number {
    const num = ieeeSpToNumber(this.emulator.getRegister(0));
    return numberToIeeeSp(Math.floor(num));
  }

  ieeeSPCeil(): number {
    const num = ieeeSpToNumber(this.emulator.getRegister(0));
    return numberToIeeeSp(Math.ceil(num));
  }
}

/**
 * MathIEEESingTransLibrary - mathieeesingtrans.library
 */
export class MathIEEESingTransLibrary {
  constructor(private emulator: MoiraEmulator) {}

  private get(): number {
    return ieeeSpToNumber(this.emulator.getRegister(0));
  }

  private set(num: number): number {
    return numberToIeeeSp(num);
  }

  ieeeSPAtan(): number { return this.set(Math.atan(this.get())); }
  ieeeSPSin(): number { return this.set(Math.sin(this.get())); }
  ieeeSPCos(): number { return this.set(Math.cos(this.get())); }
  ieeeSPTan(): number { return this.set(Math.tan(this.get())); }

  ieeeSPSincos(): number {
    const num = this.get();
    const cosPtr = this.emulator.getRegister(8);
    if (cosPtr !== 0) {
      this.emulator.writeMemory32(cosPtr, numberToIeeeSp(Math.cos(num)));
    }
    return this.set(Math.sin(num));
  }

  ieeeSPSinh(): number { return this.set(Math.sinh(this.get())); }
  ieeeSPCosh(): number { return this.set(Math.cosh(this.get())); }
  ieeeSPTanh(): number { return this.set(Math.tanh(this.get())); }
  ieeeSPExp(): number { return this.set(Math.exp(this.get())); }
  ieeeSPLog(): number { return this.set(Math.log(this.get())); }

  ieeeSPPow(): number {
    const base = ieeeSpToNumber(this.emulator.getRegister(0));
    const exp = ieeeSpToNumber(this.emulator.getRegister(1));
    return numberToIeeeSp(Math.pow(base, exp));
  }

  ieeeSPSqrt(): number { return this.set(Math.sqrt(this.get())); }

  ieeeSPTieee(): number {
    // IEEE SP to FFP
    const num = this.get();
    return numberToFfp(num);
  }

  ieeeSPFieee(): number {
    // FFP to IEEE SP
    const ffp = this.emulator.getRegister(0);
    return numberToIeeeSp(ffpToNumber(ffp));
  }

  ieeeSPAsin(): number { return this.set(Math.asin(this.get())); }
  ieeeSPAcos(): number { return this.set(Math.acos(this.get())); }
  ieeeSPLog10(): number { return this.set(Math.log10(this.get())); }
}
