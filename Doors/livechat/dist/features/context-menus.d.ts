import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare function createContextMenus(s: Screen, ib: any, sup: (u: string) => void, sdp: (u: string) => void, asm: (m: string) => void, sock: any): {
    contextMenu: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").List;
    showContextMenu: (x: number, y: number, t: "user" | "chat" | "channel", tgt?: string) => void;
    hideContextMenu: () => void;
};
