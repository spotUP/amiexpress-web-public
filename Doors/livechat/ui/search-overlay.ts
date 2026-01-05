/**
 * Search overlay UI component
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createTextarea, createList, createText } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export function createSearchOverlay(
  screen: Screen,
  onSearch: (query: string, filters: any) => void,
  onClose: () => void
) {
  const overlay = createBox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '90%',
    height: '90%',
    border: { type: 'line' },
    style: { border: { fg: 'green' } },
    label: ' Message Search ',
    tags: true,
    keys: true,
    mouse: true,
    hidden: true,
    trapFocus: true,
  });

  // Search input
  const searchInput = createTextarea({
    parent: overlay,
    top: 1,
    left: 2,
    width: '50%',
    height: 3,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    label: ' Query ',
    inputOnFocus: true,
    keys: true,
    mouse: true
  });

  // Username filter
  const usernameInput = createTextarea({
    parent: overlay,
    top: 1,
    left: '52%',
    width: '46%',
    height: 3,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    label: ' Username (optional) ',
    inputOnFocus: true,
    keys: true,
    mouse: true
  });

  // Results list
  const resultsList = createList({
    parent: overlay,
    top: 5,
    left: 2,
    width: '96%',
    height: '100%-8',
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      selected: { bg: 'blue', fg: 'white' }
    },
    label: ' Results ',
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    scrollbar: { ch: '█' }
  });

  // Help text
  const helpText = createText({
    parent: overlay,
    bottom: 0,
    left: 2,
    width: '96%',
    height: 1,
    content: '{cyan-fg}Enter: Search | Tab: Next field | Esc: Close{/cyan-fg}',
    tags: true
  });

  // Handle search submit
  searchInput.on('submit', () => {
    const query = searchInput.getValue();
    const username = usernameInput.getValue();
    onSearch(query, { username: username || undefined });
  });

  // Handle Tab key to switch fields
  searchInput.key('tab', () => {
    usernameInput.focus();
  });

  usernameInput.key('tab', () => {
    searchInput.focus();
  });

  // Handle Escape
  overlay.key(['escape'], () => {
    onClose();
  });

  overlay.show();
  searchInput.focus();
  screen.render();

  return {
    overlay,
    searchInput,
    usernameInput,
    resultsList,
    updateResults: (results: any[]) => {
      const items = results.map((r, idx) => {
        const date = new Date(r.created_at * 1000).toLocaleString();
        const highlight = r.highlighted || r.message;
        return `{cyan-fg}${idx + 1}.{/cyan-fg} {yellow-fg}${r.sender_username}{/yellow-fg} @ ${date}: ${highlight}`;
      });
      resultsList.setItems(items.length > 0 ? items : ['{gray-fg}No results found{/gray-fg}']);
      screen.render();
    },
    destroy: () => {
      overlay.hide();
      overlay.destroy();
      screen.render();
    }
  };
}
