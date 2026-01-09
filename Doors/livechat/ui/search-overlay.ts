/**
 * Search overlay UI component - uses SDK SearchModal widget
 */
import { Screen, SearchModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { SearchResult } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export function createSearchOverlay(
  screen: Screen,
  onSearch: (query: string, filters: any) => void,
  onClose: () => void
) {
  const modal = new SearchModal({
    parent: screen,
    title: 'Message Search',
    searchLabel: 'Query',
    borderColor: 'green',
    filters: [
      { id: 'username', label: 'Username (optional)' }
    ],
    helpText: '{cyan-fg}Enter: Search | Tab: Next field | Esc: Close{/cyan-fg}',
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
          content: `{cyan-fg}${idx + 1}.{/cyan-fg} {yellow-fg}${r.sender_username}{/yellow-fg} @ ${date}: ${highlight}`,
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
