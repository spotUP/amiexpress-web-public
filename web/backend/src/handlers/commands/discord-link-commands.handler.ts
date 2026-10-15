import { db } from '../../database';
import { discordLinkService, CODE_TTL_MS } from '../../services/discord-link.service';
import { LoggedOnSubState } from '../../constants/bbs-states';

/**
 * LINKDISCORD command (WHIP mirror bot, Phase 0).
 *
 * A logged-on user mints a short-lived code here, then hands it to the
 * Discord bot (`/link <code>`) to bind their Discord account to this BBS
 * user. WEB_: no express.e counterpart - inbound Discord bots did not
 * exist on AmiExpress.
 */
export class DiscordLinkCommandsHandler {
  static async handleLinkDiscordCommand(socket: any, session: any): Promise<void> {
    const userId = session?.user?.id ?? session?.user?.userId;
    const username = session?.user?.username ?? 'you';
    if (!userId) {
      socket.emit('ansi-output', '\r\n[ERROR] You must be logged on to link Discord.\r\n');
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const existing = await db.getDiscordLinkByUserId(String(userId));
    if (existing) {
      socket.emit('ansi-output', '\r\n[OK] This account is already linked to Discord.\r\n');
      socket.emit('ansi-output', 'Run the bot\'s /unlink there first to move the link elsewhere.\r\n');
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const { code, expiresAt } = discordLinkService.issueCode(String(userId), String(username));
    const minutes = Math.round(CODE_TTL_MS / 60000);
    const expiry = new Date(expiresAt).toISOString().slice(11, 16);

    socket.emit('ansi-output', '\r\n--- DISCORD LINK ---\r\n');
    socket.emit('ansi-output', `Your link code is: ${code}\r\n`);
    socket.emit(
      'ansi-output',
      `In Discord, run /link code:${code} within ${minutes} minutes (by ${expiry} UTC).\r\n`
    );
    socket.emit('ansi-output', 'The code works once, then it is spent.\r\n');
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}
