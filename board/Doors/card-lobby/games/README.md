# Patience games, in csol's format

These definitions are VENDORED FROM csol (https://github.com/nielssp/csol),
Copyright (c) 2017 Niels Poulsen, MIT licensed - the full licence text is in
`LICENSE.csol` beside this file.

They are data, not code: a `.game` file says which piles a patience has, where
they sit, how many cards each is dealt and what may be played on what. The
lobby reads them with `lib/games/patience/parser.ts`, so ANOTHER SOLITAIRE IS
A TEXT FILE rather than a new module - which is the whole reason for adopting
somebody else's format instead of inventing one.

To add a game, drop a `.game` file in here. To check it parses, run the door's
tests: `npm test`.
