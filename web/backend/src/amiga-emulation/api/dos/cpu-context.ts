/**
 * A whole 68K register set, for dos.library switching between a program and
 * the program it starts (RunCommand / Execute / SystemTagList) and back.
 * LibraryTraps applies one after a trap handler asks for it.
 */
export interface CpuContext {
  /** D0-D7 */
  d: number[];
  /** A0-A7 (A7 = SP) */
  a: number[];
  pc: number;
  sr: number;
}
