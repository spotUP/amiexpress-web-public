import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare function createFileSharing(s: Screen, sock: any, st: any, un: string, asm: (m: string) => void, acm: (m: string) => void, aa: (a: string) => void, aud: any, sm: (w: any) => void, hm: (w: any) => void): {
    fileSharingOverlay: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").DockablePanel;
    showFileSharing: () => void;
};
