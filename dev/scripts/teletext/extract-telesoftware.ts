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
import { decodeChain, inspectProgram, type ProgramShape } from '../../../sdk/teletext/telesoftware';
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

  console.log(`programs decoded: ${programs.length}, writing ${wanted.length}\n`);
  console.log('  NAME     KIND        BYTES  LINES  LOAD WITH');
  const discFiles: DfsFile[] = [];
  const chainable: string[] = [];
  for (const program of wanted) {
    const shape = inspectProgram(program.data);
    const name = dfsName(program.title);
    if (shape.kind === 'tokenised' && shape.terminated) chainable.push(name);
    const suspect = shape.kind === 'tokenised' && !shape.terminated
      ? `  SUSPECT: line chain breaks at byte ${shape.brokeAt}`
      : program.complete ? '' : '  INCOMPLETE';
    console.log(
      `  ${name.padEnd(8)} ${shape.kind.padEnd(10)} ${String(program.data.length).padStart(6)}` +
        `  ${String(shape.lines).padStart(5)}  ${loadCommand(name, shape)}${suspect}`,
    );
    discFiles.push({ name, data: program.data, ...addressesFor(shape) });
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
  console.log('on the Beeb: hold SHIFT and press BREAK, or *CAT and use the commands above');
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

/** What the caller types to get this file going. */
function loadCommand(name: string, shape: ProgramShape): string {
  if (shape.kind === 'tokenised') return `CHAIN "${name}"`;
  if (shape.kind === 'source') return `*EXEC ${name} then RUN`;
  return `*TYPE ${name}`;
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
