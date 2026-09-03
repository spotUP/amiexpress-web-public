/**
 * MISSION mode - the select screen.
 *
 * Free selection: every mission in the pack is playable from the start, and
 * the list doubles as a progress board - a cleared mission shows its best
 * time. HeborisCE's own mission screen is a browser over a pack too
 * (mission.c:47-171 walks the entries with the same left/right keys).
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Mission, MissionPack } from '../core/mission-types';
import type { MissionProgress } from '../core/mission-progress';

/** mm:ss for a clear time. */
export function formatClearTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * One row per mission: number, name, objective, and the best time if this
 * player has cleared it. Exported so a test can assert what the list SAYS
 * without building a terminal.
 */
export function missionRows(
  pack: MissionPack,
  clears: Record<string, { seconds: number }>
): string[] {
  return pack.missions.map((mission, index) => {
    const cleared = clears[mission.id];
    const mark = cleared ? `{green-fg}[${formatClearTime(cleared.seconds)}]{/green-fg}` : '{gray-fg}[  -  ]{/gray-fg}';
    const number = String(index + 1).padStart(2, '0');
    return `${number}  ${mission.name.padEnd(16).slice(0, 16)}  ${mark}`;
  });
}

/**
 * Show the pack and return the chosen mission, or null if the player quit.
 */
/**
 * What the select screen came back with: a mission, nothing, or - for a
 * sysop, who is the only one offered it - the editor.
 */
export type MissionChoice = Mission | 'edit' | null;

export async function showMissionSelect(
  screen: Screen,
  pack: MissionPack,
  progress: MissionProgress,
  playerName: string,
  /** Sysops get one extra key. Everyone else is not told about it. */
  canEdit = false
): Promise<MissionChoice> {
  const clears = progress.getClears(playerName, pack.name);
  const rows = missionRows(pack, clears);
  const done = Object.keys(clears).length;

  return new Promise((resolve) => {
    const box = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 46,
      height: Math.min(rows.length, 14) + 6,
      border: { type: 'line' },
      label: ` MISSIONS - ${pack.name} (${done}/${pack.missions.length}) `,
      style: { bg: 'black', border: { fg: 'cyan' } },
      fixed: true,
      tags: true,
    } as any);

    const hint = createBox({
      // One row of text: a frame would leave nowhere to put it.
      border: undefined,
      parent: box,
      bottom: 1,
      left: 1,
      width: 42,
      height: 1,
      tags: true,
      style: { fg: 'gray' },
      content: pack.missions[0]?.hint ?? '',
    } as any);

    const keys = createBox({
      border: undefined,
      parent: box,
      bottom: 0,
      left: 1,
      width: 42,
      height: 1,
      tags: true,
      style: { fg: 'gray' },
      content: canEdit
        ? '{yellow-fg}ENTER{/yellow-fg} play  {yellow-fg}E{/yellow-fg} edit pack  {yellow-fg}ESC{/yellow-fg} back'
        : '{yellow-fg}ENTER{/yellow-fg} play  {yellow-fg}ESC{/yellow-fg} back',
    } as any);

    const list = createList({
      parent: box,
      top: 1,
      left: 1,
      width: 42,
      height: Math.min(rows.length, 14) + 2,
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      style: {
        selected: { bg: 'blue', fg: 'white' },
        item: { fg: 'white' },
      },
      items: rows,
    } as any);

    const close = (mission: MissionChoice) => {
      list.destroy();
      hint.destroy();
      keys.destroy();
      box.destroy();
      screen.render();
      resolve(mission);
    };

    (list as any).on('select item', (_item: any, index: number) => {
      hint.setContent(pack.missions[index]?.hint ?? '');
      screen.render();
    });
    (list as any).key(['enter', 'return'], () => {
      const index = (list as any).selected ?? 0;
      close(pack.missions[index] ?? null);
    });
    (list as any).key(['escape', 'q'], () => close(null));

    // E opens the editor, for a sysop. The hint row says so only when it is
    // true: an offer a player cannot take is worse than no offer.
    if (canEdit) {
      (list as any).key(['e'], () => close('edit'));
    }

    list.focus();
    screen.render();
  });
}
