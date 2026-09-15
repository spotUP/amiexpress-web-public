/**
 * CARDS YOU CAN CLICK.
 *
 * The hand used to be one block of text inside a box: `renderCardLines`
 * joined every card's art into a string and the box drew it. That is fine to
 * look at and impossible to use - there is nothing for the mouse to hit and
 * nothing for Tab to land on, which is exactly what the sysop ran into:
 * "navigating with tab to the different panels and cards dont work either
 * isnt that an sdk level thing? why doesnt it work?" (2026-09-15).
 *
 * It was not an SDK thing. The SDK's blessed has focus and mouse, and the
 * door already enables them; a card simply was not a widget. So here each
 * card IS one - clickable, focusable, and highlighted when it is picked -
 * laid out across the hand panel and reused between frames so a repaint does
 * not churn the screen.
 *
 * The text rendering stays as the fallback: a narrow panel, a 40-column
 * caller or a terminal that cannot draw full-size cards gets the old list,
 * because half a card is worse than a line of text.
 */

import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { CardEngine, type Card } from '@amiexpress/bbs-door-sdk';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { ansiToBlessedTags, stripBlessedTags } from '../lib/utils';
import { resolveCardStyle, toRenderOptions } from '../lib/card-style';
import type { CardPreferences } from '../lib/types';
import { UI_THEME } from '../lib/constants';

const cardEngine = new CardEngine();

export interface CardButtonHost {
  readonly handPanel: Box;
  readonly handContent: Box;
  readonly screen: { render(): void };
  readonly cardPreferences: CardPreferences | undefined;
  readonly unicodeCapable: boolean;
}

/**
 * A card to draw, in whichever pack it belongs to.
 *
 * Every game in the lobby comes through here, so the renderer has to speak
 * both: an ordinary pack (poker, Skitgubbe) and UNO's, which the SDK draws
 * with a different call. "this goes for all card games dont [do] changes for
 * only one game" (sysop, 2026-09-15).
 */
export type PlayableCard =
  | { kind: 'standard'; card: Card }
  | { kind: 'uno'; card: { color: string; value: string } };

export interface CardButtonOptions {
  /** The card the caller has picked, drawn lit. */
  selected: number | null;
  /** Which cards the rules will accept right now; the rest are dimmed. */
  playable: number[];
  /** Face down - draw the back, not the face. Used for the blind endgame. */
  faceDown?: boolean;
  /** A click, or ENTER while focused. */
  onPick(index: number): void;
}

export class CardButtons {
  private buttons: Box[] = [];
  private lastKey = '';

  constructor(private readonly host: CardButtonHost) {}

  /** The widgets Tab should walk, left to right. */
  public focusables(): Box[] {
    return this.buttons.filter((button) => !button.hidden);
  }

  public clear(): void {
    for (const button of this.buttons) button.hide();
    this.lastKey = '';
    this.host.handContent.show();
  }

  /**
   * Draw the hand as buttons.
   *
   * @returns false when the panel cannot hold them, so the caller falls back
   *          to the text list rather than drawing something unreadable.
   */
  /** Convenience for the ordinary pack, which most callers have. */
  public renderStandard(cards: Card[], options: CardButtonOptions): boolean {
    return this.render(cards.map((card) => ({ kind: 'standard' as const, card })), options);
  }

  public render(cards: PlayableCard[], options: CardButtonOptions): boolean {
    const panel = this.host.handPanel;
    const rows = Math.max(0, (Number(panel.height) || 0) - 2);
    const width = Math.max(0, (Number(panel.width) || 0) - 2);

    /*
     * THE PICKED CARD STANDS PROUD of the rest, the way a card pulled half
     * out of a hand does - "can the active card be shifted up one row?"
     * (sysop, 2026-09-15), and asked for EVERY game rather than one, which
     * is why it lives here in the shared renderer and not in a module.
     *
     * The lift needs a row to rise into, so one is kept back from the card
     * size below. That is the whole cost: on a panel that can no longer hold
     * a full-size card with it, the cards come out one size down rather than
     * the lift being dropped - a hand you can read and a card that clearly
     * stands out beats a slightly taller hand that all looks the same.
     */
    const LIFT_ROWS = 1;

    if (cards.length === 0) {
      this.clear();
      return false;
    }

    /*
     * MEASURE, do not trust the table. `card-style.ts` says a full card is
     * seven rows (FULL_CARD_ROWS) and the engine actually draws ten, so a
     * panel the chooser calls roomy can still be one the art overflows. So
     * the art is rendered, measured, and dropped a size if it does not fit -
     * rather than the whole hand falling back to text, which is what the
     * first build did on the sysop's own screen.
     */
    const chrome = resolveCardStyle(
      this.host.cardPreferences,
      rows - LIFT_ROWS,
      this.host.unicodeCapable,
    );

    const draw = (size: 'full' | 'mini'): string[][] => {
      const renderOptions = toRenderOptions({ ...chrome, size }) as never;
      return cards.map((entry) => {
        const lines = entry.kind === 'uno'
          ? cardEngine.renderUnoCardLines(
            { ...(entry.card as any), face: options.faceDown ? 'back' : 'front' },
            renderOptions,
          )
          : cardEngine.renderCardLines(
            { ...(entry.card as any), face: options.faceDown ? 'back' : 'front' },
            renderOptions,
          );
        return (lines as string[]).map((line: string) => ansiToBlessedTags(line));
      });
    };

    const fits = (candidate: string[][]): { perRow: number; cardRows: number; height: number } | null => {
      const cardWidth = stripBlessedTags(candidate[0]?.[0] ?? '').length;
      const cardHeight = candidate[0]?.length ?? 0;
      if (cardWidth === 0 || cardHeight === 0) return null;
      const perRow = Math.max(1, Math.floor(width / (cardWidth + 1)));
      const cardRows = Math.ceil(cards.length / perRow);
      if (cardRows * cardHeight + LIFT_ROWS > rows) return null;
      return { perRow, cardRows, height: cardHeight };
    };

    let art = draw(chrome.size);
    let layout = fits(art);
    if (!layout && chrome.size === 'full') {
      art = draw('mini');           // a smaller card beats no card at all
      layout = fits(art);
    }
    if (!layout) {
      this.clear();
      return false;
    }

    const cardWidth = stripBlessedTags(art[0][0]).length;
    const cardHeight = layout.height;

    /*
     * A full-size card is TEN rows and the hand panel's inside is ten, so a
     * number printed under each card does not fit - it was the difference
     * between drawing the buttons and declining them entirely. The label row
     * is drawn when there is room for it and dropped when there is not: a
     * card with no number under it is still clickable and still focusable,
     * and the activity panel names the keys either way.
     */
    const perRow = layout.perRow;
    const withLabels = layout.cardRows * (cardHeight + 1) + LIFT_ROWS <= rows;
    const buttonHeight = withLabels ? cardHeight + 1 : cardHeight;

    this.host.handContent.hide();
    this.ensure(cards.length);

    cards.forEach((_, index) => {
      const button = this.buttons[index];
      const row = Math.floor(index / perRow);
      const column = index % perRow;
      const picked = index === options.selected;
      const playable = options.playable.includes(index);
      const label = index === 9 ? '0' : String(index + 1);

      button.show();
      button.width = cardWidth;
      button.height = buttonHeight;
      // Everything sits one row down, and the picked card rises into the gap.
      button.top = row * buttonHeight + (picked ? 0 : LIFT_ROWS);
      button.left = column * (cardWidth + 1);
      button.setContent(withLabels
        ? [
          ...art[index],
          picked
            ? `{yellow-bg}{black-fg}[${label}]{/}{/}`
            : playable
              ? `{green-fg}[${label}]{/}`
              : `{${UI_THEME.dim}-fg}[${label}]{/}`,
        ].join('\n')
        : art[index].join('\n'));

      // Rebound every frame: the index a widget stands for changes as cards
      // leave the hand, and a stale closure would play the wrong card.
      (button as any).removeAllListeners('click');
      (button as any).removeAllListeners('press');
      (button as any).on('click', () => options.onPick(index));
      (button as any).on('press', () => options.onPick(index));
    });

    for (let index = cards.length; index < this.buttons.length; index += 1) {
      this.buttons[index].hide();
    }

    // Only repaint when something actually changed - a table refresh runs
    // every few seconds and the cards are usually the same ones.
    const key = `${cards.map((entry) => entry.kind === 'uno'
      ? `${(entry.card as any).color}${(entry.card as any).value}`
      : `${(entry.card as any).rank}${(entry.card as any).suit}`).join(',')}|${options.selected}`
      + `|${options.playable.join(',')}|${options.faceDown ? 'b' : 'f'}|${withLabels ? 'L' : '-'}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.host.screen.render();
    }
    return true;
  }

  private ensure(count: number): void {
    while (this.buttons.length < count) {
      this.buttons.push(createBox({
        parent: this.host.handPanel,
        border: undefined,
        top: 1,
        left: 1,
        width: 9,
        height: 7,
        tags: true,
        mouse: true,
        keys: true,
        clickable: true,
        focusable: true,
        hidden: true,
        style: {
          bg: UI_THEME.windowBg,
          focus: { border: { fg: UI_THEME.accent } },
        },
      }) as Box);
    }
  }
}
