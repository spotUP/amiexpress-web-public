import { HunkLoader } from '../loader/HunkLoader';
import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';

/**
 * Generate a minimal Hunk file for testing
 *
 * This creates a simple executable with:
 * - HUNK_HEADER
 * - HUNK_CODE with a simple program
 * - HUNK_END
 */
function generateTestHunk(): Buffer {
  const chunks: Buffer[] = [];

  // Helper to write 32-bit big-endian long
  const writeLong = (value: number): void => {
    const buf = Buffer.allocUnsafe(4);
    buf.writeUInt32BE(value, 0);
    chunks.push(buf);
  };

  // Helper to write bytes
  const writeBytes = (data: number[]): void => {
    chunks.push(Buffer.from(data));
  };

  // HUNK_HEADER
  writeLong(0x3F3);         // HUNK_HEADER
  writeLong(0);             // No resident library names
  writeLong(1);             // Number of segments
  writeLong(0);             // First segment
  writeLong(0);             // Last segment
  writeLong(10);            // Segment 0 size (10 longwords = 40 bytes)

  // HUNK_CODE
  writeLong(0x3E9);         // HUNK_CODE
  writeLong(10);            // Size in longwords

  // Simple test program: MOVE.W #$ABCD,D0; STOP #$2000
  writeBytes([
    0x30, 0x3C,             // MOVE.W #$ABCD,D0
    0xAB, 0xCD,             // Immediate value
    0x4E, 0x72,             // STOP #$2000
    0x20, 0x00,
    // Padding to 40 bytes (10 longwords)
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ]);

  // HUNK_END
  writeLong(0x3F2);         // HUNK_END

  return Buffer.concat(chunks);
}

async function testHunkLoader() {
  console.log('=== Testing Hunk File Loader ===\n');

  // Generate test Hunk file
  const hunkBuffer = generateTestHunk();
  console.log(`✓ Generated test Hunk file (${hunkBuffer.length} bytes)`);

  // Parse Hunk file
  const loader = new HunkLoader();
  const hunkFile = loader.parse(hunkBuffer);

  console.log('\n--- Parsed Hunk File ---');
  console.log(`Segments: ${hunkFile.segments.length}`);
  console.log(`Entry point: 0x${hunkFile.entryPoint.toString(16)}`);

  for (let i = 0; i < hunkFile.segments.length; i++) {
    const seg = hunkFile.segments[i];
    console.log(`  Segment ${i}: ${seg.type} - ${seg.size} bytes at 0x${seg.address.toString(16)}`);
  }

  // Initialize emulator
  const emulator = new MoiraEmulator();
  await emulator.initialize();
  console.log('\n✓ Emulator initialized');

  // Load Hunk file into emulator
  loader.load(emulator, hunkFile);
  console.log('✓ Hunk file loaded into memory');

  // Set up reset vectors
  emulator.writeMemory(0x0000, 0x00);
  emulator.writeMemory(0x0001, 0x00);
  emulator.writeMemory(0x0002, 0x80);
  emulator.writeMemory(0x0003, 0x00); // SSP = 0x00008000

  // Entry point from Hunk file
  const entryPointBytes = [
    (hunkFile.entryPoint >> 24) & 0xFF,
    (hunkFile.entryPoint >> 16) & 0xFF,
    (hunkFile.entryPoint >> 8) & 0xFF,
    hunkFile.entryPoint & 0xFF
  ];
  emulator.writeMemory(0x0004, entryPointBytes[0]);
  emulator.writeMemory(0x0005, entryPointBytes[1]);
  emulator.writeMemory(0x0006, entryPointBytes[2]);
  emulator.writeMemory(0x0007, entryPointBytes[3]);

  console.log(`✓ Reset vectors set (entry point: 0x${hunkFile.entryPoint.toString(16)})`);

  // Reset CPU
  emulator.reset();

  // Execute
  console.log('\n--- Executing program ---');
  try {
    emulator.execute(1000);
  } catch (error) {
    // STOP instruction will cause halt
    console.log('Program halted (expected)');
  }

  // Check D0 register
  const d0Value = emulator.getRegister(CPURegister.D0);
  console.log(`\nD0 = 0x${d0Value.toString(16)}`);

  // Verify result
  if (d0Value === 0xABCD) {
    console.log('✅ TEST PASSED: D0 contains expected value 0xABCD');
    console.log('\nThe Hunk loader successfully:');
    console.log('  1. Parsed the Hunk file format');
    console.log('  2. Loaded code segment into memory');
    console.log('  3. Set correct entry point');
    console.log('  4. Executed the loaded program');
  } else {
    console.log(`❌ TEST FAILED: Expected 0xABCD, got 0x${d0Value.toString(16)}`);
  }

  // Cleanup
  emulator.cleanup();
  console.log('\n✓ Cleanup complete');
}

// Run test
testHunkLoader().catch(console.error);
