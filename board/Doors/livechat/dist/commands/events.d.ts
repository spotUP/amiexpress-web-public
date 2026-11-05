/**
 * Event Filtering Commands
 * /events - Manage BBS event display preferences
 */
import type { SlashCommand } from './types';
import type { AppState } from '../core/state';
/**
 * /events [on|off|logins|files|doors|messages|announcements] - Manage event filtering
 */
export declare function createEventsCommand(state: AppState, addSystemMessage: (msg: string) => void, updateStatusBar: () => void): SlashCommand;
