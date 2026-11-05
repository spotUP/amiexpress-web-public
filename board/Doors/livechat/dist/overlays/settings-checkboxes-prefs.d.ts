/**
 * Settings preference checkboxes
 */
import { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare function createPrefCheckboxes(p: Box, l: number, r: number, g: number): {
    muteSounds: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Checkbox;
    showTyping: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Checkbox;
    timestamps: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Checkbox;
    nextRow: number;
};
