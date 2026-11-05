/**
 * Settings event checkboxes
 */
import { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/state';
export declare function createEventCheckboxes(p: Box, state: AppState, l: number, r: number): {
    showLogins: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Checkbox;
    showFileActivity: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Checkbox;
    showDoorActivity: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Checkbox;
    showMessages: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Checkbox;
    showAnnouncements: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Checkbox;
    nextRow: number;
};
