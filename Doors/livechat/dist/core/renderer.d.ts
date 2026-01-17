import type { AppState } from './state';
/** UI component references */
export interface UIComponents {
    screen: any;
    topBar: any;
    channelList: any;
    channelHeader: any;
    chatLog: any;
    typingPreview: any;
    inputBox: any;
    statusBar: any;
}
/** Render all UI components */
export declare function render(ui: UIComponents, state: AppState, user: any): void;
/** Render top bar */
export declare function renderTopBar(ui: UIComponents, state: AppState, user: any): void;
/** Render channel header */
export declare function renderChannelHeader(ui: UIComponents, state: AppState): void;
/** Render typing preview */
export declare function renderTypingArea(ui: UIComponents, state: AppState): void;
/** Render input box */
export declare function renderInputBox(ui: UIComponents, state: AppState): void;
/** Append message to chat log */
export declare function appendToLog(ui: UIComponents, line: string): void;
/** Clear chat log */
export declare function clearLog(ui: UIComponents): void;
