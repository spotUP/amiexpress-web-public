/**
 * Neo-Blessed modal dialogs for ANSI Editor
 * Professional UI overlays using SDK UI engine
 */
import { UIEngine, UIHelpers } from '@amiexpress/bbs-door-sdk';
import { Tool } from './types.js';
type BlessedBox = any;
export declare abstract class BaseModal {
    protected ui: UIEngine;
    protected helpers: UIHelpers;
    protected container: BlessedBox | null;
    protected result: any;
    constructor(ui: UIEngine);
    abstract show(): Promise<any>;
    protected close(): void;
}
export declare class ToolSelectorModal extends BaseModal {
    private currentTool;
    constructor(ui: UIEngine, currentTool: Tool);
    show(): Promise<Tool | null>;
}
export declare class ColorPickerModal extends BaseModal {
    private currentFg;
    private currentBg;
    private iceColorsEnabled;
    constructor(ui: UIEngine, currentFg: number, currentBg: number, iceColorsEnabled: boolean);
    show(): Promise<{
        fg: number;
        bg: number;
    } | null>;
}
export declare class FileDialogModal extends BaseModal {
    private title;
    private files;
    private action;
    constructor(ui: UIEngine, title: string, files: string[], action: 'open' | 'save');
    show(): Promise<string | null>;
}
export declare class ConfirmDialog extends BaseModal {
    private title;
    private message;
    constructor(ui: UIEngine, title: string, message: string);
    show(): Promise<boolean>;
}
export declare class MessageDialog extends BaseModal {
    private title;
    private message;
    private type;
    constructor(ui: UIEngine, title: string, message: string, type?: 'info' | 'warning' | 'error');
    show(): Promise<void>;
}
export declare class HelpDialog extends BaseModal {
    show(): Promise<void>;
}
export declare class GalleryBrowserModal extends BaseModal {
    private files;
    constructor(ui: UIEngine, files: string[]);
    show(): Promise<string | null>;
}
export declare class RecentFilesModal extends BaseModal {
    private recentFiles;
    constructor(ui: UIEngine, recentFiles: string[]);
    show(): Promise<string | null>;
}
export {};
