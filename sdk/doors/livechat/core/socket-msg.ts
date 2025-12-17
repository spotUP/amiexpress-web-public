import type { AppState } from './state';
import type { UIComponents } from './renderer';
import type { Message } from '../types';
import { addMessage } from './state';
import { formatMessage, formatSystemMessage } from './formatter';
import { appendToLog } from './renderer';
import { AudioService } from '../utils/audio';
import { mentionsUser } from '../utils/mentions';

/** Setup message socket events */
export function setupMessageEvents(
  socket: any,
  state: AppState,
  ui: UIComponents,
  audio: AudioService,
  currentUser: string
): void {
  // New message
  socket.on('chat:message', (msg: Message) => {
    if (msg.channelId !== state.currentChannel) return;
    addMessage(state, msg);
    const isMention = mentionsUser(msg.content, currentUser);
    audio.onMessage(isMention);
    appendToLog(ui, formatMessage(msg, currentUser, state.prefs.compactMode));
    ui.screen.render();
  });

  // User joined
  socket.on('chat:user-joined', (data: any) => {
    if (data.channelId !== state.currentChannel) return;
    audio.onJoin();
    appendToLog(ui, formatSystemMessage(`${data.username} joined`));
    ui.screen.render();
  });

  // User left
  socket.on('chat:user-left', (data: any) => {
    if (data.channelId !== state.currentChannel) return;
    audio.onLeave();
    appendToLog(ui, formatSystemMessage(`${data.username} left`));
    ui.screen.render();
  });
}
