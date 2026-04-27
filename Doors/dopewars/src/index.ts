import * as path from 'path';
import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { DopewarsServer } from './server';
import { DopewarsConfig } from './types';
import { createApp } from './app';
import { JAMAICA_THEME } from './config/jamaica';

export const metadata = {
  name: 'GANJA WARS',
  version: '1.0.0',
  description: 'Jamaican drug trading game — buy low, sell high, survive Babylon',
  author: 'AmiExpress-Web',
  command: 'GANJA',
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
    theme:          JAMAICA_THEME,
  };

  const server = DopewarsServer.getInstance();
  await server.init(doorDir, cfg);
  await createApp(ctx, server);
});

export default door;
