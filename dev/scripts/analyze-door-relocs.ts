#!/usr/bin/env npx ts-node
/**
 * Analyze door binary relocations - check if all absolute addresses are covered
 * Usage: npx ts-node dev/scripts/analyze-door-relocs.ts Doors/Request/Request
 */

import * as fs from 'fs';
import * as path from 'path';

const doorPath = process.argv[2];
if (!doorPath) {
  console.log('Usage: npx ts-node dev/scripts/analyze-door-relocs.ts <door-binary>');
  process.exit(1);
}

const buffer = fs.readFileSync(doorPath);
let pos = 0;

function readU32(): number {
  const val = buffer.readUInt32BE(pos);
  pos += 4;
  return val;
}

function readU16(): number {
  const val = buffer.readUInt16BE(pos);
  pos += 2;
  return val;
}

// Parse HUNK_HEADER
const header = readU32();
if (header !== 0x3f3) {
  console.error('Not a valid Amiga executable');
  process.exit(1);
}

// Skip resident library names
while (readU32() !== 0) {}

const tableSize = readU32();
const firstHunk = readU32();
const lastHunk = readU32();

console.log(`=== ${path.basename(doorPath)} Hunk Analysis ===`);
console.log(`Segments: ${tableSize}, range ${firstHunk}-${lastHunk}`);

const segmentSizes: number[] = [];
for (let i = firstHunk; i <= lastHunk; i++) {
  const sizeWord = readU32();
  const flags = (sizeWord >>> 30) & 0x3;
  const size = (sizeWord & 0x3fffffff) * 4;
  if (flags === 3) readU32(); // Skip extended flags
  segmentSizes.push(size);
  console.log(`  Segment ${i}: ${size} bytes`);
}

// Parse hunks
const relocations = new Map<number, Array<{ offset: number; target: number }>>();
let currentSegment = -1;
const segments: Array<{ type: string; dataStart: number; dataEnd: number }> = [];

while (pos < buffer.length) {
  const rawType = readU32();
  const hunkType = rawType & 0x3fffffff;

  switch (hunkType) {
    case 0x3e9: // HUNK_CODE
    case 0x3ea: { // HUNK_DATA
      currentSegment = segments.length;
      const dataLongs = readU32();
      const dataStart = pos;
      pos += dataLongs * 4;
      segments.push({
        type: hunkType === 0x3e9 ? 'CODE' : 'DATA',
        dataStart,
        dataEnd: pos
      });
      console.log(`\nSegment ${currentSegment} (${hunkType === 0x3e9 ? 'CODE' : 'DATA'}): ${dataLongs * 4} bytes at file offset 0x${dataStart.toString(16)}`);
      break;
    }

    case 0x3eb: { // HUNK_BSS
      currentSegment = segments.length;
      const bssLongs = readU32();
      segments.push({ type: 'BSS', dataStart: 0, dataEnd: 0 });
      console.log(`\nSegment ${currentSegment} (BSS): ${bssLongs * 4} bytes`);
      break;
    }

    case 0x3ec: { // HUNK_RELOC32
      const relocs: Array<{ offset: number; target: number }> = [];
      while (true) {
        const count = readU32();
        if (count === 0) break;
        const target = readU32();
        for (let i = 0; i < count; i++) {
          relocs.push({ offset: readU32(), target });
        }
      }
      relocations.set(currentSegment, [...(relocations.get(currentSegment) || []), ...relocs]);
      console.log(`  HUNK_RELOC32: ${relocs.length} relocations`);
      break;
    }

    case 0x3fc: { // HUNK_RELOC32SHORT
      const relocs: Array<{ offset: number; target: number }> = [];
      while (true) {
        const count = readU16();
        if (count === 0) {
          if (pos & 2) pos += 2;
          break;
        }
        const target = readU16();
        for (let i = 0; i < count; i++) {
          relocs.push({ offset: readU16(), target });
        }
      }
      if (pos & 2) pos += 2;
      relocations.set(currentSegment, [...(relocations.get(currentSegment) || []), ...relocs]);
      console.log(`  HUNK_RELOC32SHORT: ${relocs.length} relocations`);
      break;
    }

    case 0x3f0: { // HUNK_SYMBOL
      while (true) {
        const nameLen = readU32();
        if (nameLen === 0) break;
        pos += (nameLen & 0xffffff) * 4 + 4;
      }
      break;
    }

    case 0x3f1: { // HUNK_DEBUG
      const debugLongs = readU32();
      pos += debugLongs * 4;
      break;
    }

    case 0x3f2: // HUNK_END
      currentSegment = -1;
      break;

    default:
      console.log(`Unknown hunk type: 0x${hunkType.toString(16)}`);
      break;
  }
}

// Now analyze CODE segment for absolute addresses that should be relocated
console.log('\n=== Relocation Analysis ===');
for (const [segIdx, relocs] of relocations.entries()) {
  console.log(`\nSegment ${segIdx} has ${relocs.length} relocations:`);

  // Sort by offset
  relocs.sort((a, b) => a.offset - b.offset);

  // Print first 20 and last 10
  const showFirst = 20;
  const showLast = 10;

  for (let i = 0; i < Math.min(showFirst, relocs.length); i++) {
    const r = relocs[i];
    console.log(`  0x${r.offset.toString(16).padStart(4, '0')} -> seg${r.target}`);
  }

  if (relocs.length > showFirst + showLast) {
    console.log(`  ... (${relocs.length - showFirst - showLast} more) ...`);
    for (let i = relocs.length - showLast; i < relocs.length; i++) {
      const r = relocs[i];
      console.log(`  0x${r.offset.toString(16).padStart(4, '0')} -> seg${r.target}`);
    }
  } else if (relocs.length > showFirst) {
    for (let i = showFirst; i < relocs.length; i++) {
      const r = relocs[i];
      console.log(`  0x${r.offset.toString(16).padStart(4, '0')} -> seg${r.target}`);
    }
  }
}

// Key offsets to check based on handoff.md
const keyOffsets = [
  { offset: 0x0a, desc: 'A4 init (lea 0x0.l, a4)' },
  { offset: 0x454, desc: 'dos.library storage offset in DATA' },
  { offset: 0x4ac, desc: 'Rename wrapper loads from this absolute' },
  { offset: 0x58dc - 2, desc: 'Rename wrapper operand (movea.l 0xNNN.l,a6)' },
];

console.log('\n=== Key Offset Check ===');
const seg0Relocs = relocations.get(0) || [];
const relocOffsets = new Set(seg0Relocs.map(r => r.offset));

for (const key of keyOffsets) {
  const hasReloc = relocOffsets.has(key.offset);
  console.log(`Offset 0x${key.offset.toString(16).padStart(4, '0')}: ${hasReloc ? '[OK] RELOCATED' : '[X] NOT RELOCATED'} - ${key.desc}`);
}

// Search for movea.l instructions that load absolute addresses
// movea.l 0xNNN.l,An is encoded as: 2x7C NNNN NNNN (where x is register)
console.log('\n=== Searching for movea.l absolute loads ===');
const codeSegment = segments[0];
if (codeSegment && codeSegment.type === 'CODE') {
  const codeData = buffer.slice(codeSegment.dataStart, codeSegment.dataEnd);

  for (let i = 0; i < codeData.length - 6; i += 2) {
    const word = codeData.readUInt16BE(i);
    // movea.l 0xNNN.l,An = 2N7C (where N is 0-7 for A0-A7)
    // Actually: 2x79 for movea.l (xxx).l,Ax
    // And 2x7C is movea.l #imm,Ax
    // For loading from absolute long: movea.l ($xxxx).l,An = 2N79 xxxx xxxx

    // Check for 2x79 pattern (movea.l absolute long to Ax)
    if ((word & 0xF1FF) === 0x2079) {
      const reg = (word >> 9) & 0x7;
      const addr = codeData.readUInt32BE(i + 2);
      const hasReloc = relocOffsets.has(i + 2);
      console.log(`  0x${i.toString(16).padStart(4, '0')}: movea.l 0x${addr.toString(16)}.l,a${reg} ${hasReloc ? '[OK] RELOC' : '[X] NO RELOC'}`);
    }
  }
}
