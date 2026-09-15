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
  /** The panel the cards are drawn inside. */
  readonly panel: Box;
  /** The text box to fall back to, and to hide while widgets are up. */
  readonly fallback: Box;
  readonly screen: { render(): void };
  readonly cardPreferences: CardPreferences | undefined;
  readonly unicodeCapable: boolean;
}

export interface CardButtonOptionsBase {
  /** What the number under each card says: 1-based by default. */
  labelFrom?: number;
  /**
   * Draw the numbers at all. A row nobody can pick from - the pile in the
   * middle of the table - is there to be READ, and numbering it invites a
   * keypress that does nothing.
   */
  labels?: boolean;
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
  | { kind: 'standard'; card: Card; face?: 'front' | 'back' }
  | { kind: 'uno'; card: { color: string; value: string }; face?: 'front' | 'back' };

export interface CardButtonOptions extends CardButtonOptionsBase {
  /** The card the caller has picked, drawn lit. */
  selected: number | null;
  /** Which cards the rules will accept right now; the rest are dimmed. */
  playable: number[];
  /** Face down - draw the back, not the face. Used for the blind endgame. */
  faceDown?: boolean;
  /** A click, or ENTER while focused. */
  onPick(index: number): void;
  /**
   * Tab landed on this card.
   *
   * Focus IS selection here: moving to a card lifts it, which is the only
   * way a caller can tell that Tab did anything ("i cant tab between the
   * panels and the borders dont lit up", sysop 2026-09-15).
   */
  onFocus?(index: number): void;
}

/** What one call to `render` settled on: the shape, and the card's size. */
interface Layout {
  /** Cards in a row before it wraps. */
  perRow: number;
  /** Columns from one card's left edge to the next: overlapping when < width. */
  stride: number;
  cardRows: number;
  height: number;
  cardWidth: number;
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
    this.host.fallback.show();
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
    const panel = this.host.panel;
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
        /*
         * THE FACE IS THE CARD'S, not the row's. `faceDown` turns a whole
         * row over (the blind endgame), but a row can be MIXED: the six in
         * front of a Skitgubbe player are three faces and three backs, and
         * before this the three backs were drawn as whatever card object the
         * caller had faked to stand in for them - three Aces of Spades on
         * the sysop's screen (2026-09-15).
         */
        const face = entry.face ?? (options.faceDown ? 'back' : 'front');
        const lines = entry.kind === 'uno'
          ? cardEngine.renderUnoCardLines({ ...(entry.card as any), face }, renderOptions)
          : cardEngine.renderCardLines({ ...(entry.card as any), face }, renderOptions);
        return (lines as string[]).map((line: string) => ansiToBlessedTags(line));
      });
    };

    /*
     * A ROW OF CARDS IS ONE HEIGHT. The engine draws a BACK shorter than a
     * face - three rows shorter at full size - so a mixed row (the three
     * face up and three face down in front of a Skitgubbe player) came out
     * ragged, the backs ending a row above their neighbours. Pad to the
     * tallest and widest in the row; measuring one card and trusting it for
     * the rest is the same mistake FULL_CARD_ROWS makes.
     */
    const square = (candidate: string[][]): string[][] => {
      const widths = candidate.map((art) => stripBlessedTags(art[0] ?? '').length);
      const height = Math.max(0, ...candidate.map((art) => art.length));
      const cardWidth = Math.max(0, ...widths);
      return candidate.map((art, index) => {
        const pad = ' '.repeat(Math.max(0, cardWidth - (widths[index] ?? 0)));
        const padded = art.map((line) => line + pad);
        /*
         * A short card grows by REPEATING its last row, not by blank ones: a
         * back is short because its hatching ran out, and one more row of
         * hatching is what a taller back looks like. Blank padding just moves
         * the ragged edge into the card.
         */
        const filler = padded[padded.length - 1] ?? ' '.repeat(cardWidth);
        while (padded.length < height) padded.push(filler);
        return padded;
      });
    };

    /*
     * A CARD IS NEVER NARROWER THAN ELEVEN COLUMNS. `mini` is a SHORTER
     * card, not a thinner one, so six cards laid out with a column of air
     * between them want 72 columns and the hand panel's inside is 57 - and
     * six is exactly what a Skitgubbe player has in front of them. The old
     * chooser had one shape, a grid with air between the cards, and when
     * that did not fit it gave up and left the panel to the text fallback:
     * a condensed hand drawn to no particular height, clipped by the panel,
     * with the face-down cards face up. That is what "V ... just flickers
     * broken cards" was (sysop, 2026-09-15) - not a flicker, the fallback.
     *
     * So there are two shapes now. A hand held in the fingers OVERLAPS, and
     * the second shape says so: one row, each card sitting `stride` columns
     * along from the last, which is what the SDK's own condensed hand layout
     * has always drawn in text. Three columns is the floor - a card showing
     * less than its edge and its rank is not a card you can read - and the
     * grid is still tried first at every size, so nothing that fits today
     * changes shape.
     */
    const MIN_STRIDE = 3;

    const measure = (candidate: string[][]): { cardWidth: number; cardHeight: number } => ({
      cardWidth: stripBlessedTags(candidate[0]?.[0] ?? '').length,
      cardHeight: candidate[0]?.length ?? 0,
    });

    /** Cards side by side with a column between them, wrapping into rows. */
    const grid = (candidate: string[][]): Layout | null => {
      const { cardWidth, cardHeight } = measure(candidate);
      if (cardWidth === 0 || cardHeight === 0) return null;
      const perRow = Math.max(1, Math.floor(width / (cardWidth + 1)));
      const cardRows = Math.ceil(cards.length / perRow);
      if (cardRows * cardHeight + LIFT_ROWS > rows) return null;
      return { perRow, stride: cardWidth + 1, cardRows, height: cardHeight, cardWidth };
    };

    /** One row, each card overlapping the one before it. */
    const fan = (candidate: string[][]): Layout | null => {
      const { cardWidth, cardHeight } = measure(candidate);
      if (cardWidth === 0 || cardHeight === 0) return null;
      if (cards.length < 2) return null;
      if (cardHeight + LIFT_ROWS > rows) return null;
      const stride = Math.floor((width - cardWidth) / (cards.length - 1));
      if (stride < MIN_STRIDE) return null;
      return {
        perRow: cards.length,
        stride: Math.min(stride, cardWidth + 1),
        cardRows: 1,
        height: cardHeight,
        cardWidth,
      };
    };

    // Biggest card first, and air before overlap.
    const sizes: Array<'full' | 'mini'> = chrome.size === 'full' ? ['full', 'mini'] : ['mini'];
    const drawn = new Map<string, string[][]>();
    const artFor = (size: 'full' | 'mini'): string[][] => {
      if (!drawn.has(size)) drawn.set(size, square(draw(size)));
      return drawn.get(size)!;
    };

    let art: string[][] | null = null;
    let layout: Layout | null = null;
    for (const shape of [grid, fan]) {
      for (const size of sizes) {
        const candidate = artFor(size);
        const found = shape(candidate);
        if (found) { art = candidate; layout = found; break; }
      }
      if (layout) break;
    }
    if (!layout || !art) {
      this.clear();
      return false;
    }

    const cardWidth = layout.cardWidth;
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

    this.host.fallback.hide();
    this.ensure(cards.length);

    cards.forEach((_, index) => {
      const button = this.buttons[index];
      const row = Math.floor(index / perRow);
      const column = index % perRow;
      const picked = index === options.selected;
      const playable = options.playable.includes(index);
      const number = (options.labelFrom ?? 1) + index;
      const label = number === 10 ? '0' : String(number);

      button.show();
      button.width = cardWidth;
      button.height = buttonHeight;
      // Everything sits one row down, and the picked card rises into the gap.
      button.top = row * buttonHeight + (picked ? 0 : LIFT_ROWS);
      button.left = column * layout!.stride;
      const showLabel = withLabels && options.labels !== false;
      button.setContent(showLabel
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
      (button as any).removeAllListeners('focus');
      (button as any).on('click', () => options.onPick(index));
      (button as any).on('press', () => options.onPick(index));
      if (options.onFocus) (button as any).on('focus', () => options.onFocus?.(index));
      // A row that cannot be picked from does not take the focus either.
      (button as any).options.focusable = options.labels !== false;
      (button as any).clickable = options.labels !== false;
    });

    for (let index = cards.length; index < this.buttons.length; index += 1) {
      this.buttons[index].hide();
    }

    /*
     * In a fan each card is drawn over the one before it, so the card the
     * caller has picked - the whole point of the lift - would be the one
     * half covered. It comes to the front instead, and the lift then shows
     * a whole card standing proud of the row.
     */
    if (layout.stride <= cardWidth && options.selected !== null
        && options.selected >= 0 && options.selected < cards.length) {
      (this.buttons[options.selected] as any).setFront?.();
    }

    // Only repaint when something actually changed - a table refresh runs
    // every few seconds and the cards are usually the same ones.
    const key = `${cards.map((entry) => entry.kind === 'uno'
      ? `${(entry.card as any).color}${(entry.card as any).value}`
      : `${(entry.card as any).rank}${(entry.card as any).suit}`).join(',')}|${options.selected}`
      + `|${options.playable.join(',')}|${options.faceDown ? 'b' : 'f'}|${withLabels ? 'L' : '-'}`
      // The shape as well: the same cards in a resized panel are a different
      // picture, and skipping that repaint leaves a fan at the old stride.
      + `|${cardWidth}x${cardHeight}@${layout.stride}/${layout.perRow}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.host.screen.render();
    }
    return true;
  }

  private ensure(count: number): void {
    while (this.buttons.length < count) {
      this.buttons.push(createBox({
        parent: this.host.panel,
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
