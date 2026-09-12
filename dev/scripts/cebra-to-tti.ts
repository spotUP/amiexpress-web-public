#!/usr/bin/env node
/**
 * Convert a CEBRA Teletext V1.00 binary page to Marco-family .tti text.
 *
 * CEBRA layout (measured, not specified): a 77-byte header starting with
 * "CEBRA Teletext V1.00", then 24 row records `02 01 <row:01-18> 04 28`
 * each carrying 40 raw 7-bit teletext bytes (text plus spacing controls).
 * Those bytes ARE broadcast codes, so they map straight onto .tti OL
 * records, which this board's native renderer (sdk/teletext) serves.
 *
 * Usage:
 *   npx tsx dev/scripts/cebra-to-tti.ts P8FF-3F7F.ttx [PAGE] [TITLE]
 *     PAGE defaults to 8FF, TITLE to the input basename.
 *   Writes the .tti to stdout; redirect it:
 *     npx tsx dev/scripts/cebra-to-tti.ts ~/Downloads/P8FF-3F7F.ttx > HELP/P8FF-3F7F.TTI
 *   A T-mode caller then views it with the ^ help command (^P8FF-3F7F).
 */
import * as fs from 'fs';
import * as path from 'path';

function main(): void {
  const [input, page = '8FF', title] = process.argv.slice(2);
  if (!input) {
    console.error('usage: cebra-to-tti.ts <cebra-file> [PAGE] [TITLE] > out.tti');
    process.exit(2);
  }
  const data = fs.readFileSync(input);
  if (!data.subarray(0, 20).equals(Buffer.from('CEBRA Teletext V1.00'))) {
    console.error('not a CEBRA Teletext V1.00 file');
    process.exit(1);
  }
  const re = /\x02\x01([\x01-\x18])\x04\x28(.{40})/gs;
  const rows: Array<[number, string]> = [];
  for (const m of data.toString('latin1').matchAll(re)) {
    rows.push([m[1].charCodeAt(0), m[2]]);
  }
  if (rows.length === 0) {
    console.error('no row records found');
    process.exit(1);
  }
  const name = title ?? path.basename(input).replace(/\.[^.]+$/, '');
  const out = [
    `DE,${name}`,
    `PN,${page}00`,
    'SC,0000',
    'CT,8,C',
    'PS,8000',
    ...rows.map(([r, body]) => `OL,${r - 1},${body}`),
  ];
  process.stdout.write(out.join('\n') + '\n');
}

main();
