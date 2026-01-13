import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { metadata } from './config';
import { events } from './services';
import { createApp } from './server';
import { runChatOnlyLogin } from './chat-only-login';

export { metadata };

/**
 * Main door class
 */
const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const session = ctx;

  // Check if this is chat-only mode without a user (needs login)
  const chatOnly = session.bbsSession?.tempData?.chatOnly;
  const hasUser = session.user || session.bbsSession?.user;

  if (chatOnly && !hasUser) {
    // Show login modal and wait for authentication
    const loginSuccessful = await runChatOnlyLogin(session as any);

    if (!loginSuccessful) {
      return;
    }
  }

  const app = await createApp(session as any);
  await app.run();
  events.clear();
});

export default door;
