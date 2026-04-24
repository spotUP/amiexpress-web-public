import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export interface ContextMenuExtras {
    isSysop?: boolean;
    onFocusTile?: (userId: string) => void;
    onHideTile?: (userId: string) => void;
    onMuteRemote?: (userId: string) => void;
    onToggleChannelExpand?: (channelName: string) => void;
}
export declare function createContextMenus(s: Screen, ib: any, sup: (u: string) => void, sdp: (u: string) => void, asm: (m: string) => void, sock: any, extras?: ContextMenuExtras): {
    contextMenu: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").List;
    showContextMenu: (x: number, y: number, t: "user" | "chat" | "channel" | "video", tgt?: string) => void;
    hideContextMenu: () => void;
};
