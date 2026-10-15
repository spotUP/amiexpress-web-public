import * as fs from 'fs';

const doorPath = '~/Code/amiexpress-web/Doors/who/who';
const buffer = fs.readFileSync(doorPath);

// Skip hunk header, find CODE hunk (0x3e9 = 1001)
let offset = 0;
while (offset < buffer.length - 4) {
  const hunkType = buffer.readUInt32BE(offset);
  if (hunkType === 0x3e9) {
    console.log('Found CODE hunk at offset 0x' + offset.toString(16));
    const size = buffer.readUInt32BE(offset + 4) * 4;
    console.log('Code size: ' + size + ' bytes (0x' + size.toString(16) + ')');

    // Code starts after hunk header (8 bytes)
    const codeStart = offset + 8;

    // PC 0x120a is at file offset codeStart + 0x120a - 0x1000
    const pc120aOffset = codeStart + (0x120a - 0x1000);
    console.log('\nDisassembly around PC 0x120a (file offset 0x' + pc120aOffset.toString(16) + '):');

    // Read 64 bytes around this address
    for (let i = -16; i < 48; i += 2) {
      const addr = 0x120a + i;
      const fileOff = pc120aOffset + i;
      if (fileOff >= codeStart && fileOff < codeStart + size - 1) {
        const word = buffer.readUInt16BE(fileOff);
        const marker = (i === 0) ? ' <--- PC=0x120a' : '';
        console.log('  0x' + addr.toString(16) + ': 0x' + word.toString(16).padStart(4, '0') + marker);
      }
    }

    // Also check what's at 0x9e38
    console.log('\nChecking offset 0x9e38 from base:');
    const dataOffset = codeStart + (0x9e38 - 0x1000);
    if (dataOffset < buffer.length - 8) {
      console.log('  0x9e38: ' + buffer.readUInt32BE(dataOffset).toString(16).padStart(8, '0'));
      console.log('  0x9e3c: ' + buffer.readUInt32BE(dataOffset + 4).toString(16).padStart(8, '0'));
      console.log('This appears to be the StackSwapStruct data!');
    }

    break;
  }
  offset += 4;
}
