import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare function createDialogs(s: Screen, ib: any): {
    modalOverlay: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Overlay;
    showModal: (w: any) => void;
    hideModal: (w: any) => void;
    messageDialog: any;
    promptDialog: any;
    questionDialog: any;
    showMessageDialog: (t: string, cb?: () => void) => void;
    showPromptDialog: (t: string, v: string, cb: (e: Error | null, val?: string) => void) => void;
    showConfirmDialog: (t: string, cb: (a: boolean) => void) => void;
};
