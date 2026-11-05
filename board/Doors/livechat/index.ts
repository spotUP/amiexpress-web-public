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

  // Check if this is chat-only mode without a real logged-in user.
  // IMPORTANT: session.user is ALWAYS set by the backend (uses guest User
  // as a shim when bbsSession.user is absent). The authoritative signal of
  // "user is logged in" is bbsSession.user — that's only populated after a
  // real authentication flow (BBS login or runChatOnlyLogin).
  const chatOnly = session.bbsSession?.tempData?.chatOnly;
  const hasRealUser = !!session.bbsSession?.user;

  if (chatOnly && !hasRealUser) {
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
