#!/usr/bin/env npx tsx
/**
 * Disassemble AEDoor.library around a given offset.
 * Usage: npx tsx dev/scripts/disasm-aedoor.ts [hex_offset]
 */

import { MoiraEmulator } from '../../web/backend/src/amiga-emulation/cpu/MoiraEmulator';
import { LibraryLoader } from '../../web/backend/src/amiga-emulation/loader/LibraryLoader';
import * as path from 'path';

async function main() {
  const offsetArg = process.argv[2] || '0x2d0';
  const countArg = process.argv[3] || '24';
  const offset = Number(offsetArg);
  const count = Number(countArg);
  if (Number.isNaN(offset)) {
    console.error(`Invalid offset: ${offsetArg}`);
    process.exit(1);
  }

  const emulator = new MoiraEmulator();
  await emulator.initialize();

  const cpu = (emulator as any)['cpu'];
  const disasm = cpu?.nativeDisassemble;
  const disasmSize = cpu?.nativeDisassembleSize;
  if (!disasm || !disasmSize) {
    console.error('Native disassembler not available in Moira build.');
    process.exit(1);
  }

  const loader = new LibraryLoader(emulator, [], null);
  const libsDir = path.resolve(__dirname, '../..', 'Libs');
  loader.addSearchPath(libsDir);

  const loaded = loader.loadLibrary('AEDoor.library', 1);
  if (!loaded) {
    console.error('Failed to load AEDoor.library');
    process.exit(1);
  }

  const base = loaded.baseAddress;
  const start = base + offset;
  console.log(`AEDoor.library base=0x${base.toString(16)} offset=0x${offset.toString(16)} addr=0x${start.toString(16)}`);

  let pc = start;
  for (let i = 0; i < count; i++) {
    const line = cpu.nativeDisassemble(pc);
    const size = cpu.nativeDisassembleSize(pc) || 2;
    console.log(`0x${pc.toString(16)}: ${line}`);
    pc += size;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
