import type { MenuKind, MenuStyle, MenuStylePref, LogoPosition } from '../../screens/menu-config/menu-config';

export interface CatalogueEntry { key: string; label: string; description: string; right: string; flags: string; runText: string; runAs: 'typed' | 'syscmd'; section: string }
export interface CatalogueSection { id: string; title: string; entries: CatalogueEntry[] }
export interface ChosenLogo { position: LogoPosition; file: string; rows: number; cols: number; afterSection: number }
/** A style the menu door draws: classic never reaches a catalogue, the board shows its own screen first. */
export type CatalogueStyle = Exclude<MenuStyle, 'classic'>;
export interface Catalogue { kind: MenuKind; parent: string; title: string; prompt: string; sections: CatalogueSection[]; style: CatalogueStyle; wipes: { open: string; leave: string; page: string }; coverflow: { slide: boolean }; logos: ChosenLogo[]; notice?: string }
export interface MenuCaller {
  secLevel: number; conference: number; node: number; columns: number; rows: number;
  displayMode: 'ansi' | 'petscii' | 'teletext' | 'rip';
  may(acsKey: string): boolean;          // an ACSPermission key, as INTERNAL_COMMANDS gates
  isSysop: boolean;
  widthRefuses(door: object): boolean;  // doorRefusedForWidth for this caller
  stylePref: MenuStylePref;              // users.menustyle; '' = board default
}
export interface MenuSource {
  kind: MenuKind;
  gate(caller: MenuCaller): { ok: true } | { ok: false; refusal: string };
  entries(caller: MenuCaller): CatalogueEntry[];                                        // before config
  children?(caller: MenuCaller, parentKey: string): CatalogueEntry[] | null;          // J's message bases (Decision 42)
  title(caller: MenuCaller): string;
  prompt(caller: MenuCaller): string;
}
