import type { AppState } from './state';
import type { UIComponents } from './renderer';
import { AudioService } from '../utils/audio';
/** Setup message socket events */
export declare function setupMessageEvents(socket: any, state: AppState, ui: UIComponents, audio: AudioService, currentUser: string): void;
