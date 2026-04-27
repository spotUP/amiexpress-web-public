import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export interface Layout {
  screen:    ReturnType<typeof createScreen>;
  header:    ReturnType<typeof blessed.box>;
  market:    ReturnType<typeof blessed.box>;
  inventory: ReturnType<typeof blessed.box>;
  events:    ReturnType<typeof blessed.box>;
  players:   ReturnType<typeof blessed.box>;
  actions:   ReturnType<typeof blessed.box>;
}

export function createLayout(session: any): Layout {
  const bbs = session?.bbs ?? session;
  const screen = createScreen(bbs, {
    smartCSR: true,
  });

  const header = blessed.box({
    parent: screen, top: 0, left: 0, width: '100%', height: 1,
    tags: true,
    style: { fg: 'white', bg: 'blue' },
    content: '',
  });

  const market = blessed.box({
    parent: screen, top: 1, left: 0, width: '34%', height: '75%-1',
    border: { type: 'line' },
    tags: true,
    style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
    label: ' MARKET ',
    scrollable: true, keys: true, vi: true,
    content: '',
  });

  const inventory = blessed.box({
    parent: screen, top: 1, left: '34%', width: '33%', height: '75%-1',
    border: { type: 'line' },
    tags: true,
    style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
    label: ' INVENTORY ',
    content: '',
  });

  const events = blessed.box({
    parent: screen, top: 1, left: '67%', width: '33%', height: '75%-1',
    border: { type: 'line' },
    tags: true,
    style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
    label: ' EVENTS ',
    scrollable: true, alwaysScroll: true,
    content: '',
  });

  const players = blessed.box({
    parent: screen, top: '75%', left: 0, width: '100%', height: 3,
    border: { type: 'line' },
    tags: true,
    style: { border: { fg: 'yellow' }, fg: 'yellow', bg: 'black' },
    label: ' PLAYERS HERE ',
    content: '---',
  });

  const actions = blessed.box({
    parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
    tags: true,
    style: { fg: 'white', bg: 'blue' },
    content: '',
  });

  return { screen, header, market, inventory, events, players, actions };
}
