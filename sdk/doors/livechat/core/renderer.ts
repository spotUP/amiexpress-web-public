import type { AppState } from './state';
import { formatMessage, formatSystemMessage } from './formatter';
import { renderTypingPreview } from '../ui/typing-preview';
import { formatChannelHeader } from '../ui/channel-header';
import { formatTopBar } from '../ui/screen';

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
export function render(ui: UIComponents, state: AppState, user: any): void {
  renderTopBar(ui, state, user);
  renderChannelHeader(ui, state);
  renderTypingArea(ui, state);
  renderInputBox(ui, state);
  ui.screen.render();
}

/** Render top bar */
export function renderTopBar(ui: UIComponents, state: AppState, user: any): void {
  const status = state.prefs.muteAllEvents ? '[MUTED]' : '[*]';
  ui.topBar.setContent(formatTopBar(user.username, user.nodeId || 1, state.currentChannel, status));
}

/** Render channel header */
export function renderChannelHeader(ui: UIComponents, state: AppState): void {
  const channel = state.channels.find(c => c.id === state.currentChannel) || null;
  const count = state.members.length;
  ui.channelHeader.setContent(formatChannelHeader(channel, count));
}

/** Render typing preview */
export function renderTypingArea(ui: UIComponents, state: AppState): void {
  ui.typingPreview.setContent(renderTypingPreview(state.typingBuffers));
}

/** Render input box */
export function renderInputBox(ui: UIComponents, state: AppState): void {
  ui.inputBox.setContent(`> ${state.inputBuffer}_`);
}

/** Append message to chat log */
export function appendToLog(ui: UIComponents, line: string): void {
  ui.chatLog.log(line);
}

/** Clear chat log */
export function clearLog(ui: UIComponents): void {
  ui.chatLog.setContent('');
}
