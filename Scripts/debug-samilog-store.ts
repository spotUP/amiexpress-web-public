const fs = require('fs');
const path = require('path');
const STORE = fs.readFileSync(path.join(process.cwd(), 'Utils/samilog/SAmiLog.Store'));
const VERSION_LENGTH = 8;
const CLEAR = 4;
const RES = 36;
const DAILY = 8;
const DAILY_BYTES = 74;
const RECORD = 118;
const COUNT = 20;
const ENTRY = 144;
const USERS_OFFSET = VERSION_LENGTH + CLEAR + RES + DAILY * DAILY_BYTES + RECORD;
function field(buf, start, len) {
  const slice = buf.slice(start, start + len);
  const zero = slice.indexOf(0);
  return slice.slice(0, zero >= 0 ? zero : len).toString('latin1').trim();
}
const start = USERS_OFFSET + 2 * ENTRY;
for (let offset = start; offset < start + 200; offset += 32) {
  const bytes = STORE.slice(offset, offset + 32);
  console.log(`0x${offset.toString(16)}:`, bytes.toString('hex')); 
}
