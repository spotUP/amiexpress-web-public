// TypeScript interface for Moira WebAssembly module

export interface MoiraModule {
  MoiraCPU: new (memSize: number) => MoiraCPU;
}

export interface MoiraCPU {
  setMemoryByte(addr: number, value: number): void;
  getMemoryByte(addr: number): number;
  loadProgram(program: Uint8Array, address: number): void;
  resetCPU(): void;
  executeCycles(cycles: number): number;
  getRegister(reg: number): number;
  setRegister(reg: number, value: number): void;
  setTrapHandler(handler: (offset: number) => void): void;
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
  private trapHandler: ((offset: number) => void) | null = null;

  constructor(private memorySize: number = 1024 * 1024) {} // Default 1MB

  async initialize(): Promise<void> {
    // Load the WASM module
    const createMoiraModule = require('./build/moira.js');
    this.module = await createMoiraModule();
    this.cpu = new this.module.MoiraCPU(this.memorySize);
    this.cpu.resetCPU();
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

  setTrapHandler(handler: (offset: number) => void): void {
    if (!this.cpu) throw new Error('Emulator not initialized');
    this.trapHandler = handler;
    this.cpu.setTrapHandler(handler);
  }

  cleanup(): void {
    if (this.cpu) {
      this.cpu.delete();
      this.cpu = null;
    }
  }
}
