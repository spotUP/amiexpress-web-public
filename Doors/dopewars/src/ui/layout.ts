import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createScreen } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { T, S } from '../door-theme';

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
    smartCSR: false,
  });

  const header = blessed.box({
    parent: screen, top: 0, left: 0, width: '100%', height: 1,
    tags: true,
    // A bar, not a framed box: blessed.box builds a Panel, and Panel draws a
    // line border when the caller names none. A one-row box with a frame has
    // no interior, so this header has never shown a character of its content.
    border: undefined,
    // A bar takes the bar TOKENS. The SDK's own footerStyle() is
    // {fg: dim, bg: tokens.bar}, so the bar token is what a bar's ground is;
    // classic's are blue/white, which is what this always was.
    style: { fg: T.barInk, bg: T.bar },
    content: '',
  });

  const market = blessed.box({
    parent: screen, top: 1, left: 0, width: '34%', height: '75%-1',
    border: { type: 'line' },
    tags: true,
    style: S.panel.style,
    label: ' MARKET ',
    scrollable: true, keys: true, vi: true,
    content: '',
  });

  const inventory = blessed.box({
    parent: screen, top: 1, left: '34%', width: '28%', height: '75%-1',
    border: { type: 'line' },
    tags: true,
    style: S.panel.style,
    label: ' INVENTORY ',
    content: '',
  });

  const events = blessed.box({
    parent: screen, top: 1, left: '62%', width: '38%', height: '75%-1',
    border: { type: 'line' },
    tags: true,
    style: S.panel.style,
    label: ' EVENTS ',
    scrollable: true, alwaysScroll: true,
    content: '',
  });

  const players = blessed.box({
    parent: screen, top: '75%', left: 0, width: '100%', height: 3,
    border: { type: 'line' },
    tags: true,
    style: { ...S.panel.style, fg: T.accent },
    label: ' PLAYERS HERE ',
    content: '---',
  });

  const actions = blessed.box({
    parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
    tags: true,
    style: { fg: T.barInk, bg: T.bar },
    content: '',
  });

  return { screen, header, market, inventory, events, players, actions };
}
