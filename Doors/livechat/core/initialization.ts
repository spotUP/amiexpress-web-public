import { createInitialState } from './state';
import { createCommandRegistry } from '../commands';
import { createCommandContext } from './command-exec';
import { SocketEmitter, PresenceService, ExtendedEventBus } from '../services';
import { AudioService } from '../utils/audio';
import { AudioEngine } from '@amiexpress/bbs-door-sdk/engines/audio/audio-engine';
import { MessageHandler } from '../handlers/message';
import { CommandHandler } from '../handlers/command';

export function initializeLiveChat(session: any, screen: any) {
  const { user, socket } = session;
  const username = user?.username || 'Guest';
  const userId = parseInt(user?.id, 10) || 0;
  const nodeId = session.bbsSession?.nodeId || 1;
  const secLevel = user?.secLevel || 10;

  const state = createInitialState();
  const registry = createCommandRegistry();
  const initialRoomId = session.bbsSession?.currentRoomId as string | undefined;
  const initialRoomName = session.bbsSession?.currentRoomName as string | undefined;
  let currentRoomLabel = initialRoomName || '';
  if (initialRoomId) state.currentChannel = initialRoomId;

  const socketEmitter = new SocketEmitter(socket);
  const presenceService = new PresenceService();
  const eventBus = new ExtendedEventBus(socket);
  const audioEngine = new AudioEngine({ enabled: true, sfxVolume: 0.5 }, socket);
  const audio = new AudioService(audioEngine);
  const messageHandler = new MessageHandler();
  const commandHandler = new CommandHandler();

  // Unlock audio on first interaction (click or keypress)
  (screen as any).on('user-interaction', () => {
  });

  presenceService.setStatus(userId, 'online');

  const onlineUsers = new Map();
  onlineUsers.set(String(userId), { username, status: 'online', nodeId, joinedAt: new Date() });

  const cmdCtx = createCommandContext(state, { id: userId, username, securityLevel: secLevel });

  return { username, userId, nodeId, secLevel, state, registry, currentRoomLabel,
    socketEmitter, presenceService, eventBus, audioEngine, audio, messageHandler,
    commandHandler, onlineUsers, cmdCtx };
}
