/**
 * A gallery card is named so two pieces of art can be told apart.
 *
 * "the gallery feels off": this board's logon is three different files, one
 * per level band, pulled in by ~SS_ - and all three cards said "LOGON". Five
 * conference bulletins said "CONF_BULL". The label was the reader's name, and
 * the reader is the one thing every copy of a screen has in common.
 */
import { describe, expect, it } from 'vitest';
import { describeReader, galleryLabel, gallerySortKey, type ScreenReaderShape } from '../src/pages/screen-index-view';

const reader = (over: Partial<ScreenReaderShape>): ScreenReaderShape =>
  ({ screen: 'LOGON', scope: 'node', id: 0, via: 'resolved', ...over }) as ScreenReaderShape;

describe('what a gallery card is called', () => {
  it('names an included file after itself, not after the screen that pulls it in', () => {
    expect(galleryLabel({ relPath: 'Screens/uprough.txt' }, reader({ via: 'include', serves: '20 and above' }), undefined))
      .toBe('uprough.txt');
    expect(galleryLabel({ relPath: 'Screens/flt.txt' }, reader({ via: 'include', serves: '10-19' }), undefined))
      .toBe('flt.txt');
  });

  it('names a conference screen with the conference', () => {
    expect(galleryLabel({ relPath: 'Conf2/bull20.txt' },
      reader({ screen: 'CONF_BULL', scope: 'conf', id: 2, scopeName: 'C64 Demoscene', serves: '20 and above' }), undefined))
      .toBe('CONF_BULL - C64 Demoscene - level 20 and above');
    expect(galleryLabel({ relPath: 'Conf1/Menu.txt' },
      reader({ screen: 'MENU', scope: 'conf', id: 1, scopeName: 'Amiga Demoscene' }), undefined))
      .toBe('MENU - Amiga Demoscene');
  });

  it('a node screen is just the screen - the node number tells an artist nothing', () => {
    expect(galleryLabel({ relPath: 'Node0/BBSTITLE.txt' }, reader({ screen: 'BBSTITLE' }), undefined)).toBe('BBSTITLE');
  });

  it('a bulletin by number and title, whatever reads it', () => {
    expect(galleryLabel({ relPath: 'Bulletins/bull2.txt' }, undefined, { number: 2, file: 'Bulletins/bull2.txt', title: 'Rules' }))
      .toBe('Bulletin 2 - Rules');
  });

  it('a file nothing reads keeps its path, which is all that is known about it', () => {
    expect(galleryLabel({ relPath: 'Screens/old.txt' }, undefined, undefined)).toBe('Screens/old.txt');
  });

  it('a screen-type twin says which terminals it is for', () => {
    expect(galleryLabel({ relPath: 'Conf1/menu250.txt.GR' },
      reader({ screen: 'MENU', scope: 'conf', id: 1, scopeName: 'Amiga Demoscene', serves: '250 and above', screenType: '.GR', screenTypeName: 'Amiga Ansi' }), undefined))
      .toBe('MENU - Amiga Demoscene - level 250 and above - Amiga Ansi');
  });

  it('included art sorts under the screen that shows it, not under its own initial', () => {
    const logon = gallerySortKey(reader({ screen: 'LOGON' }), 'LOGON');
    const flt = gallerySortKey(reader({ screen: 'LOGON', via: 'include' }), 'flt.txt');
    const menu = gallerySortKey(reader({ screen: 'MENU', scope: 'conf', id: 1 }), 'MENU - Amiga Demoscene');
    const order = [menu, flt, logon].sort((a, b) => a.localeCompare(b));
    expect(order).toEqual([logon, flt, menu]);
  });

  it('the detail line says which screen includes it, in words', () => {
    expect(describeReader(reader({ via: 'include', serves: '20 and above' })))
      .toBe('Included by LOGON in node 0 - level 20 and above');
  });
});
