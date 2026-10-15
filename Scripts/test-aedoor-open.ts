#!/usr/bin/env npx tsx
/**
 * Minimal test to trace AEDoor.library opening
 * Creates a mock door that only calls OpenLibrary("AEDoor.library", 2)
 */

import { Moira } from '../web/backend/src/amiga-emulation/cpu/Moira';
import { ExecLibrary } from '../web/backend/src/amiga-emulation/api/ExecLibrary';
import { AmigaDosEnvironment } from '../web/backend/src/amiga-emulation/AmigaDosEnvironment';

async function testAEDoorOpen() {
  console.log('=== AEDoor.library Open Test ===\n');

  // Initialize emulator
  const emulator = new Moira();
  const execBase = 0x80000;
  const codeBase = 0x1000;

  // Create a simple test program:
  // 0x1000: movea.l #0x4, a6      ; Load ExecBase from absolute 4
  // 0x1004: lea.l libname(pc), a1 ; Load library name
  // 0x1008: moveq #2, d0          ; Version 2
  // 0x100a: jsr -$228(a6)         ; OpenLibrary
  // 0x100e: trap #0               ; Exit with D0 = result
  // 0x1010: "AEDoor.library\0"

  // First, write ExecBase pointer at address 4
  emulator.writeMemory32(4, execBase);

  // Write the test code
  let pc = codeBase;

  // movea.l $4.w, a6 (2c78 0004)
  emulator.writeMemory16(pc, 0x2c78);
  emulator.writeMemory16(pc + 2, 0x0004);
  pc += 4;

  // lea.l libname(pc), a1 - calculate offset to string
  // At this point PC will be at 0x1004, string at 0x1010
  // Offset = 0x1010 - 0x1006 = 0xa (relative to PC after reading instruction)
  emulator.writeMemory16(pc, 0x43fa); // lea.l (d16,pc), a1
  emulator.writeMemory16(pc + 2, 0x000a);
  pc += 4;

  // moveq #2, d0 (7002)
  emulator.writeMemory16(pc, 0x7002);
  pc += 2;

  // jsr -$228(a6) = jsr -552(a6) for OpenLibrary (4eae fdd8)
  emulator.writeMemory16(pc, 0x4eae);
  emulator.writeMemory16(pc + 2, 0xfdd8);
  pc += 4;

  // trap #0 (4e40) - use as breakpoint
  emulator.writeMemory16(pc, 0x4e40);
  pc += 2;

  // Write library name string
  const libName = 'AEDoor.library\0';
  for (let i = 0; i < libName.length; i++) {
    emulator.writeMemory(pc + i, libName.charCodeAt(i));
  }

  // Set up ExecLibrary with vectors
  const execLib = new ExecLibrary(emulator, execBase);

  // Load AEDoor.library
  console.log('Loading AEDoor.library...');
  execLib.loadRealAEDoorLibrary();

  // Set initial CPU state
  emulator.setPC(codeBase);
  emulator.setRegister(14, execBase); // A6 = ExecBase
  emulator.setRegister(15, 0xa000);   // A7 = Stack

  console.log(`\nInitial state:`);
  console.log(`  PC=0x${emulator.getPC().toString(16)}`);
  console.log(`  A6=0x${emulator.getRegister(14).toString(16)}`);
  console.log(`  A7=0x${emulator.getRegister(15).toString(16)}`);

  // Execute with trap handling
  let stepCount = 0;
  const maxSteps = 100;
  let trapHit = false;

  while (stepCount < maxSteps && !trapHit) {
    const pc = emulator.getPC();
    const opcode = emulator.readMemory16(pc);

    console.log(`\nStep ${stepCount}: PC=0x${pc.toString(16)} opcode=0x${opcode.toString(16)}`);

    // Check for trap or JSR to ExecBase
    if ((opcode & 0xfff0) === 0x4e40) {
      // TRAP instruction
      console.log(`  TRAP #${opcode & 0xf}`);
      trapHit = true;
      break;
    }

    // Check if this is JSR to library vector
    if (opcode === 0x4eae) {
      const offset = (emulator.readMemory16(pc + 2) << 16) >> 16; // Sign extend
      const targetAddr = emulator.getRegister(14) + offset;
      console.log(`  JSR ${offset}(a6) -> target 0x${targetAddr.toString(16)}`);

      // Read what's at the target
      const targetOpcode = emulator.readMemory16(targetAddr);
      console.log(`  Target opcode: 0x${targetOpcode.toString(16)}`);

      // Handle OpenLibrary trap ourselves
      if (offset === -552) {
        console.log(`  === OpenLibrary trap ===`);
        const libNameAddr = emulator.getRegister(9); // A1
        const version = emulator.getRegister(0);     // D0

        // Read library name
        let name = '';
        let addr = libNameAddr;
        while (true) {
          const c = emulator.readMemory(addr);
          if (c === 0) break;
          name += String.fromCharCode(c);
          addr++;
        }
        console.log(`  Library: "${name}", version: ${version}`);

        // Call our OpenLibrary
        const result = execLib.openLibrary(libNameAddr, version);
        console.log(`  Result: 0x${result.toString(16)}`);

        // Set D0 and advance past JSR
        emulator.setRegister(0, result);
        emulator.setPC(pc + 4);
        stepCount++;
        continue;
      }
    }

    // Execute one instruction
    emulator.executeInstruction();
    stepCount++;
  }

  console.log(`\n=== Final state ===`);
  console.log(`  D0 (result) = 0x${emulator.getRegister(0).toString(16)}`);
  console.log(`  Steps executed: ${stepCount}`);
  console.log(`  Trap hit: ${trapHit}`);

  if (emulator.getRegister(0) !== 0) {
    console.log('\n[OK] OpenLibrary returned non-zero (success)');
  } else {
    console.log('\n[FAIL] OpenLibrary returned 0 (failure)');
  }
}

testAEDoorOpen().catch(console.error);
