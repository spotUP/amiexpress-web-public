#!/usr/bin/env npx tsx
/**
 * Scan AEDoor.library for a JMP-based LVO table and estimate library base.
 */

import { MoiraEmulator } from '../../web/backend/src/amiga-emulation/cpu/MoiraEmulator';
import { LibraryLoader } from '../../web/backend/src/amiga-emulation/loader/LibraryLoader';
import * as path from 'path';

async function main() {
  const emulator = new MoiraEmulator();
  await emulator.initialize();

  const loader = new LibraryLoader(emulator, [], null);
  loader.addSearchPath(path.resolve(__dirname, '../..', 'Libs'));

  const loaded = loader.loadLibrary('AEDoor.library', 1);
  if (!loaded) {
    console.error('Failed to load AEDoor.library');
    process.exit(1);
  }

  const codeSeg = loaded.codeSegments[0];
  if (!codeSeg) {
    console.error('No code segment found');
    process.exit(1);
  }

  const start = codeSeg.address;
  const end = codeSeg.address + codeSeg.size;

  let bestAddr = 0;
  let bestCount = 0;

  for (let addr = start; addr < end - 6 * 4; addr += 2) {
    // Check for a run of JMP absolute.long (0x4EF9) entries
    let count = 0;
    for (let i = 0; i < 20; i++) {
      const op = (emulator.readMemory(addr + i * 6) << 8) | emulator.readMemory(addr + i * 6 + 1);
      if (op !== 0x4ef9) break;
      count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestAddr = addr;
    }
  }

  if (!bestAddr || bestCount < 3) {
    console.log('No JMP table found');
    return;
  }

  const base = bestAddr + 6; // entry at base-6 corresponds to Open()
  console.log(`Found JMP table: addr=0x${bestAddr.toString(16)} count=${bestCount}`);
  console.log(`Estimated library base: 0x${base.toString(16)}`);
  console.log('First few entries:');
  for (let i = 0; i < Math.min(bestCount, 6); i++) {
    const entryAddr = bestAddr + i * 6;
    const target = (emulator.readMemory(entryAddr + 2) << 24) |
      (emulator.readMemory(entryAddr + 3) << 16) |
      (emulator.readMemory(entryAddr + 4) << 8) |
      emulator.readMemory(entryAddr + 5);
    const offset = -6 * (i + 1);
    console.log(`  offset ${offset}: JMP 0x${target.toString(16)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
