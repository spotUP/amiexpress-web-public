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
console.log('.------------------------------------------------------------------------------.');
console.log('| Speed N Name              Location            On-Time  Action H:MM Up-K Dn-K |');
console.log('`------------------------------------------------------------------------------' );
for (let i = 0; i < COUNT; i++) {
  const offset = USERS_OFFSET + i * ENTRY;
  const name = field(STORE, offset, 18) || 'Awaiting Login';
  const location = field(STORE, offset + 18, 21) || 'Unknown';
  const node = field(STORE, offset + 39, 1) || '0';
  const usage = field(STORE, offset + 40, 6) || '-:--';
  const action = field(STORE, offset + 90, 6) || '';
  const up = field(STORE, offset + 46, 6).trim() || '0';
  const dn = field(STORE, offset + 58, 6).trim() || '0';
  console.log(`| ${action.padEnd(5)} ${node.padStart(1)} ${name.padEnd(18)} ${location.padEnd(19)} ${usage.padStart(5)}  ${action.padEnd(6)} ${usage.padStart(4)} ${up.padStart(4)} ${dn.padStart(4)} |`);
}
console.log('`-------------------------^-------------------^------------------^-[V-AWAIT]-');
