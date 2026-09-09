/**
 * Bot configuration, all from the environment. Missing anything required is
 * a loud startup failure, not a silent half-alive bot.
 */

export interface BotConfig {
  botToken: string;
  guildId: string;
  apiUrl: string;
  serviceToken: string;
  /** Bridge BBS account the feed socket logs in with (POST /api/chat/login). */
  bbsUser?: string;
  bbsPassword?: string;
  /** Feed stays silent when unset. */
  feedChannelId?: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`[whip-bot] Missing required env var ${name} (see .env.example)`);
  }
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value ? value : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  return {
    botToken: required(env, 'DISCORD_BOT_TOKEN'),
    guildId: required(env, 'DISCORD_GUILD_ID'),
    apiUrl: env.WHIP_API_URL ?? 'http://localhost:3001',
    serviceToken: required(env, 'WHIP_SERVICE_TOKEN'),
    bbsUser: optional(env, 'WHIP_BBS_USER'),
    bbsPassword: optional(env, 'WHIP_BBS_PASSWORD'),
    feedChannelId: optional(env, 'DISCORD_FEED_CHANNEL_ID'),
  };
}
