/**
 * Chat-Only Login Handler
 * Handles login verification for standalone chat mode
 */
import { Socket } from 'socket.io';
import { db } from '../database';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';

export function setupChatOnlyLoginHandler(socket: Socket, session: any): void {
  console.log('[ChatOnlyLogin] Setting up login handler');

  // Handle login submission from modal
  socket.on('chat-only-login-submit', async (credentials: { username: string; password: string }) => {
    console.log('[ChatOnlyLogin] Received login submission for:', credentials.username);

    try {
      // Verify credentials
      const user = await db.getUserByUsername(credentials.username);

      if (!user) {
        console.log('[ChatOnlyLogin] User not found:', credentials.username);
        socket.emit('chat-only-login-error', 'User not found');
        return;
      }

      // Verify password (user password is already hashed)
      const isValid = await db.verifyPassword(credentials.password, user.passwordHash);

      if (!isValid) {
        console.log('[ChatOnlyLogin] Invalid password for:', credentials.username);
        socket.emit('chat-only-login-error', 'Invalid password');
        return;
      }

      console.log('[ChatOnlyLogin] Login successful for:', credentials.username);

      // Update session
      session.user = user;
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DOOR_RUNNING;

      // Notify client of success with user data
      socket.emit('chat-only-login-success', user);

    } catch (error) {
      console.error('[ChatOnlyLogin] Login error:', error);
      socket.emit('chat-only-login-error', 'Login failed. Please try again.');
    }
  });
}
