/**
 * Fire Emblem Server Component (Hybrid Mode)
 * Text-based fallback for telnet/SSH connections
 * Handles campaign progress persistence via RPC
 */

import {
  ServerDoor,
  GraphicsEngine,
  AnsiColor
} from '@amiexpress/bbs-door-sdk/server';
import * as fs from 'fs';
import * as path from 'path';

// Data directory for campaign saves
const DATA_DIR = path.join(process.cwd(), 'data', 'fire-emblem');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Server door instance
 */
const door = new ServerDoor({
  name: 'Fire Emblem Server',
  version: '1.0.0',
  author: 'AmiExpress SDK',
  description: 'Server component for campaign progress',
  runtime: 'server',
  hybrid: true,
});

/**
 * RPC: Save campaign progress
 */
door.onRPC('saveCampaign', async (params) => {
  const { userId, campaignData } = params;

  if (!userId || !campaignData) {
    throw new Error('Missing required parameters: userId, campaignData');
  }

  const filepath = path.join(DATA_DIR, `campaign-${userId}.json`);

  await fs.promises.writeFile(
    filepath,
    JSON.stringify({
      ...campaignData,
      savedAt: new Date().toISOString(),
    }),
    'utf8'
  );

  console.log(`[Fire-Emblem-Server] Campaign saved for user ${userId}, chapter ${campaignData.currentChapter}`);
  return { success: true };
});

/**
 * RPC: Load campaign progress
 */
door.onRPC('loadCampaign', async (params) => {
  const { userId } = params;

  if (!userId) {
    throw new Error('Missing required parameter: userId');
  }

  const filepath = path.join(DATA_DIR, `campaign-${userId}.json`);

  if (!fs.existsSync(filepath)) {
    return { success: false, campaignData: null };
  }

  const json = await fs.promises.readFile(filepath, 'utf8');
  const campaignData = JSON.parse(json);

  return { success: true, campaignData };
});

/**
 * RPC: List all campaigns
 */
door.onRPC('listCampaigns', async () => {
  const files = await fs.promises.readdir(DATA_DIR);
  const campaigns = [];

  for (const file of files) {
    if (file.startsWith('campaign-') && file.endsWith('.json')) {
      const filepath = path.join(DATA_DIR, file);
      const json = await fs.promises.readFile(filepath, 'utf8');
      const data = JSON.parse(json);

      const userIdMatch = file.match(/campaign-(\d+)\.json$/);
      const userId = userIdMatch ? userIdMatch[1] : 'unknown';

      campaigns.push({
        userId,
        currentChapter: data.currentChapter || 0,
        difficulty: data.difficulty || 'Normal',
        permadeath: data.permadeath ?? true,
        casualties: data.casualties?.length || 0,
        savedAt: data.savedAt,
      });
    }
  }

  return { campaigns };
});

// For telnet/SSH connections, provide text-based fallback
door.onConnect(async (user) => {
  const gfx = new GraphicsEngine({ width: 80, height: 24 });

  // Text-based info screen
  gfx.clear();
  gfx.drawBox(0, 0, 80, 24, AnsiColor.Cyan);
  gfx.drawText(25, 2, 'FIRE EMBLEM: Emblem of Valor', AnsiColor.BrightYellow);
  gfx.drawText(10, 5, 'A complete Fire Emblem-style tactical RPG using the SDK.');
  gfx.drawText(10, 7, 'For the full graphical experience with tactical combat:');
  gfx.drawText(15, 8, 'Connect via WebSocket at: https://your-bbs-url.com');
  gfx.drawText(10, 11, 'Features in full version:');
  gfx.drawText(15, 12, '* 15+ story chapters with varied objectives', AnsiColor.Yellow);
  gfx.drawText(15, 13, '* 20+ unique playable characters', AnsiColor.Yellow);
  gfx.drawText(15, 14, '* Class promotion system', AnsiColor.Yellow);
  gfx.drawText(15, 15, '* Support conversations and relationships', AnsiColor.Yellow);
  gfx.drawText(15, 16, '* Permadeath option', AnsiColor.Yellow);
  gfx.drawText(15, 17, '* Strategic turn-based combat', AnsiColor.Yellow);
  gfx.drawText(10, 20, 'Press C to view campaigns, Q to quit...', AnsiColor.BrightWhite);

  const rendered = gfx.render();
  door.send(user.id, rendered);

  // Handle input
  door.onInput((inputData) => {
    if (inputData.user.id !== user.id) return;

    const key = inputData.key.key.toLowerCase();

    if (key === 'q' || key === 'escape') {
      door.disconnect(user.id);
      return;
    }

    if (key === 'c') {
      showCampaigns(user.id);
    }
  });
});

async function showCampaigns(userId: number) {
  const gfx = new GraphicsEngine({ width: 80, height: 24 });

  gfx.clear();
  gfx.drawBox(0, 0, 80, 24, AnsiColor.Cyan);
  gfx.drawText(28, 2, 'SAVED CAMPAIGNS', AnsiColor.BrightYellow);

  // Get campaigns via internal RPC call
  const result = await door.handleRPC('listCampaigns', {});
  const campaigns = result.campaigns || [];

  let y = 5;
  gfx.drawText(8, y++, 'User    Chapter  Difficulty  Deaths  Saved At', AnsiColor.BrightCyan);
  gfx.drawText(8, y++, '──────────────────────────────────────────────────────────', AnsiColor.Cyan);

  if (campaigns.length === 0) {
    gfx.drawText(25, y + 2, 'No campaigns saved yet!', AnsiColor.Yellow);
  } else {
    campaigns.forEach((campaign: any) => {
      const userId = campaign.userId.toString().padEnd(8);
      const chapter = `${campaign.currentChapter}`.padEnd(9);
      const difficulty = campaign.difficulty.padEnd(12);
      const casualties = `${campaign.casualties}`.padEnd(8);
      const date = new Date(campaign.savedAt).toLocaleDateString();

      gfx.drawText(8, y++, `${userId} ${chapter} ${difficulty} ${casualties} ${date}`, AnsiColor.White);
    });
  }

  gfx.drawText(20, 20, 'Press Q to quit...', AnsiColor.BrightWhite);

  const rendered = gfx.render();
  door.send(userId, rendered);
}

// Start server
door.start();
console.log('[Fire-Emblem-Server] Server component started, waiting for connections and RPC calls...');
