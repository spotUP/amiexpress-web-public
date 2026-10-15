/**
 * Math library function vectors
 * Includes: mathffp, mathtrans, mathieeedoubbas, mathieeedoubtrans,
 *           mathieeesingbas, mathieeesingtrans
 * Reference: NDK3.2R4/Include_I/lvo/
 */

import { LibraryVector } from "./types";
import {
  MathFFPLibrary,
  MathTransLibrary,
  MathIEEEDoubBasLibrary,
  MathIEEEDoubTransLibrary,
  MathIEEESingBasLibrary,
  MathIEEESingTransLibrary,
} from "../MathLibrary";


/**
 * mathffp.library function vectors (Fast Floating Point basic math)
 * LVO offsets from lvo/mathffp_lib.i
 */
export const MATHFFP_VECTORS: LibraryVector[] = [
  { offset: -30, name: "SPFix", handler: (emu, lib: MathFFPLibrary) => lib.spFix() },
  { offset: -36, name: "SPFlt", handler: (emu, lib: MathFFPLibrary) => lib.spFlt() },
  { offset: -42, name: "SPCmp", handler: (emu, lib: MathFFPLibrary) => lib.spCmp() },
  { offset: -48, name: "SPTst", handler: (emu, lib: MathFFPLibrary) => lib.spTst() },
  { offset: -54, name: "SPAbs", handler: (emu, lib: MathFFPLibrary) => lib.spAbs() },
  { offset: -60, name: "SPNeg", handler: (emu, lib: MathFFPLibrary) => lib.spNeg() },
  { offset: -66, name: "SPAdd", handler: (emu, lib: MathFFPLibrary) => lib.spAdd() },
  { offset: -72, name: "SPSub", handler: (emu, lib: MathFFPLibrary) => lib.spSub() },
  { offset: -78, name: "SPMul", handler: (emu, lib: MathFFPLibrary) => lib.spMul() },
  { offset: -84, name: "SPDiv", handler: (emu, lib: MathFFPLibrary) => lib.spDiv() },
  { offset: -90, name: "SPFloor", handler: (emu, lib: MathFFPLibrary) => lib.spFloor() },
  { offset: -96, name: "SPCeil", handler: (emu, lib: MathFFPLibrary) => lib.spCeil() },
];

/**
 * mathtrans.library function vectors (transcendental math)
 * LVO offsets from lvo/mathtrans_lib.i
 */
export const MATHTRANS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "SPAtan", handler: (emu, lib: MathTransLibrary) => lib.spAtan() },
  { offset: -36, name: "SPSin", handler: (emu, lib: MathTransLibrary) => lib.spSin() },
  { offset: -42, name: "SPCos", handler: (emu, lib: MathTransLibrary) => lib.spCos() },
  { offset: -48, name: "SPTan", handler: (emu, lib: MathTransLibrary) => lib.spTan() },
  { offset: -54, name: "SPSincos", handler: (emu, lib: MathTransLibrary) => lib.spSincos() },
  { offset: -60, name: "SPSinh", handler: (emu, lib: MathTransLibrary) => lib.spSinh() },
  { offset: -66, name: "SPCosh", handler: (emu, lib: MathTransLibrary) => lib.spCosh() },
  { offset: -72, name: "SPTanh", handler: (emu, lib: MathTransLibrary) => lib.spTanh() },
  { offset: -78, name: "SPExp", handler: (emu, lib: MathTransLibrary) => lib.spExp() },
  { offset: -84, name: "SPLog", handler: (emu, lib: MathTransLibrary) => lib.spLog() },
  { offset: -90, name: "SPPow", handler: (emu, lib: MathTransLibrary) => lib.spPow() },
  { offset: -96, name: "SPSqrt", handler: (emu, lib: MathTransLibrary) => lib.spSqrt() },
  { offset: -102, name: "SPTieee", handler: (emu, lib: MathTransLibrary) => lib.spTieee() },
  { offset: -108, name: "SPFieee", handler: (emu, lib: MathTransLibrary) => lib.spFieee() },
  { offset: -114, name: "SPAsin", handler: (emu, lib: MathTransLibrary) => lib.spAsin() },
  { offset: -120, name: "SPAcos", handler: (emu, lib: MathTransLibrary) => lib.spAcos() },
  { offset: -126, name: "SPLog10", handler: (emu, lib: MathTransLibrary) => lib.spLog10() },
];

/**
 * mathieeedoubbas.library function vectors (IEEE double basic)
 * LVO offsets from lvo/mathieeedoubbas_lib.i
 */
export const MATHIEEEDOUBBAS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "IEEEDPFix", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpFix() },
  { offset: -36, name: "IEEEDPFlt", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpFlt() },
  { offset: -42, name: "IEEEDPCmp", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpCmp() },
  { offset: -48, name: "IEEEDPTst", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpTst() },
  { offset: -54, name: "IEEEDPAbs", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpAbs() },
  { offset: -60, name: "IEEEDPNeg", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpNeg() },
  { offset: -66, name: "IEEEDPAdd", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpAdd() },
  { offset: -72, name: "IEEEDPSub", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpSub() },
  { offset: -78, name: "IEEEDPMul", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpMul() },
  { offset: -84, name: "IEEEDPDiv", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpDiv() },
  { offset: -90, name: "IEEEDPFloor", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpFloor() },
  { offset: -96, name: "IEEEDPCeil", handler: (emu, lib: MathIEEEDoubBasLibrary) => lib.ieeeDpCeil() },
];

/**
 * mathieeedoubtrans.library function vectors (IEEE double transcendental)
 * LVO offsets from lvo/mathieeedoubtrans_lib.i
 */
export const MATHIEEEDOUBTRANS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "IEEEDPAtan", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpAtan() },
  { offset: -36, name: "IEEEDPSin", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpSin() },
  { offset: -42, name: "IEEEDPCos", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpCos() },
  { offset: -48, name: "IEEEDPTan", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpTan() },
  { offset: -54, name: "IEEEDPSincos", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpSincos() },
  { offset: -60, name: "IEEEDPSinh", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpSinh() },
  { offset: -66, name: "IEEEDPCosh", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpCosh() },
  { offset: -72, name: "IEEEDPTanh", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpTanh() },
  { offset: -78, name: "IEEEDPExp", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpExp() },
  { offset: -84, name: "IEEEDPLog", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpLog() },
  { offset: -90, name: "IEEEDPPow", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpPow() },
  { offset: -96, name: "IEEEDPSqrt", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpSqrt() },
  { offset: -102, name: "IEEEDPTieee", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpTieee() },
  { offset: -108, name: "IEEEDPFieee", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpFieee() },
  { offset: -114, name: "IEEEDPAsin", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpAsin() },
  { offset: -120, name: "IEEEDPAcos", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpAcos() },
  { offset: -126, name: "IEEEDPLog10", handler: (emu, lib: MathIEEEDoubTransLibrary) => lib.ieeeDpLog10() },
];

/**
 * mathieeesingbas.library function vectors (IEEE single basic)
 * LVO offsets from lvo/mathieeesingbas_lib.i
 */
export const MATHIEEESINGBAS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "IEEESPFix", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPFix() },
  { offset: -36, name: "IEEESPFlt", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPFlt() },
  { offset: -42, name: "IEEESPCmp", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPCmp() },
  { offset: -48, name: "IEEESPTst", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPTst() },
  { offset: -54, name: "IEEESPAbs", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPAbs() },
  { offset: -60, name: "IEEESPNeg", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPNeg() },
  { offset: -66, name: "IEEESPAdd", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPAdd() },
  { offset: -72, name: "IEEESPSub", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPSub() },
  { offset: -78, name: "IEEESPMul", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPMul() },
  { offset: -84, name: "IEEESPDiv", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPDiv() },
  { offset: -90, name: "IEEESPFloor", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPFloor() },
  { offset: -96, name: "IEEESPCeil", handler: (emu, lib: MathIEEESingBasLibrary) => lib.ieeeSPCeil() },
];

/**
 * mathieeesingtrans.library function vectors (IEEE single transcendental)
 * LVO offsets from lvo/mathieeesingtrans_lib.i
 */
export const MATHIEEESINGTRANS_VECTORS: LibraryVector[] = [
  { offset: -30, name: "IEEESPAtan", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPAtan() },
  { offset: -36, name: "IEEESPSin", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPSin() },
  { offset: -42, name: "IEEESPCos", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPCos() },
  { offset: -48, name: "IEEESPTan", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPTan() },
  { offset: -54, name: "IEEESPSincos", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPSincos() },
  { offset: -60, name: "IEEESPSinh", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPSinh() },
  { offset: -66, name: "IEEESPCosh", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPCosh() },
  { offset: -72, name: "IEEESPTanh", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPTanh() },
  { offset: -78, name: "IEEESPExp", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPExp() },
  { offset: -84, name: "IEEESPLog", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPLog() },
  { offset: -90, name: "IEEESPPow", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPPow() },
  { offset: -96, name: "IEEESPSqrt", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPSqrt() },
  { offset: -102, name: "IEEESPTieee", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPTieee() },
  { offset: -108, name: "IEEESPFieee", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPFieee() },
  { offset: -114, name: "IEEESPAsin", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPAsin() },
  { offset: -120, name: "IEEESPAcos", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPAcos() },
  { offset: -126, name: "IEEESPLog10", handler: (emu, lib: MathIEEESingTransLibrary) => lib.ieeeSPLog10() },
];
