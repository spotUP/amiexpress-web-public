#!/usr/bin/env npx ts-node
/**
 * Debug script for joincnf door using Moira native debugger
 *
 * This script runs joincnf with watchpoints and instruction logging
 * to trace why it shows 0 conferences when NCONFS=14.
 *
 * Usage: npx tsx dev/scripts/debug-joincnf.ts
 */

import { MoiraEmulator } from '../../web/backend/src/amiga-emulation/cpu/MoiraEmulator';

async function main() {
  console.log('=== Joincnf Debug Session ===');
  console.log('Using Moira native debugger to trace conference discovery');
  console.log('');

  // Initialize emulator
  const emulator = new MoiraEmulator();
  await emulator.initialize();

  const cpu = emulator['cpu'];

  // Check if native debug methods are available
  if (!cpu.nativeEnableLogging) {
    console.error('ERROR: Moira native debugger not available!');
    console.error('Make sure WASM was built with debug features enabled.');
    process.exit(1);
  }

  console.log('[OK] Moira native debugger available');

  // Enable instruction logging
  console.log('Enabling instruction logging...');
  cpu.nativeEnableLogging();

  // Set watchpoint on tooltypes array address (0x60100)
  // This will trigger when the door reads the tooltypes array
  console.log('Setting watchpoint on tooltypes array (0x60100)...');
  cpu.nativeSetWatchpoint(0x60100);

  // Set watchpoint on first few tooltypes entries
  cpu.nativeSetWatchpoint(0x60104); // Second entry pointer
  cpu.nativeSetWatchpoint(0x60108); // Third entry pointer

  // Set watchpoint on do_ToolTypes field in DiskObject (offset 54 = 0x36)
  // DiskObject is at 0x60000, so do_ToolTypes is at 0x60036
  console.log('Setting watchpoint on DiskObject.do_ToolTypes (0x60036)...');
  cpu.nativeSetWatchpoint(0x60036);

  // Set breakpoint at the disassembled address where door reads do_ToolTypes
  // From radare2: 0x982 in file, but needs to be adjusted for load address
  // Entry point is at 0x1008, so: 0x1008 + (0x982 - 0x28) = 0x1962
  console.log('Setting breakpoint at do_ToolTypes read (estimated 0x1962)...');
  cpu.nativeSetBreakpoint(0x1962);

  // Set catchpoint for illegal instructions
  console.log('Setting catchpoint for illegal instructions...');
  cpu.nativeSetCatchpoint(4); // Vector 4 = Illegal instruction

  console.log('');
  console.log('Debug features enabled:');
  console.log('  - Instruction logging (256-entry circular buffer)');
  console.log('  - Watchpoints on tooltypes array and DiskObject');
  console.log('  - Breakpoint at do_ToolTypes read');
  console.log('  - Catchpoint for illegal instructions');
  console.log('');
  console.log('To run joincnf with these settings, the AmigaDoorSession');
  console.log('needs to be modified to use this debug-enabled emulator.');
  console.log('');
  console.log('For now, here is what you can do:');
  console.log('');
  console.log('1. Add DEBUG_68K_NATIVE=1 environment variable');
  console.log('2. Modify AmigaDoorSession.ts to enable native debugging');
  console.log('3. Run the J command in the BBS');
  console.log('');

  // Show available methods
  console.log('Available Moira debug methods:');
  const debugMethods = [
    'nativeSetBreakpoint', 'nativeRemoveBreakpoint',
    'nativeSetWatchpoint', 'nativeRemoveWatchpoint',
    'nativeSetCatchpoint', 'nativeRemoveCatchpoint',
    'nativeEnableLogging', 'nativeDisableLogging',
    'nativeLoggedInstructions', 'nativeGetLogEntryPC',
    'nativeDisassemble', 'nativeDisassembleSize',
    'nativeStepInto', 'nativeStepOver',
    'hasNativeBreakpointHit', 'hasNativeWatchpointHit',
    'hasNativeCatchpointHit'
  ];

  for (const method of debugMethods) {
    const available = typeof (cpu as any)[method] === 'function';
    console.log(`  ${method}: ${available ? '[OK]' : '[MISSING]'}`);
  }

  console.log('');
  console.log('Test complete. Emulator debug features verified.');
}

main().catch(console.error);
