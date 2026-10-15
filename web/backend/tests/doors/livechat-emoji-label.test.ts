/**
 * What the emoji picker shows (Doors/livechat/utils/emoji-label.ts).
 *
 * Reported: "the emoji picker shows texts instead of the actual emojis."
 *
 * On this BBS the emoji IS ASCII art - `:-)`, `(Y)`, `\(^o^)/` - because
 * Amiga clients and ASCII-strict terminals cannot render Unicode
 * pictographs. The picker listed `:smile:  happy`: the shortcode and a
 * keyword, and never the art. A list of names is a list of things you have
 * to already know.
 */

import { emojiLabel, GLYPH_COLUMN } from '../../../../Doors/livechat/utils/emoji-label';
import { EMOJIS } from '../../../../Doors/livechat/utils/emojis';

/** Width the picker actually gives a label - see emoji-picker.ts. */
const ITEM_WIDTH = 52 - 14 - 2 - 1 - 2;

const smile = EMOJIS.find(e => e.code === ':smile:')!;
const tableflip = EMOJIS.find(e => e.code === ':tableflip:')!;

describe('the label', () => {
  it('leads with the emoji itself', () => {
    expect(emojiLabel(smile, ITEM_WIDTH).startsWith(':-)')).toBe(true);
  });

  it('still carries the shortcode, so it can be typed', () => {
    expect(emojiLabel(smile, ITEM_WIDTH)).toContain(':smile:');
  });

  it('lines the shortcodes up in a column', () => {
    // A ragged column of codes is hard to read down.
    const columns = [smile, tableflip].map(e => emojiLabel(e, ITEM_WIDTH).indexOf(e.code));

    expect(new Set(columns).size).toBe(1);
    expect(columns[0]).toBe(GLYPH_COLUMN);
  });
});

describe('fitting the list', () => {
  it('never writes a label wider than the list', () => {
    // A label that overflows wraps onto a second line, which knocks every
    // row below it out of alignment and pushes the last emoji off the box.
    const tooWide = EMOJIS
      .map(e => ({ code: e.code, width: emojiLabel(e, ITEM_WIDTH).length }))
      .filter(e => e.width > ITEM_WIDTH);

    expect(tooWide).toEqual([]);
  });

  it('fits every emoji in the set at the picker width', () => {
    // Both parts, for all 40-odd of them - not just the short ones.
    for (const emoji of EMOJIS) {
      expect(emojiLabel(emoji, ITEM_WIDTH)).toContain(emoji.code);
    }
  });

  it('keeps the art when there is no room for the code', () => {
    // Better a picker of emojis with no names than names with no emojis.
    const label = emojiLabel(smile, 6);

    expect(label).toBe(':-)');
    expect(label).not.toContain(':smile:');
  });

  it('clips rather than overflowing a very narrow list', () => {
    expect(emojiLabel(tableflip, 8)).toHaveLength(8);
  });
});

describe('picking an emoji', () => {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const DOOR = join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat');
  const shortcuts = readFileSync(join(DOOR, 'handlers', 'keyboard-shortcuts.ts'), 'utf8');
  const server = readFileSync(join(DOOR, 'server.ts'), 'utf8');

  it('puts the ART in the input, not the shortcode', () => {
    // Choosing something that looks like `<3` and getting `:heart:` made the
    // picker a lookup table for codes. The art is plain ASCII that every
    // terminal on this BBS can already show, so nothing needs converting.
    expect(shortcuts).toMatch(/\(e\.display \|\| e\.code\)/);
    expect(shortcuts).not.toMatch(/ib\.setValue\(c \+ e\.code/);
  });

  it('does the same from every picker in the door', () => {
    // There are three insertion points; one left behind would be a picker
    // that behaves differently depending on how it was opened.
    const insertions = server.split('emoji.display || emoji.code').length - 1;

    expect(insertions).toBe(2);
    expect(server).not.toMatch(/setValue\(currentText \+ emoji\.code/);
  });
});
