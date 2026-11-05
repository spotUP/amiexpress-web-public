#!/usr/bin/env npx tsx
/**
 * Trace joincnf NCONFS parsing
 *
 * This script loads joincnf and traces how it reads and parses NCONFS from ConfConfig.info
 * Usage: npx tsx dev/scripts/trace-joincnf-nconfs.ts
 */

import { MoiraEmulator, CPURegister } from '../../web/backend/src/amiga-emulation/cpu/MoiraEmulator';
import { HunkLoader } from '../../web/backend/src/amiga-emulation/loader/HunkLoader';
import { IconLibrary } from '../../web/backend/src/amiga-emulation/api/IconLibrary';
import * as fs from 'fs';
import * as path from 'path';
import { boardRoot } from '../../web/backend/src/utils/board-root.util';

const BBS_ROOT = boardRoot();
const DOOR_PATH = path.join(BBS_ROOT, 'doors/emp_tools/joincnf');

async function main() {
  console.log('=== Joincnf NCONFS Trace ===\n');

  // Initialize emulator
  const emulator = new MoiraEmulator();
  await emulator.initialize();
  console.log('[OK] Emulator initialized');

  // Load the door binary
  const doorData = fs.readFileSync(DOOR_PATH);
  const hunkLoader = new HunkLoader();
  const hunkFile = hunkLoader.parse(doorData);
  const loadInfo = hunkLoader.load(emulator, hunkFile);

  if (!loadInfo) {
    console.error('ERROR: Failed to load joincnf');
    process.exit(1);
  }

  console.log(`[OK] Door loaded at 0x${loadInfo.entryPoint.toString(16)}`);
  console.log(`     Segments: ${loadInfo.segments.length}`);
  for (const seg of loadInfo.segments) {
    console.log(`       ${seg.type}: 0x${seg.loadAddress.toString(16)}, ${seg.size} bytes`);
  }

  // Get CPU and enable native debugging
  const cpu = emulator['cpu'];
  if (!cpu?.nativeEnableLogging) {
    console.error('ERROR: Native debugging not available');
    process.exit(1);
  }

  console.log('\n[OK] Native debugging available');

  // Enable instruction logging
  cpu.nativeEnableLogging();
  console.log('[OK] Instruction logging enabled');

  // Calculate actual runtime addresses from file offsets
  // File offset 0x28 corresponds to entry point 0x1008
  const codeBase = loadInfo.entryPoint; // 0x1008
  const fileBase = 0x28; // First code after hunk header

  const toRuntimeAddr = (fileOffset: number) => codeBase + (fileOffset - fileBase);

  // Find DATA segment
  const dataSegment = loadInfo.segments.find(s => s.type === 'DATA');
  const dataSegAddr = dataSegment?.loadAddress || 0xc308;

  // Key addresses (file offsets from radare2):
  // 0x982: movea.l 0x36(a0), a3  - Read do_ToolTypes
  // 0x98c: jsr -0x60(a6)         - Call (maybe FindToolType?)
  // 0x998: bsr.w 0x5340          - Call atoi
  // 0x99c: move.l d0, -0x6fd0(a4) - Store NCONFS value
  // 0x9d6: cmp.l -0x6fd0(a4), d7 - Compare counter to NCONFS

  const BP_READ_TOOLTYPES = toRuntimeAddr(0x982);
  const BP_CALL_FINDTOOLTYPE = toRuntimeAddr(0x98c);
  const BP_CALL_ATOI = toRuntimeAddr(0x998);
  const BP_STORE_NCONFS = toRuntimeAddr(0x99c);
  const BP_LOOP_COMPARE = toRuntimeAddr(0x9d6);

  console.log('\nBreakpoint addresses (converted from file offsets):');
  console.log(`  Read do_ToolTypes:    0x${BP_READ_TOOLTYPES.toString(16)} (file 0x982)`);
  console.log(`  Call FindToolType:    0x${BP_CALL_FINDTOOLTYPE.toString(16)} (file 0x98c)`);
  console.log(`  Call atoi:            0x${BP_CALL_ATOI.toString(16)} (file 0x998)`);
  console.log(`  Store NCONFS:         0x${BP_STORE_NCONFS.toString(16)} (file 0x99c)`);
  console.log(`  Loop comparison:      0x${BP_LOOP_COMPARE.toString(16)} (file 0x9d6)`);

  // Set breakpoints on key addresses
  cpu.nativeSetBreakpoint(BP_STORE_NCONFS);
  cpu.nativeSetBreakpoint(BP_LOOP_COMPARE);
  console.log('\n[OK] Breakpoints set');

  // Set watchpoints on tooltypes memory
  const watchAddrs = [
    0x60000,  // DiskObject base
    0x60036,  // do_ToolTypes field
    0x60100,  // Tooltypes array
    0x60200,  // First tooltype string (NCONFS)
    0x60207,  // NCONFS value "14"
  ];
  for (const addr of watchAddrs) {
    cpu.nativeSetWatchpoint(addr);
  }
  console.log(`[OK] Watchpoints set on: ${watchAddrs.map(a => '0x' + a.toString(16)).join(', ')}`);

  // Initialize icon.library for ConfConfig.info access
  const iconLib = new IconLibrary(emulator, BBS_ROOT);
  iconLib.setDoorDirectory(path.dirname(DOOR_PATH));
  iconLib.setDoorCommand('J');

  // Set up minimal memory environment
  // A4 base register (data segment)
  console.log(`\nData segment at: 0x${dataSegAddr.toString(16)}`);

  // Set up initial registers
  emulator.setRegister(CPURegister.PC, loadInfo.entryPoint);
  emulator.setRegister(CPURegister.A7, 0x17dec); // Stack
  emulator.setRegister(CPURegister.A4, 0x14306); // Data base (from original log)
  emulator.setRegister(CPURegister.A5, 0x17df8); // Frame pointer
  emulator.setRegister(CPURegister.A6, 0x80000); // ExecBase

  // Calculate where NCONFS will be stored: -0x6fd0(a4)
  const a4 = emulator.getRegister(CPURegister.A4);
  const nconfsStorage = (a4 - 0x6fd0) >>> 0;
  console.log(`NCONFS storage location: 0x${nconfsStorage.toString(16)} = A4(0x${a4.toString(16)}) - 0x6fd0`);

  // Add watchpoint on NCONFS storage
  cpu.nativeSetWatchpoint(nconfsStorage);
  console.log(`[OK] Watchpoint set on NCONFS storage at 0x${nconfsStorage.toString(16)}`);

  // Set up arguments (node number "1")
  const argsAddr = 0xf0100;
  emulator.writeMemory(argsAddr, '1'.charCodeAt(0));
  emulator.writeMemory(argsAddr + 1, '\n'.charCodeAt(0));
  emulator.writeMemory(argsAddr + 2, 0);
  emulator.setRegister(CPURegister.A0, argsAddr);
  emulator.setRegister(CPURegister.D0, 2); // arg length

  console.log('\n=== Starting Execution ===\n');
  console.log('Will trace up to 50000 instructions or until we hit a key breakpoint...\n');

  let hitBreakpoint = false;
  let iterations = 0;
  const maxIterations = 50000;

  // Track interesting events
  let sawStoreNconfs = false;
  let sawLoopCompare = false;
  let nconfsValue = 0;

  while (!hitBreakpoint && iterations < maxIterations) {
    const pc = emulator.getRegister(CPURegister.PC);

    // Check for our key breakpoints
    if (cpu.hasNativeBreakpointHit()) {
      const bpAddr = cpu.getNativeBreakpointAddr();
      console.log(`\n[BREAKPOINT] Hit at PC=0x${bpAddr.toString(16)}`);

      if (bpAddr === BP_STORE_NCONFS) {
        // About to store NCONFS - D0 contains the atoi result
        const d0 = emulator.getRegister(CPURegister.D0);
        console.log(`  === STORE NCONFS ===`);
        console.log(`  D0 (atoi result) = ${d0} (0x${d0.toString(16)})`);
        nconfsValue = d0;
        sawStoreNconfs = true;
        cpu.clearNativeBreakpointHit();
      } else if (bpAddr === BP_LOOP_COMPARE) {
        // Loop comparison - D7 is counter, -0x6fd0(a4) is NCONFS
        const d7 = emulator.getRegister(CPURegister.D7);
        const storedNconfs = emulator.readMemory32(nconfsStorage);
        console.log(`  === LOOP COMPARISON ===`);
        console.log(`  D7 (counter) = ${d7}`);
        console.log(`  NCONFS stored at 0x${nconfsStorage.toString(16)} = ${storedNconfs}`);
        sawLoopCompare = true;

        if (storedNconfs === 0) {
          console.log(`\n  [ERROR] NCONFS is 0! Loop will not execute!`);
          hitBreakpoint = true;
        }
        cpu.clearNativeBreakpointHit();
      } else {
        cpu.clearNativeBreakpointHit();
      }
    }

    // Check for watchpoint hits
    if (cpu.hasNativeWatchpointHit()) {
      const watchAddr = cpu.getNativeWatchpointAddr();
      console.log(`[WATCHPOINT] Access at 0x${watchAddr.toString(16)}, PC=0x${pc.toString(16)}`);

      if (watchAddr === nconfsStorage) {
        const value = emulator.readMemory32(nconfsStorage);
        console.log(`  NCONFS storage value = ${value}`);
      }

      cpu.clearNativeWatchpointHit();
    }

    // Execute one instruction
    try {
      emulator.executeInstruction();
    } catch (e) {
      console.log(`\n[EXCEPTION] ${e}`);
      hitBreakpoint = true;
    }

    iterations++;

    // Progress indicator every 10000 instructions
    if (iterations % 10000 === 0) {
      console.log(`... ${iterations} instructions, PC=0x${pc.toString(16)}`);
    }
  }

  console.log(`\n=== Execution Summary ===`);
  console.log(`Total instructions: ${iterations}`);
  console.log(`Saw STORE_NCONFS breakpoint: ${sawStoreNconfs}`);
  console.log(`Saw LOOP_COMPARE breakpoint: ${sawLoopCompare}`);
  if (sawStoreNconfs) {
    console.log(`NCONFS value from atoi: ${nconfsValue}`);
  }

  // Dump instruction log
  const logCount = cpu.nativeLoggedInstructions?.() || 0;
  if (logCount > 0) {
    console.log(`\n=== Last ${Math.min(logCount, 50)} Instructions ===`);
    const start = Math.max(0, logCount - 50);
    for (let i = start; i < logCount; i++) {
      const logPc = cpu.nativeGetLogEntryPC?.(i) || 0;
      const disasm = cpu.nativeDisassemble?.(logPc) || '???';
      console.log(`  0x${logPc.toString(16).padStart(6, '0')}: ${disasm}`);
    }
  }

  console.log('\nTrace complete.');
}

main().catch(console.error);
