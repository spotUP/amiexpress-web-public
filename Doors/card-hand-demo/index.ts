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
  const deck = cards.shuffleCards(cards.buildStandardDeck());
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
};

door.onStart(async (ctx: DoorContext) => {
  await drawHand(ctx);
});

door.onInput(async (ctx: DoorContext, key: KeyPress) => {
  const k = key.key.toLowerCase();

  if (k === 'q') {
    ctx.close();
    return;
  }

  if (k === 'r') {
    await drawHand(ctx);
  }
});

export default door;
