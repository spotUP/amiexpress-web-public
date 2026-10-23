/**
 * Entering 68K code from an exec trap (InitResident's rt_Init, OpenLibrary's
 * call of a library's own Open vector) instead of returning to the caller.
 *
 * Every exec function preserves A6 for its caller. Real exec's OpenLibrary
 * does `move.l a6,-(sp); move.l lib,a6; jsr LIB_OPEN(a6); move.l (sp)+,a6`,
 * so the caller gets SysBase back. The jumped-to code runs with another A6
 * (the library base), so the jump returns through a MOVEA.L (SP)+,A6; RTS
 * stub that hands the caller its own A6. Without it the Kickstart 3.1 dos
 * init's `jsr OpenLibrary(a6); ...; jsr CloseLibrary(a6)` called
 * CloseLibrary through dos.library's jump table and ran off into RAM.
 */
import { RESTORE_A6_STUB_ADDR } from "../memory-map";
import type { TrapJumpRegs } from "./ExecLibrary";

/** The emulator surface a trap jump needs. */
export interface TrapJumpCpu {
  getRegister(reg: number): number;
  setRegister(reg: number, value: number): void;
  writeMemory16(addr: number, value: number): void;
  writeMemory32(addr: number, value: number): void;
  refillPrefetch(): void;
}

const REG_D0 = 0;
const REG_A0 = 8;
const REG_A6 = 14;
const REG_SP = 15;
const REG_PC = 16;

/** Writes the MOVEA.L (SP)+,A6; RTS stub the jump returns through. */
export function writeRestoreA6Stub(cpu: Pick<TrapJumpCpu, "writeMemory16">): void {
  cpu.writeMemory16(RESTORE_A6_STUB_ADDR, 0x2c5f); // MOVEA.L (SP)+,A6
  cpu.writeMemory16(RESTORE_A6_STUB_ADDR + 2, 0x4e75); // RTS
}

/**
 * Jumps to `pc` with `regs` as if the trapped exec call had called it, so
 * that its RTS lands in the caller at `returnAddr` with the caller's A6.
 * Call after the trap has popped its own return address. Stack on entry:
 * [SP]=restore stub, [SP+4]=caller A6, [SP+8]=returnAddr.
 */
export function enterTrapJump(
  cpu: TrapJumpCpu,
  pc: number,
  regs: TrapJumpRegs,
  returnAddr: number
): void {
  const callerA6 = cpu.getRegister(REG_A6) >>> 0;
  const sp = cpu.getRegister(REG_SP) >>> 0;
  writeRestoreA6Stub(cpu);
  cpu.writeMemory32(sp - 4, returnAddr >>> 0);
  cpu.writeMemory32(sp - 8, callerA6);
  cpu.writeMemory32(sp - 12, RESTORE_A6_STUB_ADDR);
  cpu.setRegister(REG_SP, sp - 12);
  cpu.setRegister(REG_D0, regs.d0 >>> 0);
  if (regs.a0 !== undefined) cpu.setRegister(REG_A0, regs.a0 >>> 0);
  cpu.setRegister(REG_A6, regs.a6 >>> 0);
  cpu.setRegister(REG_PC, pc >>> 0);
  cpu.refillPrefetch();
}
