/**
 * The ONE answer to "which Amiga ROM does the 68K emulator run".
 *
 * Kickstart ROMs are copyrighted and never ship with the board: the sysop
 * installs one (web admin upload, or drop any file into the ROM directory).
 * Nothing here cares what the file is called; a file is a Kickstart because
 * its contents say so (identifyKickstart), not because of its name.
 *
 * Consumers: KickstartRom (rexxmast) and LibraryManager (doors). Both call
 * resolveAmigaRom(); neither knows a path or a filename.
 */
import * as fs from 'fs';
import * as path from 'path';
import { boardRoot } from '../../utils/board-root.util';
import { scanRomTags, type MemoryReader } from './rom-tags';

export const ROM_BASE = 0xf80000;
export const KICKSTART_SIZE = 512 * 1024;
export const CANONICAL_NAME = 'kickstart.rom';
export const MIN_EXEC_VERSION = 39;

export const MISSING_ROM_MESSAGE =
  'No Kickstart ROM installed. 68K doors need any Kickstart 3.x ROM (512K, e.g. A1200 3.1). Any filename works.';

const EXEC_NAMES: Record<number, string> = {
  39: '3.0',
  40: '3.1',
  45: '3.9',
  46: '3.1.4',
  47: '3.2',
};

export type KickstartIdentity =
  | { ok: true; execVersion: number; label: string; data: Buffer }
  | { ok: false; reason: string };

function hasKickstartHeader(buf: Buffer): boolean {
  const magic = buf.readUInt16BE(0);
  return (magic === 0x1111 || magic === 0x1114 || magic === 0x1116) && buf.readUInt16BE(2) === 0x4ef9;
}

/** Pure: decide whether a buffer is a usable Kickstart 3.x image. */
export function identifyKickstart(input: Buffer): KickstartIdentity {
  if (input.length >= 11 && input.subarray(0, 11).toString('latin1') === 'AMIROMTYPE1') {
    return { ok: false, reason: 'Encrypted Cloanto ROM (needs rom.key); install a plain Kickstart image instead' };
  }
  if (input.length === 256 * 1024) {
    return { ok: false, reason: 'A 256K ROM is Kickstart 1.x or 2.x; 68K doors need Kickstart 3.x (512K)' };
  }
  if (input.length !== KICKSTART_SIZE) {
    return {
      ok: false,
      reason: `Size is ${input.length} bytes; a Kickstart 3.x image is exactly 524288 bytes (512K). 1MB ROMs are not supported`,
    };
  }
  let buf = input;
  if (!hasKickstartHeader(buf)) {
    const swapped = Buffer.from(input);
    swapped.swap16();
    if (!hasKickstartHeader(swapped)) {
      return { ok: false, reason: 'Not a Kickstart image: the ROM header is missing' };
    }
    buf = swapped;
  }
  const image = buf;
  const entry = image.readUInt32BE(4);
  if (entry < ROM_BASE || entry >= ROM_BASE + KICKSTART_SIZE) {
    return {
      ok: false,
      reason: `This ROM is relocated to run at 0x${entry.toString(16).toUpperCase()} (a MapROM or emulator build); install a standard Kickstart image, which runs at 0xF80000`,
    };
  }
  const mem: MemoryReader = {
    read16: (a) => image.readUInt16BE(a - ROM_BASE),
    read32: (a) => image.readUInt32BE(a - ROM_BASE),
    readString: (a, max) => {
      const off = a - ROM_BASE;
      if (off < 0 || off >= image.length) return '';
      let end = off;
      while (end < image.length && end - off < max && image[end] !== 0) end++;
      return image.subarray(off, end).toString('latin1');
    },
  };
  const exec = scanRomTags(mem, ROM_BASE, ROM_BASE + image.length).find((t) => t.name === 'exec.library');
  if (!exec) {
    return { ok: false, reason: 'Not a Kickstart image: no exec.library found in the ROM' };
  }
  if (exec.version < MIN_EXEC_VERSION) {
    return {
      ok: false,
      reason: `This is exec ${exec.version} (Kickstart 1.x or 2.x); 68K doors need Kickstart 3.x (exec 39 or newer)`,
    };
  }
  const idVersion = /exec (\d+\.\d+)/.exec(exec.idString)?.[1] ?? String(exec.version);
  const label = `Kickstart ${EXEC_NAMES[exec.version] ?? '3.x'} (exec ${idVersion})`;
  return { ok: true, execVersion: exec.version, label, data: image };
}

/** Candidate ROM directories, best first, deduped. The first is where uploads go. */
export function romDirs(): string[] {
  const backendRoot = path.resolve(__dirname, '..', '..', '..');
  const repoRoot = path.resolve(backendRoot, '..', '..');
  // ROM_DIR names THE ROM directory (Docker sets it to the persistent volume);
  // the checkout-relative guesses only apply when it is unset.
  if (process.env.ROM_DIR) return [path.resolve(process.env.ROM_DIR)];
  const dirs = [
    path.join(boardRoot(), 'data', 'amiga-roms'),
    path.join(process.cwd(), 'data', 'amiga-roms'),
    path.join(backendRoot, 'data', 'amiga-roms'),
    path.join(repoRoot, 'data', 'amiga-roms'),
  ];
  return Array.from(new Set(dirs.map((d) => path.resolve(d))));
}

export function uploadDir(): string {
  return romDirs()[0];
}

export interface RejectedRom {
  file: string;
  reason: string;
}

export type AmigaRom =
  | { kind: 'kickstart'; path: string; label: string; execVersion: number; data: Buffer; rejected: RejectedRom[] }
  | { kind: 'aros'; romPath: string; extPath: string; label: string; rejected: RejectedRom[] }
  | { kind: 'none'; label?: undefined; rejected: RejectedRom[]; searched: string[] };

const identityCache = new Map<string, KickstartIdentity>();

export function clearRomCache(): void {
  identityCache.clear();
}

/** Cached by path + size + mtime, so an unchanged file is read once. */
function identifyFile(file: string): KickstartIdentity {
  const st = fs.statSync(file);
  const key = `${file}|${st.size}|${st.mtimeMs}`;
  const hit = identityCache.get(key);
  if (hit) return hit;
  let identity: KickstartIdentity;
  try {
    identity = identifyKickstart(fs.readFileSync(file));
  } catch (err) {
    identity = { ok: false, reason: `Unreadable: ${(err as Error).message}` };
  }
  identityCache.set(key, identity);
  return identity;
}

function findAros(dirs: string[], rejected: RejectedRom[]): AmigaRom | null {
  for (const dir of dirs) {
    const romPath = path.join(dir, 'aros-rom.bin');
    const extPath = path.join(dir, 'aros-ext.bin');
    if (fs.existsSync(romPath) && fs.existsSync(extPath)) {
      return { kind: 'aros', romPath, extPath, label: 'AROS (open-source fallback)', rejected };
    }
  }
  return null;
}

function candidateFiles(dirs: string[]): string[] {
  const explicit = process.env.AEDOOR_ROM_FILE;
  if (explicit) {
    const files = path.isAbsolute(explicit) ? [explicit] : dirs.map((d) => path.join(d, explicit));
    return files.filter((f) => fs.existsSync(f));
  }
  const out: string[] = [];
  for (const dir of dirs) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      if (/^aros-.*\.bin$/i.test(name) || /^readme/i.test(name) || name.startsWith('.')) continue;
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).isFile()) out.push(file);
      } catch {
        /* vanished between readdir and stat */
      }
    }
  }
  return out;
}

export function resolveAmigaRom(): AmigaRom {
  const dirs = romDirs();
  const rejected: RejectedRom[] = [];

  if ((process.env.AEDOOR_ROM || '').toLowerCase() === 'aros') {
    const aros = findAros(dirs, rejected);
    if (aros) return aros;
  }

  let best: Extract<AmigaRom, { kind: 'kickstart' }> | null = null;
  for (const file of candidateFiles(dirs)) {
    const id = identifyFile(file);
    if (!id.ok) {
      rejected.push({ file, reason: id.reason });
      continue;
    }
    const canonical = path.basename(file) === CANONICAL_NAME;
    const bestCanonical = best !== null && path.basename(best.path) === CANONICAL_NAME;
    const better =
      best === null ||
      (canonical && !bestCanonical) ||
      (canonical === bestCanonical && !canonical && id.execVersion > best.execVersion);
    if (better) {
      best = { kind: 'kickstart', path: file, label: id.label, execVersion: id.execVersion, data: id.data, rejected };
    }
  }
  if (best) return best;

  return findAros(dirs, rejected) ?? { kind: 'none', rejected, searched: dirs };
}

/** What the admin shows. Never carries ROM bytes. */
export interface KickstartStatus {
  found: boolean;
  usingAros: boolean;
  label: string | null;
  path: string | null;
  rejected: RejectedRom[];
  uploadDir: string;
  message: string | null;
}

export function kickstartStatus(): KickstartStatus {
  const rom = resolveAmigaRom();
  return {
    found: rom.kind === 'kickstart',
    usingAros: rom.kind === 'aros',
    label: rom.kind === 'none' ? null : rom.label,
    path: rom.kind === 'kickstart' ? rom.path : rom.kind === 'aros' ? rom.romPath : null,
    rejected: rom.rejected,
    uploadDir: uploadDir(),
    message: rom.kind === 'kickstart' ? null : MISSING_ROM_MESSAGE,
  };
}

/** Validate and install an uploaded ROM as <uploadDir>/kickstart.rom. */
export function installKickstart(
  data: Buffer
): { ok: true; path: string; label: string } | { ok: false; reason: string } {
  const id = identifyKickstart(data);
  if (!id.ok) return id;
  const dir = uploadDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, CANONICAL_NAME);
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, id.data);
  fs.renameSync(tmp, dest);
  clearRomCache();
  return { ok: true, path: dest, label: id.label };
}
