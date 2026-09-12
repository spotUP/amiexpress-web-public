/**
 * Session-scoped file shadows for 68K doors.
 *
 * A narrow caller (40-column PETSCII or teletext) runs the same binary as
 * everyone else, and some doors only fit eighty columns because a config
 * file says so - Bulls' DUAL_LISTING=YES lays bulletins out in two
 * side-by-side columns. Rewriting the file on disk would flip every node;
 * the C64 frame adapter only reflows bytes, it cannot turn two columns
 * into one. So the DOS file layer serves this session a rewritten copy
 * and nobody else sees it.
 *
 * How it works: FileManager asks the provider on every MODE_OLDFILE open
 * (the narrow-art redirect's precedent - writes never shadow). A Buffer
 * answer becomes a memory-backed FileHandle; null falls through to disk.
 * Bytes are recomputed per open from the live file, so there is no cache
 * to go stale and a concurrent sysop edit is picked up immediately.
 *
 * What gets rewritten is declared, not hardcoded: an Empire manifest
 * setting carrying `narrowValue` reads that value instead of the file's
 * whenever the session is narrow. Same manifest the admin edits, same
 * cfgKey binding, one new optional field.
 */

import * as fs from 'fs';
import * as path from 'path';

import { sessionColumns } from '../../utils/door-min-columns.util';
import {
  parseEmpireFile,
  getKv,
  setKv,
  serializeEmpireFile,
} from '../../doors/text-cfg/empire';

/** Shadow bytes for this open, or null for the normal disk path. */
export type FileShadowProvider = (
  amiPath: string,
  sysPath: string,
  mode: number,
) => Buffer | null;

interface NarrowDecl {
  /** Bare filename as bound, e.g. "Bulls.CFG". */
  file: string;
  /** Init-section key, e.g. "DUAL_LISTING". */
  key: string;
  /** Section the key lives in (init unless the binding says otherwise). */
  section: string;
  /** The value narrow sessions read. */
  value: string;
}

export interface EmpireNarrowShadowOptions {
  /** The live BBS session, by reference - width is read per open. */
  session: any;
  /** The door's own directory (manifest + cfg files live here). */
  doorDir: string;
  readManifest?: (doorDir: string) => any | null;
  readFile?: (sysPath: string) => Buffer | null;
}

const MANIFEST_FILE = 'door.settings.json';

function defaultReadManifest(doorDir: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(doorDir, MANIFEST_FILE), 'utf8'));
  } catch {
    return null;
  }
}

function defaultReadFile(sysPath: string): Buffer | null {
  try {
    return fs.readFileSync(sysPath);
  } catch {
    return null;
  }
}

/**
 * The narrow declarations a manifest carries: every setting with a
 * narrowValue and a file binding. Malformed manifests declare nothing -
 * a door that cannot describe its overrides runs unshadowed, never broken.
 */
export function narrowDeclsFor(manifest: any): NarrowDecl[] {
  const out: NarrowDecl[] = [];
  try {
    const settings = manifest?.settings;
    if (!Array.isArray(settings)) return out;
    const manifestFile = typeof manifest?.cfgFile === 'string' ? manifest.cfgFile : undefined;
    for (const s of settings) {
      if (!s || typeof s.narrowValue !== 'string' || s.narrowValue === '') continue;
      if (typeof s.cfgKey !== 'string' || s.cfgKey === '') continue;
      const file = typeof s.cfgFile === 'string' && s.cfgFile !== '' ? s.cfgFile : manifestFile;
      if (!file) continue;
      const section =
        s.cfgRow && typeof s.cfgRow.section === 'string' && s.cfgRow.section !== ''
          ? s.cfgRow.section
          : 'init';
      out.push({ file, key: s.cfgKey, section, value: s.narrowValue });
    }
  } catch {
    return [];
  }
  return out;
}

/** True when this session reads narrow configs: under eighty columns. */
export function sessionIsNarrow(session: any): boolean {
  try {
    return sessionColumns(session) < 80;
  } catch {
    return false;
  }
}

/**
 * A provider serving single-column Empire configs to narrow sessions.
 *
 * Reads the door's manifest once (declarations don't change mid-run) and
 * the cfg file per open (values might - a sysop edit lands immediately).
 * Returns null unless at least one value actually changed, so wide
 * sessions, already-narrow files and undeclared doors all take the exact
 * same code path they always have.
 */
export function createEmpireNarrowShadow(opts: EmpireNarrowShadowOptions): FileShadowProvider {
  const { session, doorDir } = opts;
  const readManifest = opts.readManifest ?? defaultReadManifest;
  const readFile = opts.readFile ?? defaultReadFile;

  let decls: NarrowDecl[] | null = null;
  const declarations = (): NarrowDecl[] => {
    if (decls === null) decls = narrowDeclsFor(readManifest(doorDir));
    return decls;
  };

  return (amiPath: string, sysPath: string, _mode: number): Buffer | null => {
    try {
      void amiPath;
      if (!sessionIsNarrow(session)) return null;
      const all = declarations();
      if (all.length === 0) return null;
      const base = path.basename(sysPath).toLowerCase();
      const forFile = all.filter((d) => d.file.toLowerCase() === base);
      if (forFile.length === 0) return null;
      const real = readFile(sysPath);
      if (!real) return null;
      const file = parseEmpireFile(real.toString('latin1'));
      let changed = false;
      for (const decl of forFile) {
        const current = getKv(file, decl.section, decl.key);
        if (current === undefined || current === decl.value) continue;
        if (!setKv(file, decl.section, decl.key, decl.value)) continue;
        changed = true;
      }
      if (!changed) return null;
      return Buffer.from(serializeEmpireFile(file), 'latin1');
    } catch {
      return null;
    }
  };
}
