import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Party } from '../types/party';
import type { UserStats } from '../types/user';
import type { DataManager } from '../core/data-manager';
import type { PartyCalendar } from '../core/party-calendar';
import { createProgressBar } from '../core/gamification';
import { T } from '../door-theme';
import { attachWhipChrome, type FooterHint } from './chrome';

/** The keys this screen answers to, and the same keys shortened for 40 columns. */
const HINTS: readonly FooterHint[] = [
  { key: 'Up/Down', does: 'Scroll' },
  { key: 'R', does: 'Refresh from demoparty.net' },
  { key: 'Q/ESC', does: 'Back' },
];
const COMPACT_HINTS: readonly FooterHint[] = [
  { key: 'Up/Dn', does: 'Scroll' },
  { key: 'R', does: 'Refresh' },
  { key: 'Q', does: 'Back' },
];

export async function showPartyTimeline(
  screen: Screen,
  user: UserStats,
  dataManager: DataManager,
  partyCalendar: PartyCalendar
): Promise<void> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Note: Removed 200ms artificial delay for better responsiveness

    let parties = await dataManager.loadParties();
    let selectedIndex = 0;
    let listBox: any;

    // Filter to upcoming parties and sort by date
    const upcomingParties = parties
      .filter(p => new Date(p.date) >= new Date())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // The header and the footer are built ONCE, outside render().
    //
    // They used to be torn down and rebuilt on every arrow key along with the
    // list, which was harmless while they held static text and is not once
    // they carry the chrome: the masthead and the hint row are attached to
    // these two elements, and an element replaced under a running timer is an
    // element the timer keeps painting after it has left the screen. Same
    // geometry, same place, built once.
    const header = createBox({
      fixed: true,
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      // Empty: a three-row framed box has ONE interior row, and the chrome's
      // masthead owns it now. The centred title moved to `title` below.
      content: '',
      style: { fg: T.ink, bg: T.ground, border: { fg: T.accent } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Footer - NOT focusable
    const instructions = createBox({
      fixed: true,
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      // Filled by the chrome, from the SDK's hint builder.
      content: '',
      style: { fg: T.dim, bg: T.ground, border: { fg: T.dim } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const render = async () => {
      // Remove the old list. The header and the footer stay put - see above.
      if (listBox) screen.remove(listBox);

      // Party list container - focusable (scrollable)
      listBox = createBox({
        fixed: true,
        parent: screen,
        top: 3,
        left: 1,
        width: '98%',
        height: '100%-6',
        border: { type: 'line' },
        label: ' Parties ',
        style: {
          border: { fg: T.accent },
          bg: T.ground
        },
        scrollable: true,
        alwaysScroll: true,
        mouse: true,
        keys: true,
        vi: true,
        focusable: true,
      });

      if (upcomingParties.length === 0) {
        listBox.setContent(`{center}{${T.dim}-fg}No upcoming parties found.{/${T.dim}-fg}{/center}`);
      } else {
        let content = '';

        for (let i = 0; i < upcomingParties.length; i++) {
          const party = upcomingParties[i];
          const days = partyCalendar.getDaysUntilParty(party.date);
          const color = partyCalendar.getPartyCountdownColor(days);
          const isSelected = i === selectedIndex;

          // Get user's progress for this party
          const projects = await dataManager.loadProjects();
          const partyProjects = projects.filter(p => p.partyId === party.id);
          const allTasks = await dataManager.loadTasks();
          const partyTasks = allTasks.filter(t =>
            partyProjects.some(p => p.id === t.projectId)
          );
          const completedTasks = partyTasks.filter(t => t.status === 'done').length;
          const progress = partyTasks.length > 0
            ? Math.floor((completedTasks / partyTasks.length) * 100)
            : 0;
          const progressBar = createProgressBar(progress, 24);

          const prefix = isSelected ? '{inverse}' : '';
          const suffix = isSelected ? '{/inverse}' : '';

          // Truncate long names and categories to prevent overflow
          const maxNameLength = 35;
          const partyName = party.name.length > maxNameLength
            ? party.name.substring(0, maxNameLength - 3) + '...'
            : party.name;

          const maxLocationLength = 40;
          const location = party.location.length > maxLocationLength
            ? party.location.substring(0, maxLocationLength - 3) + '...'
            : party.location;

          content += `${prefix}\n`;
          content += ` {${color}-fg}[${days < 7 ? '!' : '*'}]{/${color}-fg} {bold}${partyName}{/bold}  -  {bold}${days} days{/bold}\n`;
          content += `     Location: ${location}\n`;
          content += `     Date: ${party.date}\n`;

          if (party.categories.length > 0) {
            const cats = party.categories.join(', ');
            const maxCatsLength = 50;
            const truncatedCats = cats.length > maxCatsLength
              ? cats.substring(0, maxCatsLength - 3) + '...'
              : cats;
            content += `     Categories: ${truncatedCats}\n`;
          }

          content += `     Progress: ${progress}% ${progressBar}\n`;
          content += `     Active: ${partyTasks.length - completedTasks} | Completed: ${completedTasks}\n`;
          content += `${suffix}\n`;
        }

        listBox.setContent(content);
      }

      listBox.focus();

      screen.render();
    };

    // The whole chrome from the door's ONE call.
    const chrome = attachWhipChrome({
      screen,
      header,
      footer: instructions,
      title: 'PARTY TIMELINE 2026',
      hints: HINTS,
      compactHints: COMPACT_HINTS,
      // A getter, not the element: render() builds a NEW list pane on every
      // arrow key, and a pane captured once would be glitching a widget that
      // is no longer on screen.
      glitch: () => listBox,
    });

    const keyHandler = (ch: any, key: any) => {
      switch (key.name) {
        case 'up':
          selectedIndex = Math.max(0, selectedIndex - 1);
          render();
          break;

        case 'down':
          selectedIndex = Math.min(upcomingParties.length - 1, selectedIndex + 1);
          render();
          break;

        case 'r':
          // Refresh party data from demoparty.net
          (async () => {
            await partyCalendar.refreshParties();
            parties = await dataManager.loadParties();
            await render();
          })();
          break;

        case 'q':
        case 'escape':
          cleanup();
          resolve();
          break;
      }
    };

    screen.on('keypress', keyHandler);

    const cleanup = () => {
      // First: a rail timer still writing after these widgets are gone would
      // paint into a screen that no longer holds them.
      chrome.stop();
      screen.off('keypress', keyHandler);
      screen.remove(header);
      if (listBox) screen.remove(listBox);
      screen.remove(instructions);
    };

    await render();
  });
}
