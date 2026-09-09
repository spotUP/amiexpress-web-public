/**
 * WHIP mirror bot, Phase 1 entry point.
 *
 * `/link` verifies the LINKDISCORD code against POST /api/whip/link.
 * `/whip` exposes read-only WHIP data (projects, tasks, leaderboard,
 * achievements, parties) as embeds. The live WHIP feed posts door activity
 * to DISCORD_FEED_CHANNEL_ID and stays silent when that env var is unset.
 */

import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import { loadConfig, type BotConfig } from './config';
import { WhipApiClient, WhipApiError } from './whip-api';
import { startFeed } from './feed';

const linkCommand = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Discord account to your BBS user')
  .addStringOption((opt) =>
    opt.setName('code').setDescription('The LINKDISCORD code from the BBS').setRequired(true)
  );

const whipCommand = new SlashCommandBuilder()
  .setName('whip')
  .setDescription('Read WHIP projects, tasks, leaderboard, and more')
  .addSubcommand((sub) => sub.setName('projects').setDescription('List WHIP projects'))
  .addSubcommand((sub) =>
    sub
      .setName('tasks')
      .setDescription('List tasks in a project')
      .addStringOption((opt) =>
        opt.setName('project').setDescription('Project id (see /whip projects)').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('my-tasks')
      .setDescription('List tasks assigned to you (or to another user)')
      .addStringOption((opt) => opt.setName('user').setDescription('BBS user id').setRequired(false))
  )
  .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Show the WHIP leaderboard'))
  .addSubcommand((sub) =>
    sub
      .setName('achievements')
      .setDescription('Show achievements (defaults to your linked BBS user)')
      .addStringOption((opt) => opt.setName('user').setDescription('BBS user id').setRequired(false))
  )
  .addSubcommand((sub) => sub.setName('parties').setDescription('List upcoming parties'));

export async function registerCommands(botToken: string, guildId: string, clientId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(botToken);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [linkCommand.toJSON(), whipCommand.toJSON()],
  });
}

async function replyError(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: message });
  } else {
    await interaction.reply({ content: message, ephemeral: true });
  }
}

/** Resolve an explicit `user` option, else the caller's link. Null = told the user already. */
async function resolveUserId(
  interaction: ChatInputCommandInteraction,
  api: WhipApiClient,
  optionName = 'user'
): Promise<string | null> {
  const explicit = interaction.options.getString(optionName, false);
  if (explicit) return explicit.trim();
  try {
    const status = await api.linkStatus(interaction.user.id);
    return status.userId;
  } catch (err) {
    if (err instanceof WhipApiError && err.status === 404) {
      await replyError(
        interaction,
        'Your Discord account is not linked. On the BBS run LINKDISCORD, then `/link code:...` here first.'
      );
      return null;
    }
    throw err;
  }
}

async function handleLink(interaction: ChatInputCommandInteraction, api: WhipApiClient): Promise<void> {
  const code = interaction.options.getString('code', true).trim().toUpperCase();
  if (!/^[0-9A-F]{8}$/.test(code)) {
    await interaction.reply({
      content: 'That does not look like a link code. On the BBS, run LINKDISCORD and use the 8-character code it shows.',
      ephemeral: true,
    });
    return;
  }
  try {
    const linked = await api.link(code, interaction.user.id);
    await interaction.reply({
      content: `Linked to BBS user **${linked.username}**.`,
      ephemeral: true,
    });
  } catch (err) {
    if (err instanceof WhipApiError && err.status === 404) {
      await interaction.reply({
        content: 'Unknown, expired, or already-used code. On the BBS, run LINKDISCORD for a fresh one.',
        ephemeral: true,
      });
      return;
    }
    throw err;
  }
}

async function handleWhip(interaction: ChatInputCommandInteraction, api: WhipApiClient): Promise<void> {
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply();
  try {
    switch (sub) {
      case 'projects': {
        const projects = await api.listProjects();
        const embed = new EmbedBuilder().setTitle('WHIP projects');
        embed.setDescription(
          projects.length === 0
            ? 'No projects yet.'
            : projects
                .map(
                  (p) =>
                    `**${p.name}** (${p.type}, ${p.status}) — ${p.taskCounts.done}/${p.taskCounts.total} done\n${p.id}`
                )
                .join('\n\n')
        );
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'tasks': {
        const projectId = interaction.options.getString('project', true).trim();
        const tasks = await api.listTasks(projectId);
        const embed = new EmbedBuilder().setTitle(`Tasks in ${projectId}`);
        embed.setDescription(
          tasks.length === 0
            ? 'No tasks in this project.'
            : tasks.map((t) => `**${t.title}** [${t.status}] (${t.priority}, ${t.points} pts)${t.assignedTo ? ` — ${t.assignedTo}` : ''}`).join('\n')
        );
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'my-tasks': {
        const userId = await resolveUserId(interaction, api);
        if (!userId) return;
        const tasks = await api.listUserTasks(userId);
        const embed = new EmbedBuilder().setTitle(`Tasks for ${userId}`);
        embed.setDescription(
          tasks.length === 0
            ? 'No tasks assigned.'
            : tasks.map((t) => `**${t.title}** [${t.status}] (${t.priority}, ${t.points} pts)`).join('\n')
        );
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'leaderboard': {
        const rows = await api.leaderboard();
        const embed = new EmbedBuilder().setTitle('WHIP leaderboard');
        embed.setDescription(
          rows.length === 0
            ? 'Nobody on the board yet.'
            : rows
                .map((r) => `${r.rank}. **${r.handle}** — ${r.points} pts (${r.level}, ${r.tasksCompleted} tasks)`)
                .join('\n')
        );
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'achievements': {
        const userId = await resolveUserId(interaction, api);
        if (!userId) return;
        const ach = await api.achievements(userId);
        const embed = new EmbedBuilder().setTitle(`Achievements for ${userId} (${ach.totalPoints} pts)`);
        const unlocked = ach.unlocked.length === 0 ? 'None yet.' : ach.unlocked.map((a) => `${a.name} (+${a.points})`).join(', ');
        embed.addFields(
          { name: `Unlocked (${ach.unlocked.length})`, value: unlocked },
          {
            name: `Locked (${ach.locked.length})`,
            value: ach.locked.length === 0 ? 'None.' : ach.locked.map((a) => a.name).join(', '),
          }
        );
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'parties': {
        const parties = await api.listParties();
        const embed = new EmbedBuilder().setTitle('Parties');
        embed.setDescription(
          parties.length === 0
            ? 'No parties listed.'
            : parties.map((p) => `**${p.name}** — ${p.date} @ ${p.location}`).join('\n')
        );
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      default:
        await replyError(interaction, `Unknown subcommand: ${sub}`);
    }
  } catch (err) {
    const message = err instanceof WhipApiError ? `WHIP request failed: ${err.message}` : 'WHIP request failed.';
    await replyError(interaction, message);
  }
}

function maybeStartFeed(client: Client, config: BotConfig, apiUrl: string): void {
  if (!config.feedChannelId) return; // Feed stays silent when unset.
  if (!config.bbsUser || !config.bbsPassword) {
    console.warn('[whip-bot] DISCORD_FEED_CHANNEL_ID is set but WHIP_BBS_USER/WHIP_BBS_PASSWORD are missing; feed disabled');
    return;
  }
  const { feedChannelId, bbsUser, bbsPassword } = config;
  startFeed({
    apiUrl,
    bbsUser,
    bbsPassword,
    post: async (line) => {
      const channel = await client.channels.fetch(feedChannelId);
      if (channel?.isTextBased()) {
        await (channel as TextChannel).send(line);
      }
    },
    log: (message) => console.log(message),
  })
    .then(() => console.log('[whip-bot] Live WHIP feed started'))
    .catch((err) => console.error('[whip-bot] Feed failed to start, bot stays up:', err?.message ?? err));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new WhipApiClient(config.apiUrl, config.serviceToken);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', async () => {
    console.log(`[whip-bot] Logged in as ${client.user?.tag}`);
    if (client.user) {
      await registerCommands(config.botToken, config.guildId, client.user.id);
      console.log('[whip-bot] Slash commands registered');
    }
    maybeStartFeed(client, config, config.apiUrl);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      if (interaction.commandName === 'link') {
        await handleLink(interaction, api);
      } else if (interaction.commandName === 'whip') {
        await handleWhip(interaction, api);
      }
    } catch (err) {
      console.error('[whip-bot] Interaction failed:', err);
      await replyError(interaction, 'Something went wrong talking to the BBS. Try again in a bit.');
    }
  });

  await client.login(config.botToken);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[whip-bot] Fatal:', err?.message ?? err);
    process.exit(1);
  });
}
