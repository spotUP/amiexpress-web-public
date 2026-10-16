import type { Catalogue, CatalogueEntry, CatalogueSection, MenuCaller, MenuSource } from './types';
import { levelEntry, widthClassOf, cleanText, LABEL_MAX, DESCRIPTION_MAX, type MenuConfig, type OverflowMode } from '../../screens/menu-config/menu-config';

/** The ONE rule for how a long menu behaves: the caller's own choice, else the board default for their width and level. */
export function effectiveOverflow(caller: MenuCaller, config: MenuConfig): OverflowMode {
  const cls = widthClassOf(caller.columns);
  return caller.overflowPref || levelEntry(config.overflow[cls], caller.secLevel) || (cls === 'c64' ? 'pages' : 'scroll');
}

export function buildCatalogue(source: MenuSource, caller: MenuCaller, config: MenuConfig, parentKey?: string): Catalogue | { refusal: string } {
  const gate = source.gate(caller);
  if (!gate.ok) return { refusal: gate.refusal };
  let entries: CatalogueEntry[];
  if (parentKey !== undefined) {
    const kids = source.children?.(caller, parentKey) ?? null;
    if (!kids) return { refusal: 'No such entry.' };
    entries = kids;
  } else entries = source.entries(caller);

  const level = caller.secLevel;
  const exception = levelEntry(config.levels, level) ?? { hide: [], rename: {}, order: [] };
  const hidden = new Set(exception.hide);
  const decorate = (e: CatalogueEntry): CatalogueEntry => ({
    ...e,
    label: cleanText(exception.rename[e.key] ?? config.labels[e.key] ?? e.label, LABEL_MAX),
    description: cleanText(config.descriptions[e.key] ?? e.description, DESCRIPTION_MAX),
    section: config.placement[e.key] ?? e.section,
  });
  const visible = entries.filter(e => !hidden.has(e.key)).map(decorate);
  const byKey = new Map(visible.map(e => [e.key, e]));
  const rank = (k: string) => { const i = exception.order.indexOf(k); return i < 0 ? exception.order.length : i; };

  let sections: CatalogueSection[];
  const c64 = widthClassOf(caller.columns) === 'c64' && parentKey === undefined ? levelEntry(config.c64Menus, level) : undefined;
  if (c64) {
    sections = c64.sections.map((s, i) => ({ id: `c64-${i}`, title: s.title, entries: s.keys.map(k => byKey.get(k)).filter((e): e is CatalogueEntry => !!e) }));
  } else {
    const known = new Set(config.sections.map(s => s.id));
    sections = config.sections.map(s => ({ id: s.id, title: s.title, entries: [] as CatalogueEntry[] }));
    const fallback = sections.find(s => s.id === 'doors') ?? sections[sections.length - 1];
    for (const e of visible) (known.has(e.section) ? sections.find(s => s.id === e.section)! : fallback).entries.push(e);
    for (const s of sections) s.entries.sort((a, b) => rank(a.key) - rank(b.key) || visible.indexOf(a) - visible.indexOf(b));
  }
  sections = sections.filter(s => s.entries.length > 0);

  const cls = widthClassOf(caller.columns);
  const overflow = effectiveOverflow(caller, config);
  const wipesOn = cls !== 'c64' || config.wipes.at40;
  return {
    kind: source.kind, parent: parentKey ?? '', title: source.title(caller), prompt: source.prompt(caller),
    sections, overflow,
    wipes: wipesOn ? { open: config.wipes.open, leave: config.wipes.leave, page: config.wipes.page } : { open: '', leave: '', page: '' },
    // Decision D9: the slide is characters, so colour does not matter, but 40 columns and PETSCII never slide.
    drill: { enabled: config.drill.enabled, slide: config.drill.slide && cls !== 'c64' && caller.displayMode !== 'petscii' },
    logos: [],   // chosen by M6 (logos need the board's files and the rotation counter)
  };
}
