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
//
// The volume file OVERRIDES the process environment. dotenv keeps what is
// already set unless told otherwise, and compose sets WHIP_API_URL and
// HEALTH_PORT in `environment:` - so the admin's own fields were read off
// the disk and then discarded, and "Board URL" changed nothing. The whole
// point of the admin-written file is that what the sysop types wins.
const volumeEnv = process.env.BOT_ENV_FILE;
const localEnv = path.join(__dirname, '..', '.env');
if (volumeEnv && fs.existsSync(volumeEnv)) {
  loadEnv({ path: volumeEnv, override: true });
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
import { describeError } from './log-safe';
import { BoardApiClient, BoardApiError, type BoardText } from './board-api';
import { startFeedResilient } from './feed';
import { createHealthState, startHealthServer, type HealthState } from './health';
import {
  formatAchievements,
  formatBoardText,
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
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('board').setDescription('Board card'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('online').setDescription('Who is on the board right now'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('new').setDescription('Latest conference traffic'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('top').setDescription('Top callers'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('finduser').setDescription('Look up a BBS user by handle')
      .addStringOption((opt) => opt.setName('name').setDescription('Handle').setRequired(true))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub.setName('files').setDescription('File totals for a conference, or files matching a term')
      .addStringOption((opt) => opt.setName('find').setDescription('Search term').setRequired(false))
      .addIntegerOption((opt) => opt.setName('conf').setDescription('Conference number').setRequired(false))
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('confs').setDescription('Conferences on the board'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('doors').setDescription('Doors on the board'))
  .addSubcommand((sub: SlashCommandSubcommandBuilder) => sub.setName('mystats').setDescription('Your own board card (only you see it)'));

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

export interface DiscordIdentity {
  userId: string;
  /** Present only when a link row binds this Discord id: the backend
   *  checks discordId against the link, so unlinked resolutions must not
   *  send one. */
  discordId?: string;
}

/**
 * Who a Discord user is on the board, best evidence first:
 *
 * 1. An explicit `user` option (buttons and modals pass one through).
 * 2. The link row (LINKDISCORD): the explicit override, spoof-proof.
 * 3. Exact BBS handle match, case-insensitive (spotUP = spotup).
 * 4. The Discord name set in the WHIP door ("my Discord name").
 * 5. Fuzzy substring either way (spot ~ spotUP).
 *
 * One hit wins; several fuzzy hits are ambiguous and the bot asks instead
 * of guessing; none is unknown with a pointer to the door. Only the bridge
 * registers anything - nobody runs LINKDISCORD unless they want the lock.
 */
export async function resolveDiscordIdentity(
  api: WhipApiClient,
  discordId: string,
  discordUsername: string,
  explicit?: string | null,
): Promise<DiscordIdentity | { ambiguous: string[] } | null> {
  const name = (explicit ?? '').trim();
  if (name) {
    const users = await api.listUsers();
    const hit = users.find(
      (u) => u.handle.toLowerCase() === name.toLowerCase() || u.userId === name,
    );
    return hit ? { userId: hit.userId } : null;
  }
  try {
    const status = await api.linkStatus(discordId);
    return { userId: status.userId, discordId };
  } catch (err) {
    if (!(err instanceof WhipApiError) || err.status !== 404) throw err;
  }
  const clean = discordUsername.trim();
  if (clean) {
    try {
      const resolved = await api.resolve(clean);
      return { userId: resolved.userId };
    } catch (err) {
      if (!(err instanceof WhipApiError) || err.status !== 404) throw err;
    }
  }
  const users = await api.listUsers();
  const lower = clean.toLowerCase();
  const claimed = users.find(
    (u) => (u.discordName ?? '').toLowerCase() === lower && lower !== '',
  );
  if (claimed) return { userId: claimed.userId };
  if (lower) {
    const fuzzy = users.filter((u) => {
      const handle = u.handle.toLowerCase();
      const dn = (u.discordName ?? '').toLowerCase();
      if (handle.includes(lower) || lower.includes(handle)) return true;
      if (!dn) return false;
      return dn.includes(lower) || lower.includes(dn);
    });
    if (fuzzy.length === 1) return { userId: fuzzy[0].userId };
    if (fuzzy.length > 1) return { ambiguous: fuzzy.map((u) => u.handle) };
  }
  return null;
}

/** Resolve an explicit `user` option, else the caller's Discord identity.
 *  Null = told the user already (unknown, or ambiguous). Button and select
 *  interactions carry no options bag — the presser IS the identity there —
 *  so the option read is optional (live 2026-09-11: Move… crashed on
 *  `options.getString of undefined`). */
export async function resolveUserId(
  interaction: ChatInputCommandInteraction,
  api: WhipApiClient,
  optionName = 'user',
): Promise<DiscordIdentity | null> {
  const explicit = interaction.options?.getString?.(optionName, false) ?? null;
  const found = await resolveDiscordIdentity(api, interaction.user.id, interaction.user.username, explicit);
  if (found && 'ambiguous' in found) {
    await replyError(
      interaction,
      `Your Discord name matches several board users (${found.ambiguous.join(', ')}). Set your exact Discord name in the WHIP door under Me, then try again.`,
    );
    return null;
  }
  if (!found) {
    await replyError(
      interaction,
      explicit?.trim()
        ? `Unknown user "${explicit.trim()}".`
        : 'I do not know you on the board yet. Set your Discord name in the WHIP door under Me (D), then try again.',
    );
    return null;
  }
  return found;
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
    '**You, found.** The bot matches your Discord name to your BBS handle (exact, then the Discord name you set in the WHIP door under Me, then fuzzy). No registration needed.',
    '',
    '**Read the board.** `/whip projects` — all projects with progress. `/whip tasks project:<id>` — one project. `/whip task id:<id>` — one task with buttons. `/whip my-tasks` — yours (or `user:<id>`). `/whip leaderboard` — points and levels. `/whip achievements` — yours (or `user:<id>`). `/whip parties` — upcoming parties. `/whip users` — BBS users for assigning.',
    '',
    '**Change the board.** `/whip task-new` and `/whip project-new` open forms. On a task: Complete, Move, Delete buttons. Or in text: `/whip task-complete`, `/whip task-move`, `/whip task-edit`, `/whip task-delete`, `/whip project-delete`.',
    '',
    '**Ask about the board.** `/whip board` — the board card. `/whip online` — who is on. `/whip new` — latest traffic. `/whip top` — top callers. `/whip finduser name:<handle>` — look a caller up. `/whip files` — what a conference holds (`find:` to search). `/whip confs` — conferences. `/whip doors` — doors. `/whip mystats` — your own card, shown only to you.',
    '',
    '**Follow along.** The feed channel posts completions, new projects, and achievements as they happen in the door.',
    '',
    '**Out.** `/link` with a LINKDISCORD code locks your Discord account to your BBS user (no one can borrow the name); ask the sysop to unlink you if stuck.',
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

/**
 * A task id as typed: exact or unique 8-char prefix. The door shows short
 * ids and callers quote them (`8f358f41`), but the API wants the full
 * UUID — exact match wins, a unique prefix resolves, anything else says
 * so with candidates instead of "Unknown task".
 */
export async function resolveTaskId(api: WhipApiClient, raw: string): Promise<string> {
  const tasks = await api.listAllTasks();
  const exact = tasks.find((t) => t.id === raw);
  if (exact) return exact.id;
  const hits = tasks.filter((t) => t.id.toLowerCase().startsWith(raw.toLowerCase()));
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) {
    throw new WhipApiError(
      `"${raw}" matches ${hits.length} tasks: ${hits.slice(0, 5).map((t) => `${t.title} (\`${t.id.slice(0, 8)}\`)`).join(', ')}. Be more specific.`,
      400,
    );
  }
  throw new WhipApiError(`Unknown task "${raw}".`, 404);
}

async function handleWhip(
  interaction: ChatInputCommandInteraction,
  api: WhipApiClient,
  board: BoardApiClient | null,
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === 'help') {
    await interaction.reply({ content: buildHelpText(), ephemeral: true });
    return;
  }
  // A modal IS the reply to the interaction, so it cannot follow a defer:
  // showModal after deferReply throws InteractionAlreadyReplied, which the
  // outer catch turned into "WHIP request failed." - both creation forms
  // have been dead since they were written.
  if (sub === 'task-new') {
    await interaction.showModal(buildNewTaskModal(interaction.options.getString('project', true).trim()));
    return;
  }
  if (sub === 'project-new') {
    await interaction.showModal(buildNewProjectModal());
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
        const identity = await resolveUserId(interaction, api);
        if (!identity) return;
        const formatted = formatUserTasks(await api.listUserTasks(identity.userId));
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
        const identity = await resolveUserId(interaction, api);
        if (!identity) return;
        const formatted = formatAchievements(await api.achievements(identity.userId));
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
      case 'board': {
        await boardEmbed(interaction, 'Board', (b) => b.boardInfo(), board);
        break;
      }
      case 'online': {
        await boardEmbed(interaction, 'Online now', (b) => b.whoOnline(), board);
        break;
      }
      case 'new': {
        await boardEmbed(interaction, 'Latest traffic', (b) => b.recentMessages(1, 5), board);
        break;
      }
      case 'top': {
        await boardEmbed(interaction, 'Top callers', (b) => b.topCallers(5), board);
        break;
      }
      case 'finduser': {
        const name = interaction.options.getString('name', true).trim();
        await boardEmbed(interaction, `User ${name}`, async (b) => {
          const exact = await b.userLookup(name);
          if (!exact.text.startsWith('No user called')) return exact;
          return b.userSearch(name, 5);
        }, board);
        break;
      }

      case 'files': {
        /*
         * The plan's batch 2 called this `newfiles`, "latest uploads". The
         * bot-data API cannot answer that: `getFileEntries` takes `limit` and
         * `search` and nothing else (services/bot-data/types.ts:59), so there
         * is no way to order by upload date, and adding one is a backend
         * change the plan puts outside these command batches. What the
         * endpoints DO answer is how much a conference holds and what matches
         * a term, so that is what this says it does.
         */
        const find = (interaction.options.getString('find') ?? '').trim();
        const conf = interaction.options.getInteger('conf') ?? 1;
        if (find) {
          await boardEmbed(interaction, `Files matching "${find}" in conference ${conf}`,
            (b) => b.fileSearch(find, conf, 5), board);
        } else {
          await boardEmbed(interaction, `Files in conference ${conf}`, (b) => b.fileStats(conf), board);
        }
        break;
      }

      case 'confs': {
        await boardEmbed(interaction, 'Conferences', (b) => b.conferences(), board);
        break;
      }

      case 'doors': {
        await boardEmbed(interaction, 'Doors', (b) => b.doors(), board);
        break;
      }

      case 'mystats': {
        /*
         * The identity payoff: `/link` already proves who the asker is, so
         * this needs no `user:` option - and must not have one, or it becomes
         * a way to read somebody else's card. The reply is ephemeral because
         * a caller's own stats are nobody else's business in a public channel.
         *
         * linkStatus answers with a user id and no handle, and the board card
         * is looked up BY handle, so the bot's own user list bridges the two.
         */
        if (!needBoard(interaction, board)) break;
        const linked = await requireLinkedUser(interaction, api);
        if (!linked) break;
        const users = await api.listUsers();
        const me = users.find((u) => u.userId === linked.userId);
        if (!me) {
          await interaction.editReply({
            content: 'Your account is linked, but the board does not list it. Tell the sysop.',
          });
          break;
        }
        const card = await board.userLookup(me.handle);
        const embed = new EmbedBuilder().setTitle(`${me.handle} on the board`);
        embed.setDescription(formatBoardText(card));
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'task': {
        const taskId = await resolveTaskId(api, interaction.options.getString('id', true).trim());
        const task = await api.getTask(taskId);
        const embed = new EmbedBuilder().setTitle(task.title);
        embed.setDescription(
          `${formatTaskLine(task)}${task.description ? `\n\n${task.description}` : ''}\n\`${task.id}\``
        );
        await interaction.editReply({ embeds: [embed], components: [buildTaskButtons(task.id)] });
        break;
      }

      case 'task-edit': {
        const id = await resolveTaskId(api, interaction.options.getString('id', true).trim());
        const patch: Record<string, unknown> = {};
        for (const key of ['title', 'description', 'category', 'priority', 'points'] as const) {
          const value = interaction.options.getString(key, false);
          if (value !== null) patch[key] = key === 'points' ? value : value.trim();
        }
        const assignRaw = interaction.options.getString('assign', false);
        const actor = await requireLinkedUser(interaction, api);
        if (!actor) return;
        try {
          if (assignRaw !== null) patch.assignedTo = await resolveAssignee(api, assignRaw.trim(), actor.userId);
          if (patch.points !== undefined) patch.points = parsePoints(patch.points as string);
          const task = await api.updateTask(id, patch, actor.userId, actor.discordId);
          await interaction.editReply({ content: `Updated **${task.title}**.` });
        } catch (err) {
          await replyError(interaction, writeErrorMessage(err));
        }
        break;
      }
      case 'task-delete': {
        const id = await resolveTaskId(api, interaction.options.getString('id', true).trim());
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
          const result = await completeTask(api, await resolveTaskId(api, interaction.options.getString('id', true).trim()), actor);
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
            await resolveTaskId(api, interaction.options.getString('id', true).trim()),
            interaction.options.getString('status', true),
            actor
          );
          await interaction.editReply({ content: result });
        } catch (err) {
          await replyError(interaction, writeErrorMessage(err));
        }
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
    if (err instanceof BoardApiError) {
      const message = err.status === 403
        ? 'The bot is not allowed to read that. Ask the sysop to widen its token.'
        : `Board request failed: ${err.message}`;
      await replyError(interaction, message);
      return;
    }
    const message = err instanceof WhipApiError ? `WHIP request failed: ${err.message}` : 'WHIP request failed.';
    await replyError(interaction, message);
  }
}

/**
 * The board client or a told user. Board subcommands need BOARD_DATA_TOKEN;
 * without it they say so instead of failing on an undefined client.
 */
function needBoard(interaction: Repliable, board: BoardApiClient | null): board is BoardApiClient {
  if (board) return true;
  void replyError(interaction, 'Board reads are not configured on this bot. Ask the sysop to set BOARD_DATA_TOKEN.');
  return false;
}

async function boardEmbed(
  interaction: ChatInputCommandInteraction,
  title: string,
  read: (board: BoardApiClient) => Promise<BoardText>,
  board: BoardApiClient | null,
): Promise<void> {
  if (!needBoard(interaction, board)) return;
  const embed = new EmbedBuilder().setTitle(title);
  embed.setDescription(formatBoardText(await read(board)));
  await interaction.editReply({ embeds: [embed] });
}

/**
 * The actor for a WRITE, or null (the user has been told why).
 *
 * A write is only ever the person pressing the keys, proved by a link row -
 * never a name match and never the `user:` option. Before this, every write
 * path went through resolveUserId, which falls back to the Discord username,
 * then to a stored discordName, then to a FUZZY substring of either - and
 * deliberately sent no discordId for those, which is exactly the field the
 * board checks. So any member of the guild could rename themselves to a BBS
 * handle, or simply pass `user: <handle>`, and complete, edit or DELETE that
 * caller's tasks and projects, with the points and achievements landing on
 * the victim. Linking gave the victim no protection at all.
 *
 * Reads keep the friendlier resolution: knowing which tasks to SHOW someone
 * is not the same question as being allowed to change them.
 */
async function requireLinkedUser(
  interaction: ChatInputCommandInteraction,
  api: WhipApiClient
): Promise<{ userId: string; discordId: string } | null> {
  try {
    const status = await api.linkStatus(interaction.user.id);
    return { userId: status.userId, discordId: interaction.user.id };
  } catch (err) {
    if (err instanceof WhipApiError && err.status === 404) {
      await replyError(
        interaction,
        'Writing to WHIP needs a linked account. On the BBS, run LINKDISCORD and give me the code with `/link <code>`.',
      );
      return null;
    }
    await replyError(interaction, writeErrorMessage(err));
    return null;
  }
}

function writeErrorMessage(err: unknown): string {
  return err instanceof WhipApiError ? err.message : 'WHIP request failed.';
}

/**
 * Assignee as typed: a handle resolves to its user id, a raw id passes
 * through, blank means the backend default (the creator). Unknown handles
 * are rejected with the user list, not silently dropped.
 */
async function resolveAssignee(api: WhipApiClient, raw: string, fallbackUserId: string): Promise<string> {
  if (!raw) return fallbackUserId;
  try {
    const users = await api.listUsers();
    const hit = users.find((u) => u.handle.toLowerCase() === raw.toLowerCase() || u.userId === raw);
    if (hit) return hit.userId;
    const known = users.map((u) => u.handle).join(', ') || 'nobody yet';
    throw new WhipApiError(`Unknown user "${raw}". Known: ${known}.`, 400);
  } catch (err) {
    if (err instanceof WhipApiError) throw err;
    return fallbackUserId;
  }
}

async function completeTask(
  api: WhipApiClient,
  taskId: string,
  actor: { userId: string; discordId?: string }
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
  actor: { userId: string; discordId?: string }
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
      const assigneeRaw = fields.getTextInputValue('assignee').trim();
      const task = await api.createTask({
        projectId: parsed.taskId,
        title: fields.getTextInputValue('title').trim(),
        category: fields.getTextInputValue('category').trim() || undefined,
        points: parsePoints(fields.getTextInputValue('points')),
        description: fields.getTextInputValue('description'),
        assignedTo: await resolveAssignee(api, assigneeRaw, actor.userId),
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
  startFeedResilient({
    apiUrl,
    bbsUser,
    bbsPassword,
    post: async (line) => {
      health.lastFeedEventAt = new Date().toISOString();
      const channel = await client.channels.fetch(feedChannelId);
      if (channel?.isTextBased()) {
        // The line carries BBS text - a task title a caller typed, which
        // can be typed from Discord too. Sent as bare content it would ping
        // the guild for "@everyone" and every role it names, so mentions
        // are off: the feed reports, it does not summon.
        await (channel as TextChannel).send({ content: line, allowedMentions: { parse: [] } });
      }
    },
    log: (message) => console.log(message),
  }, {
    onState: (state) => {
      const was = health.feedState;
      health.feedState = state;
      if (state === 'live' && was !== 'live') console.log('[whip-bot] Live WHIP feed started');
      if (state === 'retrying') health.feedReconnects += 1;
    },
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new WhipApiClient(config.apiUrl, config.serviceToken);
  const board = config.boardToken ? new BoardApiClient(config.apiUrl, config.boardToken) : null;
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
    console.warn('[whip-bot] Health endpoint unavailable, bot stays up:', describeError(err));
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
      console.error('[whip-bot] Mention reply failed:', describeError(err));
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
          await handleWhip(interaction, api, board);
        }
        return;
      }
      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        await handleWriteComponent(interaction, api);
      }
    } catch (err) {
      console.error('[whip-bot] Interaction failed:', describeError(err));
      if (interaction.isRepliable()) {
        await replyError(interaction, 'Something went wrong talking to the BBS. Try again in a bit.');
      }
    }
  });

  await client.login(config.botToken);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[whip-bot] Fatal:', describeError(err));
    process.exit(1);
  });
}
