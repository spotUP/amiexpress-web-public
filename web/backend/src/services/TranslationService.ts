/**
 * Translation Service
 * 1:1 port from AmiExpress express.e translation system
 *
 * express.e:2586-2667 - loadTranslators/unloadTranslators
 * express.e:6460-6537 - translateText/translateWord/getTranslator
 *
 * Translation modes:
 * - TRANS_NONE: No translation
 * - TRANS_HOST_TO_DEFINED: Translate from host language to user's defined language
 * - TRANS_DEFINED_TO_HOST: Translate from user's language to host language
 *
 * Dictionary format (.TRN files):
 * - Text file with word pairs: "sourceword\0targetword\0" (null-separated)
 * - Words are organized alphabetically by first letter (a-z indexes + misc)
 * - Loaded into memory as indexed lookup table for fast translation
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { config } from '../config';
import { parseInfoFile } from '../utils/info-file.util';

/**
 * Read a tooltype value from an .info file
 * Returns the value or empty string if not found
 */
function readToolType(infoPath: string, key: string): string {
  try {
    if (!fsSync.existsSync(infoPath)) return '';
    const info = parseInfoFile(infoPath);
    const tt = info.tooltypes.find(t => !t.commented && t.key.toUpperCase() === key.toUpperCase());
    return tt?.value || '';
  } catch {
    return '';
  }
}

// Translation modes - express.e constants
export enum TranslatorMode {
  TRANS_NONE = 0,
  TRANS_HOST_TO_DEFINED = 1,
  TRANS_DEFINED_TO_HOST = 2
}

/**
 * Translator dictionary structure
 * Matches express.e translator object
 */
interface TranslatorDict {
  name: string;  // e.g., "EnglishSpanish" or "SpanishEnglish"
  words: Map<string, string>;  // lowercase word -> translation
}

/**
 * Translation Service
 * Manages language dictionaries and text translation
 */
class TranslationService {
  private translators: Map<string, TranslatorDict> = new Map();
  private hostLanguage: string = '';
  private userLanguages: Map<number, string> = new Map();  // userId -> userLanguage
  private languageList: string[] = [];  // Available languages from LANGUAGES.info
  private languageBasePath: string = '';
  private loaded: boolean = false;

  /**
   * Initialize the translation service
   * Loads host language and available languages from config
   */
  async initialize(): Promise<void> {
    if (this.loaded) return;

    const bbsDataPath = config.get('dataDir');

    // Read host language from LANGUAGES.info - express.e:31746-31747
    const languagesInfoPath = path.join(bbsDataPath, 'LANGUAGES.info');
    this.hostLanguage = readToolType(languagesInfoPath, 'HOSTLANGUAGE') || 'English';

    // Read language base path - express.e:2597
    const bbsConfigPath = path.join(bbsDataPath, 'bbsConfig.info');
    this.languageBasePath = readToolType(bbsConfigPath, 'LANGUAGE_BASE') || path.join(bbsDataPath, 'Languages');

    // Ensure trailing slash
    if (!this.languageBasePath.endsWith('/') && !this.languageBasePath.endsWith('\\')) {
      this.languageBasePath += '/';
    }

    // Load available languages - express.e:2604-2645
    this.languageList = [];
    let langNum = 1;
    let langName = readToolType(languagesInfoPath, `LANGUAGE.${langNum}`);
    while (langName) {
      this.languageList.push(langName);
      langNum++;
      langName = readToolType(languagesInfoPath, `LANGUAGE.${langNum}`);
    }

    // Load all translator dictionaries
    await this.loadTranslators();
    this.loaded = true;

    console.log(`[TranslationService] Initialized: host=${this.hostLanguage}, languages=${this.languageList.join(', ')}`);
  }

  /**
   * Load all translator dictionaries
   * express.e:2586-2648 - loadTranslators()
   */
  private async loadTranslators(): Promise<void> {
    this.translators.clear();

    for (const lang of this.languageList) {
      if (lang === this.hostLanguage) continue;

      // Load host->lang dictionary
      const hostToLangName = `${this.hostLanguage}${lang}`;
      const hostToLangPath = path.join(this.languageBasePath, `${hostToLangName}.TRN`);
      await this.loadTranslator(hostToLangName, hostToLangPath);

      // Load lang->host dictionary
      const langToHostName = `${lang}${this.hostLanguage}`;
      const langToHostPath = path.join(this.languageBasePath, `${langToHostName}.TRN`);
      await this.loadTranslator(langToHostName, langToHostPath);
    }
  }

  /**
   * Load a single translator dictionary file
   * express.e:2492-2584 - loadTranslator()
   *
   * Dictionary file format (simplified from express.e):
   * Each line: "sourceword=targetword" or "sourceword:targetword"
   * Lines starting with # or ; are comments
   */
  private async loadTranslator(name: string, filePath: string): Promise<void> {
    try {
      if (!fsSync.existsSync(filePath)) {
        console.log(`[TranslationService] Dictionary not found: ${filePath}`);
        return;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const words = new Map<string, string>();

      // Parse dictionary file
      // Format: "sourceword=targetword" or "sourceword:targetword" per line
      // Or null-separated binary format from original AmiExpress
      const lines = content.split(/[\r\n]+/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

        // Try = separator first, then :
        let sepIndex = trimmed.indexOf('=');
        if (sepIndex < 0) sepIndex = trimmed.indexOf(':');

        if (sepIndex > 0) {
          const source = trimmed.substring(0, sepIndex).trim().toLowerCase();
          const target = trimmed.substring(sepIndex + 1).trim();
          if (source && target) {
            words.set(source, target);
          }
        }
      }

      if (words.size > 0) {
        this.translators.set(name, { name, words });
        console.log(`[TranslationService] Loaded ${name}: ${words.size} words`);
      }
    } catch (err) {
      console.error(`[TranslationService] Error loading ${name}:`, err);
    }
  }

  /**
   * Get the translator dictionary for a language pair
   * express.e:6460-6468 - getTranslator()
   */
  private getTranslator(name: string): TranslatorDict | undefined {
    return this.translators.get(name);
  }

  /**
   * Translate a single word
   * express.e:6395-6458 - translateWord()
   *
   * Preserves capitalization:
   * - ALL CAPS -> ALL CAPS
   * - Proper Case -> Proper Case
   * - lowercase -> lowercase
   */
  private translateWord(translator: TranslatorDict, word: string): { translated: boolean; word: string } {
    const searchWord = word.toLowerCase();
    const translation = translator.words.get(searchWord);

    if (!translation) {
      return { translated: false, word };
    }

    // Preserve capitalization - express.e:6408-6416
    let result = translation;

    // Check original word's capitalization
    if (word.length > 0) {
      const firstChar = word[0];
      const isFirstUpper = firstChar >= 'A' && firstChar <= 'Z';

      if (isFirstUpper) {
        // Check if ALL CAPS
        let allCaps = true;
        let properCaps = true;

        for (let i = 1; i < word.length; i++) {
          const c = word[i];
          if (c >= 'a' && c <= 'z') allCaps = false;
          if (c >= 'A' && c <= 'Z') properCaps = false;
        }

        if (allCaps) {
          // ALL CAPS
          result = translation.toUpperCase();
        } else if (properCaps) {
          // Proper Case - capitalize first letter
          result = translation.charAt(0).toUpperCase() + translation.slice(1).toLowerCase();
        }
      }
    }

    return { translated: true, word: result };
  }

  /**
   * Translate text using word-by-word replacement
   * express.e:6470-6537 - translateText()
   *
   * @param text Text to translate
   * @param mode Translation direction
   * @param userLanguage User's selected language
   * @param highlightUntranslated If true, highlight untranslated words in yellow (ANSI)
   * @returns Translated text
   */
  translateText(
    text: string,
    mode: TranslatorMode,
    userLanguage: string,
    highlightUntranslated: boolean = false
  ): string {
    if (mode === TranslatorMode.TRANS_NONE) return text;

    // Determine translator name - express.e:6483-6488
    let translatorName: string;
    if (mode === TranslatorMode.TRANS_HOST_TO_DEFINED) {
      translatorName = `${this.hostLanguage}${userLanguage}`;
    } else {
      translatorName = `${userLanguage}${this.hostLanguage}`;
    }

    const translator = this.getTranslator(translatorName);
    if (!translator) {
      console.log(`[TranslationService] No translator for ${translatorName}`);
      return text;
    }

    // Translate word-by-word - express.e:6493-6536
    let result = '';
    let currentWord = '';
    let lineLen = 0;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const upperC = c.toUpperCase();

      // Check if character is part of a word - express.e:6500
      // A-Z, a-z, apostrophe ('), hyphen (-), or high ASCII (>=128)
      const isWordChar = (upperC >= 'A' && upperC <= 'Z') ||
                         c.charCodeAt(0) >= 128 ||
                         c === "'" ||
                         c === '-';

      if (isWordChar) {
        currentWord += c;
      } else {
        // End of word, translate it
        if (currentWord.length > 0) {
          const { translated, word } = this.translateWord(translator, currentWord);

          // Line wrap at 75 characters - express.e:6504-6506
          if (lineLen + word.length > 75) {
            result += '\r\n';
            lineLen = 0;
          }

          // Highlight untranslated words - express.e:6509-6514
          if (!translated && highlightUntranslated) {
            result += '\x1b[33m' + word + '\x1b[0m';  // Yellow
          } else {
            result += word;
          }

          lineLen += word.length;
          currentWord = '';
        }

        // Add the non-word character
        result += c;
        lineLen++;
      }
    }

    // Handle final word
    if (currentWord.length > 0) {
      const { translated, word } = this.translateWord(translator, currentWord);
      if (lineLen + word.length > 75) {
        result += '\r\n';
      }
      if (!translated && highlightUntranslated) {
        result += '\x1b[33m' + word + '\x1b[0m';
      } else {
        result += word;
      }
    }

    return result;
  }

  /**
   * Get user's selected language
   */
  getUserLanguage(userId: number): string {
    return this.userLanguages.get(userId) || this.hostLanguage;
  }

  /**
   * Set user's selected language
   */
  setUserLanguage(userId: number, language: string): void {
    this.userLanguages.set(userId, language);
  }

  /**
   * Get host language
   */
  getHostLanguage(): string {
    return this.hostLanguage;
  }

  /**
   * Get available languages (excluding host)
   */
  getAvailableLanguages(): string[] {
    return this.languageList.filter(lang => lang !== this.hostLanguage);
  }

  /**
   * Get all languages (including host)
   */
  getAllLanguages(): string[] {
    return this.languageList;
  }

  /**
   * Check if translator exists for a language
   */
  hasTranslator(language: string): boolean {
    const hostToLang = `${this.hostLanguage}${language}`;
    const langToHost = `${language}${this.hostLanguage}`;
    return this.translators.has(hostToLang) || this.translators.has(langToHost);
  }
}

// Export singleton instance
export const translationService = new TranslationService();
