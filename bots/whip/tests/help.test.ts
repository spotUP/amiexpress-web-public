/**
 * /whip help prints the usage screen: link flow, every subcommand, feed.
 */
import assert from 'assert';
import { buildHelpText } from '../src/index';

export async function helpMentionsLinkFlow(): Promise<void> {
  const text = buildHelpText();
  assert.ok(text.includes('LINKDISCORD'), 'tells where the code comes from');
  assert.ok(text.includes('/link'), 'names the link command');
}

export async function helpMentionsEverySubcommand(): Promise<void> {
  const text = buildHelpText();
  for (const sub of ['projects', 'tasks', 'my-tasks', 'leaderboard', 'achievements', 'parties']) {
    assert.ok(text.includes(sub), `mentions /whip ${sub}`);
  }
}
