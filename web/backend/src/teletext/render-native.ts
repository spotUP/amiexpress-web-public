/**
 * Native packet-level .tti screens, rendered server-side.
 *
 * The packet engine is vendored TheMarco/teletext (see NOTICE.md): the
 * .tti text parses to a service, the first page compiles to 40-byte rows,
 * the state machine resolves colors, double-height, mosaics and flash
 * into a grid, and renderToAnsi emits 8-color SGR - the Amiga-safe
 * subset, no truecolor. What comes out is ordinary ANSI the display
 * path serves like any screen, on every transport.
 *
 * Pure except for reading nothing: pass the file text in, get ANSI or
 * null (unparseable stays unserved - packet bytes as ANSI would be
 * noise, and the loader falls through to .ttx/.txt).
 */
import * as fs from 'fs';
import { importTti } from './marco/tti/index';
import { compileRow } from './marco/compile/index';
import { processPage } from './marco/state-machine/state-machine';
import { renderToAnsi } from './marco/render-ansi/index';

export interface NativeRender {
  /** ANSI rows joined with \n, ready to serve. */
  ansi: string;
  /** Page title for logs, when the file names one. */
  title: string;
}

/** True when text smells like native packet TTI (DE/PN/OL records). */
export function looksNativeTti(text: string): boolean {
  return /^(DE|PN|SC|CT|PS|OL|FL|SP|CO),/m.test(text);
}

/** File-level detection for the loader's security slot (read + sniff). */
export function looksNativeTtiFile(absPath: string): boolean {
  try {
    return looksNativeTti(fs.readFileSync(absPath, 'latin1'));
  } catch {
    return false;
  }
}

/**
 * Read, validate and render a native .tti file in one go for the loader
 * arms. Null when anything is off (missing, not packets, unrenderable) -
 * the caller falls through to .ttx/.txt.
 */
export function tryNativeTtiFile(absPath: string): NativeRender | null {
  let text: string;
  try {
    text = fs.readFileSync(absPath, 'latin1');
  } catch {
    return null;
  }
  if (!looksNativeTti(text)) return null;
  return renderNativeTti(text);
}

export function renderNativeTti(text: string): NativeRender | null {
  let service;
  try {
    service = importTti(text, 'board', 'Board');
  } catch {
    return null;
  }
  const page = service?.pages?.[0];
  const subpage = page?.subpages?.[0];
  if (!subpage || subpage.rows.length === 0) return null;
  try {
    const raw: number[][] = [];
    for (const row of subpage.rows) {
      raw.push(Array.from(compileRow(row).bytes40));
    }
    const grid = processPage(raw);
    const ansi = renderToAnsi(grid);
    if (!ansi || ansi.trim() === '') return null;
    return { ansi, title: '' };
  } catch {
    return null;
  }
}
