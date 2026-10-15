import type { AppState } from './state';
import type { UIComponents } from './renderer';
import { AudioService } from '../utils/audio';
import { setupMessageEvents } from './socket-msg';
import { setupTypingEvents, setupBBSEvents } from './socket-typing';

/** Setup all socket event handlers */
export function setupSocketEvents(
  socket: any,
  state: AppState,
  ui: UIComponents,
  audio: AudioService,
  currentUser: string
): void {
  setupMessageEvents(socket, state, ui, audio, currentUser);
  setupTypingEvents(socket, state, ui);
  setupBBSEvents(socket, state, ui, audio);
}
