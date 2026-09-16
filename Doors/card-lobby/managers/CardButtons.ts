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
export type DrawnCard =
  | { kind: 'standard'; card: Card; face?: 'front' | 'back' }
  | { kind: 'uno'; card: { color: string; value: string }; face?: 'front' | 'back' };

/**
 * A card, and whatever lies UNDER it.
 *
 * Cards on a table are not always side by side. In Skitgubbe each player has
 * three PILES in front of them - a blind card face down with an open one
 * lying on top of it - and drawing those as six cards in a row says the
 * wrong thing about the game: "there is 3 cards in front of me, backside up,
 * they are blind and on top of those there are 3 cards that are open, you
 * put 6 open cards next to each other" (sysop, 2026-09-15). `under` is that
 * pile: it is drawn first, up and to the left, so its corner shows behind
 * the card on top - and it is drawn, not implied, so when the open card is
 * played what is left is a card, still face down.
 */
export type PlayableCard = DrawnCard & { under?: DrawnCard };

export interface CardButtonOptions extends CardButtonOptionsBase {
  /** The card the caller has picked, drawn lit. */
  selected: number | null;
  /** Which cards the rules will accept right now; the rest are dimmed. */
  playable: number[];
  /** Face down - draw the back, not the face. Used for the blind endgame. */
  faceDown?: boolean;
  /**
   * Draw the row as ONE PILE: every card lying on the one before it, each a
   * step down and to the right, the last one on top. That is what a discard
   * pile looks like on a table - "make them look like the pile in front of
   * me but with all cards open" (sysop, 2026-09-15) - rather than three
   * separate cards side by side, which reads as three piles.
   */
  pile?: boolean;
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
  /** The card size this layout was measured at. */
  size: 'full' | 'mini';
  /** Columns from one card's left edge to the next: overlapping when < width. */
  stride: number;
  /** Rows from one card's top to the next. Only a pile steps downwards. */
  stackY: number;
  cardRows: number;
  height: number;
  cardWidth: number;
}

export class CardButtons {
  private buttons: Box[] = [];
  /** The cards lying UNDER the ones above: drawn, never picked, never focused. */
  private unders: Box[] = [];
  private lastKey = '';

  constructor(private readonly host: CardButtonHost) {}

  /** The widgets Tab should walk, left to right. */
  public focusables(): Box[] {
    return this.buttons.filter((button) => !button.hidden);
  }

  /** The cards lying under the ones above - drawn only, in the same order. */
  public underlays(): Box[] {
    return this.unders.filter((under) => !under.hidden);
  }

  public clear(): void {
    for (const button of this.buttons) button.hide();
    for (const under of this.unders) under.hide();
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

    /*
     * ...and the lift is the FIRST thing given up. A hand of twenty at five
     * rows a card needs two rows of ten, which is exactly the panel's ten
     * rows with nothing left over: keeping a row back for the lift would
     * drop the whole hand to the text list to preserve an effect nobody can
     * see on a hand they cannot see. So every shape is tried with the lift
     * and then, if none fitted, without it.
     */
    let lift = LIFT_ROWS;

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

    const drawOne = (entry: DrawnCard, size: 'full' | 'mini'): string[] => {
      const renderOptions = toRenderOptions({ ...chrome, size }) as never;
      {
        /*
         * THE FACE IS THE CARD'S, not the row's. `faceDown` turns a whole
         * row over (the blind endgame), but a row can be MIXED: the six in
         * front of a Skitgubbe player are three faces and three backs, and
         * before this the three backs were drawn as whatever card object the
         * caller had faked to stand in for them - three Aces of Spades on
         * the sysop's screen (2026-09-15).
         */
        const face = entry.face ?? (options.faceDown ? 'back' : 'front');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines = entry.kind === 'uno'
          ? cardEngine.renderUnoCardLines({ ...(entry.card as any), face }, renderOptions)
          : cardEngine.renderCardLines({ ...(entry.card as any), face }, renderOptions);
        return (lines as string[]).map((line: string) => ansiToBlessedTags(line));
      }
    };

    const draw = (size: 'full' | 'mini'): string[][] =>
      cards.map((entry) => drawOne(entry, size));

    /*
     * A ROW OF CARDS IS ONE HEIGHT. The engine draws a BACK shorter than a
     * face - three rows shorter at full size - so a mixed row (the three
     * face up and three face down in front of a Skitgubbe player) came out
     * ragged, the backs ending a row above their neighbours. Pad to the
     * tallest and widest in the row; measuring one card and trusting it for
     * the rest is the same mistake FULL_CARD_ROWS makes.
     */
    const square = (candidate: string[][], to?: { height: number; width: number }): string[][] => {
      const widths = candidate.map((art) => stripBlessedTags(art[0] ?? '').length);
      const height = to?.height ?? Math.max(0, ...candidate.map((art) => art.length));
      const cardWidth = to?.width ?? Math.max(0, ...widths);
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

    /*
     * How far the card on top sits down and to the right of the one under
     * it. Two columns and one row is enough to show a corner of the card
     * below, which is what says "there is something under this" - and it is
     * all the room a 57-column panel can spare for three piles.
     */
    const STACK_X = 2;
    const STACK_Y = 1;

    /*
     * A PILE STEPS FURTHER, so every card in it can be READ.
     *
     * "the last 3 has to be seen so i know when it's a good time to put down
     * the last to create a 4 pair" (sysop, 2026-09-16) - four of a rank in a
     * row turns the pile away, so the ranks under the top card are what the
     * decision is made on. Two columns shows a card's left border and one
     * cell of nothing; four reaches the rank itself, `10` included, which is
     * the widest there is.
     *
     * The piles in FRONT of a player keep the tighter step: what shows there
     * is a blind card, and there is nothing on it to read.
     *
     * And it steps SIDEWAYS ONLY - "can we overlap them side by side so the
     * value is visible?" (sysop, 2026-09-16). A staircase spends a row per
     * card and pushes the ranks apart diagonally, which reads as three
     * separate cards rather than one pile; overlapping along a single row is
     * how a hand is held, and every rank lines up to be read at once.
     */
    const PILE_STACK_X = 4;
    const PILE_STACK_Y = 0;
    const stacked = cards.some((entry) => entry.under);
    const slotX = stacked ? STACK_X : 0;
    const slotY = stacked ? STACK_Y : 0;

    const measure = (candidate: string[][]): { cardWidth: number; cardHeight: number } => ({
      // The SLOT, which is the card plus the corner of whatever is under it.
      cardWidth: stripBlessedTags(candidate[0]?.[0] ?? '').length + slotX,
      cardHeight: (candidate[0]?.length ?? 0) + slotY,
    });

    /** Cards side by side with a column between them, wrapping into rows. */
    const grid = (candidate: string[][], size: 'full' | 'mini'): Layout | null => {
      const { cardWidth, cardHeight } = measure(candidate);
      if (cardWidth === 0 || cardHeight === 0) return null;
      const perRow = Math.max(1, Math.floor(width / (cardWidth + 1)));
      const cardRows = Math.ceil(cards.length / perRow);
      if (cardRows * cardHeight + lift > rows) return null;
      return { perRow, size, stride: cardWidth + 1, stackY: 0, cardRows, height: cardHeight, cardWidth };
    };

    /**
     * Cards overlapping like a hand held in the fingers, in as few rows as
     * the panel allows.
     *
     * One row for a hand of six; more when a hand gets long. "how do we do
     * when a user has picked up 20 cards?" (sysop, 2026-09-15) - twenty at
     * eleven columns each will not overlap into 57 columns without hiding
     * the ranks, so they go into two rows of ten rather than falling back to
     * the text list. Fewest rows first: a hand read left to right beats a
     * hand read in a block.
     */
    const fan = (candidate: string[][], size: 'full' | 'mini'): Layout | null => {
      const { cardWidth, cardHeight } = measure(candidate);
      if (cardWidth === 0 || cardHeight === 0) return null;
      if (cards.length < 2) return null;
      const maxRows = Math.floor((rows - lift) / cardHeight);
      for (let cardRows = 1; cardRows <= maxRows; cardRows += 1) {
        const perRow = Math.ceil(cards.length / cardRows);
        if (perRow < 2) continue;
        const stride = Math.floor((width - cardWidth) / (perRow - 1));
        if (stride < MIN_STRIDE) continue;
        return {
          perRow,
          size,
          stackY: 0,
          stride: Math.min(stride, cardWidth + 1),
          cardRows,
          height: cardHeight,
          cardWidth,
        };
      }
      return null;
    };

    /** One pile: each card a step down and right of the one below it. */
    const asPile = (candidate: string[][], size: 'full' | 'mini'): Layout | null => {
      const { cardWidth, cardHeight } = measure(candidate);
      if (cardWidth === 0 || cardHeight === 0) return null;
      const steps = cards.length - 1;
      if (cardHeight + steps * PILE_STACK_Y + lift > rows) return null;
      if (cardWidth + steps * PILE_STACK_X > width) return null;
      return {
        perRow: cards.length,
        size,
        stride: PILE_STACK_X,
        stackY: PILE_STACK_Y,
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
    // With the lift first; without it rather than not at all.
    for (const tryLift of [LIFT_ROWS, 0]) {
      lift = tryLift;
      for (const shape of options.pile ? [asPile, grid, fan] : [grid, fan]) {
        for (const size of sizes) {
          const candidate = artFor(size);
          const found = shape(candidate, size);
          if (found) { art = candidate; layout = found; break; }
        }
        if (layout) break;
      }
      if (layout) break;
    }
    if (!layout || !art) {
      this.clear();
      return false;
    }

    // The slot holds the card plus the corner of what is under it; the
    // widgets themselves are the size of the card art.
    const slotWidth = layout.cardWidth;
    const cardWidth = slotWidth - slotX;
    const cardHeight = layout.height - slotY;
    /*
     * THE CARD UNDERNEATH IS SQUARED TO THE CARD ON TOP OF IT.
     *
     * The engine draws a back SHORTER than a face - four rows against five at
     * `mini` - and each pile's blind card used to be squared only against
     * itself, so it ended two rows above the open card lying on it and the
     * bottom of the pile was simply missing ("the bottom cards in the
     * skitgubbe piles are missing the two bottom rows", sysop 2026-09-16).
     * A pile is one card tall plus the step, so both layers take the SAME
     * measurements - the ones the layout settled on.
     */
    const underArt = stacked
      ? square(
        cards.map((entry) => (entry.under ? drawOne(entry.under, layout!.size) : [])),
        // The pile's FULL height, not the top card's: the blind card is
        // offset up by `slotY`, so matching only the card on top of it leaves
        // its last row hanging in the air above the pile's bottom edge - "the
        // blind cards are missing their bottom row" (sysop, 2026-09-16). Made
        // this tall, its left edge runs the whole way down and the two cards
        // finish level, which is what a card lying on another one looks like.
        { height: cardHeight + slotY, width: cardWidth },
      ).map((padded, index) => (cards[index].under ? padded : null))
      : cards.map(() => null);

    /*
     * A full-size card is TEN rows and the hand panel's inside is ten, so a
     * number printed under each card does not fit - it was the difference
     * between drawing the buttons and declining them entirely. The label row
     * is drawn when there is room for it and dropped when there is not: a
     * card with no number under it is still clickable and still focusable,
     * and the activity panel names the keys either way.
     */
    const perRow = layout.perRow;
    const roomForLabels = layout.stackY === 0
      && layout.cardRows * (cardHeight + 1) + lift <= rows;
    /*
     * Whether a label is ACTUALLY drawn, which is not the same as whether
     * there is room for one: a row the caller cannot pick from asks for none
     * (`labels: false` - the pile, the cards in front of you). Reserving the
     * row anyway made every widget one taller than its own content, which
     * wasted a row per row of cards and left a pile's widget a row taller
     * than the blind card underneath it.
     */
    const withLabels = roomForLabels && options.labels !== false;
    const buttonHeight = withLabels ? cardHeight + 1 : cardHeight;

    this.host.fallback.hide();
    this.ensure(cards.length);
    if (stacked) this.ensureUnders(cards.length);

    cards.forEach((_, index) => {
      const button = this.buttons[index];
      const row = Math.floor(index / perRow);
      const column = index % perRow;
      const picked = index === options.selected;
      const playable = options.playable.includes(index);
      const number = (options.labelFrom ?? 1) + index;
      const label = number === 10 ? '0' : String(number);

      const slotTop = row * buttonHeight + (picked ? 0 : lift) + index * layout!.stackY;
      const slotLeft = column * layout!.stride;

      /*
       * The card UNDER this one, at the slot's own corner: the card on top
       * is then offset down and right, so the one below shows through at the
       * top left the way a pile does.
       */
      const beneath = underArt[index];
      const underButton = this.unders[index];
      if (beneath && underButton) {
        underButton.show();
        underButton.width = cardWidth;
        underButton.height = cardHeight + slotY;
        underButton.top = slotTop;
        underButton.left = slotLeft;
        underButton.setContent(beneath.join('\n'));
        // Behind everything, whatever order the widgets were made in.
        (underButton as any).setBack?.();
      } else if (underButton) {
        underButton.hide();
      }

      button.show();
      button.width = cardWidth;
      button.height = buttonHeight;
      // Everything sits one row down, and the picked card rises into the gap.
      button.top = slotTop + (beneath ? slotY : 0);
      button.left = slotLeft + (beneath ? slotX : 0);
      const showLabel = withLabels;
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
    for (let index = cards.length; index < this.unders.length; index += 1) {
      this.unders[index].hide();
    }

    /*
     * A pile is read from the top card down, so the cards have to be laid in
     * that order: the last one in the row is the one lying on all the rest.
     */
    if (layout.stackY > 0) {
      for (const button of this.buttons.slice(0, cards.length)) (button as any).setFront?.();
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
      + `|${cardWidth}x${cardHeight}@${layout.stride}/${layout.perRow}+${lift}`
      + `|${cards.map((entry) => (entry.under
        ? `${(entry.under.card as any).rank ?? (entry.under.card as any).color}${entry.under.face ?? ''}`
        : '-')).join(',')}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.host.screen.render();
    }
    return true;
  }

  /** The widgets for the cards underneath, made once and reused. */
  private ensureUnders(count: number): void {
    while (this.unders.length < count) {
      this.unders.push(createBox({
        parent: this.host.panel,
        border: undefined,
        top: 1,
        left: 1,
        width: 9,
        height: 7,
        tags: true,
        mouse: false,
        keys: false,
        clickable: false,
        focusable: false,
        hidden: true,
        style: { bg: UI_THEME.windowBg },
      }) as Box);
    }
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
