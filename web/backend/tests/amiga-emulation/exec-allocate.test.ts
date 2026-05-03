/**
 * Regression: exec.library Allocate (LVO -186) must walk the MemHeader
 * free-chunk list and return a real chunk pointer.
 *
 * Background:
 *   SAS/C's `__MERGE` runtime ctor allocates a 16K block via AllocMem and
 *   then calls Allocate to sub-allocate from it. When Allocate previously
 *   returned 0 (a stub claiming SAS/C would "fall back to AllocMem"), the
 *   ctor treated 0 as fatal and called __exit(20) — the SAS/C exit path
 *   that pushes 20 (FAIL) and jumps over JSR _main into the dtor sequence.
 *
 * Symptom:
 *   DOORSMENU exited immediately with FAIL: no JH_REGISTER, no FindPort,
 *   no menu output. Only the SAS/C startup ctors and dtors fired.
 *
 * Fix:
 *   web/backend/src/amiga-emulation/api/library-vectors/exec-vectors.ts:163
 *   walks mh_First (A0+16) → mc_Next chain, finds the first chunk with
 *   mc_Bytes >= byteSize (rounded up to 8), splits it, updates mh_Free,
 *   returns the chunk address.
 */

import { EXEC_VECTORS } from '../../src/amiga-emulation/api/library-vectors/exec-vectors';

interface FakeMem {
  bytes: Map<number, number>;
  read32(addr: number): number;
  write32(addr: number, value: number): void;
  registers: number[]; // 0..7 = D, 8..15 = A; 16 = PC
  setReg(idx: number, value: number): void;
  getReg(idx: number): number;
}

function makeFakeEmulator(): FakeMem {
  const bytes = new Map<number, number>();
  return {
    bytes,
    registers: new Array(17).fill(0),
    read32(addr: number) {
      const b0 = bytes.get(addr) || 0;
      const b1 = bytes.get(addr + 1) || 0;
      const b2 = bytes.get(addr + 2) || 0;
      const b3 = bytes.get(addr + 3) || 0;
      return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    },
    write32(addr: number, value: number) {
      bytes.set(addr, (value >>> 24) & 0xff);
      bytes.set(addr + 1, (value >>> 16) & 0xff);
      bytes.set(addr + 2, (value >>> 8) & 0xff);
      bytes.set(addr + 3, value & 0xff);
    },
    setReg(idx, value) { this.registers[idx] = value >>> 0; },
    getReg(idx) { return this.registers[idx]; },
  };
}

// Adapt our FakeMem into the MoiraEmulator-shaped object Allocate calls.
function asEmu(fake: FakeMem): any {
  return {
    getRegister: (i: number) => fake.getReg(i),
    setRegister: (i: number, v: number) => fake.setReg(i, v),
    readMemory32: (addr: number) => fake.read32(addr),
    writeMemory32: (addr: number, value: number) => fake.write32(addr, value),
  };
}

function getAllocateHandler() {
  const v = EXEC_VECTORS.find((vec) => vec.name === 'Allocate');
  if (!v) throw new Error('Allocate vector not found in EXEC_VECTORS');
  return v.handler;
}

/**
 * Build an in-memory MemHeader at `headerAddr` with one initial free MemChunk
 * of `freeBytes` starting at `chunkAddr`.
 */
function setupMemHeader(fake: FakeMem, headerAddr: number, chunkAddr: number, freeBytes: number) {
  // mh_First (offset +16) -> first MemChunk
  fake.write32(headerAddr + 16, chunkAddr);
  // mh_Free (offset +28)
  fake.write32(headerAddr + 28, freeBytes);
  // MemChunk: mc_Next = 0, mc_Bytes = freeBytes
  fake.write32(chunkAddr + 0, 0);
  fake.write32(chunkAddr + 4, freeBytes);
}

describe('exec.library Allocate (LVO -186) — chunk allocator (regression)', () => {
  test('returns the first chunk address when it fits exactly and unlinks it', () => {
    const fake = makeFakeEmulator();
    const headerAddr = 0x100000;
    const chunkAddr = 0x100100;
    setupMemHeader(fake, headerAddr, chunkAddr, 16);

    fake.setReg(8, headerAddr); // A0 = MemHeader
    fake.setReg(0, 16);          // D0 = byteSize (already 8-aligned)

    const result = getAllocateHandler()(asEmu(fake), null as any);

    expect(result).toBe(chunkAddr);
    // mh_First should now be 0 (chunk fully consumed)
    expect(fake.read32(headerAddr + 16)).toBe(0);
    // mh_Free decremented
    expect(fake.read32(headerAddr + 28)).toBe(0);
  });

  test('splits a larger chunk and leaves the remainder on the free list', () => {
    const fake = makeFakeEmulator();
    const headerAddr = 0x100000;
    const chunkAddr = 0x100100;
    setupMemHeader(fake, headerAddr, chunkAddr, 1024);

    fake.setReg(8, headerAddr);
    fake.setReg(0, 16);

    const result = getAllocateHandler()(asEmu(fake), null as any);

    expect(result).toBe(chunkAddr);
    // The new chunk header lives at chunkAddr + 16
    const newChunkAddr = chunkAddr + 16;
    expect(fake.read32(headerAddr + 16)).toBe(newChunkAddr);
    // Remaining bytes
    expect(fake.read32(newChunkAddr + 4)).toBe(1024 - 16);
    // mc_Next preserved (was 0)
    expect(fake.read32(newChunkAddr + 0)).toBe(0);
    // mh_Free decremented
    expect(fake.read32(headerAddr + 28)).toBe(1024 - 16);
  });

  test('rounds byteSize up to a multiple of 8 (MEM_BLOCKSIZE)', () => {
    const fake = makeFakeEmulator();
    const headerAddr = 0x100000;
    const chunkAddr = 0x100100;
    setupMemHeader(fake, headerAddr, chunkAddr, 1024);

    fake.setReg(8, headerAddr);
    fake.setReg(0, 17); // → rounds up to 24

    const result = getAllocateHandler()(asEmu(fake), null as any);

    expect(result).toBe(chunkAddr);
    expect(fake.read32(headerAddr + 28)).toBe(1024 - 24);
    // Remainder lives at chunkAddr + roundedByteSize (24)
    expect(fake.read32(chunkAddr + 24 + 4)).toBe(1024 - 24);
  });

  test('walks past too-small chunks to find one that fits', () => {
    const fake = makeFakeEmulator();
    const headerAddr = 0x100000;
    const tinyChunk = 0x100100;
    const fitChunk = 0x100200;
    // mh_First → tiny (8 bytes) → fit (256 bytes) → null
    fake.write32(headerAddr + 16, tinyChunk);
    fake.write32(headerAddr + 28, 8 + 256);
    fake.write32(tinyChunk + 0, fitChunk); // mc_Next
    fake.write32(tinyChunk + 4, 8);         // mc_Bytes
    fake.write32(fitChunk + 0, 0);
    fake.write32(fitChunk + 4, 256);

    fake.setReg(8, headerAddr);
    fake.setReg(0, 64);

    const result = getAllocateHandler()(asEmu(fake), null as any);

    expect(result).toBe(fitChunk);
    // The tiny chunk is still at the head, now linking to the fit chunk's
    // remainder (since fitChunk got split at +64 → 0x100240).
    expect(fake.read32(headerAddr + 16)).toBe(tinyChunk);
    expect(fake.read32(tinyChunk + 0)).toBe(fitChunk + 64);
    expect(fake.read32(fitChunk + 64 + 4)).toBe(256 - 64);
  });

  test('returns 0 (NULL) when no chunk fits — caller must treat as failure', () => {
    const fake = makeFakeEmulator();
    const headerAddr = 0x100000;
    const chunkAddr = 0x100100;
    setupMemHeader(fake, headerAddr, chunkAddr, 16);

    fake.setReg(8, headerAddr);
    fake.setReg(0, 1024); // larger than the only chunk

    const result = getAllocateHandler()(asEmu(fake), null as any);

    expect(result).toBe(0);
    // Free list and free-count untouched on failure
    expect(fake.read32(headerAddr + 16)).toBe(chunkAddr);
    expect(fake.read32(headerAddr + 28)).toBe(16);
  });

  test('returns 0 on null memHeader', () => {
    const fake = makeFakeEmulator();
    fake.setReg(8, 0);
    fake.setReg(0, 16);

    const result = getAllocateHandler()(asEmu(fake), null as any);

    expect(result).toBe(0);
  });

  test('returns 0 on zero byteSize', () => {
    const fake = makeFakeEmulator();
    fake.setReg(8, 0x100000);
    fake.setReg(0, 0);

    const result = getAllocateHandler()(asEmu(fake), null as any);

    expect(result).toBe(0);
  });

  test('SAS/C __MERGE shape: AllocMem(16K) followed by Allocate(16) yields a non-NULL pointer', () => {
    // This is the exact pattern that was producing __exit(20) in DOORSMENU:
    // SAS/C ctor allocates a 16384-byte pool block, configures it as a
    // MemHeader with one big free chunk, then calls Allocate(16) to carve
    // out a tiny SignalSemaphore-style record. Allocate() returning NULL is
    // treated as fatal in that ctor.
    const fake = makeFakeEmulator();
    const poolBase = 0x123e7c; // matches the address SAS/C used in our trace
    const POOL_SIZE = 16384;
    const headerSize = 32;
    const firstChunk = poolBase + headerSize;
    setupMemHeader(fake, poolBase, firstChunk, POOL_SIZE - headerSize);

    fake.setReg(8, poolBase);
    fake.setReg(0, 16);

    const result = getAllocateHandler()(asEmu(fake), null as any);

    expect(result).not.toBe(0);
    expect(result).toBe(firstChunk);
  });
});
