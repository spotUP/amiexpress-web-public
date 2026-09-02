/**
 * Where express.e displays each screen, generated from express.e itself.
 *
 * The admin tells a sysop when a caller sees a screen. That sentence should not
 * be somebody's memory of AmiExpress: express.e says it exactly, and this port
 * is 1:1 with express.e by rule. Every `displayScreen(SCREEN_X)` call site is
 * recorded with the PROC that makes it and the line number, so the manager can
 * cite the source the same way the code does.
 *
 * Run when express.e changes:
 *   npx tsx dev/scripts/generate-screen-provenance.ts
 *
 * The output is committed, because the deployed image has no express.e in it.
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(__dirname, '..', '..', 'AmiExpress-Sources', 'express.e');
const OUT = path.join(
  __dirname, '..', '..', 'web', 'config-app', 'src', 'pages', 'screen-provenance.ts',
);

interface Site {
  screen: string;
  proc: string;
  line: number;
}

function collect(): Site[] {
  const lines = fs.readFileSync(SOURCE, 'latin1').split('\n');
  const sites: Site[] = [];
  let proc = '';

  lines.forEach((text, index) => {
    const procMatch = /^PROC\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(text);
    if (procMatch) proc = procMatch[1];

    for (const match of text.matchAll(/displayScreen\(SCREEN_([A-Z_0-9]+)/g)) {
      // displayScreen itself is the implementation, not a call site.
      if (proc === 'displayScreen') continue;
      sites.push({ screen: match[1], proc, line: index + 1 });
    }
  });

  return sites;
}

function render(sites: Site[]): string {
  const byScreen = new Map<string, Site[]>();
  for (const site of sites) {
    const list = byScreen.get(site.screen) ?? [];
    // One line can carry two calls (FILEHELP does); the same place twice is
    // still one place.
    if (list.some(seen => seen.line === site.line && seen.proc === site.proc)) continue;
    byScreen.set(site.screen, [...list, site]);
  }

  const entries = [...byScreen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([screen, list]) => {
      const shown = list.map(s => `{ proc: '${s.proc}', line: ${s.line} }`).join(', ');
      return `  ${screen}: [${shown}],`;
    })
    .join('\n');

  return `/**
 * Where express.e displays each screen. GENERATED - do not edit.
 *
 * Source: AmiExpress-Sources/express.e
 * Regenerate: npx tsx dev/scripts/generate-screen-provenance.ts
 *
 * The admin says when a caller meets a screen; this is where that claim comes
 * from, so it cites express.e rather than somebody's memory of AmiExpress.
 */

export interface ScreenCallSite {
  /** The express.e procedure that displays it. */
  proc: string;
  /** Its line in express.e. */
  line: number;
}

export const SCREEN_CALL_SITES: Record<string, ScreenCallSite[]> = {
${entries}
};

/** Every place express.e shows this screen, or an empty list. */
export function callSitesFor(screen: string): ScreenCallSite[] {
  return SCREEN_CALL_SITES[screen] ?? [];
}
`;
}

const sites = collect();
fs.writeFileSync(OUT, render(sites), 'utf8');
console.log(`[provenance] ${sites.length} call sites across ${new Set(sites.map(s => s.screen)).size} screens -> ${path.relative(process.cwd(), OUT)}`);
