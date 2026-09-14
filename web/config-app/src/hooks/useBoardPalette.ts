/**
 * Which palette the BOARD is run in, for anything that previews art.
 *
 * A sysop who has set `TERMINAL_COLOURS=8` runs a board whose callers see the
 * Amiga's eight pens, and every bright code the board sends is folded onto
 * them. An editor that still opened in sixteen would show that sysop's
 * artists a screen none of their callers will ever see, and leave them to
 * remember a button - so the preview starts where the board is, and the
 * button is there to look at the other one.
 *
 * The query is the same key the System Config page uses, so the two share a
 * cache and a save on that page moves the editor with it. Sixteen until the
 * answer arrives, and sixteen if it never does: that is what the board sends
 * when nothing says otherwise.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { PaletteMode } from '../utils/ansi-palette';

export function useBoardPalette(): PaletteMode {
  const { data } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: () => apiClient.getSystemConfig(),
    // A board's colour depth is not news; it changes when a sysop changes it.
    staleTime: 5 * 60 * 1000,
  });

  const config = (data as { data?: { terminal_colours?: number | string } } | undefined)?.data;
  return Number(config?.terminal_colours) === 8 ? 'amiga' : 'full';
}
