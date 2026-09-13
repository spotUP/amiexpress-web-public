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
 * Pure and I/O-free (no fs, no network): pass the file text in, get ANSI
 * or null. File reads live with the callers (backend loader, admin
 * importer). Stays importable from browser bundles for the editor layer.
 */
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
    // The page says which national option sub-set it is written in, and the
    // renderer needs telling: without it a Swedish page prints {|}[\] where
    // äöåÄÖÅ belong.
    const ansi = renderToAnsi(grid, { subset: subpage.languageSubset });
    if (!ansi || ansi.trim() === '') return null;
    return { ansi, title: '' };
  } catch {
    return null;
  }
}
