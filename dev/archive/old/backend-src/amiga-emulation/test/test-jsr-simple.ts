import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';

async function test() {
  const emu = new MoiraEmulator();
  await emu.initialize();
  console.log('Testing simple JSR...');

  // Set up stack at 0x8000
  emu.writeMemory(0x0, 0x00);
  emu.writeMemory(0x1, 0x00);
  emu.writeMemory(0x2, 0x80);
  emu.writeMemory(0x3, 0x00); // SSP = 0x8000
  emu.writeMemory(0x4, 0x00);
  emu.writeMemory(0x5, 0x00);
  emu.writeMemory(0x6, 0x10);
  emu.writeMemory(0x7, 0x00); // PC = 0x1000

  // Simple program: JSR to 0xFFFFFFC4, then STOP
  const prog = new Uint8Array([
    0x4E, 0xB9, 0xFF, 0xFF, 0xFF, 0xC4,  // JSR 0xFFFFFFC4
    0x4E, 0x72, 0x20, 0x00                // STOP #$2000
  ]);
  emu.loadProgram(prog, 0x1000);
  emu.reset();

  console.log('Before execution:');
  console.log('  PC=0x' + emu.getRegister(CPURegister.PC).toString(16));
  console.log('  A7 (SP)=0x' + emu.getRegister(CPURegister.A7).toString(16));

  try {
    emu.execute(1000);
  } catch(e) {
    console.log('Execution stopped:', e);
  }

  console.log('After execution:');
  console.log('  PC=0x' + emu.getRegister(CPURegister.PC).toString(16));
  console.log('  A7 (SP)=0x' + emu.getRegister(CPURegister.A7).toString(16));

  emu.cleanup();
}

test().catch(console.error);
