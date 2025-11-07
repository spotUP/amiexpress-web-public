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
 */
export function registerPreferenceHandlers(socket: Socket) {
  const session = getSessionBySocketId(socket.id);
  if (!session) return;

  // Get user's font preference
  socket.on('get-font-preference', async () => {
    const session = getSessionBySocketId(socket.id);
    if (!session || !session.user) {
      socket.emit('font-preference', { font: 'mosoul' }); // Default
      return;
    }

    const fontPreference = (session.user as any).fontPreference || 'mosoul';
    socket.emit('font-preference', { font: fontPreference });
  });

  // Set user's font preference
  socket.on('set-font-preference', async (data: { font: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session || !session.user) return;

    try {
      await db.updateUser(session.user.id, { fontPreference: data.font } as any);
      (session.user as any).fontPreference = data.font;
      socket.emit('font-changed', { font: data.font });
    } catch (error) {
      console.error('Error updating font preference:', error);
    }
  });
}
