#!/usr/bin/env npx tsx
/**
 * Simple 68k disassembler for analyzing Amiga door binaries
 * Focuses on startup code to understand door initialization
 */

import * as fs from 'fs';

interface Instruction {
  address: number;
  bytes: number[];
  mnemonic: string;
  operands: string;
  comment?: string;
}

class M68kDisassembler {
  private data: Buffer;
  private baseAddr: number;

  constructor(data: Buffer, baseAddr: number = 0) {
    this.data = data;
    this.baseAddr = baseAddr;
  }

  readWord(offset: number): number {
    return this.data.readUInt16BE(offset);
  }

  readLong(offset: number): number {
    return this.data.readUInt32BE(offset);
  }

  disassembleInstruction(offset: number): Instruction | null {
    if (offset >= this.data.length - 1) return null;

    const word = this.readWord(offset);
    const bytes: number[] = [word >> 8, word & 0xff];
    const address = this.baseAddr + offset;

    // JSR (Jump to Subroutine) - 0100111010xxxxxx
    if ((word & 0xffc0) === 0x4e80) {
      const ea = word & 0x3f;
      return {
        address,
        bytes,
        mnemonic: 'JSR',
        operands: this.decodeEA(ea, offset + 2),
      };
    }

    // RTS (Return from Subroutine) - 0100111001110101
    if (word === 0x4e75) {
      return { address, bytes, mnemonic: 'RTS', operands: '' };
    }

    // MOVE.L - 0010ssxxxxxxxxxx
    if ((word & 0xf000) === 0x2000) {
      const size = ((word >> 12) & 0x3) === 2 ? 'L' : ((word >> 12) & 0x3) === 3 ? 'W' : 'B';
      const dest = (word >> 6) & 0x3f;
      const src = word & 0x3f;
      return {
        address,
        bytes,
        mnemonic: `MOVE.${size}`,
        operands: `${this.decodeEA(src, offset + 2)}, ${this.decodeEA(dest, offset + 2)}`,
      };
    }

    // LEA (Load Effective Address) - 0100aaa111xxxxxx
    if ((word & 0xf1c0) === 0x41c0) {
      const reg = (word >> 9) & 0x7;
      const ea = word & 0x3f;
      return {
        address,
        bytes,
        mnemonic: 'LEA',
        operands: `${this.decodeEA(ea, offset + 2)}, A${reg}`,
      };
    }

    // MOVEM - 01001d001s0mmmmm
    if ((word & 0xfb80) === 0x4880) {
      const dir = (word & 0x0400) ? 'mem->regs' : 'regs->mem';
      const size = (word & 0x0040) ? 'L' : 'W';
      const mask = this.readWord(offset + 2);
      bytes.push(mask >> 8, mask & 0xff);
      return {
        address,
        bytes,
        mnemonic: `MOVEM.${size}`,
        operands: `${dir === 'regs->mem' ? this.regList(mask) : '...'},${dir === 'mem->regs' ? this.regList(mask) : '...'}`,
      };
    }

    // CLR - 01000010ssxxxxxx
    if ((word & 0xff00) === 0x4200) {
      const size = ['B', 'W', 'L'][(word >> 6) & 0x3];
      const ea = word & 0x3f;
      return {
        address,
        bytes,
        mnemonic: `CLR.${size}`,
        operands: this.decodeEA(ea, offset + 2),
      };
    }

    // TST - 01001010ssxxxxxx
    if ((word & 0xff00) === 0x4a00) {
      const size = ['B', 'W', 'L'][(word >> 6) & 0x3];
      const ea = word & 0x3f;
      return {
        address,
        bytes,
        mnemonic: `TST.${size}`,
        operands: this.decodeEA(ea, offset + 2),
      };
    }

    // BEQ, BNE, BRA, etc. - 0110ccccxxxxxxxx
    if ((word & 0xf000) === 0x6000) {
      const cond = (word >> 8) & 0xf;
      let disp = word & 0xff;
      if (disp === 0) {
        const ext = this.readWord(offset + 2);
        disp = ext;
        bytes.push(ext >> 8, ext & 0xff);
      } else if (disp & 0x80) {
        disp = disp - 256; // Sign extend
      }
      const target = address + 2 + disp;
      const condName = ['RA', 'SR', 'HI', 'LS', 'CC', 'CS', 'NE', 'EQ',
                        'VC', 'VS', 'PL', 'MI', 'GE', 'LT', 'GT', 'LE'][cond];
      return {
        address,
        bytes,
        mnemonic: `B${condName}`,
        operands: `$${target.toString(16).toUpperCase().padStart(4, '0')}`,
      };
    }

    // CMP - 1011xxxoooxxxxxx
    if ((word & 0xf000) === 0xb000) {
      const reg = (word >> 9) & 0x7;
      const opmode = (word >> 6) & 0x7;
      const ea = word & 0x3f;
      const size = opmode < 3 ? ['B', 'W', 'L'][opmode] : 'L';
      return {
        address,
        bytes,
        mnemonic: `CMP.${size}`,
        operands: `${this.decodeEA(ea, offset + 2)}, D${reg}`,
      };
    }

    // Unknown instruction
    return {
      address,
      bytes,
      mnemonic: 'DC.W',
      operands: `$${word.toString(16).toUpperCase().padStart(4, '0')}`,
    };
  }

  decodeEA(ea: number, extOffset: number): string {
    const mode = (ea >> 3) & 0x7;
    const reg = ea & 0x7;

    switch (mode) {
      case 0: return `D${reg}`;
      case 1: return `A${reg}`;
      case 2: return `(A${reg})`;
      case 3: return `(A${reg})+`;
      case 4: return `-(A${reg})`;
      case 5: return `(d16,A${reg})`;
      case 6: return `(d8,A${reg},Xn)`;
      case 7:
        switch (reg) {
          case 0: return `(xxx).W`;
          case 1: return `(xxx).L`;
          case 2: return `(d16,PC)`;
          case 3: return `(d8,PC,Xn)`;
          case 4: return `#<data>`;
          default: return `???`;
        }
      default: return `???`;
    }
  }

  regList(mask: number): string {
    const regs: string[] = [];
    for (let i = 0; i < 8; i++) {
      if (mask & (1 << i)) regs.push(`D${i}`);
    }
    for (let i = 0; i < 8; i++) {
      if (mask & (1 << (i + 8))) regs.push(`A${i}`);
    }
    return regs.join('/');
  }

  disassemble(startOffset: number, numInstructions: number): Instruction[] {
    const instructions: Instruction[] = [];
    let offset = startOffset;

    for (let i = 0; i < numInstructions; i++) {
      const instr = this.disassembleInstruction(offset);
      if (!instr) break;
      instructions.push(instr);
      offset += instr.bytes.length;
    }

    return instructions;
  }

  printInstructions(instructions: Instruction[]) {
    console.log('\n68000 Disassembly:\n');
    console.log('Address   Bytes              Instruction');
    console.log('--------  -----------------  ---------------------------------');
    for (const instr of instructions) {
      const addrStr = instr.address.toString(16).toUpperCase().padStart(8, '0');
      const bytesStr = instr.bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(17, ' ');
      const instrStr = `${instr.mnemonic.padEnd(8, ' ')} ${instr.operands}`;
      console.log(`${addrStr}  ${bytesStr}  ${instrStr}`);
    }
  }
}

// Parse AmigaOS LoadSeg format
function parseLoadSegBinary(filePath: string): { segments: Buffer[], entryPoint: number } {
  const data = fs.readFileSync(filePath);

  // Check hunk header
  if (data.readUInt32BE(0) !== 0x000003f3) {
    throw new Error('Not a valid AmigaOS executable');
  }

  // Skip to first code hunk (hunk 0)
  // Format: 0x000003f3 (header), 0x00000000 (names), num_hunks, first, last, sizes...
  let offset = 0;
  offset += 4; // Skip header ID
  offset += 4; // Skip string table size
  const numHunks = data.readUInt32BE(offset); offset += 4;
  const firstHunk = data.readUInt32BE(offset); offset += 4;
  const lastHunk = data.readUInt32BE(offset); offset += 4;

  console.log(`Number of hunks: ${numHunks}`);
  console.log(`First hunk: ${firstHunk}, Last hunk: ${lastHunk}`);

  // Read hunk sizes
  const hunkSizes: number[] = [];
  for (let i = 0; i <= lastHunk - firstHunk; i++) {
    const size = data.readUInt32BE(offset) & 0x3fffffff; // Remove flags
    hunkSizes.push(size * 4); // Size is in longwords
    offset += 4;
  }
  console.log(`Hunk sizes (bytes):`, hunkSizes);

  // Find CODE hunk (type 0x000003e9)
  const segments: Buffer[] = [];
  while (offset < data.length) {
    const hunkType = data.readUInt32BE(offset);
    offset += 4;

    if (hunkType === 0x000003e9) { // HUNK_CODE
      const hunkSize = data.readUInt32BE(offset) * 4; // Longwords to bytes
      offset += 4;
      const codeData = data.subarray(offset, offset + hunkSize);
      segments.push(codeData);
      console.log(`Found CODE hunk at offset 0x${(offset - 8).toString(16)}, size: ${hunkSize} bytes`);
      offset += hunkSize;
    } else if (hunkType === 0x000003ea) { // HUNK_DATA
      const hunkSize = data.readUInt32BE(offset) * 4;
      offset += 4;
      offset += hunkSize;
    } else if (hunkType === 0x000003eb) { // HUNK_BSS
      const hunkSize = data.readUInt32BE(offset) * 4;
      offset += 4;
    } else if (hunkType === 0x000003ec) { // HUNK_RELOC32
      // Skip relocation entries
      while (offset < data.length) {
        const numRelocs = data.readUInt32BE(offset);
        offset += 4;
        if (numRelocs === 0) break;
        offset += 4; // hunk number
        offset += numRelocs * 4; // relocation offsets
      }
    } else if (hunkType === 0x000003f2) { // HUNK_END
      break;
    } else {
      console.log(`Unknown hunk type: 0x${hunkType.toString(16)}`);
      break;
    }
  }

  if (segments.length === 0) {
    throw new Error('No CODE hunk found');
  }

  return { segments, entryPoint: 0x70020 }; // Entry point from Process structure
}

// Main
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: disasm68k.ts <binary-file> [num-instructions] [start-offset]');
  process.exit(1);
}

const filePath = args[0];
const numInstructions = args[1] ? parseInt(args[1]) : 50;
const startOffset = args[2] ? parseInt(args[2], 16) : 0;

try {
  const { segments, entryPoint } = parseLoadSegBinary(filePath);
  const code = segments[0]; // First code segment

  console.log(`\nDisassembling ${filePath}`);
  console.log(`Code segment size: ${code.length} bytes`);
  console.log(`Starting at offset: 0x${startOffset.toString(16)}`);
  console.log(`Entry point: 0x${entryPoint.toString(16)}`);

  const disasm = new M68kDisassembler(code, entryPoint);
  const instructions = disasm.disassemble(startOffset, numInstructions);
  disasm.printInstructions(instructions);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
