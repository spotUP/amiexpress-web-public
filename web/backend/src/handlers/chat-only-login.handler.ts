/**
 * Chat-Only Login Handler
 * Handles login verification for standalone chat mode
 */
import { Socket } from 'socket.io';
import { db } from '../database';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { chatLogin } from '../services/chat-login';

export function setupChatOnlyLoginHandler(socket: Socket, session: any): void {
console.log('[ChatOnlyLogin] Setting up login handler');

  // Handle login submission from modal
  socket.on('chat-only-login-submit', async (credentials: { username: string; password: string }) => {
console.log('[ChatOnlyLogin] Received login submission for:', credentials.username);

    try {
      // services/chat-login: the password check, its failure count and the
      // board's account gates, shared with the HTTP login and the door.
      const login = await chatLogin(db, credentials.username, credentials.password);
      if (!login.ok) {
console.log('[ChatOnlyLogin] Login refused for:', credentials.username, login.status);
        socket.emit('chat-only-login-error', login.message);
        return;
      }
      const user = login.user;

console.log('[ChatOnlyLogin] Login successful for:', credentials.username);

      // Update session
      session.user = user;
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DOOR_RUNNING;

      // Who logged on - never the whole row: it carried the password hash
      // to the browser.
      socket.emit('chat-only-login-success', {
        id: user.id,
        username: user.username,
        secLevel: user.secLevel,
      });

    } catch (error) {
console.error('[ChatOnlyLogin] Login error:', error);
      socket.emit('chat-only-login-error', 'Login failed. Please try again.');
    }
  });
}
