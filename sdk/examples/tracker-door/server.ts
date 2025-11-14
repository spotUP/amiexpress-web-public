/**
 * Tracker-Door Server Component (Hybrid Mode)
 * Handles file I/O operations via RPC
 */

import { ServerDoor } from '@amiexpress/bbs-door-sdk/server';
import * as fs from 'fs';
import * as path from 'path';

const door = new ServerDoor({
  name: 'Tracker-Door Server',
  version: '1.0.0',
  author: 'Demo Scene Community',
  description: 'Server component for file I/O',
  runtime: 'server',
  hybrid: true,
});

// Data directory for saved songs
const DATA_DIR = path.join(process.cwd(), 'data', 'tracker-songs');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * RPC: Save a song to disk
 * @param params.userId User ID
 * @param params.songName Song name
 * @param params.songData Song data (JSON)
 */
door.onRPC('saveSong', async (params) => {
  const { userId, songName, songData } = params;

  if (!userId || !songName || !songData) {
    throw new Error('Missing required parameters: userId, songName, songData');
  }

  // Create user directory
  const userDir = path.join(DATA_DIR, `user-${userId}`);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // Sanitize filename
  const sanitizedName = songName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `${sanitizedName}.json`;
  const filepath = path.join(userDir, filename);

  // Save song
  await fs.promises.writeFile(filepath, JSON.stringify(songData, null, 2), 'utf8');

  console.log(`[Tracker-Server] Saved song: ${filepath}`);

  return {
    success: true,
    filename,
    filepath,
    size: JSON.stringify(songData).length,
  };
});

/**
 * RPC: Load a song from disk
 * @param params.userId User ID
 * @param params.songName Song name
 */
door.onRPC('loadSong', async (params) => {
  const { userId, songName } = params;

  if (!userId || !songName) {
    throw new Error('Missing required parameters: userId, songName');
  }

  const userDir = path.join(DATA_DIR, `user-${userId}`);
  const sanitizedName = songName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `${sanitizedName}.json`;
  const filepath = path.join(userDir, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Song not found: ${songName}`);
  }

  const json = await fs.promises.readFile(filepath, 'utf8');
  const songData = JSON.parse(json);

  console.log(`[Tracker-Server] Loaded song: ${filepath}`);

  return {
    success: true,
    songName,
    songData,
  };
});

/**
 * RPC: List saved songs for a user
 * @param params.userId User ID
 */
door.onRPC('listSongs', async (params) => {
  const { userId } = params;

  if (!userId) {
    throw new Error('Missing required parameter: userId');
  }

  const userDir = path.join(DATA_DIR, `user-${userId}`);

  if (!fs.existsSync(userDir)) {
    return { songs: [] };
  }

  const files = await fs.promises.readdir(userDir);
  const songs = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const filepath = path.join(userDir, file);
      const stats = await fs.promises.stat(filepath);
      const songName = file.replace('.json', '');

      songs.push({
        name: songName,
        filename: file,
        size: stats.size,
        modified: stats.mtime,
      });
    }
  }

  console.log(`[Tracker-Server] Listed ${songs.length} songs for user ${userId}`);

  return { songs };
});

/**
 * RPC: Delete a song
 * @param params.userId User ID
 * @param params.songName Song name
 */
door.onRPC('deleteSong', async (params) => {
  const { userId, songName } = params;

  if (!userId || !songName) {
    throw new Error('Missing required parameters: userId, songName');
  }

  const userDir = path.join(DATA_DIR, `user-${userId}`);
  const sanitizedName = songName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `${sanitizedName}.json`;
  const filepath = path.join(userDir, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Song not found: ${songName}`);
  }

  await fs.promises.unlink(filepath);

  console.log(`[Tracker-Server] Deleted song: ${filepath}`);

  return {
    success: true,
    songName,
  };
});

/**
 * RPC: Auto-save song (creates backup)
 * @param params.userId User ID
 * @param params.songData Song data
 */
door.onRPC('autoSave', async (params) => {
  const { userId, songData } = params;

  if (!userId || !songData) {
    throw new Error('Missing required parameters: userId, songData');
  }

  // Create autosave directory
  const autosaveDir = path.join(DATA_DIR, `user-${userId}`, 'autosave');
  if (!fs.existsSync(autosaveDir)) {
    fs.mkdirSync(autosaveDir, { recursive: true });
  }

  // Create timestamped autosave file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `autosave-${timestamp}.json`;
  const filepath = path.join(autosaveDir, filename);

  await fs.promises.writeFile(filepath, JSON.stringify(songData, null, 2), 'utf8');

  // Keep only last 10 autosaves
  const files = await fs.promises.readdir(autosaveDir);
  const autosaves = files
    .filter((f) => f.startsWith('autosave-'))
    .sort()
    .reverse();

  // Delete old autosaves
  for (let i = 10; i < autosaves.length; i++) {
    await fs.promises.unlink(path.join(autosaveDir, autosaves[i]));
  }

  console.log(`[Tracker-Server] Auto-saved: ${filepath}`);

  return {
    success: true,
    filename,
  };
});

// Start server
door.start();
console.log('[Tracker-Server] Server component started, waiting for RPC calls...');
