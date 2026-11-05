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

/** Check if event should be shown based on user preferences */
export function shouldShowEvent(event: BBSEvent, prefs: AppState['prefs']): boolean {
  if (prefs.muteAllEvents) return false;

  switch (event.type) {
    case 'user_login':
    case 'user_logout':
      return prefs.showLogins;

    case 'upload_start':
    case 'upload_complete':
    case 'download_start':
    case 'download_complete':
      return prefs.showFileActivity;

    case 'door_enter':
    case 'door_exit':
      return prefs.showDoorActivity;

    case 'new_message':
    case 'page_sysop':
    case 'conference_join':
    case 'node_activity':
      return prefs.showMessages;

    case 'system_announcement':
      return prefs.showSystemAnnouncements;

    default:
      return true; // Show unknown events by default
  }
}

/** Setup BBS event socket events */
export function setupBBSEvents(
  socket: any,
  state: AppState,
  ui: UIComponents,
  audio: AudioService
): void {
  socket.on('bbs:event', (event: BBSEvent) => {
    if (!shouldShowEvent(event, state.prefs)) return;
    audio.onNotification();
    appendToLog(ui, formatBBSEvent(event));
    ui.screen.render();
  });
}
