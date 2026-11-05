export interface DmSidebarHandlerCtx {
    socket: any;
    state: any;
    userId: number;
    screen: any;
    updateChannelList: () => void;
    addChatMessage: (line: string, applyMarkdown?: boolean) => void;
}
export declare function setupDmSidebarHandlers(ctx: DmSidebarHandlerCtx): void;
