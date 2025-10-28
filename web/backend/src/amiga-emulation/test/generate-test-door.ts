/**
 * Generate a simple test Amiga door executable
 * This creates a Hunk file with a door that outputs text and waits for input
 */

import * as fs from 'fs';
import * as path from 'path';

// Helper to convert long to bytes (big-endian)
function longToBytes(value: number): number[] {
  return [
    (value >> 24) & 0xFF,
    (value >> 16) & 0xFF,
    (value >> 8) & 0xFF,
    value & 0xFF
  ];
}

/**
 * Create a test door that:
 * 1. Gets stdout handle
 * 2. Writes "Welcome to Test Door!\r\n"
 * 3. Writes "Press ENTER to continue...\r\n"
 * 4. Waits for input
 * 5. Writes "Goodbye!\r\n"
 * 6. Exits
 */
function generateTestDoor(): Buffer {
  const message1 = 'Welcome to Test Door!\r\n';
  const message2 = 'Press ENTER to continue...\r\n';
  const message3 = 'Goodbye!\r\n';

  // Calculate where HunkLoader will place segments
  const CODE_BASE = 0x1000;
  const CODE_SIZE = 108; // Will be calculated, but approximately this
  // Data segment will be at CODE_BASE + CODE_SIZE, aligned to 256 bytes
  const DATA_BASE = ((CODE_BASE + CODE_SIZE + 0xFF) & ~0xFF); // = 0x1100

  // Data section: strings
  const dataSection: number[] = [];

  // Message 1
  const msg1Offset = 0;
  for (let i = 0; i < message1.length; i++) {
    dataSection.push(message1.charCodeAt(i));
  }

  // Message 2
  const msg2Offset = dataSection.length;
  for (let i = 0; i < message2.length; i++) {
    dataSection.push(message2.charCodeAt(i));
  }

  // Message 3
  const msg3Offset = dataSection.length;
  for (let i = 0; i < message3.length; i++) {
    dataSection.push(message3.charCodeAt(i));
  }

  // Input buffer (80 bytes)
  const inputBufOffset = dataSection.length;
  for (let i = 0; i < 80; i++) {
    dataSection.push(0);
  }

  // Pad to long word boundary
  while (dataSection.length % 4 !== 0) {
    dataSection.push(0);
  }

  // Code section
  const code: number[] = [
    // Get stdout: JSR dos.library Output() (offset -60)
    0x4E, 0xB9, 0xFF, 0xFF, 0xFF, 0xC4,  // JSR 0xFFFFFFC4
    // D0 now has stdout handle (2)

    // Write message 1
    0x22, 0x00,                           // MOVE.L D0,D1 (file handle)
    0x24, 0x3C, ...longToBytes(msg1Offset + DATA_BASE), // MOVE.L #msg1,D2 (buffer)
    0x26, 0x3C, ...longToBytes(message1.length),         // MOVE.L #len1,D3 (length)
    0x4E, 0xB9, 0xFF, 0xFF, 0xFF, 0xD0,  // JSR Write (offset -48)

    // Write message 2
    0x4E, 0xB9, 0xFF, 0xFF, 0xFF, 0xC4,  // JSR Output() (get stdout again)
    0x22, 0x00,                           // MOVE.L D0,D1
    0x24, 0x3C, ...longToBytes(msg2Offset + DATA_BASE), // MOVE.L #msg2,D2
    0x26, 0x3C, ...longToBytes(message2.length),         // MOVE.L #len2,D3
    0x4E, 0xB9, 0xFF, 0xFF, 0xFF, 0xD0,  // JSR Write

    // Get stdin: JSR dos.library Input() (offset -54)
    0x4E, 0xB9, 0xFF, 0xFF, 0xFF, 0xCA,  // JSR 0xFFFFFFCA
    // D0 now has stdin handle (1)

    // Read input: Read(stdin, buffer, 80)
    0x22, 0x00,                           // MOVE.L D0,D1 (file handle)
    0x24, 0x3C, ...longToBytes(inputBufOffset + DATA_BASE), // MOVE.L #inputBuf,D2
    0x26, 0x3C, ...longToBytes(80),       // MOVE.L #80,D3
    0x4E, 0xB9, 0xFF, 0xFF, 0xFF, 0xD6,  // JSR Read (offset -42)

    // Write message 3
    0x4E, 0xB9, 0xFF, 0xFF, 0xFF, 0xC4,  // JSR Output()
    0x22, 0x00,                           // MOVE.L D0,D1
    0x24, 0x3C, ...longToBytes(msg3Offset + DATA_BASE), // MOVE.L #msg3,D2
    0x26, 0x3C, ...longToBytes(message3.length),         // MOVE.L #len3,D3
    0x4E, 0xB9, 0xFF, 0xFF, 0xFF, 0xD0,  // JSR Write

    // Exit
    0x4E, 0x72, 0x20, 0x00                // STOP #$2000
  ];

  // Pad code to long word boundary
  while (code.length % 4 !== 0) {
    code.push(0);
  }

  // Build Hunk file
  const hunk: number[] = [];

  // HUNK_HEADER (0x000003F3)
  hunk.push(0x00, 0x00, 0x03, 0xF3);

  // No resident libraries
  hunk.push(0x00, 0x00, 0x00, 0x00);

  // Table size (2 segments: code + data)
  hunk.push(0x00, 0x00, 0x00, 0x02);

  // First hunk (0) to last hunk (1)
  hunk.push(0x00, 0x00, 0x00, 0x00);
  hunk.push(0x00, 0x00, 0x00, 0x01);

  // Size of hunk 0 (code) in longs
  hunk.push(...longToBytes(code.length / 4));

  // Size of hunk 1 (data) in longs
  hunk.push(...longToBytes(dataSection.length / 4));

  // HUNK_CODE (0x000003E9)
  hunk.push(0x00, 0x00, 0x03, 0xE9);

  // Size in longs
  hunk.push(...longToBytes(code.length / 4));

  // Code data
  hunk.push(...code);

  // HUNK_END (0x000003F2) - End of CODE segment
  hunk.push(0x00, 0x00, 0x03, 0xF2);

  // HUNK_DATA (0x000003EA)
  hunk.push(0x00, 0x00, 0x03, 0xEA);

  // Size in longs
  hunk.push(...longToBytes(dataSection.length / 4));

  // Data
  hunk.push(...dataSection);

  // HUNK_END (0x000003F2) - End of DATA segment
  hunk.push(0x00, 0x00, 0x03, 0xF2);

  return Buffer.from(hunk);
}

// Generate and save test door
const testDoor = generateTestDoor();
const outputPath = path.join(__dirname, '../../../doors/test-door');

// Create doors directory if it doesn't exist
const doorsDir = path.dirname(outputPath);
if (!fs.existsSync(doorsDir)) {
  fs.mkdirSync(doorsDir, { recursive: true });
}

fs.writeFileSync(outputPath, testDoor);

console.log(`✅ Test door generated: ${outputPath} (${testDoor.length} bytes)`);
console.log('');
console.log('To test the door:');
console.log('1. Start the backend server: npm run dev');
console.log('2. Connect via Socket.io and emit:');
console.log('   socket.emit("door:launch", { doorId: "test-door" })');
console.log('3. Listen for door:output events');
console.log('4. Send input with: socket.emit("door:input", "test\\r\\n")');
