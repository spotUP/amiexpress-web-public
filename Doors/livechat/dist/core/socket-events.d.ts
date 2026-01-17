import type { AppState } from './state';
import type { UIComponents } from './renderer';
import { AudioService } from '../utils/audio';
/** Setup all socket event handlers */
export declare function setupSocketEvents(socket: any, state: AppState, ui: UIComponents, audio: AudioService, currentUser: string): void;
