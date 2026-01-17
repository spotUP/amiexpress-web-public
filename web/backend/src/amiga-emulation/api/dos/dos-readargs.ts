/**
 * dos-readargs.ts - ReadArgs parsing for dos.library
 *
 * Implements Amiga ReadArgs() command-line parsing with support for:
 * - Named arguments (/K keyword)
 * - Required arguments (/A)
 * - Switches (/S)
 * - Numeric values (/N)
 * - Multiple values (/M)
 * - Rest of line (/F)
 * - Toggle switches (/T)
 *
 * @module dos-readargs
 */

import {
  ReadArgsTemplateEntry,
  ReadArgsContext,
  ReadArgsToken,
  ReadArgsTokenResult,
  ReadArgsContextInfo,
  ReadArgsInputInfo,
  DOS_ERRORS,
  READARGS_DEFAULT_BUFFER_SIZE,
  READARGS_HEAP_BASE,
} from './dos-types';
import { MoiraEmulator } from '../../cpu/MoiraEmulator';
import { debugLog } from '../../../utils/debug-log';

/**
 * Manages ReadArgs parsing state and memory allocation
 */
export class ReadArgsParser {
  private emulator: MoiraEmulator;
  private heapPtr: number = READARGS_HEAP_BASE;
  private contexts: Map<number, ReadArgsContext> = new Map();
  private bufferPool: number[] = [];
  private argStringPtr: number = 0;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  /**
   * Set pointer to CLI argument string
   */
  setArgStringPtr(ptr: number): void {
    this.argStringPtr = ptr;
  }

  /**
   * Get or create a ReadArgs context for the given RDArgs pointer
   */
  getOrCreateContext(
    rdargsAddr: number,
    arrayAddr: number,
    templateEntries: ReadArgsTemplateEntry[]
  ): ReadArgsContextInfo {
    const existing = this.contexts.get(rdargsAddr);
    if (existing) {
      return { rdArgsPtr: rdargsAddr, context: existing };
    }

    // Allocate RDArgs struct if needed (32 bytes)
    let ownsStruct = false;
    if (rdargsAddr === 0) {
      rdargsAddr = this.allocateBuffer(32);
      this.zeroMemory(rdargsAddr, 32);
      ownsStruct = true;
    }

    // Initialize array slots to 0
    for (let i = 0; i < templateEntries.length; i++) {
      this.writeLong(arrayAddr + i * 4, 0);
    }

    // Read buffer info from RDArgs struct
    const bufferPtr = this.readLong(rdargsAddr + 16);
    const bufferSize = this.readLong(rdargsAddr + 20);
    const ownsBuffer = bufferPtr === 0;

    const context: ReadArgsContext = {
      rdArgsPtr: rdargsAddr,
      bufferPtr,
      bufferSize,
      bufferOffset: 0,
      ownsBuffer,
      ownsStruct,
    };

    this.contexts.set(rdargsAddr, context);
    return { rdArgsPtr: rdargsAddr, context };
  }

  /**
   * Parse a ReadArgs template string into structured entries
   */
  parseTemplate(template: string): ReadArgsTemplateEntry[] {
    return template
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [namePart, ...modifierParts] = entry.split('/');
        const modifiers = modifierParts
          .map((m) => m.trim().toUpperCase())
          .filter(Boolean);

        const aliasParts = namePart
          .split('=')
          .map((part) => part.trim())
          .filter(Boolean);

        const canonical = aliasParts.length > 0 ? aliasParts[aliasParts.length - 1] : '';
        const aliases = aliasParts.slice(0, -1);
        const namesUpper = [canonical, ...aliases]
          .filter(Boolean)
          .map((n) => n.toUpperCase());

        return {
          displayName: canonical || entry,
          namesUpper,
          required: modifiers.includes('A'),
          isSwitch: modifiers.includes('S'),
          isKeyword: modifiers.includes('K'),
          isNumeric: modifiers.includes('N'),
          isMultiple: modifiers.includes('M'),
          isRest: modifiers.includes('F'),
          isToggle: modifiers.includes('T'),
        };
      });
  }

  /**
   * Get the input string for ReadArgs parsing
   */
  getInputString(rdargsPtr: number): ReadArgsInputInfo {
    const sourcePtr = this.readLong(rdargsPtr);
    const sourceLength = this.readLong(rdargsPtr + 4);
    const sourceCur = this.readLong(rdargsPtr + 8);

    if (sourcePtr !== 0 && sourceLength > 0) {
      const remaining = Math.max(0, sourceLength - Math.max(0, sourceCur));
      const text = this.readFixedString(sourcePtr + sourceCur, remaining);
      return { input: text.trim(), sourcePtr, length: remaining };
    }

    if (this.argStringPtr !== 0) {
      const cli = this.readString(this.argStringPtr, 1024);
      return {
        input: cli.trim(),
        sourcePtr: this.argStringPtr,
        length: cli.length,
      };
    }

    return { input: '', sourcePtr: 0, length: 0 };
  }

  /**
   * Tokenize input string respecting quotes and escapes
   */
  tokenize(input: string): ReadArgsTokenResult {
    const tokens: ReadArgsToken[] = [];
    let current = '';
    let inQuotes = false;
    let escapeNext = false;

    const flushToken = () => {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        const eqIndex = trimmed.indexOf('=');
        const token: ReadArgsToken = {
          raw: trimmed,
          value: eqIndex >= 0 ? trimmed.slice(eqIndex + 1) : trimmed,
          normalizedValue: trimmed.toUpperCase(),
          consumed: false,
        };
        if (eqIndex > 0) {
          token.key = trimmed.slice(0, eqIndex);
          token.keyUpper = token.key.toUpperCase();
          token.normalizedValue = (token.value || '').toUpperCase();
        }
        tokens.push(token);
      }
      current = '';
    };

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (escapeNext) {
        current += ch;
        escapeNext = false;
        continue;
      }
      if (ch === '\\' && inQuotes) {
        escapeNext = true;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && /\s/.test(ch)) {
        flushToken();
        continue;
      }
      current += ch;
    }

    if (inQuotes) {
      return { tokens: [], error: DOS_ERRORS.ERROR_UNMATCHED_QUOTES };
    }
    flushToken();
    return { tokens };
  }

  /**
   * Consume a named argument from tokens
   */
  consumeNamedArgument(
    tokens: ReadArgsToken[],
    entry: ReadArgsTemplateEntry,
    requireKeyword: boolean,
    templateNames: Set<string>,
    consumedTokens: Set<number>
  ): string | 'NEED_VALUE' | null {
    // First try key=value format
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.consumed || !token.keyUpper) {
        continue;
      }
      if (entry.namesUpper.includes(token.keyUpper)) {
        token.consumed = true;
        consumedTokens.add(i);
        return token.value;
      }
    }

    if (!requireKeyword) {
      return null;
    }

    // Try keyword followed by value
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.consumed) {
        continue;
      }
      if (entry.namesUpper.includes(token.normalizedValue)) {
        token.consumed = true;
        consumedTokens.add(i);
        const nextToken = this.findNextValueToken(
          tokens,
          i + 1,
          templateNames,
          consumedTokens
        );
        if (!nextToken) {
          return 'NEED_VALUE';
        }
        return nextToken.value;
      }
    }

    return null;
  }

  /**
   * Find next unconsumed value token
   */
  findNextValueToken(
    tokens: ReadArgsToken[],
    startIndex: number,
    names: Set<string>,
    consumedTokens: Set<number>
  ): ReadArgsToken | null {
    for (let i = startIndex; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.consumed) {
        continue;
      }
      if (token.keyUpper || names.has(token.normalizedValue)) {
        return null;
      }
      token.consumed = true;
      consumedTokens.add(i);
      return token;
    }
    return null;
  }

  /**
   * Consume a positional value from tokens
   */
  consumePositionalValue(
    tokens: ReadArgsToken[],
    reservedNames: Set<string>,
    consumedTokens: Set<number>
  ): string | null {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.consumed || token.keyUpper) {
        continue;
      }
      if (reservedNames.has(token.normalizedValue)) {
        continue;
      }
      token.consumed = true;
      consumedTokens.add(i);
      return token.value;
    }
    return null;
  }

  /**
   * Parse a numeric value (supports decimal and hex)
   */
  parseNumber(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    let base = 10;
    let str = trimmed;

    if (str.startsWith('$')) {
      base = 16;
      str = str.slice(1);
    } else if (str.startsWith('0x') || str.startsWith('0X')) {
      base = 16;
      str = str.slice(2);
    }

    const parsed = parseInt(str, base);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return parsed << 0; // Convert to 32-bit integer
  }

  /**
   * Allocate string storage in context buffer
   */
  allocateString(context: ReadArgsContext, value: string): number | null {
    const addr = this.allocateFromContext(context, value.length + 1);
    if (!addr) {
      return null;
    }
    this.writeString(addr, value);
    return addr;
  }

  /**
   * Allocate number storage in context buffer
   */
  allocateNumber(context: ReadArgsContext, num: number): number | null {
    const addr = this.allocateFromContext(context, 4);
    if (!addr) {
      return null;
    }
    this.writeLong(addr, num);
    return addr;
  }

  /**
   * Allocate pointer array in context buffer
   */
  allocatePointerArray(context: ReadArgsContext, count: number): number | null {
    return this.allocateFromContext(context, count * 4);
  }

  /**
   * Allocate memory from context buffer
   */
  allocateFromContext(context: ReadArgsContext, size: number): number | null {
    const aligned = (size + 3) & ~3;

    // Allocate buffer if needed
    if (context.bufferPtr === 0 || context.bufferSize === 0) {
      const bufferPtr = this.allocateBuffer(
        Math.max(READARGS_DEFAULT_BUFFER_SIZE, aligned)
      );
      if (bufferPtr === 0) {
        return null;
      }
      context.bufferPtr = bufferPtr;
      context.bufferSize = Math.max(READARGS_DEFAULT_BUFFER_SIZE, aligned);
      context.bufferOffset = 0;
      context.ownsBuffer = true;
      this.writeLong(context.rdArgsPtr + 16, context.bufferPtr);
      this.writeLong(context.rdArgsPtr + 20, context.bufferSize);
    }

    // Check if we have space
    if (context.bufferOffset + aligned > context.bufferSize) {
      return null;
    }

    const addr = context.bufferPtr + context.bufferOffset;
    this.zeroMemory(addr, aligned);
    context.bufferOffset += aligned;
    return addr;
  }

  /**
   * Allocate a buffer from the heap
   */
  private allocateBuffer(size: number): number {
    const aligned = (size + 3) & ~3;

    // Try to reuse from pool
    if (aligned === READARGS_DEFAULT_BUFFER_SIZE && this.bufferPool.length > 0) {
      const addr = this.bufferPool.pop() as number;
      this.zeroMemory(addr, aligned);
      return addr;
    }

    // Allocate new
    const addr = this.heapPtr;
    this.heapPtr += aligned;
    this.zeroMemory(addr, aligned);
    return addr;
  }

  /**
   * Free a ReadArgs context
   */
  freeContext(rdargsPtr: number): void {
    const context = this.contexts.get(rdargsPtr);
    if (!context) {
      return;
    }

    // Return buffer to pool if standard size
    if (context.ownsBuffer && context.bufferSize === READARGS_DEFAULT_BUFFER_SIZE) {
      this.bufferPool.push(context.bufferPtr);
    }

    this.contexts.delete(rdargsPtr);
    debugLog(`[ReadArgsParser] Freed context for 0x${rdargsPtr.toString(16)}`);
  }

  // Memory helper methods
  private readLong(address: number): number {
    return this.emulator.readMemory32(address);
  }

  private writeLong(address: number, value: number): void {
    this.emulator.writeMemory32(address, value >>> 0);
  }

  private readString(address: number, maxLen: number = 256): string {
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

  private readFixedString(address: number, length: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < length; i++) {
      const value = this.emulator.readMemory(address + i);
      if (value === 0) {
        break;
      }
      bytes.push(value);
    }
    return String.fromCharCode(...bytes);
  }

  private writeString(address: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.emulator.writeMemory(address + i, str.charCodeAt(i));
    }
    this.emulator.writeMemory(address + str.length, 0);
  }

  private zeroMemory(address: number, size: number): void {
    for (let i = 0; i < size; i++) {
      this.emulator.writeMemory(address + i, 0);
    }
  }
}
