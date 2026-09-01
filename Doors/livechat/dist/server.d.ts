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
import { type TerminalModeSwitch } from '@amiexpress/bbs-door-sdk/utils/terminal-mode';
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
    screen: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Screen;
    readonly terminalMode: TerminalModeSwitch | null;
    run(): Promise<void>;
}>;
export {};
