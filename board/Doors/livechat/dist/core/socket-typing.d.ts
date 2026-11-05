import type { AppState } from './state';
import type { UIComponents } from './renderer';
import type { BBSEvent } from '../types';
import { AudioService } from '../utils/audio';
/** Setup typing socket events */
export declare function setupTypingEvents(socket: any, state: AppState, ui: UIComponents): void;
/** Check if event should be shown based on user preferences */
export declare function shouldShowEvent(event: BBSEvent, prefs: AppState['prefs']): boolean;
/** Setup BBS event socket events */
export declare function setupBBSEvents(socket: any, state: AppState, ui: UIComponents, audio: AudioService): void;
