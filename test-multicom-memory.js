// Quick test to verify MULTICOM memory structure
// Run this in a door session to dump memory

const { MoiraEmulator } = require('./web/backend/src/amiga-emulation/cpu/MoiraEmulator');
const emulator = new MoiraEmulator();

// Simulate what our MULTICOM handler writes
const MAX_NODES = 19;
const MASTER_NODE_BASE = 0xB0000;
const POINTER_ARRAY_BASE = MASTER_NODE_BASE + 100;
const NODE_INFO_BASE = 0xB0200;
const SINGLE_PORTS_BASE = 0xB1000;
const SINGLE_PORT_SIZE = 512;
const NODE_INFO_SIZE = 16;

console.log('=== MULTICOM Memory Structure Test ===\n');
console.log(`Master Node Base: 0x${MASTER_NODE_BASE.toString(16)}`);
console.log(`Pointer Array Base: 0x${POINTER_ARRAY_BASE.toString(16)}`);
console.log(`NodeInfo Base: 0x${NODE_INFO_BASE.toString(16)}`);
console.log(`SinglePort Base: 0x${SINGLE_PORTS_BASE.toString(16)}\n`);

// Initialize like our handler does
for (let i = 0; i < 100; i++) {
  emulator.writeMemory(MASTER_NODE_BASE + i, 0);
}

for (let i = 0; i < MAX_NODES; i++) {
  const nodeInfoAddr = NODE_INFO_BASE + (i * NODE_INFO_SIZE);
  const singlePortAddr = SINGLE_PORTS_BASE + (i * SINGLE_PORT_SIZE);

  // Write pointer to nodeInfo in myNode[i]
  const myNodeOffset = POINTER_ARRAY_BASE + (i * 4);
  emulator.writeMemory32(myNodeOffset, nodeInfoAddr);

  // Initialize nodeInfo
  emulator.writeMemory32(nodeInfoAddr + 0, singlePortAddr); // .s
  emulator.writeMemory32(nodeInfoAddr + 4, -1); // .netSocket
  emulator.writeMemory32(nodeInfoAddr + 8, 0);  // .offHook

  // Initialize singlePort semaphore header
  for (let j = 0; j < 46; j++) {
    emulator.writeMemory(singlePortAddr + j, 0);
  }

  // Write test data for node 2
  const status = (i === 2) ? 3 : -1;
  emulator.writeMemory32(singlePortAddr + 84, status);

  const handle = (i === 2) ? 'TestUser' : '';
  for (let j = 0; j < handle.length && j < 30; j++) {
    emulator.writeMemory(singlePortAddr + 88 + j, handle.charCodeAt(j));
  }
  emulator.writeMemory(singlePortAddr + 88 + handle.length, 0);

  const location = (i === 2) ? 'TestLoc' : '';
  for (let j = 0; j < location.length && j < 30; j++) {
    emulator.writeMemory(singlePortAddr + 119 + j, location.charCodeAt(j));
  }
  emulator.writeMemory(singlePortAddr + 119 + location.length, 0);
}

// Now verify by reading back like RTW would
console.log('=== Verification (reading like RTW) ===\n');

const masterNodePtr = MASTER_NODE_BASE;
console.log(`Step 1: Got masterNode pointer: 0x${masterNodePtr.toString(16)}`);

for (let i = 0; i < 5; i++) {
  console.log(`\nNode ${i}:`);

  // Read myNode[i] pointer
  const myNodePtr = emulator.readMemory32(POINTER_ARRAY_BASE + (i * 4));
  console.log(`  myNode[${i}] pointer: 0x${myNodePtr.toString(16)}`);

  // Read nodeInfo.s pointer
  const singlePortPtr = emulator.readMemory32(myNodePtr);
  console.log(`  nodeInfo.s pointer: 0x${singlePortPtr.toString(16)}`);

  // Read singlePort fields
  const status = emulator.readMemory32(singlePortPtr + 84);
  const handle = emulator.readString(singlePortPtr + 88, 31);
  const location = emulator.readString(singlePortPtr + 119, 31);

  console.log(`  status: ${status}`);
  console.log(`  handle: "${handle}"`);
  console.log(`  location: "${location}"`);
}
