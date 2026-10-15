/**
 * Talking to the bot (DM) or naming it (mention) prints usage; channel
 * chatter and fellow bots get silence.
 */
import assert from 'assert';
import { shouldAnswerMessage } from '../src/index';

export async function answersDMs(): Promise<void> {
  assert.strictEqual(shouldAnswerMessage({ authorIsBot: false, mentioned: false, isDM: true }), true);
}

export async function answersMentions(): Promise<void> {
  assert.strictEqual(shouldAnswerMessage({ authorIsBot: false, mentioned: true, isDM: false }), true);
}

export async function ignoresChannelChatter(): Promise<void> {
  assert.strictEqual(shouldAnswerMessage({ authorIsBot: false, mentioned: false, isDM: false }), false);
}

export async function ignoresBotsEvenWhenMentioned(): Promise<void> {
  assert.strictEqual(shouldAnswerMessage({ authorIsBot: true, mentioned: true, isDM: false }), false);
  assert.strictEqual(shouldAnswerMessage({ authorIsBot: true, mentioned: false, isDM: true }), false);
}
