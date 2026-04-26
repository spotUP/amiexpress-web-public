/**
 * Training mode level selector dialog
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export interface TrainingConfig {
  startLevel: number;
}

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

export async function showTrainingConfig(screen: Screen): Promise<TrainingConfig> {
  const items = LEVELS.map(l => `Level ${l.toString().padStart(3, ' ')} - ${LEVEL_DESCS[l]}`);

  return new Promise((resolve) => {
    const box = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 44,
      height: items.length + 4,
      border: { type: 'line' },
      label: ' TRAINING - SELECT START LEVEL ',
      style: { bg: 'black', border: { fg: 'cyan' } },
      fixed: true,
      tags: true,
    } as any);

    const list = createList({
      parent: box,
      top: 1,
      left: 1,
      width: 40,
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
      resolve({ startLevel: LEVELS[idx] });
    };

    (list as any).key(['enter', 'return'], () => done((list as any).selected ?? 0));
    (list as any).key(['escape'], () => done(0));
  });
}
