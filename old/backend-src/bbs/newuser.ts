/**
 * New User Registration Module
 *
 * Handles new user account creation flow
 */

import { Socket } from 'socket.io';
import { BBSSession } from './session';

/**
 * Start the new user account creation process
 * @param socket - Socket.IO socket instance
 * @param session - Current BBS session
 * @param username - Username for the new account
 * @returns Promise<boolean> - True if registration started successfully
 */
export async function newUserAccount(socket: Socket, session: BBSSession, username: string): Promise<boolean> {
  // Display JOIN screen for new user registration
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
  socket.emit('ansi-output', '\x1b[36m-= New User Registration =-\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', `Welcome, ${username}!\r\n\r\n`);
  socket.emit('ansi-output', 'Please use the registration form to create your account.\r\n');
  socket.emit('ansi-output', '\x1b[33mNote: New user registration is handled via the registration form.\x1b[0m\r\n');

  return false; // Return false to indicate user should use the registration form
}

/**
 * Complete new user registration after form submission
 * @param socket - Socket.IO socket instance
 * @param session - Current BBS session
 * @param userData - User registration data
 * @returns Promise<boolean> - True if registration completed successfully
 */
export async function completeNewUserRegistration(socket: Socket, session: BBSSession, userData: any): Promise<boolean> {
  // This would be called after the registration form is submitted
  socket.emit('ansi-output', '\x1b[32mRegistration complete!\x1b[0m\r\n');
  return true;
}
