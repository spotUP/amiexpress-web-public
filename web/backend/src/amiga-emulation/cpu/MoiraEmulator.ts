// TypeScript interface for Moira WebAssembly module

export interface MoiraModule {
  MoiraCPU: new (memSize: number) => MoiraCPU;
}

export interface MoiraCPU {
  setMemoryByte(addr: number, value: number): void;
  getMemoryByte(addr: number): number;
  loadProgram(program: Uint8Array, address: number): void;
  loadROM(romData: Uint8Array): void;
  resetCPU(): void;
  executeCycles(cycles: number): number;
  getRegister(reg: number): number;
  setRegister(reg: number, value: number): void;
  getCycles(): number;
  delete(): void;
}

// CPU Register indices
export enum CPURegister {
  D0 = 0, D1 = 1, D2 = 2, D3 = 3,
  D4 = 4, D5 = 5, D6 = 6, D7 = 7,
  A0 = 8, A1 = 9, A2 = 10, A3 = 11,
  A4 = 12, A5 = 13, A6 = 14, A7 = 15,
  PC = 16,  // Program Counter
  SR = 17   // Status Register
}

export class MoiraEmulator {
  private module: MoiraModule | null = null;
  private cpu: MoiraCPU | null = null;

  constructor(private memorySize: number = 16 * 1024 * 1024) {} // 16MB for full 24-bit address space

  async initialize(): Promise<void> {
    // Load the WASM module
    const createMoiraModule = require('./build/moira.js');
    this.module = await createMoiraModule();
    this.cpu = new this.module.MoiraCPU(this.memorySize);
    // Don't reset yet - wait until ROM is loaded
  }

  loadROM(romData: Uint8Array): void {
    if (!this.cpu || !this.module) throw new Error('Emulator not initialized');

    // Convert Uint8Array to Emscripten vector
    const vec = new (this.module as any).VectorUint8();
    for (let i = 0; i < romData.length; i++) {
      vec.push_back(romData[i]);
    }

    this.cpu.loadROM(vec);
    vec.delete();

    console.log(`[MoiraEmulator] ROM loaded (${romData.length} bytes)`);
    console.log(`[MoiraEmulator] ROM mapped to 0xF80000-0xFFFFFF`);
    console.log(`[MoiraEmulator] Exception vectors copied to 0x000000`);
  }

  loadProgram(binary: Uint8Array, address: number = 0x1000): void {
    if (!this.cpu || !this.module) throw new Error('Emulator not initialized');

    // Convert Uint8Array to Emscripten vector
    const vec = new (this.module as any).VectorUint8();
    for (let i = 0; i < binary.length; i++) {
      vec.push_back(binary[i]);
    }

    this.cpu.loadProgram(vec, address);
    vec.delete(); // Clean up the temporary vector
  }

  execute(cycles: number = 1000): number {
    if (!this.cpu) throw new Error('Emulator not initialized');
    return this.cpu.executeCycles(cycles);
  }

  reset(): void {
    if (!this.cpu) throw new Error('Emulator not initialized');
    this.cpu.resetCPU();
  }

  getRegister(reg: CPURegister): number {
    if (!this.cpu) throw new Error('Emulator not initialized');
    return this.cpu.getRegister(reg);
  }

  setRegister(reg: CPURegister, value: number): void {
    if (!this.cpu) throw new Error('Emulator not initialized');
    this.cpu.setRegister(reg, value);
  }

  readMemory(address: number): number {
    if (!this.cpu) throw new Error('Emulator not initialized');
    return this.cpu.getMemoryByte(address);
  }

  writeMemory(address: number, value: number): void {
    if (!this.cpu) throw new Error('Emulator not initialized');
    this.cpu.setMemoryByte(address, value);
  }

  getCycles(): number {
    if (!this.cpu) throw new Error('Emulator not initialized');
    return this.cpu.getCycles();
  }

  // Helper methods for 16-bit and 32-bit memory access
  readMemory16(address: number): number {
    const high = this.readMemory(address);
    const low = this.readMemory(address + 1);
    return (high << 8) | low;
  }

  readMemory32(address: number): number {
    const high = this.readMemory16(address);
    const low = this.readMemory16(address + 2);
    return ((high << 16) | low) >>> 0;  // Unsigned 32-bit
  }

  writeMemory16(address: number, value: number): void {
    this.writeMemory(address, (value >> 8) & 0xFF);
    this.writeMemory(address + 1, value & 0xFF);
  }

  writeMemory32(address: number, value: number): void {
    this.writeMemory16(address, (value >> 16) & 0xFFFF);
    this.writeMemory16(address + 2, value & 0xFFFF);
  }

  /**
   * Read a null-terminated string from memory
   * @param address Starting address
   * @param maxLength Maximum length to read (default 256)
   * @returns The string read from memory
   */
  readString(address: number, maxLength: number = 256): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLength; i++) {
      const byte = this.readMemory(address + i);
      if (byte === 0) break; // Null terminator
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }

  /**
   * Write a null-terminated string to memory
   * @param address Starting address
   * @param str String to write
   */
  writeString(address: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.writeMemory(address + i, str.charCodeAt(i));
    }
    this.writeMemory(address + str.length, 0); // Null terminator
  }

  cleanup(): void {
    if (this.cpu) {
      this.cpu.delete();
      this.cpu = null;
    }
  }
}
