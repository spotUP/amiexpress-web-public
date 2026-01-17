/** Door metadata interface */
export interface DoorMetadata {
    name: string;
    version: string;
    author: string;
    description: string;
    minSecurityLevel: number;
    command: string;
    category: string;
}
/** Door metadata */
export declare const metadata: DoorMetadata;
/** Default channel IDs */
export declare const defaultChannels: {
    general: string;
    random: string;
    help: string;
    system: string;
};
/** UI dimensions */
export declare const layout: {
    sidebarWidth: number;
    headerHeight: number;
    inputHeight: number;
    typingHeight: number;
};
/** Timing config */
export declare const timing: {
    typingTimeout: number;
    typingCleanup: number;
    reconnectDelay: number;
};
