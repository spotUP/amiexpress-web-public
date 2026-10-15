import * as path from 'path';
import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { DopewarsServer } from './server';
import { DopewarsConfig } from './types';
import { createApp } from './app';
import { JAMAICA_THEME } from './config/jamaica';
import { loadSettings, configFieldsFrom } from './settings';
import { applyTheme } from './door-theme';

export const metadata = {
  name: 'GANJA WARS',
  version: '1.0.0',
  description: 'Jamaican drug trading game — buy low, sell high, survive Babylon',
  author: 'AmiExpress-Web',
  command: 'GANJA',
};

const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  // Before the layout is built: T and S are live bindings, so every style
  // object in ui/ reads the caller's theme rather than the classic default.
  applyTheme((ctx as any).bbs);

  const doorDir = path.join(__dirname, '..');
  const settings = loadSettings();
  // Everything that comes from a SETTING comes through one function, so a
  // knob that stops being forwarded fails a test rather than quietly editing
  // into the void. The webhook is an environment variable and the theme is a
  // constant, so those two are the call site's.
  const cfg: DopewarsConfig = {
    ...configFieldsFrom(settings),
    discordWebhook: process.env.DOPEWARS_DISCORD_WEBHOOK ?? '',
    theme:          JAMAICA_THEME,
  };

  const server = DopewarsServer.getInstance();
  await server.init(doorDir, cfg, ctx.bbs);
  await createApp(ctx, server);
});

export default door;
