/**
 * Search overlay UI component - uses SDK SearchModal widget
 */
import { Screen, SearchModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare function createSearchOverlay(screen: Screen, onSearch: (query: string, filters: any) => void, onClose: () => void): {
    overlay: SearchModal;
    searchInput: null;
    usernameInput: null;
    resultsList: null;
    updateResults: (results: any[]) => void;
    destroy: () => void;
};
