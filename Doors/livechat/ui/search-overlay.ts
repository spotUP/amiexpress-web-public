/**
 * Search overlay UI component - uses SDK SearchModal widget
 */
import { Screen, SearchModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { PANEL_BORDER } from './theme';
import type { SearchResult } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { T } from '../door-theme';

export function createSearchOverlay(
  screen: Screen,
  onSearch: (query: string, filters: any) => void,
  onClose: () => void
) {
  const modal = new SearchModal({
    parent: screen,
    title: 'Message Search',
    searchLabel: 'Query',
    borderColor: PANEL_BORDER,
    zIndex: 9990,
    filters: [
      { id: 'username', label: 'Username (optional)' }
    ],
    helpText: `{${T.accent}-fg}Enter: Search | Tab: Next field | Esc: Close{/${T.accent}-fg}`,
    onSearch: (query, filters) => {
      onSearch(query, { username: filters.username || undefined });
    },
    onClose: () => {
      onClose();
    },
  });

  modal.display();

  return {
    overlay: modal,
    searchInput: null,  // Not exposed directly, use modal methods
    usernameInput: null,
    resultsList: null,
    updateResults: (results: any[]) => {
      const searchResults: SearchResult[] = results.map((r, idx) => {
        const date = new Date(r.created_at * 1000).toLocaleString();
        const highlight = r.highlighted || r.message;
        return {
          id: String(idx),
          content: `{${T.accent}-fg}${idx + 1}.{/${T.accent}-fg} {${T.accentAlt}-fg}${r.sender_username}{/${T.accentAlt}-fg} @ ${date}: ${highlight}`,
          data: r,
        };
      });
      modal.setResults(searchResults);
    },
    destroy: () => {
      modal.hide();
      modal.destroy();
      screen.render();
    }
  };
}
