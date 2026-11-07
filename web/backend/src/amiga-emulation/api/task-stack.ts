/**
 * The stack fields of an exec Task / dos Process (exec/tasks.h,
 * dos/dosextens.h): tc_SPLower, tc_SPUpper, pr_StackSize, pr_StackBase.
 *
 * Startup code reads them to learn how big its stack is. vbcc's startup.o
 * computes tc_SPUpper - tc_SPLower and, when that is below ___stack, AllocVecs
 * a new stack and StackSwaps onto it, so zero bounds put every vbcc door on a
 * 4 KB heap stack. Both the door's own process (DoorLoader) and every command
 * the shell runs (DosLibrary) write them through here.
 */
export const TC_SPREG = 0x36;
export const TASK_STACK_FIELDS = [0x3a, 0x3e, 0x84, 0x90] as const;

/** Values for TASK_STACK_FIELDS: lower, upper (longword-aligned top), size in bytes, BPTR to the top. */
export function taskStackFieldValues(lower: number, size: number): number[] {
  const top = (lower + size) & ~3;
  return [lower >>> 0, top >>> 0, size >>> 0, top >>> 2];
}
