/**
 * Training mode level selector dialog
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import {
  PRACTICE_GOAL_VALUES, practiceGoalTarget,
  type PracticeGoal, type PracticeGoalType,
} from '../core/practice-goal';

export interface TrainingConfig {
  startLevel: number;
  /** What ends the run (HeborisCE p_goaltype). 'none' plays until a top-out. */
  goal: PracticeGoal;
}

/**
 * The reference's five finish conditions and its own value list
 * (gamestart.c:743-745, 11229-11252). Level multiplies the value by ten, so
 * "30" here means level 300 - see core/practice-goal.ts.
 */
const GOAL_TYPES: { type: PracticeGoalType; label: string }[] = [
  { type: 'none',   label: 'Endless - play until you top out' },
  { type: 'level',  label: 'Reach a level' },
  { type: 'lines',  label: 'Clear a number of lines' },
  { type: 'pieces', label: 'Place a number of pieces' },
  { type: 'time',   label: 'Survive a number of seconds' },
];

const LEVELS = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const LEVEL_DESCS: Record<number, string> = {
  0:   'Normal start',
  100: 'Moderate speed',
  200: 'Increased gravity',
  300: 'Fast',
  400: 'Very fast',
  500: 'High gravity',
  600: 'Near-20G',
  700: 'Near-20G',
  800: 'Near-20G',
  900: '20G mode!',
};

/**
 * One list dialog, reused for each page of the training setup.
 * Escape answers with the first entry, which is the same "just play" default
 * the single-page version had.
 */
function pick(screen: Screen, title: string, items: string[]): Promise<number> {
  return new Promise((resolve) => {
    const box = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 48,
      height: items.length + 4,
      border: { type: 'line' },
      label: ` ${title} `,
      style: { bg: 'black', border: { fg: 'cyan' } },
      fixed: true,
      tags: true,
    } as any);

    const list = createList({
      parent: box,
      top: 1,
      left: 1,
      width: 44,
      height: items.length + 2,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        selected: { bg: 'blue', fg: 'white' },
        item: { fg: 'white' },
      },
      items,
    } as any);

    list.focus();
    screen.render();

    const done = (idx: number) => {
      list.destroy();
      box.destroy();
      screen.render();
      resolve(idx);
    };

    (list as any).key(['enter', 'return'], () => done((list as any).selected ?? 0));
    (list as any).key(['escape'], () => done(0));
  });
}

export async function showTrainingConfig(screen: Screen): Promise<TrainingConfig> {
  const levelIndex = await pick(
    screen,
    'TRAINING - SELECT START LEVEL',
    LEVELS.map(l => `Level ${l.toString().padStart(3, ' ')} - ${LEVEL_DESCS[l]}`)
  );
  const startLevel = LEVELS[levelIndex] ?? 0;

  const typeIndex = await pick(
    screen,
    'TRAINING - WHAT ENDS THE RUN',
    GOAL_TYPES.map(g => g.label)
  );
  const type = GOAL_TYPES[typeIndex]?.type ?? 'none';
  if (type === 'none') return { startLevel, goal: { type: 'none', value: 0 } };

  const valueIndex = await pick(
    screen,
    'TRAINING - HOW FAR',
    PRACTICE_GOAL_VALUES.map((value) => {
      const target = practiceGoalTarget({ type, value });
      switch (type) {
        case 'level':  return `Level ${target}`;
        case 'lines':  return `${target} lines`;
        case 'pieces': return `${target} pieces`;
        default:       return `${target} seconds`;
      }
    })
  );

  return {
    startLevel,
    goal: { type, value: PRACTICE_GOAL_VALUES[valueIndex] ?? PRACTICE_GOAL_VALUES[0] },
  };
}
