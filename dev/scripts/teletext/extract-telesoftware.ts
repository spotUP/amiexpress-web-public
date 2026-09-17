#!/usr/bin/env tsx
/**
 * Decode the telesoftware in a teletext pack and write it as a disc image.
 *
 * Ceefax carried BBC Micro programs on pages 700+ from 1983 to 1989. With a
 * teletext adapter you read them off the broadcast and saved them; this
 * does the same from a recovered tape, and leaves a .ssd the board's BBC
 * Micro can load.
 *
 *   npx tsx dev/scripts/teletext/extract-telesoftware.ts <pack> [--out <file>]
 *
 *   --out <file>   where to write the .ssd (default: the board's
 *                  Beeb/software/<pack-id>.ssd)
 *   --title "..."  the disc title, twelve characters
 *   --partial      include programs whose blocks are incomplete
 *
 * What comes out is BASIC SOURCE, not a tokenised program, because that is
 * how it was sent - the transmission redefines a teletext control code to
 * mean carriage return and sends the text through. So on the Beeb:
 *
 *   *CAT            see what is on the disc
 *   *EXEC SNAKE     type the program in, as if from the keyboard
 *   RUN
 */
import * as fs from 'fs';
import * as path from 'path';
import { extractTeletextLines } from '../../../sdk/teletext/marco/tti/index';
import { decodeChain } from '../../../sdk/teletext/telesoftware';
import { buildDfsImage, sectorsFor, type DfsFile } from '../../../sdk/teletext/dfs-image';
import { softwareDirFor } from './telesoftware-paths';
import type { TeletextLine } from '../../../sdk/teletext/packet27';

function main(): void {
  const argv = process.argv.slice(2);
  const pack = argv.find(a => !a.startsWith('--'));
  if (!pack) {
    console.error('usage: extract-telesoftware.ts <pack directory> [--out file] [--title "..."] [--partial]');
    process.exitCode = 1;
    return;
  }
  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };
  const includePartial = argv.includes('--partial');

  const pagesDir = fs.existsSync(path.join(pack, 'pages')) ? path.join(pack, 'pages') : pack;
  const files = fs.readdirSync(pagesDir).filter(n => n.toLowerCase().endsWith('.t42'));
  if (files.length === 0) {
    console.error(`no .t42 pages in ${pagesDir}`);
    process.exitCode = 1;
    return;
  }

  const pages = files.map(name => ({
    lines: extractTeletextLines(
      new Uint8Array(fs.readFileSync(path.join(pagesDir, name))),
    ) as unknown as TeletextLine[],
  }));

  const programs = decodeChain(pages).filter(p => p.data.length > 0);
  const wanted = programs.filter(p => p.complete || includePartial);
  if (wanted.length === 0) {
    console.error('no complete programs decoded (try --partial)');
    process.exitCode = 1;
    return;
  }

  console.log(`programs decoded: ${programs.length}, writing ${wanted.length}`);
  const discFiles: DfsFile[] = [];
  for (const program of wanted) {
    let lines = 0;
    for (const byte of program.data) if (byte === 0x0d) lines++;
    console.log(
      `  ${program.title.padEnd(10)} ${String(program.data.length).padStart(6)} bytes` +
        `  ${String(lines).padStart(4)} lines  ${program.complete ? '' : '(INCOMPLETE)'}`,
    );
    discFiles.push({ name: dfsName(program.title), data: program.data });
  }

  // A DFS disc is 400 or 800 sectors; take the bigger if the smaller will
  // not hold it rather than failing a job that can succeed.
  const needed = sectorsFor(discFiles);
  const sectors = needed <= 400 ? 400 : 800;
  const image = buildDfsImage(discFiles, {
    title: flag('title') ?? path.basename(pack).slice(0, 12),
    bootOption: 0,
    sectors,
  });

  const out = flag('out') ?? path.join(softwareDirFor(), `${path.basename(pack)}.ssd`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image);
  console.log(`\nwrote ${out}: ${image.length} bytes, ${needed} of ${sectors} sectors used`);
  console.log('on the Beeb:  *CAT  then  *EXEC <NAME>  then  RUN');
}

/** DFS names are seven characters, uppercase, no spaces. */
function dfsName(title: string): string {
  const cleaned = title.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  return cleaned || 'PROG';
}

main();
