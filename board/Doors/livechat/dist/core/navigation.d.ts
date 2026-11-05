import type { Channel } from '../types';
/** Channel navigation state */
export interface NavState {
    selectedIndex: number;
    scrollOffset: number;
    maxVisible: number;
}
/** Create navigation state */
export declare function createNavState(maxVisible?: number): NavState;
/** Move selection up */
export declare function navUp(nav: NavState, channels: Channel[]): boolean;
/** Move selection down */
export declare function navDown(nav: NavState, channels: Channel[]): boolean;
/** Get selected channel */
export declare function getSelectedChannel(nav: NavState, channels: Channel[]): Channel | null;
/** Get visible channels for rendering */
export declare function getVisibleChannels(nav: NavState, channels: Channel[]): Channel[];
/** Select channel by ID */
export declare function selectById(nav: NavState, channels: Channel[], id: string): boolean;
