/**
 * Card Hand Demo (SDK v2 CoreDoor)
 *
 * Renders a 5-card poker hand using CardEngine defaults (ASCII + ANSI).
 */

import { CoreDoor as Door, CardEngine, AnsiColor } from '@amiexpress/bbs-door-sdk';
import type { DoorContext, KeyPress } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'Card Hand Demo',
  version: '1.0.0',
  author: 'AmiExpress Team',
  description: 'Render a poker hand with CardEngine.',
});

const cards = new CardEngine();

const drawHand = async (ctx: DoorContext): Promise<void> => {
  try {
    const deck = cards.shuffleCards(cards.buildStandardDeck());

    if (!deck || deck.length < 5) {
      await ctx.output.writeLine('\r\n\x1b[31mError: Failed to create hand\x1b[0m\r\n');
      return;
    }

    const hand = deck.slice(0, 5);

    await ctx.output.clear();
    await ctx.output.setForeground(AnsiColor.Cyan);
    await ctx.output.writeLine('CardEngine Hand Demo');
    await ctx.output.reset();
    await ctx.output.writeLine('');

    for (const line of cards.renderHandLines(hand, { layout: 'flat-condensed' })) {
      await ctx.output.writeLine(line);
    }

    await ctx.output.writeLine('');
    await ctx.output.writeLine('[R]edraw  [Q]uit');
  } catch (error) {
    await ctx.output.writeLine('\r\n\x1b[31mError rendering hand\x1b[0m\r\n');
  }
};

door.onStart(async (ctx: DoorContext) => {
  await drawHand(ctx);
});

door.onInput(async (ctx: DoorContext, key: KeyPress) => {
  // Validate input
  if (!key || !key.key || typeof key.key !== 'string') {
    return;
  }

  const k = key.key.toLowerCase();

  if (k === 'q') {
    // Exit door by clearing input handler - SDK will handle cleanup
    if (ctx.bbsSession) {
      ctx.bbsSession.doorInputHandler = null;
    }
    return;
  }

  if (k === 'r') {
    try {
      await drawHand(ctx);
    } catch (error) {
      await ctx.output.writeLine('\r\n\x1b[31mError: Failed to redraw\x1b[0m\r\n');
    }
    return;
  }

  // Provide feedback for invalid keys
  if (k.length === 1 && k.match(/[a-z0-9]/)) {
    await ctx.output.writeLine('\r\n\x1b[33mPress R to redraw, Q to quit\x1b[0m\r\n');
  }
});

export default door;
