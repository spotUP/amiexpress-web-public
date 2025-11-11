/**
 * Discord Announce Door
 *
 * Announces user logins/logoffs to a Discord channel via webhook.
 * Ported from Amiga E version by REbEL/QTX.
 *
 * Usage:
 * - Can be run from logon/logoff scripts
 * - Requires DISCORD_WEBHOOK_URL in configuration
 *
 * Original: dev/docs/AmiExpressEDoorSources/DiscordAnnounce/dannounce.e
 */

import { Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';

interface DiscordAnnounceConfig {
  webhookUrl: string;
  enabled: boolean;
  botName?: string;
  avatarUrl?: string;
}

/**
 * Load configuration from dannounce.cfg or environment
 */
function loadConfig(): DiscordAnnounceConfig {
  const configPath = path.join(process.cwd(), 'doors', 'discord-announce', 'dannounce.cfg');

  // Default configuration
  const config: DiscordAnnounceConfig = {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    enabled: true,
    botName: '/X Announce Bot',
    avatarUrl: ''
  };

  // Try to load from config file
  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const lines = fileContent.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        const upperKey = key.trim().toUpperCase();

        switch (upperKey) {
          case 'WEBHOOKURL':
            config.webhookUrl = value;
            break;
          case 'ENABLED':
            config.enabled = value.toUpperCase() === 'YES' || value === '1' || value.toUpperCase() === 'TRUE';
            break;
          case 'BOTNAME':
            config.botName = value;
            break;
          case 'AVATARURL':
            config.avatarUrl = value;
            break;
        }
      }
    }
  } catch (err) {
    console.error('[DiscordAnnounce] Error loading config:', err);
  }

  return config;
}

/**
 * Clean string for Discord (remove special characters, escape quotes)
 */
function cleanString(str: string): string {
  return str
    .replace(/["\\]/g, '\\$&')  // Escape quotes and backslashes
    .replace(/\n/g, ' ')         // Remove newlines
    .replace(/\r/g, '')          // Remove carriage returns
    .trim();
}

/**
 * Post announcement to Discord webhook
 */
async function postToDiscord(
  username: string,
  bbsName: string,
  logOn: boolean,
  config: DiscordAnnounceConfig
): Promise<boolean> {
  if (!config.enabled || !config.webhookUrl) {
    console.log('[DiscordAnnounce] Disabled or no webhook URL configured');
    return false;
  }

  const cleanUsername = cleanString(username);
  const cleanBbsName = cleanString(bbsName);
  const action = logOn ? 'logged on to' : 'logged off of';

  const message = `${cleanUsername} has just ${action} ${cleanBbsName}`;

  const payload = {
    username: config.botName,
    avatar_url: config.avatarUrl,
    content: message
  };

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('[DiscordAnnounce] Discord webhook failed:', response.status, response.statusText);
      return false;
    }

    console.log(`[DiscordAnnounce] Posted: ${message}`);
    return true;
  } catch (error) {
    console.error('[DiscordAnnounce] Error posting to Discord:', error);
    return false;
  }
}

/**
 * Announce user login
 */
export async function announceLogin(username: string, bbsName: string): Promise<void> {
  const config = loadConfig();
  await postToDiscord(username, bbsName, true, config);
}

/**
 * Announce user logoff
 */
export async function announceLogoff(username: string, bbsName: string): Promise<void> {
  const config = loadConfig();
  await postToDiscord(username, bbsName, false, config);
}

/**
 * Run Discord Announce door (TypeScript door interface)
 * This follows the standard TypeScript door interface
 */
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user, bbsSession } = doorSession;

  if (!user) {
    socket.emit('ansi-output', '\x1b[31mError: No user session\x1b[0m\r\n');
    return;
  }

  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
  socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m|\x1b[0m           \x1b[32mDISCORD ANNOUNCE TEST\x1b[0m              \x1b[36m|\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n\r\n');

  const config = loadConfig();

  if (!config.enabled) {
    socket.emit('ansi-output', '\x1b[33mDiscord announcements are DISABLED\x1b[0m\r\n');
  } else if (!config.webhookUrl) {
    socket.emit('ansi-output', '\x1b[31mNo webhook URL configured!\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\nSet DISCORD_WEBHOOK_URL environment variable or\r\n');
    socket.emit('ansi-output', 'create doors/discord-announce/dannounce.cfg\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[32mSending test announcement...\x1b[0m\r\n\r\n');

    const bbsName = process.env.BBS_NAME || 'AmiExpress-Web BBS';
    const username = user.username;

    const success = await postToDiscord(username, bbsName, true, config);

    if (success) {
      socket.emit('ansi-output', '\x1b[32mTest announcement sent successfully!\x1b[0m\r\n');
      socket.emit('ansi-output', `Message: "${username} has just logged on to ${bbsName}"\r\n`);
    } else {
      socket.emit('ansi-output', '\x1b[31mFailed to send announcement.\x1b[0m\r\n');
      socket.emit('ansi-output', 'Check backend logs for details.\r\n');
    }
  }

  socket.emit('ansi-output', '\r\n\x1b[33mPress ENTER to return to menu\x1b[0m ');

  // Wait for ENTER key - use promise to block until user presses ENTER
  await new Promise<void>((resolve) => {
    const handleInput = (data: string) => {
      if (data.trim() === '' || data.includes('\n') || data.includes('\r')) {
        socket.off('user-input', handleInput);
        resolve();
      }
    };

    socket.on('user-input', handleInput);
  });
}
