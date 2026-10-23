/**
 * Split an installed Kickstart image into its resident modules.
 *
 * WHY THIS EXISTS: the board used to shell out to amitools' `romtool split`,
 * which only splits ROMs listed in its own checksum database. Every ROM on
 * this board (A1200 3.1, A4000 3.1, the AROS pair) answered "was not found in
 * split database", so nothing was ever produced on a fresh board - and the
 * modules a developer once got from an A500 ROM were committed to the repo
 * (ROM/, System/ROM/), which is Kickstart code that must never ship.
 *
 * A Kickstart needs no database to be split: every module starts with an
 * Exec RomTag (struct Resident), and the same scanner ExecLibrary and
 * identifyKickstart use (rom-tags.ts) finds them all. A module is the bytes
 * from the end of the previous module up to its own rt_EndSkip; the first
 * module also takes the ROM header in front of it (exec's code sits before
 * exec's tag), and nothing runs past the next tag or into the ROM footer
 * (checksum, size, autovectors).
 *
 * Output is a cache directory keyed by the image's SHA-1, so installing a
 * different Kickstart builds a new set and an unchanged one is split once.
 * The directory is complete when `.complete` exists; it is written under a
 * temporary name and renamed, so a crash mid-split never leaves a half set
 * that looks finished.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { scanRomTags, bufferReader, type RomTagInfo } from './rom-tags';

/** The ROM footer: checksum, ROM size, then the 68000 autovector words. */
const ROM_FOOTER_BYTES = 0x18;

export interface RomModule {
  /** File name in the cache: rt_Name plus the idstring's version, romtool style. */
  file: string;
  name: string;
  version: number;
  idString: string;
  /** Absolute ROM address of the module's first byte. */
  start: number;
  data: Buffer;
}

function moduleFileName(tag: RomTagInfo): string {
  const safe = tag.name.replace(/[^A-Za-z0-9._-]/g, '_');
  const ver = /(\d+\.\d+)/.exec(tag.idString)?.[1] ?? String(tag.version);
  return `${safe}_${ver}`;
}

/** Pure: the resident modules of a ROM image that runs at `base`. */
export function splitRomModules(image: Buffer, base: number): RomModule[] {
  const tags = scanRomTags(bufferReader(image, base), base, base + image.length).sort((a, b) => a.addr - b.addr);
  const romEnd = base + Math.max(0, image.length - ROM_FOOTER_BYTES);
  const used = new Set<string>();
  const modules: RomModule[] = [];
  let prevEnd = base;
  tags.forEach((tag, i) => {
    const nextTag = i + 1 < tags.length ? tags[i + 1].addr : romEnd;
    // A module ends at its rt_EndSkip. Commodore's build puts some RomTags
    // at the END of their module's code (expansion, romboot), so the module
    // starts where the previous one ended, not at its tag.
    const start = prevEnd <= tag.addr ? prevEnd : tag.addr;
    const end = tag.endSkip > tag.addr && tag.endSkip <= nextTag ? tag.endSkip : Math.max(nextTag, tag.addr + 26);
    prevEnd = end;
    let file = moduleFileName(tag);
    for (let n = 2; used.has(file); n++) file = `${moduleFileName(tag)}.${n}`;
    used.add(file);
    modules.push({
      file,
      name: tag.name,
      version: tag.version,
      idString: tag.idString,
      start,
      data: Buffer.from(image.subarray(start - base, end - base)),
    });
  });
  return modules;
}

export interface BuiltRomModules {
  /** The cache directory holding this ROM's modules and its index.txt. */
  dir: string;
  /** Module file names, in ROM order (the index.txt lines). */
  files: string[];
  /** True when this call split the ROM, false when the cache already had it. */
  built: boolean;
}

/**
 * Write the modules of `image` under `cacheRoot/<sha1>/` once and answer
 * where they are. A cached set is trusted only when `.complete` exists.
 */
export function buildRomModules(image: Buffer, base: number, cacheRoot: string): BuiltRomModules {
  const key = crypto.createHash('sha1').update(image).digest('hex').slice(0, 16);
  const dir = path.join(cacheRoot, key);
  const indexPath = path.join(dir, 'index.txt');
  if (fs.existsSync(path.join(dir, '.complete')) && fs.existsSync(indexPath)) {
    const files = fs.readFileSync(indexPath, 'latin1').split('\n').filter(Boolean);
    return { dir, files, built: false };
  }

  const modules = splitRomModules(image, base);
  const staging = `${dir}.tmp-${process.pid}-${Date.now()}`;
  fs.mkdirSync(staging, { recursive: true });
  for (const m of modules) fs.writeFileSync(path.join(staging, m.file), m.data);
  const files = modules.map((m) => m.file);
  fs.writeFileSync(path.join(staging, 'index.txt'), files.map((f) => `${f}\n`).join(''), 'latin1');
  fs.writeFileSync(path.join(staging, '.complete'), `${key}\n`);
  // A stale half-written set under the final name (from before .complete
  // existed) is replaced, never merged into.
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(staging, dir);
  return { dir, files, built: true };
}
