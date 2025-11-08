/**
 * Hello World TypeScript Door for AmiExpress-Web
 * Demonstrates TypeScript door capabilities with full BBS API
 */

import { Socket } from 'socket.io';
import { BBSApi } from '../../web/backend/src/doors/BBSApi';

interface DoorSession {
  socket: Socket;
  user: any;
  bbsSession?: any;
  bbs: BBSApi;  // Full BBS API
}

export async function runDoor(session: DoorSession) {
  const { bbs } = session;

  // Use BBS API for all operations
  bbs.clearScreen();

  // Display header using BBS API
  bbs.write('\x1b[0;36m╔══════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n');
  bbs.write('\x1b[0;36m║\x1b[0;33m                     TYPESCRIPT DOOR - HELLO WORLD                            \x1b[0;36m║\x1b[0m\r\n');
  bbs.write('\x1b[0;36m║\x1b[0;32m                Demonstrates Full BBS API Capabilities                        \x1b[0;36m║\x1b[0m\r\n');
  bbs.write('\x1b[0;36m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n\r\n');

  // Get user information from BBS API
  const user = bbs.getUser();
  if (user) {
    bbs.write(`\x1b[0;36m[ User Information ]\x1b[0m\r\n`);
    bbs.writeLine(`  Username:      ${user.username}`);
    bbs.writeLine(`  Real Name:     ${user.realname || 'Not set'}`);
    bbs.writeLine(`  Location:      ${user.location || 'Unknown'}`);
    bbs.writeLine(`  Security:      ${user.secLevel}`);
    bbs.writeLine(`  Total Calls:   ${user.numCalls || 0}`);
    bbs.writeLine('');
  }

  // Get node and system information
  const nodeId = bbs.getNodeNumber();
  const sysInfo = bbs.getSystemInfo();
  const conference = bbs.getCurrentConferenceName();

  bbs.write(`\x1b[0;36m[ System Information ]\x1b[0m\r\n`);
  bbs.writeLine(`  BBS Name:      ${sysInfo.bbsName}`);
  bbs.writeLine(`  Sysop:         ${sysInfo.sysopName}`);
  bbs.writeLine(`  Node:          ${nodeId}`);
  bbs.writeLine(`  Conference:    ${conference}`);
  bbs.writeLine(`  Time Online:   ${bbs.getTimeOnline()} minutes`);
  bbs.writeLine(`  Time Left:     ${bbs.getTimeRemaining()} minutes`);
  bbs.writeLine('');

  // Interactive examples demonstrating input functions
  bbs.write('\x1b[0;36m[ Interactive Demo ]\x1b[0m\r\n');

  // Example 1: getLine() - Get text input
  const framework = await bbs.getLine('\x1b[0;33mEnter your favorite JavaScript framework: \x1b[0m');
  if (framework && framework.trim()) {
    bbs.writeLine(`\x1b[0;32m✓ Nice! ${framework.trim()} is a solid choice!\x1b[0m`);
  } else {
    bbs.writeLine('\x1b[0;32m✓ TypeScript is the real winner here!\x1b[0m');
  }
  bbs.writeLine('');

  // Example 2: getKey() - Get single keypress
  bbs.write('\x1b[0;33mTest file operations? (Y/N): \x1b[0m');
  const choice = await bbs.getKey();
  bbs.writeLine(choice.toUpperCase());

  if (choice.toUpperCase() === 'Y') {
    bbs.writeLine('');
    bbs.write('\x1b[0;36m[ File I/O Demo ]\x1b[0m\r\n');

    // Test file operations
    const testFile = 'Node1/test-door.txt';
    const testContent = `Hello from TypeScript door!\nWritten at: ${new Date().toISOString()}\n`;

    const writeSuccess = await bbs.writeFile(testFile, testContent);
    if (writeSuccess) {
      bbs.writeLine('\x1b[0;32m✓ File written successfully\x1b[0m');

      const readContent = await bbs.readFile(testFile);
      if (readContent) {
        bbs.writeLine('\x1b[0;32m✓ File read successfully:\x1b[0m');
        bbs.write('\x1b[0;33m');
        bbs.write(readContent);
        bbs.writeLine('\x1b[0m');
      }
    } else {
      bbs.writeLine('\x1b[0;31m✗ File write failed\x1b[0m');
    }
  }

  // Example 3: Menu with hotkey()
  bbs.writeLine('');
  bbs.write('\x1b[0;36m[ BBS API Functions Available ]\x1b[0m\r\n');
  bbs.writeLine('  ✓ write/writeLine - Output text');
  bbs.writeLine('  ✓ clearScreen - Clear display');
  bbs.writeLine('  ✓ moveCursor - Position cursor');
  bbs.writeLine('  ✓ getLine - Get text input');
  bbs.writeLine('  ✓ getKey - Get single key');
  bbs.writeLine('  ✓ getUser - Get user information');
  bbs.writeLine('  ✓ getTimeRemaining - Check time');
  bbs.writeLine('  ✓ readFile/writeFile - File I/O');
  bbs.writeLine('  ✓ listFiles - Directory listing');
  bbs.writeLine('  ✓ logActivity - Log actions');
  bbs.writeLine('  ✓ displayMCI - Process MCI codes');
  bbs.writeLine('  ✓ And many more!');
  bbs.writeLine('');

  // Log activity
  await bbs.logActivity('Tested TypeScript door', 'All API functions working');

  // Pause before exit
  await bbs.pause('\r\n\x1b[0;32mPress any key to exit...\x1b[0m');
}

export default runDoor;
