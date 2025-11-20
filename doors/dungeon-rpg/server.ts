/**
 * Dungeon RPG Server Component (Hybrid Mode)
 * Text-based fallback for telnet/SSH connections
 * Handles game state persistence via RPC
 */

import {
  ServerDoor,
  GraphicsEngine,
  AnsiColor
} from '@amiexpress/bbs-door-sdk/server';
import * as fs from 'fs';
import * as path from 'path';

// Data directory for save games
const DATA_DIR = path.join(process.cwd(), 'data', 'dungeon-rpg');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Server door instance
 */
const door = new ServerDoor({
  name: 'Dungeon RPG Server',
  version: '1.0.0',
  author: 'AmiExpress SDK Team',
  description: 'Server component for game state persistence',
  runtime: 'server',
  hybrid: true,
});

/**
 * RPC: Save game state
 */
door.onRPC('saveGame', async (params) => {
  const { userId, slot, state } = params;

  if (!userId || typeof slot !== 'number' || !state) {
    throw new Error('Missing required parameters: userId, slot, state');
  }

  const filepath = path.join(DATA_DIR, `save-${userId}-slot${slot}.json`);

  await fs.promises.writeFile(
    filepath,
    JSON.stringify({
      ...state,
      savedAt: new Date().toISOString(),
    }),
    'utf8'
  );

  console.log(`[Dungeon-RPG-Server] Game saved for user ${userId}, slot ${slot}`);
  return { success: true };
});

/**
 * RPC: Load game state
 */
door.onRPC('loadGame', async (params) => {
  const { userId, slot } = params;

  if (!userId || typeof slot !== 'number') {
    throw new Error('Missing required parameters: userId, slot');
  }

  const filepath = path.join(DATA_DIR, `save-${userId}-slot${slot}.json`);

  if (!fs.existsSync(filepath)) {
    return { success: false, state: null };
  }

  const json = await fs.promises.readFile(filepath, 'utf8');
  const state = JSON.parse(json);

  return { success: true, state };
});

/**
 * RPC: List available save slots
 */
door.onRPC('listSaves', async (params) => {
  const { userId } = params;

  if (!userId) {
    throw new Error('Missing required parameter: userId');
  }

  const files = await fs.promises.readdir(DATA_DIR);
  const saves = [];

  for (const file of files) {
    if (file.startsWith(`save-${userId}-`) && file.endsWith('.json')) {
      const filepath = path.join(DATA_DIR, file);
      const json = await fs.promises.readFile(filepath, 'utf8');
      const data = JSON.parse(json);

      const slotMatch = file.match(/slot(\d+)\.json$/);
      const slot = slotMatch ? parseInt(slotMatch[1]) : 0;

      saves.push({
        slot,
        savedAt: data.savedAt,
        playerLevel: data.player?.level || 1,
        playerHp: data.player?.hp || 0,
        currentLevel: data.currentLevel || 'dungeon1',
      });
    }
  }

  // Sort by slot number
  saves.sort((a, b) => a.slot - b.slot);

  return { saves };
});

// For telnet/SSH connections, provide text-based fallback
door.onConnect(async (user) => {
  const gfx = new GraphicsEngine({ width: 80, height: 24 });

  // Text-based info screen
  gfx.clear();
  gfx.drawBox({ x: 0, y: 0, width: 80, height: 24 }, 'single', AnsiColor.Cyan);
  gfx.drawText(28, 2, 'DUNGEON RPG', AnsiColor.BrightYellow);
  gfx.drawText(10, 5, 'This is a comprehensive RPG demonstrating all SDK features.');
  gfx.drawText(10, 7, 'For the full graphical version with sound and rich UI:');
  gfx.drawText(15, 8, 'Connect via WebSocket at: https://your-bbs-url.com');
  gfx.drawText(10, 11, 'Features in full version:');
  gfx.drawText(15, 12, '* AI-driven enemy pathfinding', AnsiColor.Yellow);
  gfx.drawText(15, 13, '* Tile-based dungeon maps', AnsiColor.Yellow);
  gfx.drawText(15, 14, '* Inventory and equipment system', AnsiColor.Yellow);
  gfx.drawText(15, 15, '* Save/Load game state', AnsiColor.Yellow);
  gfx.drawText(15, 16, '* NPC dialogue and quest system', AnsiColor.Yellow);
  gfx.drawText(15, 17, '* ANSI graphics and sound effects', AnsiColor.Yellow);
  gfx.drawText(10, 20, 'Press S to view saves, Q to quit...', AnsiColor.BrightWhite);

  const rendered = gfx.render();
  door.send(rendered, user.id);

  // Handle input
  door.onInput((inputUser, keyEvent) => {
    if (inputUser.id !== user.id) return;

    const key = keyEvent.key.toLowerCase();

    if (key === 'q' || key === 'escape') {
      door.disconnect(user.id);
      return;
    }

    if (key === 's') {
      showSaves(user.id);
    }
  });
});

async function showSaves(userId: number) {
  const gfx = new GraphicsEngine({ width: 80, height: 24 });

  gfx.clear();
  gfx.drawBox({ x: 0, y: 0, width: 80, height: 24 }, 'single', AnsiColor.Cyan);
  gfx.drawText(30, 2, 'SAVED GAMES', AnsiColor.BrightYellow);

  // Get saves via internal RPC call
  const result = await door.handleRPC('listSaves', { userId });
  const saves = result.saves || [];

  let y = 5;
  gfx.drawText(10, y++, 'Slot  Level   HP    Dungeon     Saved At', AnsiColor.BrightCyan);
  gfx.drawText(10, y++, '────────────────────────────────────────────────────', AnsiColor.Cyan);

  if (saves.length === 0) {
    gfx.drawText(25, y + 2, 'No saved games found!', AnsiColor.Yellow);
  } else {
    saves.forEach((save: any) => {
      const slot = `${save.slot}`.padEnd(6);
      const level = `${save.playerLevel}`.padEnd(8);
      const hp = `${save.playerHp}`.padEnd(6);
      const dungeon = `${save.currentLevel}`.padEnd(12);
      const date = new Date(save.savedAt).toLocaleString();

      gfx.drawText(10, y++, `${slot} ${level} ${hp} ${dungeon} ${date}`, AnsiColor.White);
    });
  }

  gfx.drawText(20, 20, 'Press Q to quit...', AnsiColor.BrightWhite);

  const rendered = gfx.render();
  door.send(rendered, userId);
}

// Start server
door.start();
console.log('[Dungeon-RPG-Server] Server component started, waiting for connections and RPC calls...');
