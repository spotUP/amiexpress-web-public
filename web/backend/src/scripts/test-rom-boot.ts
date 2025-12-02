/**
 * Test ROM Boot - Attempt to boot Kickstart ROM and see what it needs
 *
 * This will help us understand:
 * 1. What hardware the ROM expects
 * 2. How far we can get before needing hardware emulation
 * 3. If we can use ROM exec.library instead of our trap handlers
 */

import { MoiraEmulator } from '../amiga-emulation/cpu/MoiraEmulator';
import * as fs from 'fs';
import * as path from 'path';

async function testRomBoot() {
  console.log('[ROM Boot Test] Starting...\n');

  // Create emulator
  const emulator = new MoiraEmulator();
  await emulator.initialize();

  // Load Kickstart ROM
  const romPath = path.join(process.cwd(), 'data/amiga-roms/Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom');
  if (!fs.existsSync(romPath)) {
    console.error('[ROM Boot Test] ROM not found at:', romPath);
    process.exit(1);
  }

  const romData = fs.readFileSync(romPath);
  console.log(`[ROM Boot Test] Loaded ROM: ${romData.length} bytes (${romData.length/1024}KB)`);

  // Load ROM into emulator (maps to 0xF80000 - 0xFFFFFF)
  emulator.loadROM(new Uint8Array(romData));
  console.log('[ROM Boot Test] ROM mapped to 0xF80000 - 0xFFFFFF\n');

  // Read reset vectors from ROM
  const ROM_BASE = 0xF80000;
  const initialSSP = emulator.readMemory32(ROM_BASE + 0);
  const initialPC = emulator.readMemory32(ROM_BASE + 4);

  console.log('[ROM Boot Test] Reset Vectors:');
  console.log(`  Initial SSP: 0x${initialSSP.toString(16).padStart(8, '0')}`);
  console.log(`  Initial PC:  0x${initialPC.toString(16).padStart(8, '0')}`);

  // Set up CPU for ROM boot
  // CRITICAL: On M68K, registers 15=A7(SP), 16=PC, 17=SR
  emulator.setRegister(17, 0x2700); // SR (supervisor mode, interrupts disabled) - SET FIRST!
  emulator.setRegister(15, initialSSP); // A7 (SP)
  emulator.setRegister(16, initialPC); // PC

  console.log('\n[ROM Boot Test] CPU initialized for ROM boot:');
  const verifySP = emulator.getRegister(15);
  const verifySR = emulator.getRegister(17);
  const verifyPC = emulator.getRegister(16);
  console.log(`  SP: 0x${verifySP.toString(16)} (expected: 0x${initialSSP.toString(16)})`);
  console.log(`  SR: 0x${verifySR.toString(16)} (supervisor mode)`);
  console.log(`  PC: 0x${verifyPC.toString(16)} (expected: 0x${initialPC.toString(16)})`);

  // Prefill instruction queue
  emulator.refillPrefetch();

  console.log('\n[ROM Boot Test] Starting ROM execution...\n');

  // Track memory access patterns
  let lastPC = 0;
  let samePCCount = 0;
  let instructionCount = 0;
  const maxInstructions = 50000; // Run 50K instructions - ROM boot takes time!

  // Track unusual memory accesses (potential hardware access)
  const hardwareRanges = [
    { start: 0xBFD000, end: 0xBFFFFF, name: 'CIA-A' },
    { start: 0xBFE000, end: 0xBFEFFF, name: 'CIA-B' },
    { start: 0xDFF000, end: 0xDFFFFF, name: 'Custom Chips' },
  ];

  try {
    for (let i = 0; i < maxInstructions; i++) {
      const pc = emulator.getRegister(16);

      // Check for infinite loop
      if (pc === lastPC) {
        samePCCount++;
        if (samePCCount > 10) {
          console.log(`\n[ROM Boot Test] STOPPED: Infinite loop at PC=0x${pc.toString(16)}`);
          break;
        }
      } else {
        samePCCount = 0;
      }
      lastPC = pc;

      // Log every 5000 instructions
      if (i % 5000 === 0) {
        const sp = emulator.getRegister(15);
        const d0 = emulator.getRegister(0);
        const a0 = emulator.getRegister(8);
        console.log(`[ROM Boot Test] Instruction ${i}: PC=0x${pc.toString(16).padStart(8, '0')} SP=0x${sp.toString(16)} D0=0x${d0.toString(16)} A0=0x${a0.toString(16)}`);
      }

      // Execute one instruction
      const cycles = emulator.execute(1);
      instructionCount++;

      // Check if PC jumped to weird location
      const newPC = emulator.getRegister(16);

      // Check for hardware access (this is just logging, won't stop execution)
      for (const range of hardwareRanges) {
        if (newPC >= range.start && newPC <= range.end) {
          console.log(`\n[ROM Boot Test] *** HARDWARE ACCESS DETECTED ***`);
          console.log(`  Accessing ${range.name} at PC=0x${newPC.toString(16)}`);
          console.log(`  This indicates ROM needs hardware emulation`);
        }
      }

      // Check for illegal instruction or exception
      if (cycles === 0) {
        console.log(`\n[ROM Boot Test] STOPPED: Exception or illegal instruction at PC=0x${pc.toString(16)}`);
        break;
      }
    }

    console.log(`\n[ROM Boot Test] Executed ${instructionCount} instructions`);

    // Check if ExecBase was created
    const execBasePtr = emulator.readMemory32(0x4);
    console.log(`\n[ROM Boot Test] ExecBase check:`);
    console.log(`  Pointer at 0x000004: 0x${execBasePtr.toString(16).padStart(8, '0')}`);

    if (execBasePtr !== 0 && execBasePtr > 0x1000 && execBasePtr < 0x100000) {
      console.log(`  *** ExecBase appears to be initialized! ***`);
      console.log(`  ROM boot was successful (at least partially)`);

      // Try to read ExecBase structure
      const libVersion = emulator.readMemory16(execBasePtr + 20);
      const libRevision = emulator.readMemory16(execBasePtr + 22);
      console.log(`  Exec Version: ${libVersion}.${libRevision}`);
    } else {
      console.log(`  ExecBase not initialized yet (or invalid)`);
      console.log(`  ROM needs more execution or hardware emulation`);
    }

  } catch (error: any) {
    console.error(`\n[ROM Boot Test] ERROR: ${error.message}`);
    console.error(`  PC: 0x${emulator.getRegister(16).toString(16)}`);
    console.error(`  SP: 0x${emulator.getRegister(15).toString(16)}`);
  }

  console.log('\n[ROM Boot Test] Complete');
}

testRomBoot().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
