import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';

async function testMoiraBasic() {
  console.log('Testing Moira WebAssembly emulator...');

  // Initialize emulator
  const emulator = new MoiraEmulator();
  await emulator.initialize();

  console.log('✓ Emulator initialized');

  // Simple test program: MOVE.W #$1234,D0; STOP (halt)
  // This moves 0x1234 into D0 register and halts
  const testProgram = new Uint8Array([
    0x30, 0x3C,       // MOVE.W #$1234,D0
    0x12, 0x34,       // Immediate value 0x1234
    0x4E, 0x72,       // STOP #$2000
    0x20, 0x00
  ]);

  // Set up reset vectors (68000 starts execution by reading these)
  // Address 0x0000-0x0003: Initial SSP (Supervisor Stack Pointer)
  emulator.writeMemory(0x0000, 0x00);
  emulator.writeMemory(0x0001, 0x00);
  emulator.writeMemory(0x0002, 0x20);
  emulator.writeMemory(0x0003, 0x00); // SSP = 0x00002000

  // Address 0x0004-0x0007: Initial PC (Program Counter)
  emulator.writeMemory(0x0004, 0x00);
  emulator.writeMemory(0x0005, 0x00);
  emulator.writeMemory(0x0006, 0x10);
  emulator.writeMemory(0x0007, 0x00); // PC = 0x00001000

  // Load program at 0x1000
  emulator.loadProgram(testProgram, 0x1000);
  console.log('✓ Test program loaded at 0x1000');

  // Reset CPU to load vectors
  emulator.reset();
  console.log('✓ CPU reset with vectors');

  // Execute
  const cyclesExecuted = emulator.execute(100);
  console.log(`✓ Executed ${cyclesExecuted} cycles`);

  // Check D0 register
  const d0Value = emulator.getRegister(CPURegister.D0);
  console.log(`D0 = 0x${d0Value.toString(16)}`);

  if (d0Value === 0x1234) {
    console.log('✅ TEST PASSED: D0 contains expected value 0x1234');
  } else {
    console.log(`❌ TEST FAILED: Expected 0x1234, got 0x${d0Value.toString(16)}`);
  }

  // Cleanup
  emulator.cleanup();
  console.log('✓ Cleanup complete');
}

// Run test
testMoiraBasic().catch(console.error);
