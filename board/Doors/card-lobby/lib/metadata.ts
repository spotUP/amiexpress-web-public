/**
 * What the board is told this door is.
 *
 * Its own file because index.ts sits at the repo's 2000-line ceiling and this
 * is the least surprising thing to lift out: five constants that every other
 * part of the door only reads.
 */

export const metadata = {
  name: 'Card Lobby',
  version: '2.0.0',
  description: 'Desktop-style card lobby with PokerEngine tables',
  author: 'AmiExpress Team',
  command: 'CARDLOBBY',
};
