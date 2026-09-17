#!/usr/bin/env tsx
/**
 * Write down where the games are, once, so nobody has to go looking.
 *
 * A board with the restoration archive installed carries fifteen hundred
 * recovered broadcast days. Almost every one is a Tuesday's news; the few
 * that hold something to play are scattered across years and networks with
 * page numbers nobody remembers. This walks the packs, notes what each one
 * carries, and leaves a quicklink list the browser opens on.
 *
 *   npx tsx dev/scripts/teletext/build-catalogue.ts [--root <Teletext dir>]
 *
 * Two kinds of thing are found:
 *
 *  - PROGRAMS, from a pack's telesoftware.json - BBC Micro software
 *    broadcast on Ceefax, already decoded to a disc.
 *  - GAMES, from the hidden pages an interactive teletext game hides its
 *    answer screens behind. A page number carrying a hex digit cannot be
 *    typed on a television keypad, which is exactly why the games used
 *    them, and it makes them findable now.
 */
import * as fs from 'fs';
import * as path from 'path';
import { teletextRoot, readManifest } from '../../../sdk/teletext/library';
import {
  CATALOGUE_FILE,
  sortCatalogue,
  type Catalogue,
  type CatalogueEntry,
} from '../../../sdk/teletext/catalogue';
import type { TelesoftwareMap } from '../../../sdk/teletext/telesoftware';

/**
 * A page whose number carries a LETTER, and so cannot be typed on a
 * television keypad at all.
 *
 * That is the whole trick the interactive games used to hide their answer
 * screens, and it is what makes them findable now. The first cut of this
 * matched any three hex characters - which is every page, since 1, 5 and 2
 * are hex too - and cheerfully reported 1,102 games.
 */
const HIDDEN_PAGE = /^P[1-8](?:[0-9A-F][A-F]|[A-F][0-9A-F])-/i;
/** How many hidden pages before a pack is holding a game rather than a stray. */
const ENOUGH_HIDDEN = 8;

/**
 * The day a pack was recorded, read off its name.
 *
 * NOT the pages it holds. The first cut fingerprinted a game by the page
 * numbers it hid its answers behind - which is identical for every edition,
 * because Bamboozle used 10A to 15F on Tuesday and again on Wednesday. Nine
 * years of the programme collapsed into one line.
 */
function broadcastDay(entry: CatalogueEntry): string {
  const fromTitle = entry.serviceTitle.match(/(\d{1,2})\s+([A-Z][a-z]{2})[a-z]*\s+(\d{4})/);
  if (fromTitle) return `${fromTitle[3]}-${fromTitle[2]}-${fromTitle[1].padStart(2, '0')}`;
  const fromId = entry.service.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (fromId) return `${fromId[1]}-${fromId[2]}-${fromId[3]}`;
  return entry.service;
}

/**
 * One line per broadcast, not one per recovery.
 *
 * The archive holds the same day more than once - a curated import and an
 * automatic one - and two identical Bamboozle lines in a quicklink list is
 * worse than none. Two game entries are the same broadcast when they are
 * the same DAY on the same page; the one with the shorter, hand-given
 * title wins, because somebody looked at that one.
 */
function dedupe(entries: CatalogueEntry[]): CatalogueEntry[] {
  const seen = new Map<string, CatalogueEntry>();
  const out: CatalogueEntry[] = [];

  for (const entry of entries) {
    if (entry.kind !== 'game') {
      out.push(entry);
      continue;
    }
    const key = `${entry.page}:${broadcastDay(entry)}`;
    const already = seen.get(key);
    if (!already) {
      seen.set(key, entry);
      out.push(entry);
      continue;
    }
    // Prefer the shorter, hand-given title over a generated one.
    if (entry.serviceTitle.length < already.serviceTitle.length) {
      Object.assign(already, entry);
    }
  }
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--root');
  const root = at === -1 ? teletextRoot() : argv[at + 1];

  const entries: CatalogueEntry[] = [];
  let packs = 0;

  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    let manifest;
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      manifest = readManifest(dir);
    } catch {
      continue;
    }
    if (!manifest) continue;
    packs++;

    const service = manifest.id || name;
    const serviceTitle = manifest.title || name;

    // The BBC Micro software this pack carried.
    const sidecar = path.join(dir, 'telesoftware.json');
    if (fs.existsSync(sidecar)) {
      try {
        const map = JSON.parse(fs.readFileSync(sidecar, 'utf8')) as TelesoftwareMap;
        for (const program of map.programs ?? []) {
          if (program.pages.length === 0) continue;
          entries.push({
            service,
            serviceTitle,
            page: program.pages[0],
            kind: 'program',
            label: program.title.toUpperCase(),
            command: program.command,
            playable: program.kind !== 'tokenised' || program.intact !== false,
          });
        }
      } catch {
        // A damaged sidecar costs this pack its programs, not the run.
      }
    }

    // An interactive game, found by the hidden pages it hides answers on.
    const hiddenPages: string[] = [];
    try {
      for (const page of fs.readdirSync(path.join(dir, 'pages'))) {
        if (HIDDEN_PAGE.test(page)) hiddenPages.push(page.slice(1, 4).toUpperCase());
      }
    } catch {
      // No pages directory: nothing to count.
    }
    if (hiddenPages.length >= ENOUGH_HIDDEN) {
      const home = parseInt(String(manifest.homePage ?? '100'), 16);
      entries.push({
        service,
        serviceTitle,
        page: Number.isNaN(home) ? 0x100 : home,
        kind: 'game',
        label: serviceTitle,
      });
    }
  }

  const catalogue: Catalogue = {
    built: new Date().toISOString(),
    entries: sortCatalogue(dedupe(entries)),
  };
  const out = path.join(root, CATALOGUE_FILE);
  fs.writeFileSync(out, `${JSON.stringify(catalogue, null, 2)}\n`);

  const games = catalogue.entries.filter(e => e.kind === 'game').length;
  const programs = catalogue.entries.filter(e => e.kind === 'program').length;
  console.log(`scanned ${packs} packs`);
  console.log(`  ${games} interactive games`);
  console.log(`  ${programs} BBC Micro programs`);
  console.log(`wrote ${out}`);
}

main();
