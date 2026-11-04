/**
 * The Screen Designer's Door art tab: every door slot as a gallery card.
 *
 * The cards are the gallery's own, so a slot behaves like a screen. Clicking
 * one opens the door-art dialog, because a slot has no screen path for the
 * screen dialog to open.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../api/client';
import { ScreenGallery } from '../components/ScreenGallery';
import { DoorArtDialog } from './DoorArtDialog';
import { DoorArtChoice } from './DoorArtSlot';
import { buildDoorArtCards, type DoorArtCard, type DoorArtEntry, type DoorArtTarget } from './door-art-view';

/** The board's door slots as cards, drawn in the chosen format. */
export function useDoorArtCards(format: string): { cards: DoorArtCard[]; isLoading: boolean } {
  const client = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['door-art'],
    queryFn: async () => (await apiClient.listDoorArt()).data as DoorArtEntry[],
  });
  const cards = useMemo(
    () => buildDoorArtCards(Array.isArray(data) ? data : [], format, client),
    [data, format, client],
  );
  return { cards, isLoading };
}

export interface DoorArtGalleryProps {
  cards: DoorArtCard[];
  isLoading: boolean;
}

export function DoorArtGallery({ cards, isLoading }: DoorArtGalleryProps) {
  const [open, setOpen] = useState<DoorArtTarget | null>(null);

  const renderBelow = (item: { path: string }) => {
    const card = cards.find(entry => entry.path === item.path);
    return card ? <DoorArtChoice command={card.target.command} slot={card.slot} /> : null;
  };

  return (
    <>
      <ScreenGallery
        items={cards}
        isLoading={isLoading}
        onOpen={path => setOpen(cards.find(card => card.path === path)?.target ?? null)}
        renderBelow={renderBelow}
      />
      {open && (
        <DoorArtDialog
          command={open.command}
          doorName={open.doorName}
          file={open.file}
          section={open.section}
          label={open.label}
          maxLines={open.maxLines}
          maxLineLength={open.maxLineLength}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
