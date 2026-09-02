/**
 * Card Lobby - the card style panel.
 *
 * This was a list dialog that closed on every pick, so changing three
 * settings meant opening the menu three times ("the card style dialog closes
 * every time i make a selection not very practical", sysop 2026-09-02). It is
 * now a settings panel: it stays open, LEFT/RIGHT cycles the highlighted
 * setting, a live preview under the list redraws with every change, and the
 * table behind the panel is repainted too - so a choice is judged on the real
 * board, not on a description of it.
 *
 * The settings are the card engine's own option surface
 * (sdk/engines/cards/card-engine.ts:49-101) rather than a chosen subset:
 * size, faces, colour, back, hand layout and spacing.
 */

import { Box, List, type Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { CardEngine } from '@amiexpress/bbs-door-sdk';
import type { CardPreferences } from '../lib/types';
import { UI_THEME } from '../lib/constants';
import { ansiToBlessedTags } from '../lib/utils';
import { resolveCardStyle, CARD_STYLE_CHOICES, toRenderOptions } from '../lib/card-style';

const cardEngine = new CardEngine();

/** The hand the preview draws. Four cards show a layout; the back shows a back. */
const PREVIEW_HAND = [
  { rank: 'A', suit: 'S' },
  { rank: 'K', suit: 'H' },
  { rank: '10', suit: 'D' },
  { rank: 'Q', suit: 'C' },
] as const;

/** Rows the preview box can draw into, which decides what `auto` size means. */
const PREVIEW_ROWS = 9;

type SettingKey = keyof typeof CARD_STYLE_CHOICES;

interface Setting {
  key: SettingKey;
  label: string;
  /** What each stored value is called on screen, in full English words. */
  names: Record<string, string>;
}

const SETTINGS: Setting[] = [
  {
    key: 'size', label: 'Card size',
    names: { auto: 'Fit the panel', full: 'Always big', mini: 'Always small' },
  },
  {
    key: 'style', label: 'Card faces',
    names: { ascii: 'ASCII', unicode: 'Unicode' },
  },
  {
    key: 'colour', label: 'Colour',
    names: { ansi: 'Coloured suits', none: 'Monochrome' },
  },
  {
    key: 'back', label: 'Card backs',
    names: { lined: 'Lined', dotted: 'Dotted', classic: 'Classic', shiny: 'Shiny' },
  },
  {
    key: 'layout', label: 'Hand layout',
    names: {
      'flat-condensed': 'Overlapped',
      flat: 'Side by side',
      arch: 'Fanned arch',
      'arch-condensed': 'Tight arch',
    },
  },
  {
    key: 'spacing', label: 'Card spacing',
    names: { auto: 'Automatic', tight: 'Tight', wide: 'Wide' },
  },
];

/** The value a setting holds when the player has never touched it. */
const defaultValue = (key: SettingKey): string => CARD_STYLE_CHOICES[key][0];

const valueOf = (preferences: CardPreferences, key: SettingKey): string =>
  (preferences[key] as string | undefined) ?? defaultValue(key);

/** Step a setting one place along its ring, in either direction. */
const cycle = (preferences: CardPreferences, key: SettingKey, step: number): void => {
  const ring = CARD_STYLE_CHOICES[key] as readonly string[];
  const at = ring.indexOf(valueOf(preferences, key));
  const next = ring[(at + step + ring.length) % ring.length];
  (preferences as Record<string, string>)[key] = next;
};

/**
 * One list row: the setting's name, its value, and - where the terminal
 * overrules the choice - what will actually be drawn.
 */
const rowFor = (
  setting: Setting,
  preferences: CardPreferences,
  unicodeCapable: boolean,
): string => {
  const value = valueOf(preferences, setting.key);
  const name = setting.names[value] ?? value;
  const overruled = setting.key === 'style' && value === 'unicode' && !unicodeCapable
    ? '  (this terminal draws ASCII)'
    : '';
  return ` ${setting.label.padEnd(14, ' ')}<  ${name.padEnd(16, ' ')}>${overruled}`;
};

/** The preview: the sample hand, then a face-down card beside it. */
export function previewLines(
  preferences: CardPreferences,
  unicodeCapable: boolean,
  rows = PREVIEW_ROWS,
): string[] {
  const chrome = resolveCardStyle(preferences, rows, unicodeCapable);
  const options = toRenderOptions(chrome);
  const hand = cardEngine
    .renderHandLines(PREVIEW_HAND.map((card) => ({ ...card })) as never, options as never)
    .map(ansiToBlessedTags);
  const back = cardEngine
    .renderCardLines({ rank: 'A', suit: 'S', face: 'back' } as never,
      { ...options, face: 'back' } as never)
    .map(ansiToBlessedTags);

  // Sit the back to the right of the hand, top-aligned, with a gap.
  const height = Math.max(hand.length, back.length);
  const handWidth = Math.max(...hand.map((line) => line.replace(/\{[^}]*\}/g, '').length), 0);
  const out: string[] = [];
  for (let row = 0; row < height; row += 1) {
    const left = hand[row] ?? '';
    const pad = handWidth - left.replace(/\{[^}]*\}/g, '').length;
    out.push(`${left}${' '.repeat(Math.max(0, pad) + 3)}${back[row] ?? ''}`);
  }
  return out;
}

export interface CardStyleDialogHost {
  screen: Screen;
  overlayShade: Box;
  setModalActive(value: boolean): void;
  isModalActive(): boolean;
}

/**
 * Open the panel. Resolves with the preferences when it closes; `onChange`
 * fires on every change first, so the board behind can follow along.
 */
export function showCardStyleDialog(
  host: CardStyleDialogHost,
  current: CardPreferences,
  unicodeCapable: boolean,
  onChange?: (preferences: CardPreferences) => void,
): Promise<CardPreferences> {
  const preferences: CardPreferences = { ...current };
  if (host.isModalActive()) return Promise.resolve(preferences);
  host.setModalActive(true);
  host.overlayShade.show();

  return new Promise((resolve) => {
    const frame = new Box({
      parent: host.overlayShade,
      top: 'center',
      left: 'center',
      width: 68,
      height: 21,
      border: { type: 'ascii' },
      label: ' Card Style ',
      style: { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg, fg: UI_THEME.ink } as never,
    });

    const list = new List({
      parent: frame,
      top: 0,
      left: 0,
      width: '100%-2',
      height: SETTINGS.length,
      style: {
        bg: UI_THEME.windowBg,
        fg: UI_THEME.ink,
        selected: { fg: UI_THEME.highlightInk, bg: UI_THEME.highlightBg },
      } as never,
      items: SETTINGS.map((setting) => rowFor(setting, preferences, unicodeCapable)),
      keys: true,
      mouse: true,
      vi: true,
    });

    const preview = new Box({
      parent: frame,
      top: SETTINGS.length + 1,
      left: 1,
      width: '100%-4',
      height: PREVIEW_ROWS,
      tags: true,
      style: { bg: UI_THEME.windowBg, fg: UI_THEME.ink } as never,
    });

    const help = new Box({
      parent: frame,
      bottom: 0,
      left: 1,
      width: '100%-4',
      height: 1,
      tags: true,
      content: `{${UI_THEME.dim}-fg}LEFT/RIGHT or ENTER changes a setting.  ESC closes.{/}`,
      style: { bg: UI_THEME.windowBg } as never,
    });

    const repaint = (): void => {
      const selected = (list as unknown as { selected: number }).selected ?? 0;
      list.setItems(SETTINGS.map((setting) => rowFor(setting, preferences, unicodeCapable)));
      list.select(selected);
      preview.setContent(previewLines(preferences, unicodeCapable).join('\n'));
      host.screen.render();
    };

    const change = (step: number): void => {
      const setting = SETTINGS[(list as unknown as { selected: number }).selected ?? 0];
      if (!setting) return;
      cycle(preferences, setting.key, step);
      repaint();
      onChange?.({ ...preferences });
    };

    // A List closes its dialog on 'select' everywhere else in this door; here
    // ENTER and SPACE are another way to cycle (the widget turns both into a
    // 'select'), and only ESC or Q closes.
    list.on('select', () => change(1));

    // These handlers return true to consume the key. The List reads LEFT and
    // RIGHT as page-up and page-down (widgets/List.ts:355-368), so a key left
    // unconsumed cycles the value and throws the highlight ten rows down at
    // the same time.
    list.key(['right', 'l'], () => { change(1); return true; });
    list.key(['left', 'h'], () => { change(-1); return true; });
    list.key(['escape', 'q'], () => {
      list.destroy();
      preview.destroy();
      help.destroy();
      frame.destroy();
      host.overlayShade.hide();
      host.setModalActive(false);
      host.screen.render();
      resolve(preferences);
      return true;
    });

    host.overlayShade.setFront();
    frame.setFront();
    list.focus();
    repaint();
  });
}
