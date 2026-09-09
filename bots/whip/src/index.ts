/**
 * WHIP mirror bot, Phase 1 entry point.
 *
 * `/link` verifies the LINKDISCORD code against POST /api/whip/link.
 * `/whip` exposes read-only WHIP data (projects, tasks, leaderboard,
 * achievements, parties) as embeds. The live WHIP feed posts door activity
 * to DISCORD_FEED_CHANNEL_ID and stays silent when that env var is unset.
 */

import * as path from 'path';
import * as fs from 'fs';
import { config as loadEnv } from 'dotenv';

// Env resolution order: an explicit BOT_ENV_FILE (the compose sidecar
// points it at the shared volume file the admin UI writes), else the local
// .env next to package.json (src/ in dev, dist/ in prod), else the bare
// process environment. First file that exists wins; missing files are not
// an error. Seen live: a present-but-unread .env reads as "missing token".
const volumeEnv = process.env.BOT_ENV_FILE;
const localEnv = path.join(__dirname, '..', '.env');
if (volumeEnv && fs.existsSync(volumeEnv)) {
  loadEnv({ path: volumeEnv });
} else if (fs.existsSync(localEnv)) {
  loadEnv({ path: localEnv });
}

import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
  type SlashCommandSubcommandBuilder,
  type TextChannel,
} from 'discord.js';
import { loadConfig, type BotConfig } from './config';
import { WhipApiClient, WhipApiError } from './whip-api';
import { startFeed } from './feed';
import { createHealthState, startHealthServer, type HealthState } from './health';
import {
  formatAchievements,
  formatLeaderboard,
  formatParties,
  formatProjects,
  formatTaskLine,
  formatTasks,
  formatUserTasks,
} from './format';
import {
  WRITE_PREFIX,
  buildDeleteConfirm,
  buildMoveSelect,
  buildNewProjectModal,
  buildNewTaskModal,
  buildProjectDeleteConfirm,
  buildTaskButtons,
  parseAction,
  parsePoints,
  projectChoices,
  taskChoices,
  userChoices,
} from './writes';

const linkCommand = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Discord account to your BBS user')
  .addStringOption((opt) =>
    opt.setName('code').setDescription('The LINKDISCORD code from the BBS').setRequired(true)
  );

const whipCommand = new SlashCommandBuilder()
  .setName('whip')
  .setDescription('Read WHIP projects, tasks, leaderboard, and more')
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('projects').setDescription('List WHIP projects'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('tasks')
      .setDescription('List tasks in a project')
      .addStringOption((opt) =>
        opt.setName('project').setDescription('Project — start typing to pick').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('my-tasks')
      .setDescription('List tasks assigned to you (or to another user)')
      .addStringOption((opt) => opt.setName('user').setDescription('BBS user — start typing to pick').setRequired(false).setAutocomplete(true))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('leaderboard').setDescription('Show the WHIP leaderboard'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('achievements')
      .setDescription('Show achievements (defaults to your linked BBS user)')
      .addStringOption((opt) => opt.setName('user').setDescription('BBS user — start typing to pick').setRequired(false).setAutocomplete(true))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('parties').setDescription('List upcoming parties'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('help').setDescription('How to use this bot'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('task').setDescription('Show one task with action buttons')
      .addStringOption((opt) => opt.setName('id').setDescription('Task id — start typing to pick').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('task-new').setDescription('Create a task (form)')
      .addStringOption((opt) => opt.setName('project').setDescription('Project id — start typing to pick').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('task-edit').setDescription('Edit a task (only given fields change)')
      .addStringOption((opt) => opt.setName('id').setDescription('Task id — start typing to pick').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('title').setDescription('New title').setRequired(false))
      .addStringOption((opt) => opt.setName('description').setDescription('New description').setRequired(false))
      .addStringOption((opt) => opt.setName('category').setDescription('code, music, gfx, design, effects, engine, 3d, bug').setRequired(false))
      .addStringOption((opt) => opt.setName('priority').setDescription('lamer, scener, elite, legend').setRequired(false))
      .addStringOption((opt) => opt.setName('points').setDescription('Points').setRequired(false))
      .addStringOption((opt) => opt.setName('assign').setDescription('BBS user to assign to — start typing to pick').setRequired(false).setAutocomplete(true))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('task-delete').setDescription('Delete a task (asks first)')
      .addStringOption((opt) => opt.setName('id').setDescription('Task id — start typing to pick').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('task-complete').setDescription('Complete a task, awarding points')
      .addStringOption((opt) => opt.setName('id').setDescription('Task id — start typing to pick').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('task-move').setDescription('Move a task to another column')
      .addStringOption((opt) => opt.setName('id').setDescription('Task id — start typing to pick').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) =>
        opt.setName('status').setDescription('Column').setRequired(true)
          .addChoices(
            { name: 'todo', value: 'todo' },
            { name: 'in-progress', value: 'in-progress' },
            { name: 'testing', value: 'testing' },
            { name: 'done', value: 'done' }
          )
      )
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('project-new').setDescription('Create a project (form)')
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('project-delete').setDescription('Delete a project and its tasks (asks first)')
      .addStringOption((opt) => opt.setName('id').setDescription('Project id — start typing to pick').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('users').setDescription('List BBS users for assigning tasks')
  );

export async function registerCommands(botToken: string, guildId: string, clientId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(botToken);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [linkCommand.toJSON(), whipCommand.toJSON()],
  });
}

interface Repliable {
  deferred: boolean;
  replied: boolean;
  reply(args: any): Promise<unknown>;
  editReply(args: any): Promise<unknown>;
}

async function replyError(interaction: Repliable, message: string): Promise<void> {
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

/** Pure usage text, so the help screen is unit-tested, not eyeballed. */
export function buildHelpText(): string {
  return [
    '**Link first.** On the BBS run LINKDISCORD, then `/link code:XXXXXXXX` here (10 minutes, single use).',
    '',
    '**Read the board.** `/whip projects` — all projects with progress. `/whip tasks project:<id>` — one project. `/whip task id:<id>` — one task with buttons. `/whip my-tasks` — yours (or `user:<id>`). `/whip leaderboard` — points and levels. `/whip achievements` — yours (or `user:<id>`). `/whip parties` — upcoming parties. `/whip users` — BBS users for assigning.',
    '',
    '**Change the board (linked users).** `/whip task-new` and `/whip project-new` open forms. On a task: Complete, Move, Delete buttons. Or in text: `/whip task-complete`, `/whip task-move`, `/whip task-edit`, `/whip task-delete`, `/whip project-delete`.',
    '',
    '**Follow along.** The feed channel posts completions, new projects, and achievements as they happen in the door.',
    '',
    '**Out.** `/link` again to move your link; ask the sysop to unlink you if stuck.',
  ].join('\n');
}

/** Pure mention/DM rule, so it is unit-tested, not eyeballed. */
export function shouldAnswerMessage(input: { authorIsBot: boolean; mentioned: boolean; isDM: boolean }): boolean {
  if (input.authorIsBot) return false;
  // Talking to the bot directly (DM), or naming it in a channel: usage.
  // Anything else in a channel is none of its business - and without the
  // privileged Message Content intent it cannot even see the words.
  return input.isDM || input.mentioned;
}

/** The bot's own user id, set on ready. */
let botUserId: string | null = null;

async function handleMessage(message: Message): Promise<void> {
  if (!botUserId) return;
  const answer = shouldAnswerMessage({
    authorIsBot: message.author.bot,
    mentioned: message.mentions.has(botUserId),
    isDM: message.channel.isDMBased(),
  });
  if (answer) {
    await message.reply(buildHelpText());
  }
}

async function handleWhip(interaction: ChatInputCommandInteraction, api: WhipApiClient): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'help') {
    await interaction.reply({ content: buildHelpText(), ephemeral: true });
    return;
  }
  await interaction.deferReply();
  try {
    switch (sub) {
      case 'projects': {
        const projects = await api.listProjects();
        const embed = new EmbedBuilder().setTitle('WHIP projects');
        embed.setDescription(formatProjects(projects));
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'tasks': {
        const projectId = interaction.options.getString('project', true).trim();
        const tasks = await api.listTasks(projectId);
        const embed = new EmbedBuilder().setTitle(`Tasks in ${projectId}`);
        embed.setDescription(formatTasks(tasks));
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'my-tasks': {
        const userId = await resolveUserId(interaction, api);
        if (!userId) return;
        const formatted = formatUserTasks(await api.listUserTasks(userId));
        const embed = new EmbedBuilder().setTitle(formatted.title);
        embed.setDescription(formatted.body);
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'leaderboard': {
        const rows = await api.leaderboard();
        const embed = new EmbedBuilder().setTitle('WHIP leaderboard');
        embed.setDescription(formatLeaderboard(rows));
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'achievements': {
        const userId = await resolveUserId(interaction, api);
        if (!userId) return;
        const formatted = formatAchievements(await api.achievements(userId));
        const embed = new EmbedBuilder().setTitle(formatted.title);
        embed.addFields(formatted.unlocked, formatted.locked);
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'parties': {
        const parties = await api.listParties();
        const embed = new EmbedBuilder().setTitle('Parties');
        embed.setDescription(formatParties(parties));
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'users': {
        const users = await api.listUsers();
        const embed = new EmbedBuilder().setTitle('BBS users');
        embed.setDescription(
          users.length === 0
            ? 'Nobody yet.'
            : users.map((u) => `**${u.handle}** · \`${u.userId}\``).join('\n')
        );
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'task': {
        const task = await api.getTask(interaction.options.getString('id', true).trim());
        const embed = new EmbedBuilder().setTitle(task.title);
        embed.setDescription(
          `${formatTaskLine(task)}${task.description ? `\n\n${task.description}` : ''}\n\`${task.id}\``
        );
        await interaction.editReply({ embeds: [embed], components: [buildTaskButtons(task.id)] });
        break;
      }
      case 'task-new': {
        await interaction.showModal(buildNewTaskModal(interaction.options.getString('project', true).trim()));
        break;
      }
      case 'task-edit': {
        const id = interaction.options.getString('id', true).trim();
        const patch: Record<string, unknown> = {};
        for (const key of ['title', 'description', 'category', 'priority', 'points', 'assign'] as const) {
          const value = interaction.options.getString(key, false);
          if (value !== null) patch[key === 'assign' ? 'assignedTo' : key] = key === 'points' ? value : value.trim();
        }
        const actor = await requireLinkedUser(interaction, api);
        if (!actor) return;
        try {
          if (patch.points !== undefined) patch.points = parsePoints(patch.points as string);
          const task = await api.updateTask(id, patch, actor.userId, interaction.user.id);
          await interaction.editReply({ content: `Updated **${task.title}**.` });
        } catch (err) {
          await replyError(interaction, writeErrorMessage(err));
        }
        break;
      }
      case 'task-delete': {
        const id = interaction.options.getString('id', true).trim();
        try {
          const task = await api.getTask(id);
          await interaction.editReply({
            content: `Delete task **${task.title}**?`,
            components: [buildDeleteConfirm(id)],
          });
        } catch (err) {
          await replyError(interaction, writeErrorMessage(err));
        }
        break;
      }
      case 'task-complete': {
        const actor = await requireLinkedUser(interaction, api);
        if (!actor) return;
        try {
          const result = await completeTask(api, interaction.options.getString('id', true).trim(), actor);
          await interaction.editReply({ content: result });
        } catch (err) {
          await replyError(interaction, writeErrorMessage(err));
        }
        break;
      }
      case 'task-move': {
        const actor = await requireLinkedUser(interaction, api);
        if (!actor) return;
        try {
          const result = await moveTaskTo(
            api,
            interaction.options.getString('id', true).trim(),
            interaction.options.getString('status', true),
            actor
          );
          await interaction.editReply({ content: result });
        } catch (err) {
          await replyError(interaction, writeErrorMessage(err));
        }
        break;
      }
      case 'project-new': {
        await interaction.showModal(buildNewProjectModal());
        break;
      }
      case 'project-delete': {
        const id = interaction.options.getString('id', true).trim();
        try {
          const projects = await api.listProjects();
          const project = projects.find((p) => p.id === id);
          if (!project) throw new WhipApiError('Unknown project', 404);
          await interaction.editReply({
            content: `Delete project **${project.name}** and its ${project.taskCounts.total} task(s)?`,
            components: [buildProjectDeleteConfirm(id)],
          });
        } catch (err) {
          await replyError(interaction, writeErrorMessage(err));
        }
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

/** Linked actor or null (already told the user). Discord id always travels. */
async function requireLinkedUser(
  interaction: ChatInputCommandInteraction,
  api: WhipApiClient
): Promise<{ userId: string; discordId: string } | null> {
  const userId = await resolveUserId(interaction, api);
  if (!userId) return null;
  return { userId, discordId: interaction.user.id };
}

function writeErrorMessage(err: unknown): string {
  return err instanceof WhipApiError ? err.message : 'WHIP request failed.';
}

async function completeTask(
  api: WhipApiClient,
  taskId: string,
  actor: { userId: string; discordId: string }
): Promise<string> {
  const result = await api.moveTask(taskId, 'done', actor.userId, actor.discordId);
  const unlocks =
    result.unlocked.length > 0 ? `\nUnlocked: ${result.unlocked.join(', ')}` : '';
  return `Completed **${result.task.title}** (+${result.task.points} pts).${unlocks}`;
}

async function moveTaskTo(
  api: WhipApiClient,
  taskId: string,
  status: string,
  actor: { userId: string; discordId: string }
): Promise<string> {
  const result = await api.moveTask(taskId, status, actor.userId, actor.discordId);
  return `Moved **${result.task.title}** to ${result.task.status}.`;
}

/** Autocomplete for every id-typed option: type two letters, pick. */
async function handleAutocomplete(interaction: any, api: WhipApiClient): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value ?? '');
  try {
    let sub = '';
    try {
      sub = interaction.options.getSubcommand();
    } catch {
      sub = '';
    }
    if (focused.name === 'project' || (focused.name === 'id' && sub === 'project-delete')) {
      const projects = await api.listProjects();
      await interaction.respond(projectChoices(projects, query));
    } else if (focused.name === 'id') {
      const tasks = await api.listAllTasks();
      await interaction.respond(taskChoices(tasks, query));
    } else if (focused.name === 'user' || focused.name === 'assign') {
      const users = await api.listUsers();
      await interaction.respond(userChoices(users, query));
    } else {
      await interaction.respond([]);
    }
  } catch {
    // Autocomplete must never error visibly; empty list beats a failure.
    try {
      await interaction.respond([]);
    } catch {
      // Already answered or gone.
    }
  }
}
async function handleWriteComponent(interaction: any, api: WhipApiClient): Promise<boolean> {
  const parsed = parseAction(interaction.customId ?? '');
  if (!parsed && !isNewProjectModal(interaction)) return false;

  if (interaction.isModalSubmit()) {
    return handleModalSubmit(interaction, api, parsed);
  }
  if (interaction.isButton()) {
    return handleButton(interaction, api, parsed);
  }
  if (interaction.isStringSelectMenu()) {
    return handleSelect(interaction, api, parsed);
  }
  return false;
}

function isNewProjectModal(interaction: any): boolean {
  return interaction.isModalSubmit?.() === true && interaction.customId === `${WRITE_PREFIX}newproj`;
}

async function handleModalSubmit(interaction: any, api: WhipApiClient, parsed: { action: string; taskId: string } | null): Promise<boolean> {
  const actor = await requireLinkedUser(interaction, api);
  if (!actor) return true;
  try {
    if (parsed && parsed.action === 'newtask') {
      const fields = interaction.fields;
      const task = await api.createTask({
        projectId: parsed.taskId,
        title: fields.getTextInputValue('title').trim(),
        category: fields.getTextInputValue('category').trim() || undefined,
        points: parsePoints(fields.getTextInputValue('points')),
        description: fields.getTextInputValue('description'),
        actorUserId: actor.userId,
        discordId: actor.discordId,
      });
      await interaction.reply({
        content: `Created **${task.title}**.`,
        embeds: [],
        components: [buildTaskButtons(task.id)],
      });
      return true;
    }
    if (interaction.customId === `${WRITE_PREFIX}newproj`) {
      const fields = interaction.fields;
      const project = await api.createProject({
        name: fields.getTextInputValue('name').trim(),
        type: fields.getTextInputValue('type').trim() || 'demo',
        description: fields.getTextInputValue('description'),
        actorUserId: actor.userId,
        discordId: actor.discordId,
      });
      await interaction.reply({ content: `Created project **${project.name}** (\`${project.id}\`).` });
      return true;
    }
  } catch (err) {
    await replyError(interaction, writeErrorMessage(err));
    return true;
  }
  return false;
}

async function handleButton(interaction: any, api: WhipApiClient, parsed: { action: string; taskId: string } | null): Promise<boolean> {
  if (!parsed) return false;
  const actor = await requireLinkedUser(interaction, api);
  if (!actor) return true;
  try {
    switch (parsed.action) {
      case 'done': {
        await interaction.deferUpdate();
        const result = await completeTask(api, parsed.taskId, actor);
        await interaction.followUp({ content: result, ephemeral: true });
        return true;
      }
      case 'move': {
        await interaction.reply({ content: 'Move to…', components: [buildMoveSelect(parsed.taskId)], ephemeral: true });
        return true;
      }
      case 'del': {
        const task = await api.getTask(parsed.taskId);
        await interaction.reply({
          content: `Delete task **${task.title}**?`,
          components: [buildDeleteConfirm(parsed.taskId)],
          ephemeral: true,
        });
        return true;
      }
      case 'del-yes': {
        await api.deleteTask(parsed.taskId, actor.userId, actor.discordId);
        await interaction.update({ content: 'Deleted.', components: [] });
        return true;
      }
      case 'del-no': {
        await interaction.update({ content: 'Kept.', components: [] });
        return true;
      }
      case 'pdel-yes': {
        await api.deleteProject(parsed.taskId, actor.userId, actor.discordId);
        await interaction.update({ content: 'Project deleted.', components: [] });
        return true;
      }
      case 'pdel-no': {
        await interaction.update({ content: 'Kept.', components: [] });
        return true;
      }
    }
  } catch (err) {
    await replyError(interaction, writeErrorMessage(err));
    return true;
  }
  return false;
}

async function handleSelect(interaction: any, api: WhipApiClient, parsed: { action: string; taskId: string } | null): Promise<boolean> {
  if (!parsed || parsed.action !== 'mv') return false;
  const actor = await requireLinkedUser(interaction, api);
  if (!actor) return true;
  try {
    const result = await moveTaskTo(api, parsed.taskId, interaction.values[0], actor);
    await interaction.update({ content: result, components: [] });
    return true;
  } catch (err) {
    await replyError(interaction, writeErrorMessage(err));
    return true;
  }
}

function maybeStartFeed(client: Client, config: BotConfig, apiUrl: string, health: HealthState): void {
  if (!config.feedChannelId) return; // Feed stays silent when unset.
  if (!config.bbsUser || !config.bbsPassword) {
    console.warn('[whip-bot] DISCORD_FEED_CHANNEL_ID is set but WHIP_BBS_USER/WHIP_BBS_PASSWORD are missing; feed disabled');
    return;
  }
  health.feedEnabled = true;
  const { feedChannelId, bbsUser, bbsPassword } = config;
  startFeed({
    apiUrl,
    bbsUser,
    bbsPassword,
    post: async (line) => {
      health.lastFeedEventAt = new Date().toISOString();
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
  const client = new Client({
    // Guilds (commands) + GuildMessages/DirectMessages (mention and DM
    // detection). None of these is privileged: the bot never asks for
    // Message Content, so channel chatter stays unreadable to it.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  });
  const health = createHealthState();

  // Health endpoint for compose + admin status probe. Fail-soft like the
  // feed: a taken port must not keep the bot offline.
  try {
    await startHealthServer('whip', health, config.healthPort);
    console.log(`[whip-bot] Health on :${config.healthPort}/health`);
  } catch (err) {
    console.warn('[whip-bot] Health endpoint unavailable, bot stays up:', (err as Error)?.message ?? err);
  }

  client.once('ready', async () => {
    console.log(`[whip-bot] Logged in as ${client.user?.tag}`);
    health.discordReady = true;
    if (client.user) {
      botUserId = client.user.id;
      await registerCommands(config.botToken, config.guildId, client.user.id);
      console.log('[whip-bot] Slash commands registered');
    }
    maybeStartFeed(client, config, config.apiUrl, health);
  });

  client.on('messageCreate', async (message) => {
    try {
      await handleMessage(message);
    } catch (err) {
      console.error('[whip-bot] Mention reply failed:', (err as Error)?.message ?? err);
    }
  });

  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction, api);
        return;
      }
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'link') {
          await handleLink(interaction, api);
        } else if (interaction.commandName === 'whip') {
          await handleWhip(interaction, api);
        }
        return;
      }
      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        await handleWriteComponent(interaction, api);
      }
    } catch (err) {
      console.error('[whip-bot] Interaction failed:', err);
      if (interaction.isRepliable()) {
        await replyError(interaction, 'Something went wrong talking to the BBS. Try again in a bit.');
      }
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
