"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSearchOverlay = createSearchOverlay;
/**
 * Search overlay UI component - uses SDK SearchModal widget
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
function createSearchOverlay(screen, onSearch, onClose) {
    const modal = new blessed_1.SearchModal({
        parent: screen,
        title: 'Message Search',
        searchLabel: 'Query',
        borderColor: 'green',
        zIndex: 9990,
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
        searchInput: null, // Not exposed directly, use modal methods
        usernameInput: null,
        resultsList: null,
        updateResults: (results) => {
            const searchResults = results.map((r, idx) => {
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
