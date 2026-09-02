/**
 * MISSION mode - the briefing.
 *
 * The select screen names a mission and its one-line hint; that is not enough
 * to play one. A mission carries an objective, a norm, a clock, a starting
 * speed, a stack of garbage and up to four rule changes, and the player meets
 * all of them at once when the first piece falls. This is the screen that
 * says so first.
 *
 * The text is built by a pure function so the wording can be tested without a
 * terminal - the same reason core/mission-run.ts judges away from the engine.
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Mission, MissionPack } from '../core/mission-types';
import type { MissionClear } from '../core/mission-progress';
import { formatClearTime } from './mission-select';

/** One sentence saying what the player has to do. */
export function missionObjectiveText(mission: Mission): string {
  const { objective, norm, timeLimitSeconds } = mission;
  const times = (n: number) => (n === 1 ? 'once' : `${n} times`);

  switch (objective) {
    case 'lines':       return `Clear ${norm} lines. Any size counts.`;
    case 'single':      return `Clear exactly one line, ${times(norm)}.`;
    case 'double':      return `Clear two lines at once, ${times(norm)}.`;
    case 'triple':      return `Clear three lines at once, ${times(norm)}.`;
    case 'tetris':      return `Clear four lines at once, ${times(norm)}.`;
    case 'cycle':       return 'Clear one line, two, three and four - one of each.';
    case 'tspin':       return `Clear lines with a T-spin, ${times(norm)}.`;
    case 'tspinDouble': return `Clear two lines at once with a T-spin, ${times(norm)}.`;
    case 'combo':       return `Reach a ${norm}-combo: clear on ${norm} pieces in a row.`;
    case 'allClear':    return `Empty the whole board, ${times(norm)}.`;
    case 'pieces':      return `Place ${norm} pieces without topping out.`;
    case 'level':       return `Reach level ${norm}.`;
    case 'b2bTetris':   return `Clear four lines at once ${times(norm)} in a row. `
                             + 'A smaller clear resets the count.';
    case 'survive':     return `Stay alive for ${timeLimitSeconds} seconds.`;
    default:            return 'Play.';
  }
}

/** Every rule this mission changes, in the order a player meets them. */
export function missionConditions(mission: Mission): string[] {
  const conditions: string[] = [];

  if (mission.timeLimitSeconds > 0 && mission.objective !== 'survive') {
    conditions.push(`Time limit: ${formatClearTime(mission.timeLimitSeconds)}`);
  }
  if (mission.startLevel > 0) {
    conditions.push(`Starts at level ${mission.startLevel}`);
  }
  if (mission.garbageRows > 0) {
    conditions.push(`${mission.garbageRows} rows of garbage to dig through`);
  }
  if (mission.modifiers.big) {
    conditions.push('BIG: every piece is twice the size');
  }
  if (mission.modifiers.hideNext) {
    conditions.push('HIDE NEXT: no preview of what is coming');
  }
  if (mission.modifiers.hidden) {
    conditions.push('HIDDEN: locked blocks vanish - they are still there');
  }
  if (mission.modifiers.rollRoll) {
    conditions.push('ROLL ROLL: the piece turns by itself');
  }

  return conditions;
}

/**
 * The whole briefing as lines, ready to paint. Exported for the same reason
 * the pieces above are: what the player is told is worth a test.
 */
export function missionBriefingLines(mission: Mission, clear: MissionClear | null): string[] {
  const lines: string[] = [
    `{bold}{yellow-fg}${mission.name}{/yellow-fg}{/bold}`,
    '',
    `{white-fg}${missionObjectiveText(mission)}{/white-fg}`,
  ];

  const conditions = missionConditions(mission);
  if (conditions.length > 0) {
    lines.push('');
    for (const condition of conditions) lines.push(`{cyan-fg}- ${condition}{/cyan-fg}`);
  }

  if (mission.hint) {
    lines.push('', `{gray-fg}${mission.hint}{/gray-fg}`);
  }

  lines.push('');
  lines.push(clear
    ? `{green-fg}Cleared in ${formatClearTime(clear.seconds)}{/green-fg}`
    : '{gray-fg}Not cleared yet{/gray-fg}');

  return lines;
}

/**
 * Pick a mission and read its briefing, until the player either starts one or
 * leaves the pack.
 *
 * The loop lives here rather than in app.ts so it can be driven in a test:
 * backing out of a briefing has to return to the LIST, not to the menu, and
 * that is the part a player notices when it is wrong.
 */
export async function pickMission(
  pack: MissionPack,
  clearFor: (missionId: string) => MissionClear | null,
  dialogs: {
    select: (pack: MissionPack) => Promise<Mission | null>;
    brief: (mission: Mission, clear: MissionClear | null) => Promise<boolean>;
  }
): Promise<Mission | null> {
  for (;;) {
    const picked = await dialogs.select(pack);
    if (!picked) return null;
    if (await dialogs.brief(picked, clearFor(picked.id))) return picked;
  }
}

/**
 * Show the briefing. Resolves true to start the mission, false to go back to
 * the pack - the player has to be able to change their mind after reading
 * what they picked.
 */
export async function showMissionBriefing(
  screen: Screen,
  mission: Mission,
  clear: MissionClear | null
): Promise<boolean> {
  const lines = missionBriefingLines(mission, clear);

  return new Promise((resolve) => {
    const box = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 52,
      height: lines.length + 6,
      border: { type: 'line' },
      label: ' MISSION BRIEFING ',
      style: { bg: 'black', border: { fg: 'yellow' } },
      fixed: true,
      tags: true,
      content: lines.join('\n')
        + '\n\n{bold}ENTER{/bold} start    {bold}ESC{/bold} pick another',
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
    } as any);

    const finish = (start: boolean) => {
      screen.removeListener('keypress', onKey);
      box.destroy();
      screen.render();
      resolve(start);
    };

    const onKey = (_ch: string | undefined, key: any) => {
      const name = key?.name;
      if (name === 'enter' || name === 'return' || name === 'space') finish(true);
      else if (name === 'escape' || name === 'q') finish(false);
    };

    screen.on('keypress', onKey);
    screen.render();
  });
}
