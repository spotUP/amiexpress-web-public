/**
 * Library function vector types for trap-based library emulation
 */

import { MoiraEmulator } from "../../cpu/MoiraEmulator";

/**
 * Library function vector entry
 */
export interface LibraryVector {
  offset: number; // Negative offset from library base
  name: string; // Function name (for logging)
  handler: (
    emulator: MoiraEmulator,
    library: any,
    returnAddr?: number
  ) => number; // Returns D0, optional returnAddr
}
