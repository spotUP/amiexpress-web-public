/**
 * Tetris Server Component (Hybrid Mode)
 * Text-based fallback for telnet/SSH connections
 * Handles high score persistence via RPC
 */

import {
  ServerDoor,
  GraphicsEngine,
  HUDBuilder,
  AnsiColor
} from '@amiexpress/bbs-door-sdk/server';
import * as fs from 'fs';
import * as path from 'path';

// Data directory for high scores
const DATA_DIR = path.join(process.cwd(), 'data', 'tetris');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * RPC: Save high score
 */
const door = new ServerDoor({
  name: 'Tetris Server',
  version: '1.0.0',
  author: 'AmiExpress SDK',
  description: 'Server component for high scores',
  runtime: 'server',
  hybrid: true,
});

/**
 * RPC: Get high score
 */
door.onRPC('getHighScore', async (params) => {
  const { userId } = params;
  const filepath = path.join(DATA_DIR, `highscore-${userId}.json`);

  if (!fs.existsSync(filepath)) {
    return { score: 0 };
  }

  const json = await fs.promises.readFile(filepath, 'utf8');
  const data = JSON.parse(json);

  return { score: data.score || 0 };
});

/**
 * RPC: Save high score
 */
door.onRPC('saveHighScore', async (params) => {
  const { userId, score } = params;

  if (!userId || typeof score !== 'number') {
    throw new Error('Missing required parameters: userId, score');
  }

  const filepath = path.join(DATA_DIR, `highscore-${userId}.json`);

  // Load existing score
  let currentBest = 0;
  if (fs.existsSync(filepath)) {
    const json = await fs.promises.readFile(filepath, 'utf8');
    const data = JSON.parse(json);
    currentBest = data.score || 0;
  }

  // Only save if new high score
  if (score > currentBest) {
    await fs.promises.writeFile(
      filepath,
      JSON.stringify({ score, date: new Date().toISOString() }),
      'utf8'
    );
    console.log(`[Tetris-Server] New high score for user ${userId}: ${score}`);
    return { success: true, newRecord: true, score };
  }

  return { success: true, newRecord: false, score: currentBest };
});

/**
 * RPC: Get global leaderboard
 */
door.onRPC('getLeaderboard', async () => {
  const files = await fs.promises.readdir(DATA_DIR);
  const scores = [];

  for (const file of files) {
    if (file.startsWith('highscore-') && file.endsWith('.json')) {
      const filepath = path.join(DATA_DIR, file);
      const json = await fs.promises.readFile(filepath, 'utf8');
      const data = JSON.parse(json);
      const userId = file.replace('highscore-', '').replace('.json', '');

      scores.push({
        userId,
        score: data.score,
        date: data.date,
      });
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return { leaderboard: scores.slice(0, 10) };
});

// For telnet/SSH connections, provide text-based game
door.onConnect(async (user) => {
  const gfx = new GraphicsEngine({ width: 80, height: 24 });
  const hud = new HUDBuilder();

  // Simple text-based Tetris game
  gfx.clear();
  gfx.drawBox(0, 0, 80, 24, AnsiColor.Cyan);
  gfx.drawText(25, 2, 'TETRIS - Text Mode', AnsiColor.BrightYellow);
  gfx.drawText(10, 5, 'This is a simplified version for telnet/SSH connections.');
  gfx.drawText(10, 7, 'For the full graphical version with sound, connect via:');
  gfx.drawText(15, 8, 'WebSocket: https://your-bbs-url.com');
  gfx.drawText(10, 11, 'Press any key to view high scores, or Q to quit...');

  const rendered = gfx.render();
  door.send(user.id, rendered);

  // Wait for input
  door.onInput((inputData) => {
    if (inputData.user.id !== user.id) return;

    const key = inputData.key.key.toLowerCase();

    if (key === 'q' || key === 'escape') {
      door.disconnect(user.id);
      return;
    }

    // Show high scores
    showHighScores(user.id);
  });
});

async function showHighScores(userId: number) {
  const gfx = new GraphicsEngine({ width: 80, height: 24 });

  gfx.clear();
  gfx.drawBox(0, 0, 80, 24, AnsiColor.Cyan);
  gfx.drawText(28, 2, 'HIGH SCORES', AnsiColor.BrightYellow);

  // Get leaderboard via internal RPC call
  const result = await door.handleRPC('getLeaderboard', {});
  const leaderboard = result.leaderboard || [];

  let y = 5;
  gfx.drawText(15, y++, 'Rank  User ID      Score        Date', AnsiColor.BrightCyan);
  gfx.drawText(15, y++, '─────────────────────────────────────────', AnsiColor.Cyan);

  if (leaderboard.length === 0) {
    gfx.drawText(25, y + 2, 'No scores yet!', AnsiColor.Yellow);
  } else {
    leaderboard.forEach((entry: any, index: number) => {
      const rank = `${index + 1}.`.padEnd(6);
      const userId = entry.userId.toString().padEnd(12);
      const score = entry.score.toString().padEnd(12);
      const date = new Date(entry.date).toLocaleDateString();

      const color = index === 0 ? AnsiColor.BrightYellow :
                   index === 1 ? AnsiColor.BrightCyan :
                   index === 2 ? AnsiColor.BrightGreen : AnsiColor.White;

      gfx.drawText(15, y++, `${rank} ${userId} ${score} ${date}`, color);
    });
  }

  gfx.drawText(20, 20, 'Press Q to quit...', AnsiColor.BrightWhite);

  const rendered = gfx.render();
  door.send(userId, rendered);
}

// Start server
door.start();
console.log('[Tetris-Server] Server component started, waiting for connections and RPC calls...');
