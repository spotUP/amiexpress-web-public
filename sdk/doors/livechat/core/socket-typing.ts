import type { AppState } from './state';
import type { UIComponents } from './renderer';
import type { BBSEvent } from '../types';
import { processKeystroke } from '../ui/typing-preview';
import { getUserColor } from './formatter';
import { formatBBSEvent } from '../services';
import { renderTypingArea, appendToLog } from './renderer';
import { AudioService } from '../utils/audio';

/** Setup typing socket events */
export function setupTypingEvents(
  socket: any,
  state: AppState,
  ui: UIComponents
): void {
  socket.on('chat:keystroke', (data: any) => {
    if (data.channelId !== state.currentChannel) return;
    processKeystroke(
      state.typingBuffers,
      data.userId,
      data.username,
      data.char,
      getUserColor(data.username)
    );
    renderTypingArea(ui, state);
    ui.screen.render();
  });
}

/** Setup BBS event socket events */
export function setupBBSEvents(
  socket: any,
  state: AppState,
  ui: UIComponents,
  audio: AudioService
): void {
  socket.on('bbs:event', (event: BBSEvent) => {
    if (state.prefs.muteAllEvents) return;
    audio.onNotification();
    appendToLog(ui, formatBBSEvent(event));
    ui.screen.render();
  });
}
