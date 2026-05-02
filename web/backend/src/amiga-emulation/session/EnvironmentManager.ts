/**
 * EnvironmentManager - Manages AmigaOS environment variables
 *
 * Implements DOS V36+ environment variable system:
 * - Local variables (per-process)
 * - Global variables (system-wide)
 * - LocalVar structure management
 * - Memory allocation for variable storage
 *
 * AmigaOS LocalVar structure (from dos/var.h):
 * struct LocalVar {
 *   struct Node lv_Node;      // 14 bytes (ln_Succ=0, ln_Pred=4, ln_Type=8, ln_Pri=9, ln_Name=10)
 *   UWORD lv_Flags;           // Offset 14: GVF_LOCAL_VAR, GVF_BINARY_VAR, etc.
 *   UBYTE *lv_Value;          // Offset 16: Pointer to value string
 *   ULONG lv_Len;             // Offset 20: Length of value
 * };
 * Total size: 24 bytes
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';

export interface LocalVarData {
  name: string;
  value: string;
  flags: number;
  nodeAddr: number;  // Address of LocalVar structure in emulator memory
}

export class EnvironmentManager {
  private emulator: MoiraEmulator;
  private variables: Map<string, LocalVarData>;
  private nextVarAddr: number;
  private localVarsListAddr: number;

  // GVF flags from dos/var.h
  private static readonly GVF_LOCAL_VAR = 0;
  private static readonly GVF_GLOBAL_VAR = 256;
  private static readonly GVF_BINARY_VAR = 512;
  private static readonly GVF_DONT_NULL_TERM = 1024;
  private static readonly GVF_SAVE_VAR = 2048;

  constructor(emulator: MoiraEmulator, baseAddr: number = 0x130000) {
    this.emulator = emulator;
    this.variables = new Map();
    this.nextVarAddr = baseAddr;
    this.localVarsListAddr = 0;
  }

  /**
   * Initialize the LocalVars list structure
   * Creates an Exec MinList at the specified address
   *
   * MinList structure (8 bytes):
   * +0: lh_Head (APTR) - pointer to first node
   * +4: lh_Tail (APTR) - always NULL
   * +8: lh_TailPred (APTR) - pointer to last node
   */
  public initializeLocalVarsList(listAddr: number): void {
    this.localVarsListAddr = listAddr;

    // Initialize empty MinList
    // lh_Head points to Tail (empty list)
    this.emulator.writeMemory32(listAddr + 0, listAddr + 4);  // lh_Head → Tail
    this.emulator.writeMemory32(listAddr + 4, 0);              // lh_Tail (NULL)
    this.emulator.writeMemory32(listAddr + 8, listAddr + 0);  // lh_TailPred → Head

console.log(`[EnvironmentManager] Initialized LocalVars list at 0x${listAddr.toString(16)}`);
  }

  /**
   * Set an environment variable
   * Creates LocalVar structure in emulator memory and adds to linked list
   *
   * @param name Variable name
   * @param value Variable value
   * @param flags GVF flags (default: GVF_LOCAL_VAR)
   * @returns true if successful
   */
  public setVar(name: string, value: string, flags: number = 0): boolean {
    try {
console.log(`[EnvironmentManager] SetVar("${name}", "${value}", flags=${flags})`);

      // Delete existing variable if present
      if (this.variables.has(name)) {
        this.deleteVar(name);
      }

      // Allocate memory for LocalVar structure (24 bytes)
      const nodeAddr = this.nextVarAddr;
      this.nextVarAddr += 24;

      // Allocate memory for name string
      const nameAddr = this.nextVarAddr;
      this.emulator.writeString(nameAddr, name);
      this.nextVarAddr += name.length + 1;

      // Allocate memory for value string
      const valueAddr = this.nextVarAddr;
      this.emulator.writeString(valueAddr, value);
      this.nextVarAddr += value.length + 1;

      // Write LocalVar structure
      // struct Node (14 bytes)
      this.emulator.writeMemory32(nodeAddr + 0, 0);      // ln_Succ (will be set when adding to list)
      this.emulator.writeMemory32(nodeAddr + 4, 0);      // ln_Pred (will be set when adding to list)
      this.emulator.writeMemory(nodeAddr + 8, 0);        // ln_Type
      this.emulator.writeMemory(nodeAddr + 9, 0);        // ln_Pri
      this.emulator.writeMemory32(nodeAddr + 10, nameAddr); // ln_Name

      // LocalVar fields
      this.emulator.writeMemory16(nodeAddr + 14, flags);    // lv_Flags
      this.emulator.writeMemory32(nodeAddr + 16, valueAddr); // lv_Value
      this.emulator.writeMemory32(nodeAddr + 20, value.length); // lv_Len

      // Add to linked list (ADDTAIL)
      if (this.localVarsListAddr !== 0) {
        this.addNodeToList(nodeAddr);
      }

      // Store in map
      this.variables.set(name, {
        name,
        value,
        flags,
        nodeAddr
      });

console.log(`[EnvironmentManager] Created LocalVar at 0x${nodeAddr.toString(16)}`);
      return true;
    } catch (error) {
console.error(`[EnvironmentManager] SetVar error:`, error);
      return false;
    }
  }

  /**
   * Get an environment variable value
   * @param name Variable name
   * @returns Variable value or undefined if not found
   */
  public getVar(name: string): string | undefined {
    const varData = this.variables.get(name);
    return varData?.value;
  }

  /**
   * Find an environment variable
   * @param name Variable name
   * @returns LocalVar structure address or 0 if not found
   */
  public findVar(name: string): number {
    const varData = this.variables.get(name);
    if (varData) {
console.log(`[EnvironmentManager] FindVar("${name}") → 0x${varData.nodeAddr.toString(16)}`);
      return varData.nodeAddr;
    }
console.log(`[EnvironmentManager] FindVar("${name}") → not found`);
    return 0;
  }

  /**
   * Find environment variable with flags support (for FindVar LVO -924)
   * Supports GVF_GLOBAL_ONLY and GVF_LOCAL_ONLY flag filtering
   *
   * @param name Variable name
   * @param flags GVF flags (GVF_GLOBAL_ONLY=256, GVF_LOCAL_ONLY=0, etc.)
   * @returns Address of LocalVar structure, or 0 if not found
   */
  public findVarPointer(name: string, flags: number): number {
    const varData = this.variables.get(name);
    if (!varData) {
console.log(`[EnvironmentManager] FindVarPointer("${name}", flags=${flags}) → not found`);
      return 0;
    }

    // Check flag restrictions
    const isGlobalVar = (varData.flags & EnvironmentManager.GVF_GLOBAL_VAR) !== 0;
    const globalOnly = (flags & EnvironmentManager.GVF_GLOBAL_VAR) !== 0;
    const localOnly = (flags & EnvironmentManager.GVF_GLOBAL_VAR) === 0;

    // If GVF_GLOBAL_ONLY is set, only return global variables
    if (globalOnly && !isGlobalVar) {
console.log(`[EnvironmentManager] FindVarPointer("${name}") → skipped (not global)`);
      return 0;
    }

    // If GVF_LOCAL_ONLY is set (default), only return local variables
    // But in practice, most code doesn't set this explicitly, so we're lenient
    // and return any variable unless GVF_GLOBAL_ONLY is explicitly set

console.log(`[EnvironmentManager] FindVarPointer("${name}", flags=${flags}) → 0x${varData.nodeAddr.toString(16)}`);
    return varData.nodeAddr;
  }

  /**
   * Delete an environment variable
   * Removes from linked list and frees memory
   *
   * @param name Variable name
   * @returns true if variable was found and deleted
   */
  public deleteVar(name: string): boolean {
    const varData = this.variables.get(name);
    if (!varData) {
console.log(`[EnvironmentManager] DeleteVar("${name}") → not found`);
      return false;
    }

console.log(`[EnvironmentManager] DeleteVar("${name}")`);

    // Remove from linked list
    if (this.localVarsListAddr !== 0) {
      this.removeNodeFromList(varData.nodeAddr);
    }

    // Remove from map
    this.variables.delete(name);

    // Note: We don't actually free memory in the emulator as it would complicate
    // memory management. The memory will be reclaimed when the session ends.

    return true;
  }

  /**
   * Pre-populate standard DOS and BBS environment variables
   * Called at session initialization
   */
   public populateStandardVars(bbsRoot: string, nodeId: number, confId: number, username: string, secLevel: number): void {
console.log(`[EnvironmentManager] Populating standard environment variables`);

    // Standard AmigaDOS variables
    this.setVar('PATH', 'Work:,S:,C:,Doors:', EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('PROMPT', '%N.%S>', EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('RETURN', '0', EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('RC', '0', EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('Result2', '0', EnvironmentManager.GVF_LOCAL_VAR);

    // Device info
    this.setVar('DEVINFO', 'CON:,NIL:,SER:', EnvironmentManager.GVF_LOCAL_VAR);

    // Kickstart/Workbench versions (matches env-initializer.ts)
    this.setVar('Kickstart', '39.106', EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('Workbench', '39.29', EnvironmentManager.GVF_LOCAL_VAR);

    // BBS path and location variables
    this.setVar('BBS_ROOT', bbsRoot, EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('BBSPATH', bbsRoot, EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('BBS_PATH', bbsRoot, EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('BBSDATA', bbsRoot, EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('BBS_NAME', 'AmiExpress Web BBS', EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('BBSNAME', 'AmiExpress Web BBS', EnvironmentManager.GVF_LOCAL_VAR);

    // Node number variables (doors check various names)
    this.setVar('NODE_ID', String(nodeId), EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('AXNODE', String(nodeId), EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('AMX_NODE', String(nodeId), EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('NODE', String(nodeId), EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('AXNODENUM', String(nodeId), EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('BBSNODE', String(nodeId), EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('NODE_NUMBER', String(nodeId), EnvironmentManager.GVF_LOCAL_VAR);

    // User/session variables (used by AquaWho, DOORSMENU, etc.)
    this.setVar('USERNAME', username, EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('USER_NAME', username, EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('HANDLE', username, EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('USER_LEVEL', String(secLevel), EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('SYSOP', 'sysop', EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('SYSOP_NAME', 'sysop', EnvironmentManager.GVF_LOCAL_VAR);

    // Conference info
    this.setVar('CONF_ID', String(confId), EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('CONF', String(confId), EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('CONFNUM', String(confId), EnvironmentManager.GVF_LOCAL_VAR);

    // Connection/serial variables (doors may check these)
    this.setVar('BAUD', '115200', EnvironmentManager.GVF_LOCAL_VAR);
    this.setVar('SERIALRATE', '115200', EnvironmentManager.GVF_LOCAL_VAR);

console.log(`[EnvironmentManager] Populated ${this.variables.size} standard variables`);
  }

  /**
   * Add DOORUSE.* variables from door .info file tooltypes
   * @param doorName Door name (e.g., "AquaScan")
   * @param doorUse DOORUSE value from .info file (e.g., "FR/REVSCAN")
   */
  public setDoorUseVar(doorName: string, doorUse: string): void {
    const varName = `DOORUSE.${doorName.toUpperCase()}`;
    this.setVar(varName, doorUse, EnvironmentManager.GVF_LOCAL_VAR);
console.log(`[EnvironmentManager] Set ${varName}=${doorUse}`);
  }

  /**
   * Add a node to the LocalVars linked list (ADDTAIL)
   * @param nodeAddr Address of LocalVar node
   */
  private addNodeToList(nodeAddr: number): void {
    // Get current tail predecessor (last node)
    const tailPredAddr = this.emulator.readMemory32(this.localVarsListAddr + 8);

    // Link new node
    this.emulator.writeMemory32(nodeAddr + 0, this.localVarsListAddr + 4);  // ln_Succ → Tail
    this.emulator.writeMemory32(nodeAddr + 4, tailPredAddr);                // ln_Pred → old last node

    // Update old last node or head
    if (tailPredAddr === this.localVarsListAddr + 0) {
      // List was empty, update head
      this.emulator.writeMemory32(this.localVarsListAddr + 0, nodeAddr);
    } else {
      // Update old last node's successor
      this.emulator.writeMemory32(tailPredAddr + 0, nodeAddr);
    }

    // Update tail predecessor
    this.emulator.writeMemory32(this.localVarsListAddr + 8, nodeAddr);
  }

  /**
   * Remove a node from the LocalVars linked list (REMOVE)
   * @param nodeAddr Address of LocalVar node
   */
  private removeNodeFromList(nodeAddr: number): void {
    const succAddr = this.emulator.readMemory32(nodeAddr + 0);  // ln_Succ
    const predAddr = this.emulator.readMemory32(nodeAddr + 4);  // ln_Pred

    // Link predecessor to successor
    this.emulator.writeMemory32(predAddr + 0, succAddr);

    // Link successor to predecessor
    this.emulator.writeMemory32(succAddr + 4, predAddr);
  }

  /**
   * Get all variables (for debugging)
   */
  public getAllVars(): Map<string, LocalVarData> {
    return new Map(this.variables);
  }

  /**
   * Clear all variables
   */
  public clear(): void {
    this.variables.clear();
console.log(`[EnvironmentManager] Cleared all environment variables`);
  }
}
