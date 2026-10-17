/**
 * A feed bulletin number must never read as `<another bulletin><security level>`.
 * Live, bull15 (Exploit-DB) was found as the level-5 security screen of
 * bulletin 1 (express.e:6246 walks levels down in steps of 5; the B command
 * tries Bull<N><level> first, express.e:24648), so callers saw the feed in
 * place of bulletin 1. Same for bull25, bull35 and bull45.
 */
import {
  NEWS_BULLETIN_SOURCES,
  OWNED_BULLETIN_NUMBERS,
  shadowedBulletinNumbers,
} from '../../src/services/news-bulletins';

const num = (file: string): number => parseInt(file.replace(/\D/g, ''), 10);

describe('feed bulletin numbers', () => {
  it('no configured feed reads as a security screen of another bulletin', () => {
    const all = [...OWNED_BULLETIN_NUMBERS, ...NEWS_BULLETIN_SOURCES.map((s) => num(s.file))];
    const clashes = NEWS_BULLETIN_SOURCES
      .map((s) => ({ file: s.file, hits: shadowedBulletinNumbers(num(s.file), all) }))
      .filter((c) => c.hits.length > 0);
    expect(clashes).toEqual([]);
  });

  it('flags the numbers that collided live', () => {
    expect(shadowedBulletinNumbers(15, [1, 2])).toEqual([1]);
    expect(shadowedBulletinNumbers(25, [2])).toEqual([2]);
    expect(shadowedBulletinNumbers(35, [3])).toEqual([3]);
    expect(shadowedBulletinNumbers(45, [4])).toEqual([4]);
    expect(shadowedBulletinNumbers(1255, [1])).toEqual([1]);
  });

  it('passes numbers whose tail is not a walked level', () => {
    expect(shadowedBulletinNumbers(46, [4])).toEqual([]);
    expect(shadowedBulletinNumbers(10, [1])).toEqual([]);
    expect(shadowedBulletinNumbers(105, [1])).toEqual([]);
    expect(shadowedBulletinNumbers(1260, [1])).toEqual([]);
    expect(shadowedBulletinNumbers(4, [4])).toEqual([]);
  });
});
