import { MoiraEmulator } from '../amiga-emulation/cpu/MoiraEmulator';
import { HunkLoader } from '../amiga-emulation/loader/HunkLoader';
import * as fs from 'fs';

async function main() {
  const emulator = new MoiraEmulator();
  await emulator.initialize();

  // Load the door
  const doorPath = './doors/RTW/RTW';
  const doorData = fs.readFileSync(doorPath);
  const loader = new HunkLoader();
  const hunkFile = loader.parse(doorData);
  loader.load(emulator, hunkFile);
  const entryPoint = hunkFile.entryPoint;

console.log('Entry point: 0x' + entryPoint.toString(16));

  // Dump memory at entry point
console.log('\nMemory at entry point (0x1008):');
  for (let i = 0; i < 40; i += 2) {
    const addr = 0x1008 + i;
    const val = emulator.readMemory16(addr);
console.log('  0x' + addr.toString(16) + ': 0x' + val.toString(16).padStart(4, '0'));
  }

  // Verify ExecBase is set
  const execBasePtr = emulator.readMemory32(4);
console.log('\nExecBase pointer at 0x4: 0x' + execBasePtr.toString(16));
}

main().catch(console.error);
