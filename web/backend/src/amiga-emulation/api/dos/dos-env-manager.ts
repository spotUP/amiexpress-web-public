/**
 * dos-env-manager.ts - Environment variable management for dos.library
 *
 * Handles Amiga environment variables (LocalVars, SetVar, GetVar, etc.)
 * for the DOS library emulation.
 *
 * @module dos-env-manager
 */

import { MoiraEmulator } from '../../cpu/MoiraEmulator';
import { debugLog } from '../../../utils/debug-log';
import {
  ENV_VAR_STRUCT_BASE,
  ENV_STRING_BASE,
  ENV_VAR_STRUCT_SIZE,
} from './dos-types';

/**
 * Cached environment variable entry
 */
interface EnvVarEntry {
  /** Memory address of LocalVar structure */
  structAddr: number;
  /** Memory address of variable name string */
  nameAddr: number;
  /** Memory address of value string */
  valueAddr: number;
  /** Length of the value */
  length: number;
}

/**
 * Manages environment variables for door execution.
 *
 * Environment variables are stored in emulated memory using
 * Amiga LocalVar structures linked in a list.
 */
export class DosEnvManager {
  private emulator: MoiraEmulator;

  // Memory allocation pointers
  private structNext: number;
  private stringNext: number;

  // Normalized name -> value mapping for fast lookup
  private normalizedMap: Map<string, string> = new Map();

  // Name -> struct address cache
  private varCache: Map<string, EnvVarEntry> = new Map();

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
    this.structNext = ENV_VAR_STRUCT_BASE;
    this.stringNext = ENV_STRING_BASE;
  }

  /**
   * Reset environment variable state
   */
  reset(): void {
    this.normalizedMap.clear();
    this.varCache.clear();
    this.structNext = ENV_VAR_STRUCT_BASE;
    this.stringNext = ENV_STRING_BASE;
  }

  /**
   * Populate environment from a key-value record
   */
  setEnvironment(env?: Record<string, string | undefined>): void {
    this.reset();

    if (!env) {
      return;
    }

    for (const [rawName, rawValue] of Object.entries(env)) {
      if (typeof rawValue !== 'string') {
        continue;
      }
      const trimmed = rawName.trim();
      if (!trimmed) {
        continue;
      }
      this.normalizedMap.set(trimmed.toLowerCase(), rawValue);
    }

    debugLog(`[DosEnvManager] Set ${this.normalizedMap.size} environment variables`);
  }

  /**
   * Get an environment variable value
   */
  getValue(name: string): string | undefined {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) {
      return undefined;
    }
    return this.normalizedMap.get(trimmed);
  }

  /**
   * Set an environment variable
   */
  setValue(name: string, value: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    this.normalizedMap.set(trimmed.toLowerCase(), value);
    // Invalidate cache so it gets re-allocated
    this.varCache.delete(trimmed.toLowerCase());
    debugLog(`[DosEnvManager] Set ${trimmed}="${value}"`);
  }

  /**
   * Delete an environment variable
   */
  deleteVar(name: string): boolean {
    const trimmed = name.trim().toLowerCase();
    const existed = this.normalizedMap.has(trimmed);
    this.normalizedMap.delete(trimmed);
    this.varCache.delete(trimmed);
    return existed;
  }

  /**
   * Check if a variable exists
   */
  hasVar(name: string): boolean {
    return this.normalizedMap.has(name.trim().toLowerCase());
  }

  /**
   * Get or create a LocalVar structure for the variable.
   * Returns the memory address of the LocalVar node.
   */
  ensureVarNode(name: string, value: string): number {
    const normalized = name.trim().toLowerCase();

    // Check cache
    const existing = this.varCache.get(normalized);
    if (existing) {
      return existing.structAddr;
    }

    // Allocate new LocalVar structure
    const structAddr = this.structNext;
    this.structNext += ENV_VAR_STRUCT_SIZE;

    // Allocate name and value strings
    const nameAddr = this.writeString(name);
    const valueAddr = this.writeString(value);

    // Write LocalVar structure (Amiga exec list node format)
    // struct LocalVar {
    //   struct Node lv_Node;     // Standard list node (14 bytes)
    //   UWORD lv_Flags;          // Flags
    //   UBYTE *lv_Value;         // Pointer to value
    //   ULONG lv_Len;            // Length of value
    // }

    // Node structure at offset 0
    this.emulator.writeMemory32(structAddr + 0, 0);      // ln_Succ
    this.emulator.writeMemory32(structAddr + 4, 0);      // ln_Pred
    this.emulator.writeMemory(structAddr + 8, 0);        // ln_Type
    this.emulator.writeMemory(structAddr + 9, 0);        // ln_Pri
    this.emulator.writeMemory32(structAddr + 10, nameAddr); // ln_Name

    // LocalVar specific fields
    this.emulator.writeMemory32(structAddr + 14, valueAddr); // lv_Value
    this.emulator.writeMemory32(structAddr + 18, value.length); // lv_Len

    // Cache the entry
    const entry: EnvVarEntry = {
      structAddr,
      nameAddr,
      valueAddr,
      length: value.length,
    };
    this.varCache.set(normalized, entry);

    debugLog(`[DosEnvManager] Created LocalVar for "${name}" at 0x${structAddr.toString(16)}`);
    return structAddr;
  }

  /**
   * Find a LocalVar structure by name.
   * Returns the memory address or 0 if not found.
   */
  findVarNode(name: string): number {
    const value = this.getValue(name);
    if (value === undefined) {
      return 0;
    }
    return this.ensureVarNode(name, value);
  }

  /**
   * Get all variable names
   */
  getVarNames(): string[] {
    return Array.from(this.normalizedMap.keys());
  }

  /**
   * Write a string to emulated memory and return its address
   */
  private writeString(text: string): number {
    const addr = this.stringNext;
    this.emulator.writeString(addr, text);
    this.stringNext += text.length + 1;
    return addr;
  }

  /**
   * Read a null-terminated string from emulated memory
   */
  readString(address: number, maxLen: number = 256): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const value = this.emulator.readMemory(address + i);
      if (value === 0) {
        break;
      }
      bytes.push(value);
    }
    return String.fromCharCode(...bytes);
  }

  /**
   * Copy a value to a user-provided buffer.
   * Returns the number of bytes copied or -1 on error.
   */
  copyValueToBuffer(name: string, bufferAddr: number, bufferSize: number): number {
    const value = this.getValue(name);
    if (value === undefined) {
      return -1;
    }

    const copyLen = Math.min(value.length, bufferSize - 1);
    for (let i = 0; i < copyLen; i++) {
      this.emulator.writeMemory(bufferAddr + i, value.charCodeAt(i));
    }
    this.emulator.writeMemory(bufferAddr + copyLen, 0); // Null terminate

    return copyLen;
  }
}
