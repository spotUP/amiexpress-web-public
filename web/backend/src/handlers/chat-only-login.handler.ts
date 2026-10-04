/**
 * Chat-Only Login Handler
 * Handles login verification for standalone chat mode
 */
import { Socket } from 'socket.io';
import { db } from '../database';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { loadAccount } from '../services/load-account';
import { accountRefusal } from '../services/logon-gates';
import { countWrongPassword, clearWrongPasswords } from '../services/password-failures';

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
        // The same words as a wrong password: a different answer told any
        // visitor which names have accounts.
        socket.emit('chat-only-login-error', 'Invalid username or password');
        return;
      }

      // Verify password (user password is already hashed)
      const isValid = await db.verifyPassword(credentials.password, user.passwordHash);

      if (!isValid) {
console.log('[ChatOnlyLogin] Invalid password for:', credentials.username);
        // express.e:1008-1016 - counted toward MAX_PASSWORD_FAILS on the
        // account, as the BBS logon and FTP count theirs.
        countWrongPassword(user, 'CHAT');
        socket.emit('chat-only-login-error', 'Invalid username or password');
        return;
      }

      // The board's own account gates on the board's own record - the ones
      // the BBS logon and FTP ask (services/logon-gates). A deleted, locked
      // or level-0 account logged straight into chat (open-surface audit,
      // 2026-10-04); a password that must be changed cannot be changed here.
      // express.e:1018 - a right password zeroes the count.
      clearWrongPasswords(user, 'CHAT');

      const { user: account } = loadAccount(user);
      if (accountRefusal(account) !== null) {
console.log('[ChatOnlyLogin] Account refused by the logon gates:', credentials.username);
        socket.emit('chat-only-login-error', 'That account cannot log on. Call the board to find out why.');
        return;
      }

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
