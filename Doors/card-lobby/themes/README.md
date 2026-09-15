# Card decks, in csol's theme format

Each `.theme` file here draws a deck: the frame of a card, its size, the
glyphs its suits use, and where the rank and suit sit on it. The SDK reads
them (`sdk/engines/cards/card-theme.ts`) and the card-style menu inside the
door offers them by name, so a player picks a deck the way they pick a size.

The ones shipped here are VENDORED FROM csol (https://github.com/nielssp/csol),
Copyright (c) 2017 Niels Poulsen, MIT - see `LICENSE.csol`.

TO DRAW YOUR OWN: copy one, change its `name`, and edit the `top`, `middle`
and `bottom` lines. They are the card, character for character. Mind that the
format is LINE-ORIENTED - a value owns the rest of its line, spaces included,
because `middle │    │` is the middle of a card.
