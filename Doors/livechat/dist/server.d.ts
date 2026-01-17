/**
 * LiveChat v3.2 - Desktop-Level Multi-User Chat
 *
 * Full-featured chat with advanced neo-blessed UI:
 * - Menu bar with keyboard shortcuts
 * - Simple list for channels with selection
 * - Table view for users with columns
 * - Popup dialogs and overlays
 * - Loading spinners
 * - Mouse support everywhere
 * - Settings panel with checkboxes
 */
import { AppState } from './core/state';
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
export declare function createApp(session: DoorSession): Promise<{
    state: AppState;
    run(): Promise<void>;
}>;
export {};
