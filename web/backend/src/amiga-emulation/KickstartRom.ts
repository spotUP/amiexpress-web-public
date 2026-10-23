/**
 * Kickstart ROM Loader
 * Loads and maps Amiga Kickstart ROM into emulated memory
 *
 * Reference: vAmiga Memory.cpp ROM loading
 */

import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import { resolveAmigaRom, MISSING_ROM_MESSAGE } from './rom/amiga-rom';
import { notifySysop } from '../utils/sysop-alert.util.js';

export class KickstartRom {
  private romData: Uint8Array | null = null;
  private romSize: number = 0;

  // AROS extension ROM support (mapped at 0xE00000)
  private extRomData: Uint8Array | null = null;
  private extRomSize: number = 0;
  private isAros: boolean = false;

  // Main Amiga ROM is mapped to 0xF80000 - 0xFFFFFF (512KB)
  private readonly ROM_START = 0xF80000;
  private readonly ROM_END = 0xFFFFFF;
  private readonly ROM_SIZE = 512 * 1024; // 512KB

  // AROS extension ROM is mapped to 0xE00000 - 0xE7FFFF (512KB)
  private readonly EXT_ROM_START = 0xE00000;
  private readonly EXT_ROM_END = 0xE7FFFF;

  constructor() {
    this.loadRom();
  }

  /**
   * Load the ROM the shared resolver picked (rom/amiga-rom.ts). This class
   * knows no path and no filename; AEDOOR_ROM / AEDOOR_ROM_FILE are honoured
   * by the resolver.
   */
  private loadRom(): void {
    const rom = resolveAmigaRom();
    if (rom.kind === 'kickstart') {
console.log(`[ROM] Loading ${rom.label} from: ${rom.path}`);
      this.romSize = rom.data.length;
      this.romData = new Uint8Array(rom.data);
console.log(`[ROM] Mapped to memory range: 0x${this.ROM_START.toString(16).toUpperCase()} - 0x${this.ROM_END.toString(16).toUpperCase()}`);
      return;
    }

    if (rom.kind === 'aros') {
console.log(`[ROM] Loading AROS ROM (open-source) from: ${rom.romPath}`);
      const arosRom = amigafs.readFileSync(rom.romPath) as Buffer;
      const arosExt = amigafs.readFileSync(rom.extPath) as Buffer;
      // AROS: main ROM at 0xF80000, extension ROM at 0xE00000.
      this.isAros = true;
      this.romSize = arosRom.length;
      this.romData = new Uint8Array(arosRom);
      this.extRomSize = arosExt.length;
      this.extRomData = new Uint8Array(arosExt);
      return;
    }

console.error(`[ROM] ${MISSING_ROM_MESSAGE} Searched: ${rom.searched.join(', ')}`);
    rom.rejected.forEach(r => console.error(`[ROM]   rejected ${r.file}: ${r.reason}`));
    try {
      const globalAny: any = global as any;
      notifySysop(globalAny?.currentBbsSession, MISSING_ROM_MESSAGE);
    } catch (_) {
      /* ignore */
    }
    throw new Error(MISSING_ROM_MESSAGE);
  }

  /**
   * Check if address is in ROM range (main ROM or AROS extension ROM)
   */
  public isRomAddress(address: number): boolean {
    // Main ROM range
    if (address >= this.ROM_START && address <= this.ROM_END) {
      return true;
    }
    // AROS extension ROM range
    if (this.isAros && this.extRomData && address >= this.EXT_ROM_START && address <= this.EXT_ROM_END) {
      return true;
    }
    return false;
  }

  /**
   * Check if address is in AROS extension ROM range
   */
  public isExtRomAddress(address: number): boolean {
    return this.isAros && this.extRomData !== null &&
           address >= this.EXT_ROM_START && address <= this.EXT_ROM_END;
  }

  /**
   * Read byte from ROM (handles both main ROM and AROS extension ROM)
   */
  public readByte(address: number): number {
    // Check AROS extension ROM first (0xE00000-0xE7FFFF)
    if (this.isExtRomAddress(address)) {
      const offset = address - this.EXT_ROM_START;
      if (offset >= this.extRomSize) {
        return 0;
      }
      return this.extRomData![offset];
    }

    // Main ROM (0xF80000-0xFFFFFF)
    if (!this.romData) {
      throw new Error('ROM not loaded');
    }

    if (address < this.ROM_START || address > this.ROM_END) {
      throw new Error(`Address 0x${address.toString(16)} is not in ROM range`);
    }

    const offset = address - this.ROM_START;

    if (offset >= this.romSize) {
      // Address beyond ROM size, return 0 (mirroring behavior)
      return 0;
    }

    return this.romData[offset];
  }

  /**
   * Read word (16-bit) from ROM in big-endian format
   */
  public readWord(address: number): number {
    const high = this.readByte(address);
    const low = this.readByte(address + 1);
    return (high << 8) | low;
  }

  /**
   * Read long (32-bit) from ROM in big-endian format
   */
  public readLong(address: number): number {
    const high = this.readWord(address);
    const low = this.readWord(address + 2);
    return (high << 16) | low;
  }

  /**
   * Get exception vector from ROM
   * Exception vectors are at the start of ROM (0x000000-0x0003FF)
   * But they're actually stored in ROM and copied to low memory on boot
   */
  public getExceptionVector(vectorNumber: number): number {
    if (vectorNumber < 0 || vectorNumber > 255) {
      throw new Error(`Invalid exception vector number: ${vectorNumber}`);
    }

    // Each vector is 4 bytes (long word)
    const vectorAddress = vectorNumber * 4;

    // Read from start of ROM (these get copied to low memory on real Amiga)
    return this.readLong(this.ROM_START + vectorAddress);
  }

  /**
   * Get initial stack pointer from ROM
   */
  public getInitialSSP(): number {
    // First long in ROM is initial stack pointer
    return this.readLong(this.ROM_START);
  }

  /**
   * Get initial program counter from ROM
   */
  public getInitialPC(): number {
    // Second long in ROM is initial program counter
    return this.readLong(this.ROM_START + 4);
  }

  /**
   * Dump ROM info for debugging
   */
  public dumpInfo(): void {
    if (!this.romData) {
console.log('[ROM] No ROM loaded');
      return;
    }

console.log('[ROM] ===== Kickstart ROM Info =====');
console.log(`[ROM] Size: ${this.romSize} bytes (${this.romSize / 1024}KB)`);
console.log(`[ROM] Mapped: 0x${this.ROM_START.toString(16)} - 0x${this.ROM_END.toString(16)}`);
console.log(`[ROM] Initial SSP: 0x${this.getInitialSSP().toString(16).padStart(8, '0')}`);
console.log(`[ROM] Initial PC:  0x${this.getInitialPC().toString(16).padStart(8, '0')}`);

    // Show first few exception vectors
console.log('[ROM] Exception Vectors:');
    for (let i = 0; i < 8; i++) {
      const vector = this.getExceptionVector(i);
      const vectorNames = [
        'Initial SSP',
        'Initial PC',
        'Bus Error',
        'Address Error',
        'Illegal Instruction',
        'Division by Zero',
        'CHK Instruction',
        'TRAPV Instruction'
      ];
console.log(`[ROM]   Vector ${i} (${vectorNames[i]}): 0x${vector.toString(16).padStart(8, '0')}`);
    }

    // Show ROM version string (typically at 0xFC0000 + 12)
    const versionOffset = 12;
    const versionBytes: number[] = [];
    for (let i = 0; i < 32; i++) {
      const byte = this.readByte(this.ROM_START + versionOffset + i);
      if (byte === 0) break;
      versionBytes.push(byte);
    }
    const versionString = String.fromCharCode(...versionBytes);
console.log(`[ROM] Version: ${versionString}`);
console.log('[ROM] ================================');
  }

  /**
   * Get ROM data for direct memory mapping
   */
  public getRomData(): Uint8Array {
    if (!this.romData) {
      throw new Error('ROM not loaded');
    }
    return this.romData;
  }

  /**
   * Get ROM size
   */
  public getSize(): number {
    return this.romSize;
  }

  /**
   * Check if using AROS ROM
   */
  public isArosRom(): boolean {
    return this.isAros;
  }

  /**
   * Get extension ROM data (AROS only)
   */
  public getExtRomData(): Uint8Array | null {
    return this.extRomData;
  }

  /**
   * Get extension ROM size
   */
  public getExtSize(): number {
    return this.extRomSize;
  }

  /**
   * Get extension ROM start address
   */
  public getExtRomStart(): number {
    return this.EXT_ROM_START;
  }

  /**
   * Get extension ROM end address
   */
  public getExtRomEnd(): number {
    return this.EXT_ROM_END;
  }

  /**
   * Get main ROM start address
   */
  public getRomStart(): number {
    return this.ROM_START;
  }

  /**
   * Get main ROM end address
   */
  public getRomEnd(): number {
    return this.ROM_END;
  }
}
