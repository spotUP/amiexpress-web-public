import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
/** Layout configuration */
export interface LayoutConfig {
    screen: Screen;
    chatWidth: number;
    sidebarWidth: number;
    inputHeight: number;
}
/** Calculate layout dimensions */
export declare function calcLayout(screen: Screen): LayoutConfig;
/** Get chat panel bounds */
export declare function chatBounds(cfg: LayoutConfig): {
    top: number;
    left: number;
    width: number;
    height: string;
};
/** Get sidebar bounds */
export declare function sidebarBounds(cfg: LayoutConfig): {
    top: number;
    right: number;
    width: number;
    height: string;
};
/** Get input bounds */
export declare function inputBounds(cfg: LayoutConfig): {
    bottom: number;
    left: number;
    width: string;
    height: number;
};
