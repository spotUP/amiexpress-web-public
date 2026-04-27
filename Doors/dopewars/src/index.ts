import * as path from 'path';
import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { DopewarsServer } from './server';
import { DopewarsConfig } from './types';
import { createApp } from './app';

export const metadata = {
  name: 'DOPEWARS',
  version: '1.0.0',
  description: 'Multiplayer drug trading game',
  author: 'AmiExpress-Web',
  command: 'DOPE',
};

const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const doorDir = path.join(__dirname, '..');
  const cfg: DopewarsConfig = {
    numTurns:       30,
    startCash:      2000,
    startDebt:      5500,
    debtInterest:   10,
    bankInterest:   5,
    discordWebhook: process.env.DOPEWARS_DISCORD_WEBHOOK ?? '',
    notifyLivechat: true,
  };

  const server = DopewarsServer.getInstance();
  await server.init(doorDir, cfg);
  await createApp(ctx, server);
});

export default door;
