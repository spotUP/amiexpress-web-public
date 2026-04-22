import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { AppState } from '../core/state';
export declare function createProfileOverlay(s: Screen, ib: any, users: any, uname: string, st: AppState, getColor: any, getChan: any, showMsg: any, showDM: any, show: any, hide: any): {
    overlay: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Panel;
    showProfile: (u: string) => void;
};
