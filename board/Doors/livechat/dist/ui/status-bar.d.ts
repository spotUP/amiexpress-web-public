/**
 * Status bar component - uses SDK StatusBar widget
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/state';
import type { PresenceService } from '../services';
export declare const STATUS_HEIGHT = 1;
export declare function createStatusBar(screen: Screen): Box;
export declare function updateStatusBar(statusBar: Box, state: AppState, presenceService: PresenceService, username: string, userId: number, nodeId: number, getChannelDisplayName: (id: string) => string, updateChatHeader: () => void): void;
