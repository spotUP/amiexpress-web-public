/**
 * Rebuild the binary page in the teletext test pack.
 *
 * sdk/tests/fixtures/teletext/ceefax-test holds one .t42 file, and a binary
 * fixture nobody can regenerate is a fixture nobody can change. This script
 * is how it was made: an authored TTI page put through the engine's own t42
 * exporter, so the fixture is real packets rather than bytes typed by hand,
 * and no archive content is redistributed in this repo.
 *
 *   npx tsx dev/scripts/teletext/make-test-pack.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { importTti, exportServiceToT42 } from '../../../sdk/teletext/marco/tti/index';

const OUT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'sdk',
  'tests',
  'fixtures',
  'teletext',
  'ceefax-test',
  'pages',
  'P101-0000.t42',
);

const tti = [
  'DE,Ceefax test binary page',
  'PN,10100',
  'SC,0000',
  'CT,6,T',
  'FL,100,102,103,104,100,100',
  // Row 0 is the header packet: columns 0-7 carry the page number and
  // clock, so a page's own title starts on row 1.
  'OL,1,\\x8D\\x86BINARY PAGE',
  'OL,3,\\x87THIS PAGE CAME BACK FROM T42',
  'OL,5,\\x92\\x7F\\x7F\\x7F\\x7F\\x20\\x7F\\x7F\\x7F\\x7F',
  '',
].join('\n');

const service = importTti(tti, 'ceefax-test', 'Ceefax Test Pack');
const bytes = exportServiceToT42(service);
fs.writeFileSync(OUT, Buffer.from(bytes));
console.log(`${OUT}: ${bytes.length} bytes, ${bytes.length / 42} packets`);
