import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';
import { AmigaDosEnvironment } from '../api/AmigaDosEnvironment';

// Helper to convert long to bytes (big-endian)
function longToBytes(value: number): number[] {
  return [
    (value >> 24) & 0xFF,
    (value >> 16) & 0xFF,
    (value >> 8) & 0xFF,
    value & 0xFF
  ];
}

async function testAmigaDosTrap() {
  console.log('=== Testing AmigaDOS Library Trap Handling ===\n');

  // Initialize emulator
  const emulator = new MoiraEmulator();
  await emulator.initialize();
  console.log('✓ Emulator initialized');

  // Create AmigaDOS environment
  const amigaDos = new AmigaDosEnvironment(emulator);
  console.log('✓ AmigaDOS environment created');

  // Capture output
  let capturedOutput = '';
  amigaDos.setOutputCallback((data: string) => {
    capturedOutput += data;
    console.log(`[OUTPUT] ${data}`);
  });

  /*
   * Test Program: Write "Hello from Amiga!" to stdout
   *
   * This program will:
   * 1. Get stdout handle using dos.library Output()
   * 2. Write text using dos.library Write()
   * 3. STOP
   */

  const message = 'Hello from Amiga!';
  const messageAddr = 0x2000;

  // Write message to memory
  for (let i = 0; i < message.length; i++) {
    emulator.writeMemory(messageAddr + i, message.charCodeAt(i));
  }

  // Create test program
  const testProgram = new Uint8Array([
    // Get stdout handle: JSR dos.library Output() (offset -60 = 0xFFFFFFC4)
    0x4E, 0xB9,       // JSR absolute.long
    0xFF, 0xFF,       // Address high word (0xFFFF)
    0xFF, 0xC4,       // Address low word (0xFFC4) = -60

    // D0 now contains stdout handle (2)
    // Move stdout handle to D1 for Write()
    0x22, 0x00,       // MOVE.L D0,D1

    // Set up parameters for Write()
    // D1 = file handle (already set)
    // D2 = buffer address
    // D3 = length
    0x24, 0x3C,       // MOVE.L #messageAddr,D2
    ...longToBytes(messageAddr),
    0x26, 0x3C,       // MOVE.L #length,D3
    ...longToBytes(message.length),

    // Call Write: JSR dos.library Write() (offset -48 = 0xFFFFFFD0)
    0x4E, 0xB9,       // JSR absolute.long
    0xFF, 0xFF,       // Address high word
    0xFF, 0xD0,       // Address low word (0xFFD0) = -48

    // STOP
    0x4E, 0x72,       // STOP #$2000
    0x20, 0x00
  ]);

  // Set up reset vectors
  emulator.writeMemory(0x0000, 0x00);
  emulator.writeMemory(0x0001, 0x00);
  emulator.writeMemory(0x0002, 0x80);
  emulator.writeMemory(0x0003, 0x00); // SSP = 0x00008000

  emulator.writeMemory(0x0004, 0x00);
  emulator.writeMemory(0x0005, 0x00);
  emulator.writeMemory(0x0006, 0x10);
  emulator.writeMemory(0x0007, 0x00); // PC = 0x00001000

  // Load program
  emulator.loadProgram(testProgram, 0x1000);
  console.log('✓ Test program loaded at 0x1000');

  // Reset CPU
  emulator.reset();
  console.log('✓ CPU reset with vectors');

  // Execute
  console.log('\n--- Executing program ---');
  try {
    emulator.execute(10000);
  } catch (error) {
    // STOP instruction will cause halt
    console.log('Program halted (expected)');
  }

  console.log('\n--- Test Results ---');
  if (capturedOutput === message) {
    console.log(`✅ TEST PASSED: Output matched expected`);
    console.log(`   Expected: "${message}"`);
    console.log(`   Got:      "${capturedOutput}"`);
  } else {
    console.log(`❌ TEST FAILED: Output mismatch`);
    console.log(`   Expected: "${message}"`);
    console.log(`   Got:      "${capturedOutput}"`);
  }

  // Cleanup
  emulator.cleanup();
  console.log('\n✓ Cleanup complete');
}

// Run test
testAmigaDosTrap().catch(console.error);
