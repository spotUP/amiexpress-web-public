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
 * What comes out is not all one thing. The 1985 transmissions carried
 * tokenised BASIC programs, BASIC source as text, and plain documentation,
 * and said which only by convention - so each decoded program is inspected
 * and given the addresses and the loading command that suit it:
 *
 *   CHAIN "SNAKE"   a tokenised program, as the machine stores it
 *   *EXEC PATCH2    BASIC source, typed back in - then RUN
 *   *TYPE GAMEINF   documentation, to be read
 *
 * SHIFT+BREAK boots the disc, which catalogues it and says the same.
 */
import * as fs from 'fs';
import * as path from 'path';
import { extractTeletextLines } from '../../../sdk/teletext/marco/tti/index';
import {
  decodeChain,
  inspectProgram,
  loadCommandFor,
  repairTerminator,
  type ProgramShape,
  type TelesoftwareListing,
  type TelesoftwareMap,
} from '../../../sdk/teletext/telesoftware';
import { buildDfsImage, sectorsFor, type DfsFile } from '../../../sdk/teletext/dfs-image';
import { softwareDirFor } from './telesoftware-paths';
import { pageNumberFromFilename, TELESOFTWARE_FILE } from '../../../sdk/teletext/library';
import { formatPageNumber } from '../../../sdk/teletext/store';
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

  // The page number comes from the community filename (Pmpp-ssss.t42), so
  // the decode can record WHERE each program was broadcast - which is what
  // lets the teletext browser offer a program on the page that carried it.
  const pages = files.map(name => ({
    page: pageNumberFromFilename(name) ?? undefined,
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

  console.log(`programs decoded: ${programs.length}, writing ${wanted.length}\n`);
  console.log('  NAME     KIND        BYTES  LINES  LOAD WITH');
  const discFiles: DfsFile[] = [];
  const chainable: string[] = [];
  const listings: TelesoftwareListing[] = [];
  for (const program of wanted) {
    // A single byte the tape destroyed, put back where BASIC's own format
    // says it must be - and only when the program has demonstrably ended.
    const { data, repaired } = repairTerminator(program.data);
    const shape = inspectProgram(data);
    const name = dfsName(program.title);
    if (shape.kind === 'tokenised' && shape.terminated) chainable.push(name);
    const suspect = shape.kind === 'tokenised' && !shape.terminated
      ? `  SUSPECT: line chain breaks at byte ${shape.brokeAt}`
      : repaired ? '  (end marker repaired)'
      : program.complete ? '' : '  INCOMPLETE';
    console.log(
      `  ${name.padEnd(8)} ${shape.kind.padEnd(10)} ${String(program.data.length).padStart(6)}` +
        `  ${String(shape.lines).padStart(5)}  ${loadCommand(name, shape)}${suspect}`,
    );
    discFiles.push({ name, data, ...addressesFor(shape) });
    listings.push({
      title: program.title,
      file: name,
      kind: shape.kind,
      command: loadCommandFor(name, shape.kind),
      pages: program.pages,
      blocks: program.blocks.size,
      complete: program.complete,
      intact: shape.kind !== 'tokenised' || shape.terminated,
      repaired,
    });
  }

  // A disc that boots. Option 3 is *EXEC, so !BOOT is typed at the prompt.
  if (chainable.length > 0) {
    discFiles.unshift({ name: '!BOOT', data: bootFile(chainable[0]), load: 0, exec: 0 });
  }

  // A DFS disc is 400 or 800 sectors; take the bigger if the smaller will
  // not hold it rather than failing a job that can succeed.
  const needed = sectorsFor(discFiles);
  const sectors = needed <= 400 ? 400 : 800;
  const image = buildDfsImage(discFiles, {
    title: flag('title') ?? path.basename(pack).slice(0, 12),
    bootOption: 3,
    sectors,
  });

  const out = flag('out') ?? path.join(softwareDirFor(), `${path.basename(pack)}.ssd`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image);
  console.log(`\nwrote ${out}: ${image.length} bytes, ${needed} of ${sectors} sectors used`);

  // The sidecar, beside the pages rather than beside the disc: it is the
  // SERVICE that knows a page carried a program, and the browser reading it
  // has the pack open already.
  const map: TelesoftwareMap = { disc: path.basename(out), programs: listings };
  const sidecar = path.join(pack, TELESOFTWARE_FILE);
  fs.writeFileSync(sidecar, `${JSON.stringify(map, null, 2)}\n`);
  const placed = listings.filter(entry => entry.pages.length > 0).length;
  console.log(
    `wrote ${sidecar}: ${listings.length} programs, ${placed} of them on a known page` +
      ` (${listings.filter(e => e.pages.length).map(e => formatPageNumber(e.pages[0])).join(' ')})`,
  );
  console.log('\non the Beeb: hold SHIFT and press BREAK, or *CAT and use the commands above');
  console.log('in TELETEXT: browse to a program page and press RED');
}

/**
 * Where a file loads, and where it runs from.
 *
 * A tokenised program gets what BBC BASIC's own SAVE writes: load &FFFF1900
 * - PAGE on a disc machine - and execution at &FFFF8023, BASIC's entry
 * point. The top two bits of each DFS address stand for the &FFFF host
 * prefix, which is what the leading 3 is.
 *
 * Text of either sort gets zero. Nothing executes it, and a load address
 * that lies is worse than none.
 */
function addressesFor(shape: ProgramShape): { load: number; exec: number } {
  if (shape.kind !== 'tokenised') return { load: 0, exec: 0 };
  return { load: 0x31900, exec: 0x38023 };
}

/** What the caller types to get this file going, for the listing printed here. */
function loadCommand(name: string, shape: ProgramShape): string {
  const command = loadCommandFor(name, shape.kind);
  return shape.kind === 'source' ? `${command} then RUN` : command;
}

/**
 * The boot file, typed in by *EXEC when the disc is booted.
 *
 * Deliberately two lines and no cleverness: it catalogues the disc and says
 * how to start something. Anything more would be this repository writing
 * 1985 software that 1985 did not broadcast.
 */
function bootFile(example: string): Uint8Array {
  const text = `*CAT\rPRINT"CHAIN a game, eg.  CHAIN ""${example}"""\r`;
  return Uint8Array.from([...text].map(c => c.charCodeAt(0)));
}

/** DFS names are seven characters, uppercase, no spaces. */
function dfsName(title: string): string {
  const cleaned = title.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  return cleaned || 'PROG';
}

main();
