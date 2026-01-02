/**
 * User Preference Socket Event Handlers
 * Handles user preference events like font selection
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { db } from '../database';
import { getSessionBySocketId } from './session-manager';

/**
 * Register user preference socket event handlers
 *
 * IMPORTANT: Handlers must be registered immediately when called, not conditionally.
 * Session checks should be done INSIDE each handler, not before registration.
 */
export function registerPreferenceHandlers(socket: Socket) {
  // Get user's font preference
  socket.on('get-font-preference', async () => {
    console.log('[Preference] Received get-font-preference request');
    const session = getSessionBySocketId(socket.id);
    if (!session || !session.user) {
      console.log('[Preference] No session or user, sending default font');
      socket.emit('font-preference', { font: 'TopazPlus_a1200' }); // Default
      return;
    }

    const fontPreference = session.user.fontPreference || 'TopazPlus_a1200';
    console.log('[Preference] Sending saved font preference:', fontPreference, 'for user:', session.user.username);
    socket.emit('font-preference', { font: fontPreference });
  });

  // Set user's font preference
  socket.on('set-font-preference', async (data: { font: string }) => {
    console.log('[Preference] Received set-font-preference request:', data.font);
    const session = getSessionBySocketId(socket.id);
    if (!session || !session.user) {
      console.log('[Preference] No session or user, cannot save font');
      return;
    }

    try {
      await db.updateUser(session.user.id, { fontPreference: data.font });
      session.user.fontPreference = data.font;
      console.log('[Preference] Saved font preference:', data.font, 'for user:', session.user.username);
      socket.emit('font-changed', { font: data.font });
    } catch (error) {
      console.error('[Preference] Error updating font preference:', error);
    }
  });
}
