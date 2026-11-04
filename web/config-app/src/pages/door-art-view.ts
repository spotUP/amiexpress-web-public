/**
 * Door art as gallery cards.
 *
 * "ok the door art are listed as a list, can we add a tab for door art that
 * lists them as the screens? it should work just like the screen view"
 * (sysop, 2026-11-04). An artist recognises art, not a file name, so a slot
 * gets the same card a screen gets: its picture, and the same answers to
 * "Draw as" and "Only what is still to draw".
 *
 * The difference is where the bytes live. A slot is addressed by door command,
 * file and section, not by a screen path, so a card carries its own source.
 */
import type { QueryClient } from '@tanstack/react-query';

import { apiClient } from '../api/client';
import type { GalleryItem } from '../components/ScreenGallery';

export type DoorArtVariant = 'c64' | 'ttx' | 'tti';

export interface DoorArtSection {
  file: string; section: string; label: string; lines: number;
  maxLines: number; maxLineLength: number;
  /**
   * A slot backed by a whole FILE the door's setting names, rather than a
   * section of its config: it can be missing, and it has alternates.
   */
  missing?: boolean;
  choices?: Array<{ file: string; lines: number }>;
  /** Which narrow drawings exist for this slot. */
  variants?: Partial<Record<DoorArtVariant, boolean>>;
}

export interface DoorArtEntry {
  command: string;
  name: string;
  sections: DoorArtSection[];
}

/** One slot, as the editor opens it. */
export interface DoorArtTarget {
  command: string; doorName: string; file: string; section: string;
  label: string; maxLines: number; maxLineLength: number;
}

/** A gallery card, and what a click on it opens. */
export interface DoorArtCard extends GalleryItem {
  target: DoorArtTarget;
  slot: DoorArtSection;
}

/**
 * What "Draw as" means for a door slot.
 *
 * A door draws its narrow art as `.c64.ans` and `.ttx.ans`, so PETSCII here is
 * the C64 drawing and teletext is the ANSI teletext drawing, with the native
 * `.tti` page as its stand-in. No door has a RIP drawing, and saying so on the
 * card is the honest answer.
 */
function drawingFor(
  slot: DoorArtSection,
  format: string,
): { variant?: DoorArtVariant; missingFormat?: string; format?: GalleryItem['format'] } {
  if (format === 'petscii') {
    return slot.variants?.c64 ? { variant: 'c64' } : { missingFormat: 'PETSCII' };
  }
  if (format === 'teletext') {
    if (slot.variants?.ttx) return { variant: 'ttx' };
    if (slot.variants?.tti) return { variant: 'tti', format: 'teletext-native' };
    return { missingFormat: 'Teletext' };
  }
  if (format === 'rip') return { missingFormat: 'RIP' };
  return {};
}

/** Under the label: how full the slot is, and which callers it is drawn for. */
function detailOf(slot: DoorArtSection): string {
  if (slot.missing) return 'File not there any more';
  if (slot.lines === 0) return 'Not drawn yet';
  const narrow = [
    slot.variants?.c64 ? 'C64' : '',
    slot.variants?.ttx || slot.variants?.tti ? 'Teletext' : '',
  ].filter(Boolean).join(', ');
  const size = `${slot.lines} of ${slot.maxLines} rows`;
  return narrow ? `${size} - also ${narrow}` : size;
}

/**
 * Where a card's bytes come from.
 *
 * Every key starts `door-art`, which is the key the dialog and the picker
 * invalidate, so a save redraws the card. The wide art of a door arrives as
 * one answer for all its slots, shared through the query cache so that a door
 * with six slots costs one request and not six.
 */
function sourceFor(client: QueryClient, target: DoorArtTarget, variant?: DoorArtVariant) {
  const { command, file, section } = target;
  return {
    queryKey: ['door-art', 'card', command, file, section, variant ?? 'wide'],
    fetch: async (): Promise<{ content?: string } | null> => {
      if (variant) {
        return (await apiClient.getDoorArtVariant(command, file, section, variant)).data as { content?: string };
      }
      const sections = await client.fetchQuery({
        queryKey: ['door-art', 'sections', command],
        queryFn: async () => (await apiClient.getDoorArt(command)).data as Array<
          { file: string; section: string; content?: string }
        >,
      });
      return sections.find(entry => entry.file === file && entry.section === section) ?? null;
    },
  };
}

export function buildDoorArtCards(
  doors: DoorArtEntry[],
  format: string,
  client: QueryClient,
): DoorArtCard[] {
  return doors.flatMap(door => door.sections.map((slot): DoorArtCard => {
    const target: DoorArtTarget = {
      command: door.command, doorName: door.name, file: slot.file, section: slot.section,
      label: slot.label, maxLines: slot.maxLines, maxLineLength: slot.maxLineLength,
    };
    const drawing = drawingFor(slot, format);
    const undrawn = !!slot.missing || slot.lines === 0;
    return {
      // Unique and readable: the gallery prints it on the card and the search
      // box reads it, which is how a door's command and file stay findable.
      path: `${door.command}/${slot.file} [${slot.section}]`,
      label: `${door.name} - ${slot.label}`,
      detail: detailOf(slot),
      problem: !!slot.missing,
      placeholder: undrawn,
      ...(undrawn ? { badge: { label: 'Not drawn yet', kind: 'todo' as const } } : {}),
      ...(drawing.missingFormat ? { missingFormat: drawing.missingFormat } : {}),
      ...(drawing.format ? { format: drawing.format } : {}),
      source: sourceFor(client, target, drawing.variant),
      target,
      slot,
    };
  }));
}

/** A card an artist still has work on, in the format they are looking at. */
export const isStillToDraw = (card: GalleryItem): boolean =>
  !!card.placeholder || !!card.missingFormat;

/** The page's search box: the same rule for screens and door slots. */
export function matchesSearch(item: GalleryItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle
    || item.label.toLowerCase().includes(needle)
    || item.path.toLowerCase().includes(needle);
}
