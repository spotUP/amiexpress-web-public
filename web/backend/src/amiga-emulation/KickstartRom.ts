/**
 * Kickstart ROM Loader
 * Loads and maps Amiga Kickstart ROM into emulated memory
 *
 * Reference: vAmiga Memory.cpp ROM loading
 */

import * as fs from 'fs';
import * as path from 'path';
import { notifySysop } from '../utils/sysop-alert.util.js';

export class KickstartRom {
  private romData: Uint8Array | null = null;
  private romSize: number = 0;

  // Amiga ROM is mapped to 0xF80000 - 0xFFFFFF (512KB)
  private readonly ROM_START = 0xF80000;
  private readonly ROM_END = 0xFFFFFF;
  private readonly ROM_SIZE = 512 * 1024; // 512KB

  constructor() {
    this.loadRom();
  }

  /**
   * Load Kickstart ROM from disk
   * Tries AROS ROM first (open-source), then falls back to Kickstart ROM
   */
  private loadRom(): void {
    // Try AROS ROM first (open-source, can be committed to GitHub)
    // AROS ROM comes in two files: aros-rom.bin (256KB) + aros-ext.bin (256KB) = 512KB
    const repoRoot = path.resolve(__dirname, '../../..');
    const backendRoot = path.join(repoRoot, 'web/backend');
    const arosRomPaths = Array.from(
      new Set([
        path.join(process.cwd(), 'data/amiga-roms'),
        path.join(backendRoot, 'data/amiga-roms'),
        path.join(repoRoot, 'data/amiga-roms'),
        path.join(__dirname, '../../data/amiga-roms'),
        path.join(__dirname, '../../../data/amiga-roms'),
      ])
    );

    // Try loading AROS ROM first
    for (const basePath of arosRomPaths) {
      const arosRomFile = path.join(basePath, 'aros-rom.bin');
      const arosExtFile = path.join(basePath, 'aros-ext.bin');

      if (fs.existsSync(arosRomFile) && fs.existsSync(arosExtFile)) {
        console.log(`[ROM] Loading AROS ROM (open-source) from: ${basePath}`);

        // Load both AROS files
        const arosRom = fs.readFileSync(arosRomFile);
        const arosExt = fs.readFileSync(arosExtFile);

        // Combine them (aros-rom.bin first, then aros-ext.bin)
        this.romSize = arosRom.length + arosExt.length;
        this.romData = new Uint8Array(this.romSize);
        this.romData.set(new Uint8Array(arosRom), 0);
        this.romData.set(new Uint8Array(arosExt), arosRom.length);

        console.log(`[ROM] Loaded AROS ROM: ${this.romSize} bytes (${this.romSize / 1024}KB)`);
        console.log(`[ROM]   - aros-rom.bin: ${arosRom.length} bytes`);
        console.log(`[ROM]   - aros-ext.bin: ${arosExt.length} bytes`);
        console.log(`[ROM] AROS ROM loaded successfully`);
        console.log(`[ROM] Mapped to memory range: 0x${this.ROM_START.toString(16).toUpperCase()} - 0x${this.ROM_END.toString(16).toUpperCase()}`);
        return;
      }
    }

    // Fall back to Kickstart 3.1 ROM (copyrighted, only for local dev)
    console.log('[ROM] AROS ROM not found, trying Kickstart ROM...');
    const romFilename = 'Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom';
    const possiblePaths = Array.from(
      new Set([
        path.join(process.cwd(), 'data/amiga-roms', romFilename),
        path.join(backendRoot, 'data/amiga-roms', romFilename),
        path.join(repoRoot, 'data/amiga-roms', romFilename),
        path.join(__dirname, '../../data/amiga-roms', romFilename),
        path.join(__dirname, '../../../data/amiga-roms', romFilename),
      ])
    );

    let romPath: string | null = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        romPath = testPath;
        break;
      }
    }

    if (!romPath) {
      console.error('[ROM] No ROM found. Tried paths:');
      console.error('[ROM] AROS ROM:');
      arosRomPaths.forEach(p => {
        console.error(`  - ${path.join(p, 'aros-rom.bin')} + ${path.join(p, 'aros-ext.bin')}`);
      });
      console.error('[ROM] Kickstart ROM:');
      possiblePaths.forEach(p => console.error(`  - ${p}`));
      // Emit to BBS terminal if session socket is available
      try {
        const globalAny: any = global as any;
        const session = globalAny?.currentBbsSession;
      notifySysop(
        session,
        'No Amiga ROM found. Please install AROS ROM (free) or Kickstart ROM (commercial).'
      );
      } catch (_) {
        /* ignore */
      }
      throw new Error(`No Amiga ROM found. Please install AROS ROM (free) or Kickstart ROM (commercial).`);
    }

    console.log(`[ROM] Loading Kickstart ROM from: ${romPath}`);

    // Read ROM file
    const romBuffer = fs.readFileSync(romPath);
    this.romSize = romBuffer.length;

    console.log(`[ROM] Loaded ${this.romSize} bytes (${this.romSize / 1024}KB)`);

    if (this.romSize !== this.ROM_SIZE) {
      console.warn(`[ROM] Warning: ROM size ${this.romSize} doesn't match expected ${this.ROM_SIZE}`);
    }

    // Convert to Uint8Array for easy access
    this.romData = new Uint8Array(romBuffer);

    console.log(`[ROM] Kickstart 3.1 loaded successfully`);
    console.log(`[ROM] Mapped to memory range: 0x${this.ROM_START.toString(16).toUpperCase()} - 0x${this.ROM_END.toString(16).toUpperCase()}`);
  }

  /**
   * Check if address is in ROM range
   */
  public isRomAddress(address: number): boolean {
    return address >= this.ROM_START && address <= this.ROM_END;
  }

  /**
   * Read byte from ROM
   */
  public readByte(address: number): number {
    if (!this.romData) {
      throw new Error('ROM not loaded');
    }

    if (!this.isRomAddress(address)) {
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
}
