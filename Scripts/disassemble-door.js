#!/usr/bin/env node

/**
 * Disassemble GetAnswer door startup to find port address memory read
 *
 * Goal: Find where door reads the value 0x7500002f (garbage port address)
 * This will tell us what memory location needs to be initialized with 0xa0000
 */

const fs = require('fs');
const path = require('path');

// Import emulator components
const { MoiraEmulator } = require('./web/backend/dist/amiga-emulation/core/MoiraEmulator');
const { AmigaDoorSession } = require('./web/backend/dist/amiga-emulation/AmigaDoorSession');

async function disassembleDoor() {
  console.log('=== GetAnswer Door Disassembly ===\n');

  const doorPath = path.join(__dirname, 'Doors/GetAnswer/GetAnswer');

  if (!fs.existsSync(doorPath)) {
    console.error('Error: Door not found at', doorPath);
    return;
  }

  console.log('Door path:', doorPath);
  console.log('');

  // Create emulator
  const emulator = new MoiraEmulator();

  // Load door binary
  const doorData = fs.readFileSync(doorPath);
  console.log('Door size:', doorData.length, 'bytes');

  // Parse AmigaDOS hunk format
  // First longword should be 0x000003F3 (HUNK_HEADER)
  const hunkHeader = doorData.readUInt32BE(0);
  console.log('Hunk header:', '0x' + hunkHeader.toString(16));

  if (hunkHeader !== 0x000003F3) {
    console.error('Error: Not a valid AmigaDOS executable (expected 0x000003F3)');
    return;
  }

  // Skip hunk parsing for now - just find CODE hunk (0x000003E9)
  let offset = 4;
  let codeStart = -1;
  let codeSize = 0;

  while (offset < doorData.length - 4) {
    const hunkType = doorData.readUInt32BE(offset);

    if (hunkType === 0x000003E9) {  // HUNK_CODE
      offset += 4;
      codeSize = doorData.readUInt32BE(offset) * 4;  // Size in longwords
      offset += 4;
      codeStart = offset;
      console.log('Found HUNK_CODE at offset', offset, 'size', codeSize, 'bytes');
      break;
    }

    offset += 4;
  }

  if (codeStart === -1) {
    console.error('Error: Could not find HUNK_CODE');
    return;
  }

  // Load code into emulator memory at 0x1000 (standard load address)
  const loadAddr = 0x1000;
  const codeData = doorData.slice(codeStart, codeStart + codeSize);

  for (let i = 0; i < codeData.length; i++) {
    emulator.writeMemory(loadAddr + i, codeData[i]);
  }

  console.log('Loaded code to memory at 0x' + loadAddr.toString(16));
  console.log('');

  // Disassemble first 100 instructions
  console.log('=== Disassembly (First 100 Instructions) ===\n');

  let pc = loadAddr;
  let instructionCount = 0;
  const maxInstructions = 100;

  // Look for patterns that might load port address:
  // - MOVE.L <addr>,A0  (loads from memory to A0)
  // - LEA <addr>,A0     (loads effective address to A0)
  // - MOVEA.L <addr>,A0 (move address to A0)

  const suspiciousInstructions = [];

  while (instructionCount < maxInstructions && pc < loadAddr + codeSize) {
    try {
      const disasm = emulator.disassemble(pc);
      const opcodeBytes = [];

      // Read instruction bytes
      for (let i = 0; i < disasm.length; i++) {
        opcodeBytes.push(emulator.readMemory(pc + i).toString(16).padStart(2, '0'));
      }

      const hexStr = opcodeBytes.join(' ').padEnd(20, ' ');
      const asmLine = `0x${pc.toString(16).padStart(4, '0')}: ${hexStr} ${disasm.text}`;

      console.log(asmLine);

      // Look for instructions that might load port address into A0
      const text = disasm.text.toUpperCase();
      if (text.includes('A0') && (
          text.includes('MOVE') ||
          text.includes('LEA') ||
          text.includes('MOVEA')
      )) {
        suspiciousInstructions.push({
          pc: pc,
          instruction: disasm.text,
          bytes: hexStr
        });
      }

      pc += disasm.length;
      instructionCount++;

    } catch (error) {
      console.log(`Error disassembling at 0x${pc.toString(16)}: ${error.message}`);
      break;
    }
  }

  console.log('\n=== Suspicious Instructions (A0 Loading) ===\n');

  if (suspiciousInstructions.length === 0) {
    console.log('No suspicious A0 loading instructions found in first 100 instructions.');
    console.log('Port address might be loaded later in execution.');
  } else {
    suspiciousInstructions.forEach(instr => {
      console.log(`0x${instr.pc.toString(16)}: ${instr.bytes} ${instr.instruction}`);
    });
  }

  console.log('\n=== Next Steps ===\n');
  console.log('1. Look for MOVE.L instructions that load A0 before GetMsg/WaitPort calls');
  console.log('2. Trace execution to see when A0 changes from 0xa0000 to 0x7500002f');
  console.log('3. Find the memory address being read');
  console.log('4. Initialize that memory with correct port address (0xa0000)');
}

disassembleDoor().catch(console.error);
