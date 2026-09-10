/**
 * Discord writes for WHIP (bot Phase 2): modals, buttons, selects.
 *
 * Every write resolves the caller's board identity first (link, handle,
 * door name, fuzzy - never anonymous) and sends actorUserId with discordId
 * only when a link row binds them, so the backend can verify the mapping.
 * Custom IDs are pure and tested; the Discord objects stay at the edges.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export type WriteDeps = {
  userId: string;
  discordId?: string;
};

const PREFIX = 'w:';

/** The custom-id namespace, for the rare caller that builds one by hand. */
export const WRITE_PREFIX = PREFIX;

/** Encode a component/modal id. Pure. */
export function encodeAction(action: string, taskId: string): string {
  return `${PREFIX}${action}:${taskId}`;
}

/** Decode; null when it is not ours. Pure. */
export function parseAction(customId: string): { action: string; taskId: string } | null {
  if (!customId.startsWith(PREFIX)) return null;
  const rest = customId.slice(PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return null;
  const action = rest.slice(0, sep);
  const taskId = rest.slice(sep + 1);
  if (!action || !taskId) return null;
  return { action, taskId };
}

export const TASK_STATUSES = ['todo', 'in-progress', 'testing', 'done'] as const;

export function buildTaskButtons(taskId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(encodeAction('done', taskId)).setLabel('Complete').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(encodeAction('move', taskId)).setLabel('Move…').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(encodeAction('del', taskId)).setLabel('Delete').setStyle(ButtonStyle.Danger)
  );
}

export function buildMoveSelect(taskId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(encodeAction('mv', taskId))
    .setPlaceholder('Move to…')
    .addOptions(TASK_STATUSES.map((s) => ({ label: s, value: s })));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildDeleteConfirm(taskId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(encodeAction('del-yes', taskId)).setLabel('Yes, delete').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(encodeAction('del-no', taskId)).setLabel('Keep').setStyle(ButtonStyle.Secondary)
  );
}

export function buildProjectDeleteConfirm(projectId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(encodeAction('pdel-yes', projectId)).setLabel('Yes, delete').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(encodeAction('pdel-no', projectId)).setLabel('Keep').setStyle(ButtonStyle.Secondary)
  );
}

export function buildNewTaskModal(projectId: string): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(encodeAction('newtask', projectId)).setTitle('New task');
  const title = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Title')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(120);
  const category = new TextInputBuilder()
    .setCustomId('category')
    .setLabel('Category')
    .setPlaceholder('code, music, gfx, design, effects, engine, 3d, bug')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  const points = new TextInputBuilder()
    .setCustomId('points')
    .setLabel('Points (default 10)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  const description = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);
  const assignee = new TextInputBuilder()
    .setCustomId('assignee')
    .setLabel('Assignee (handle, optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(title),
    new ActionRowBuilder<TextInputBuilder>().addComponents(category),
    new ActionRowBuilder<TextInputBuilder>().addComponents(points),
    new ActionRowBuilder<TextInputBuilder>().addComponents(assignee),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description)
  );
  return modal;
}

export function buildNewProjectModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`${PREFIX}newproj`).setTitle('New project');
  const name = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);
  const type = new TextInputBuilder()
    .setCustomId('type')
    .setLabel('Type')
    .setPlaceholder('demo, intro, musicdisk, graphics, music, code, tools')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  const description = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(name),
    new ActionRowBuilder<TextInputBuilder>().addComponents(type),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description)
  );
  return modal;
}

/** Points as typed; null when blank (backend default applies). Throws on garbage. */
export function parsePoints(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === '') return undefined;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) throw new Error('Points must be a non-negative number.');
  return n;
}

export interface Choice {
  name: string;
  value: string;
}

const MAX_CHOICES = 25;
const MAX_NAME = 100;

function matches(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

function capName(name: string): string {
  return name.length > MAX_NAME ? name.slice(0, MAX_NAME - 1) + '…' : name;
}

/** Autocomplete sources. Pure: filter here, fetch in index.ts. */
export function projectChoices(
  projects: Array<{ id: string; name: string; status: string; taskCounts: { total: number; done: number } }>,
  query: string
): Choice[] {
  return projects
    .filter((p) => matches(`${p.name} ${p.id}`, query))
    .slice(0, MAX_CHOICES)
    .map((p) => ({ name: capName(`${p.name} (${p.status}, ${p.taskCounts.done}/${p.taskCounts.total})`), value: p.id }));
}

export function taskChoices(
  tasks: Array<{ id: string; title: string; status: string; projectName?: string; projectId?: string }>,
  query: string
): Choice[] {
  return tasks
    .filter((t) => matches(`${t.title} ${t.projectName ?? t.projectId ?? ''} ${t.status}`, query))
    .slice(0, MAX_CHOICES)
    .map((t) => ({
      name: capName(`${t.title} [${t.status}]${t.projectName ? ` — ${t.projectName}` : ''}`),
      value: t.id,
    }));
}

export function userChoices(users: Array<{ userId: string; handle: string }>, query: string): Choice[] {
  return users
    .filter((u) => matches(`${u.handle} ${u.userId}`, query))
    .slice(0, MAX_CHOICES)
    .map((u) => ({ name: capName(u.handle), value: u.userId }));
}
