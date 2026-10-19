/**
 * Native packet-level .tti screens, rendered server-side.
 *
 * The packet engine is vendored TheMarco/teletext (see NOTICE.md): the
 * .tti text parses to a service and the first subpage goes through the
 * board's one teletext renderer, renderSubpageLines - the same rows the
 * teletext doors paint: 8-color SGR (no truecolor), sextant mosaics, rows
 * placed by their row number, row 24 when the page has one, and DECDHL
 * (ESC#3 / ESC#4) on double-height rows.
 *
 * Pure and I/O-free (no fs, no network): pass the file text in, get ANSI
 * or null. File reads live with the callers (backend loader, admin
 * importer). Stays importable from browser bundles for the editor layer.
 */
import { importTti } from './marco/tti/index';
import { renderSubpageLines } from './render-session';

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
    // renderSubpageLines passes the page's national option sub-set to the
    // renderer: without it a Swedish page prints {|}[\] where äöåÄÖÅ belong.
    const ansi = renderSubpageLines(subpage, { mode: 'teletext', mosaicStyle: 'sextant' }).join('\n');
    if (!ansi || ansi.trim() === '') return null;
    return { ansi, title: '' };
  } catch {
    return null;
  }
}
