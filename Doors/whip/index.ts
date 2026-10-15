import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { WhipApp } from './app';

export const metadata = {
  name: 'Whip',
  version: '1.0.0',
  description: 'Demo Scene Project Management',
  author: 'AmiExpress Team',
  command: 'WHIP',
};

const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const app = new WhipApp(ctx as any);
  await app.run();
});

export default door;
