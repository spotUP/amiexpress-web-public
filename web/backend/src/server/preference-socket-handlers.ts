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

  // Get the user's door theme.
  //
  // Modelled on the font preference above, and defaulting the same way: an
  // unknown or absent value is CLASSIC, which is the board exactly as it has
  // always looked. A cosmetic setting must never be able to leave somebody
  // with a screen they did not choose.
  socket.on('get-theme-preference', async () => {
    const session = getSessionBySocketId(socket.id);
    const { THEMES, themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');

    const id = themeById(session?.user?.themePreference).id;
    socket.emit('theme-preference', {
      theme: id,
      available: THEMES.map((t: any) => ({ id: t.id, name: t.name, blurb: t.blurb })),
    });
  });

  // Set the user's door theme.
  socket.on('set-theme-preference', async (data: { theme: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session || !session.user) return;

    const { themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
    // Resolve BEFORE storing, so an id the board does not have cannot be
    // written to the user's row and puzzle somebody later.
    const resolved = themeById(data?.theme);

    try {
      await db.updateUser(session.user.id, { themePreference: resolved.id });
      session.user.themePreference = resolved.id;
console.log('[Preference] Saved theme:', resolved.id, 'for user:', session.user.username);
      socket.emit('theme-changed', { theme: resolved.id, name: resolved.name });
    } catch (error) {
console.error('[Preference] Error updating theme preference:', error);
    }
  });

  // Get the user's door theme.
  //
  // Modelled on the font preference above, and defaulting the same way: an
  // unknown or absent value resolves to CLASSIC, which is the board exactly
  // as it has always looked. A cosmetic setting must never be able to leave
  // somebody with a screen they did not choose.
  socket.on('get-theme-preference', async () => {
    const session = getSessionBySocketId(socket.id);
    const { THEMES, themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');

    const id = themeById(session?.user?.themePreference).id;
    socket.emit('theme-preference', {
      theme: id,
      available: THEMES.map((t: any) => ({ id: t.id, name: t.name, blurb: t.blurb })),
    });
  });

  // Set the user's door theme.
  socket.on('set-theme-preference', async (data: { theme: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session || !session.user) return;

    const { themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
    // Resolved BEFORE storing, so an id this board does not have cannot be
    // written into the user's row to puzzle somebody later.
    const resolved = themeById(data?.theme);

    try {
      await db.updateUser(session.user.id, { themePreference: resolved.id });
      session.user.themePreference = resolved.id;
console.log('[Preference] Saved theme:', resolved.id, 'for user:', session.user.username);
      socket.emit('theme-changed', { theme: resolved.id, name: resolved.name });
    } catch (error) {
console.error('[Preference] Error updating theme preference:', error);
    }
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
