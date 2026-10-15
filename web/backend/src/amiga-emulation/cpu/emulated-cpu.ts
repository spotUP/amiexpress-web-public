/**
 * The CPU the emulator core emulates, and what ExecBase->AttnFlags must say
 * about it. cpu/moira-wrapper.cpp constructs the core with
 * `setModel(Model::M68020)`; that is the ONE place the model is chosen and this
 * constant mirrors it (tests/amiga-emulation/exec-attnflags.test.ts fails if
 * the two drift apart).
 */

/** exec/execbase.h AttnFlags bits. */
export const AFF_68010 = 1 << 0;
export const AFF_68020 = 1 << 1;
export const AFF_68030 = 1 << 2;
export const AFF_68040 = 1 << 3;
export const AFF_68881 = 1 << 4;
export const AFF_68882 = 1 << 5;
export const AFF_FPU40 = 1 << 6;
export const AFF_68060 = 1 << 7;

export type EmulatedCpuModel = '68000' | '68010' | '68020' | '68030' | '68040';

/** Model passed to Moira's setModel() in moira-wrapper.cpp. */
export const EMULATED_CPU_MODEL: EmulatedCpuModel = '68020';

/** AttnFlags exec sets for a CPU: each model also sets every older model's bit. */
export function attnFlagsForCpu(model: EmulatedCpuModel): number {
  switch (model) {
    case '68000': return 0;
    case '68010': return AFF_68010;
    case '68020': return AFF_68010 | AFF_68020;
    case '68030': return AFF_68010 | AFF_68020 | AFF_68030;
    case '68040': return AFF_68010 | AFF_68020 | AFF_68030 | AFF_68040;
  }
}

/** The Moira core has no FPU, so no AFF_68881/68882/FPU40 bits. */
export const EMULATED_ATTN_FLAGS = attnFlagsForCpu(EMULATED_CPU_MODEL);
