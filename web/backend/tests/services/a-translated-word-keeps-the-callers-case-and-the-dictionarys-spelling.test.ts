/**
 * express.e:6395-6459 translateWord, 6460-6469 getTranslator.
 * Dictionary is built in memory (loadTranslator's file format is a separate row).
 */
jest.mock('../../src/config', () => ({ config: { get: () => '/nonexistent' } }));

import { translationService } from '../../src/services/TranslationService';

type Svc = {
  translators: Map<string, { name: string; words: Map<string, string> }>;
  getTranslator(n: string): { name: string } | undefined;
  translateWord(t: unknown, w: string): { translated: boolean; word: string };
};
const svc = translationService as unknown as Svc;
const dict = { name: 'EnglishFrench', words: new Map([['hello', 'bonjour'], ['ice', 'glace Noire']]) };

describe('translateWord / getTranslator', () => {
  beforeEach(() => {
    svc.translators.clear();
    svc.translators.set('EnglishFrench', dict);
  });

  it('finds a translator whatever the case of the name (StriCmp)', () => {
    expect(svc.getTranslator('englishFRENCH')).toBe(dict);
    expect(svc.getTranslator('EnglishGerman')).toBeUndefined();
  });

  it('keeps the case pattern: lower, Proper, ALL CAPS', () => {
    expect(svc.translateWord(dict, 'hello')).toEqual({ translated: true, word: 'bonjour' });
    expect(svc.translateWord(dict, 'Hello')).toEqual({ translated: true, word: 'Bonjour' });
    expect(svc.translateWord(dict, 'HELLO')).toEqual({ translated: true, word: 'BONJOUR' });
  });

  it('raises only the first letter of a Proper word, the rest stays as the dictionary spells it', () => {
    expect(svc.translateWord(dict, 'Ice').word).toBe('Glace Noire');
  });

  it('leaves an unknown word alone and says so', () => {
    expect(svc.translateWord(dict, 'Zebra')).toEqual({ translated: false, word: 'Zebra' });
  });
});
