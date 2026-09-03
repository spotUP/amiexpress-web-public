/**
 * MISSION mode - the sysop's editor.
 *
 * The reference ships an editor and this door shipped a JSON file, so a
 * sysop who wanted a mission of their own had to leave the board, find the
 * file and know the schema. This is that editor, in the door.
 *
 * Two screens, both lists, because that is what this door already uses:
 * the pack (its missions, plus a row to add one) and one mission (its
 * fields). Cycled fields step with LEFT/RIGHT; typed ones ask.
 *
 * Nothing is written until S. The rules live in core/mission-edit.ts, and
 * every save goes through parseMissionPack (core/mission-store.ts), so the
 * editor cannot produce a pack the game would refuse to load.
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

import {
  MISSION_FIELDS,
  blankMission,
  cycleField,
  fieldValue,
  setField,
  type MissionField,
} from '../core/mission-edit';
import { saveSysopPack } from '../core/mission-store';
import type { Mission, MissionPack } from '../core/mission-types';

/** Ask for one line of text. Resolves null when the sysop backs out. */
function ask(screen: Screen, title: string, current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const box = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 52,
      height: 7,
      border: { type: 'line' },
      label: ` ${title} `,
      style: { bg: 'black', border: { fg: 'cyan' } },
      fixed: true,
      tags: true,
      content: `\n {white-fg}Type a value and press ENTER. ESC keeps "${current}".{/white-fg}`,
    } as any);

    const input: any = (screen as any).program
      ? require('@amiexpress/bbs-door-sdk/engines/ui/blessed').Textbox
      : null;

    const field = new input({
      parent: box,
      bottom: 1,
      left: 2,
      width: 46,
      height: 1,
      inputOnFocus: true,
      style: { bg: 'blue', fg: 'white' },
    });

    const done = (value: string | null): void => {
      field.destroy();
      box.destroy();
      screen.render();
      resolve(value);
    };

    field.setValue(current);
    field.focus();
    screen.render();

    field.key(['escape'], () => done(null));
    field.on('submit', (value: string) => done(value ?? ''));
  });
}

/** Tell the sysop something and wait for a key. */
function say(screen: Screen, title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const box = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 56,
      height: 8,
      border: { type: 'line' },
      label: ` ${title} `,
      style: { bg: 'black', border: { fg: 'cyan' } },
      fixed: true,
      tags: true,
      keys: true,
      content: `\n {white-fg}${message}{/white-fg}\n\n {yellow-fg}Any key.{/yellow-fg}`,
    } as any);

    (box as any).focus();
    screen.render();
    (box as any).key(['escape', 'enter', 'return', 'space', 'q'], () => {
      box.destroy();
      screen.render();
      resolve();
    });
  });
}

/** One mission's fields. Returns the edited mission, or null on ESC. */
function editMission(screen: Screen, mission: Mission): Promise<Mission | null> {
  return new Promise((resolve) => {
    let working: Mission = { ...mission, modifiers: { ...mission.modifiers } };

    const rows = (): string[] => MISSION_FIELDS.map((spec) => {
      const value = fieldValue(working, spec.field);
      const arrows = spec.kind === 'choice' ? '<   >' : '     ';
      return ` ${spec.label.padEnd(14, ' ')}${arrows.slice(0, 2)}${value.padEnd(22, ' ')}${arrows.slice(2)}`;
    });

    const box = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 56,
      height: MISSION_FIELDS.length + 6,
      border: { type: 'line' },
      label: ` EDIT - ${mission.name} `,
      style: { bg: 'black', border: { fg: 'cyan' } },
      fixed: true,
      tags: true,
    } as any);

    const list = createList({
      parent: box,
      top: 1,
      left: 1,
      width: 52,
      height: MISSION_FIELDS.length,
      keys: true,
      vi: true,
      mouse: true,
      style: { selected: { bg: 'blue', fg: 'white' }, item: { fg: 'white' } },
      items: rows(),
    } as any);

    const help = createBox({
      parent: box,
      bottom: 1,
      left: 1,
      width: 52,
      height: 2,
      tags: true,
      style: { bg: 'black', fg: 'white' },
    } as any);

    const repaint = (): void => {
      const at = (list as any).selected ?? 0;
      (list as any).setItems(rows());
      (list as any).select(at);
      const spec = MISSION_FIELDS[at];
      help.setContent(
        ` {cyan-fg}${spec?.help ?? ''}{/cyan-fg}\n`
        + ` {yellow-fg}LEFT/RIGHT{/yellow-fg} change  {yellow-fg}ENTER{/yellow-fg} type  {yellow-fg}ESC{/yellow-fg} back`,
      );
      screen.render();
    };

    const done = (result: Mission | null): void => {
      list.destroy();
      help.destroy();
      box.destroy();
      screen.render();
      resolve(result);
    };

    const step = (direction: number): boolean => {
      const spec = MISSION_FIELDS[(list as any).selected ?? 0];
      if (!spec) return true;
      if (spec.kind === 'choice') {
        working = cycleField(working, spec.field, direction);
        repaint();
      }
      // Consumed either way: this List reads LEFT and RIGHT as page-up and
      // page-down, which would throw the highlight across the form.
      return true;
    };

    const type = async (): Promise<void> => {
      const spec = MISSION_FIELDS[(list as any).selected ?? 0];
      if (!spec) return;
      if (spec.kind === 'choice') { step(1); return; }

      const typed = await ask(screen, spec.label, fieldValue(working, spec.field as MissionField));
      if (typed === null) { repaint(); return; }

      const result = setField(working, spec.field, typed);
      if ('error' in result) {
        await say(screen, 'NOT SAVED', result.error);
      } else {
        working = result.mission;
      }
      list.focus();
      repaint();
    };

    (list as any).key(['right', 'l'], () => step(1));
    (list as any).key(['left', 'h'], () => step(-1));
    (list as any).on('select', () => { void type(); });
    (list as any).key(['escape', 'q'], () => done(null));
    (list as any).key(['s'], () => done(working));

    list.focus();
    repaint();
  });
}

export interface MissionEditorResult {
  /** The file written, when the sysop saved. */
  savedTo?: string;
}

/**
 * Edit a pack.
 *
 * `pack` is a starting point - the shipped pack is content and is never
 * written to, so a save always produces a sysop pack under the data
 * directory, named after the pack.
 */
export async function showMissionEditor(
  screen: Screen,
  pack: MissionPack,
  dataDir: string,
): Promise<MissionEditorResult> {
  // A copy: leaving without saving must leave the pack that is in play alone.
  const working: MissionPack = {
    name: pack.name,
    missions: pack.missions.map((mission) => ({ ...mission, modifiers: { ...mission.modifiers } })),
  };
  const result: MissionEditorResult = {};

  for (;;) {
    const choice = await pickRow(screen, working);
    if (choice === null) return result;

    if (choice === 'name') {
      const typed = await ask(screen, 'PACK NAME', working.name);
      if (typed && typed.trim()) working.name = typed.trim().slice(0, 30);
      continue;
    }

    if (choice === 'add') {
      const created = await editMission(screen, blankMission(working.missions.length));
      if (created) working.missions.push(created);
      continue;
    }

    if (choice === 'save') {
      try {
        result.savedTo = saveSysopPack(dataDir, working);
        await say(screen, 'SAVED', `Written to ${result.savedTo}.\n Players will see it next time MISSIONS opens.`);
      } catch (error) {
        // The loader refused it. Say exactly what it said - the sysop is
        // still here and can fix it.
        await say(screen, 'NOT SAVED', (error as Error).message);
      }
      continue;
    }

    if (typeof choice === 'object' && 'remove' in choice) {
      if (working.missions.length <= 1) {
        await say(screen, 'NOT REMOVED', 'A pack needs at least one mission.');
        continue;
      }
      working.missions.splice(choice.remove, 1);
      continue;
    }

    if (typeof choice === 'object' && 'edit' in choice) {
      const edited = await editMission(screen, working.missions[choice.edit]);
      if (edited) working.missions[choice.edit] = edited;
    }
  }
}

type PackChoice = 'name' | 'add' | 'save' | { edit: number } | { remove: number } | null;

/** The pack screen: its missions, and what can be done to them. */
function pickRow(screen: Screen, pack: MissionPack): Promise<PackChoice> {
  return new Promise((resolve) => {
    const rows = [
      ` {cyan-fg}Pack name{/cyan-fg}  ${pack.name}`,
      ...pack.missions.map((mission, index) =>
        ` ${String(index + 1).padStart(2, ' ')}. ${mission.name.padEnd(22, ' ')}`
        + `${mission.objective} ${mission.objective === 'survive' ? '' : mission.norm}`),
      ' {green-fg}+ Add a mission{/green-fg}',
      ' {yellow-fg}S Save this pack{/yellow-fg}',
    ];

    const box = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 56,
      height: Math.min(rows.length, 16) + 5,
      border: { type: 'line' },
      label: ` MISSION EDITOR - ${pack.name} `,
      style: { bg: 'black', border: { fg: 'cyan' } },
      fixed: true,
      tags: true,
    } as any);

    const list = createList({
      parent: box,
      top: 1,
      left: 1,
      width: 52,
      height: Math.min(rows.length, 16),
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      style: { selected: { bg: 'blue', fg: 'white' }, item: { fg: 'white' } },
      items: rows,
    } as any);

    const help = createBox({
      parent: box,
      bottom: 1,
      left: 1,
      width: 52,
      height: 1,
      tags: true,
      style: { bg: 'black', fg: 'white' },
      content: ' {yellow-fg}ENTER{/yellow-fg} edit  {yellow-fg}D{/yellow-fg} delete  '
        + '{yellow-fg}S{/yellow-fg} save  {yellow-fg}ESC{/yellow-fg} leave',
    } as any);

    const done = (choice: PackChoice): void => {
      list.destroy();
      help.destroy();
      box.destroy();
      screen.render();
      resolve(choice);
    };

    const missionAt = (index: number): number | null => {
      const at = index - 1;                       // row 0 is the pack name
      return at >= 0 && at < pack.missions.length ? at : null;
    };

    (list as any).on('select', () => {
      const at = (list as any).selected ?? 0;
      if (at === 0) return done('name');
      const mission = missionAt(at);
      if (mission !== null) return done({ edit: mission });
      if (at === pack.missions.length + 1) return done('add');
      return done('save');
    });

    (list as any).key(['d'], () => {
      const mission = missionAt((list as any).selected ?? 0);
      if (mission !== null) done({ remove: mission });
    });
    (list as any).key(['s'], () => done('save'));
    (list as any).key(['escape', 'q'], () => done(null));

    list.focus();
    screen.render();
  });
}
