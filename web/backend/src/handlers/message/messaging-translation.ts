/**
 * Messaging Translation Handlers
 * Extracted from messaging.handler.ts to keep file under 2000-line limit.
 * Handles T/TS/T!/T* translation commands from the message reader.
 * express.e:11065-11103, 11391-11417, 12108-12145
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { AnsiUtil } from '../../utils/ansi.util';
import { translationService, TranslatorMode } from '../../services/TranslationService';
import { emitText, emitPrompt, flushOutput } from '../../utils/output.util';

// ============================================================================
// TRANSLATION COMMANDS (T/TS/T!/T*) - express.e:11065-11103, 12108-12145
// ============================================================================

/**
 * Handle translation commands
 * express.e:11065-11103 - T, TS, T!, T* commands
 *
 * T  - Translate message to user's selected language (TRANS_HOST_TO_DEFINED)
 * TS - Choose translator first, then translate
 * T! - Translate to ALL defined languages (loops through LANGUAGE.1, LANGUAGE.2, etc.)
 * T* - Translate FROM all defined languages (TRANS_DEFINED_TO_HOST for each)
 */
export async function handleTranslationCommand(socket: any, session: BBSSession, command: string): Promise<void> {
  // Lazy import to break circular dependency with messaging.handler
  const { displayMessageNavigationPrompt } = require('./messaging.handler');

  // Initialize translation service if needed
  await translationService.initialize();

  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;
  const msg = messages[currentIndex];

  // T! or T* - Translate to/from ALL languages - express.e:11066-11090
  if (command === 'T!' || command === 'T*') {
    const languages = translationService.getAvailableLanguages();
    const hostLanguage = translationService.getHostLanguage();

    if (languages.length === 0) {
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize('No translation languages configured.', 'yellow'));
      emitText(socket, '\r\n');
      displayMessageNavigationPrompt(socket, session);
      return;
    }

    // Loop through all languages - express.e:11067-11090
    for (const lang of languages) {
      if (lang === hostLanguage) continue;

      // Display translation header
      emitText(socket, '\r\n');
      if (command === 'T!') {
        // Translating TO language - express.e:11073-11075
        emitText(socket, AnsiUtil.colorize(`Translating to ${lang}`, 'cyan'));
      } else {
        // Translating FROM language - express.e:11077-11079
        emitText(socket, AnsiUtil.colorize(`Translating from ${lang}`, 'cyan'));
      }
      emitText(socket, '\r\n\r\n');

      // Set translation mode
      const mode = command === 'T!'
        ? TranslatorMode.TRANS_HOST_TO_DEFINED
        : TranslatorMode.TRANS_DEFINED_TO_HOST;

      // Check if translator exists
      if (!translationService.hasTranslator(lang)) {
        emitText(socket, AnsiUtil.colorize(`(No dictionary for ${lang})`, 'yellow'));
        emitText(socket, '\r\n');
        continue;
      }

      // Translate and display message body
      const highlightUntranslated = (session.user?.translatorID ?? 0) & 128 ? true : false;
      const translatedBody = translationService.translateText(msg.body, mode, lang, highlightUntranslated);
      emitText(socket, translatedBody);
      emitText(socket, '\r\n');

      // Pause after each language - express.e:11085
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.pressKeyPrompt());
      await flushOutput(socket);
      // Note: In a real implementation, we'd wait for keypress here
      // For now, we just continue to the next language
    }

    emitText(socket, '\r\n');
    displayMessageNavigationPrompt(socket, session);
    return;
  }

  // TS - Choose translator first - express.e:11092-11094
  if (command === 'TS') {
    await displayChooseTranslator(socket, session);
    return;
  }

  // T - Translate to user's selected language - express.e:11096-11100
  if (command === 'T') {
    const userLanguage = translationService.getUserLanguage(session.user?.id || 0);
    const hostLanguage = translationService.getHostLanguage();

    if (userLanguage === hostLanguage) {
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize('No translation language selected. Use TS to choose one.', 'yellow'));
      emitText(socket, '\r\n');
      displayMessageNavigationPrompt(socket, session);
      return;
    }

    if (!translationService.hasTranslator(userLanguage)) {
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize(`No dictionary available for ${userLanguage}.`, 'yellow'));
      emitText(socket, '\r\n');
      displayMessageNavigationPrompt(socket, session);
      return;
    }

    // Translate message - express.e:11096-11100
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize(`Translating to ${userLanguage}`, 'cyan'));
    emitText(socket, '\r\n\r\n');

    const highlightUntranslated = (session.user?.translatorID ?? 0) & 128 ? true : false;
    const translatedBody = translationService.translateText(
      msg.body,
      TranslatorMode.TRANS_HOST_TO_DEFINED,
      userLanguage,
      highlightUntranslated
    );
    emitText(socket, translatedBody);
    emitText(socket, '\r\n\r\n');

    displayMessageNavigationPrompt(socket, session);
    return;
  }
}

/**
 * Display language selection screen
 * express.e:11391-11417 - chooseTranslator()
 */
async function displayChooseTranslator(socket: any, session: BBSSession): Promise<void> {
  const languages = translationService.getAllLanguages();
  const hostLanguage = translationService.getHostLanguage();
  const currentUserLang = translationService.getUserLanguage(session.user?.id || 0);

  emitText(socket, '\r\n');

  // Display SCREEN_LANGUAGES if it exists - express.e:11395-11397
  // (simplified - we just display the list inline)
  emitText(socket, AnsiUtil.colorize('                         Available Languages', 'green'));
  emitText(socket, '\r\n\r\n');

  // List languages with numbers - express.e uses displayScreen(SCREEN_LANGUAGES)
  languages.forEach((lang, index) => {
    const num = String(index + 1).padStart(2);
    const marker = lang === currentUserLang ? ' *' : '';
    const hostMarker = lang === hostLanguage ? ' (Host)' : '';
    emitText(socket, `  ${AnsiUtil.colorize(num, 'yellow')}. ${lang}${marker}${hostMarker}\r\n`);
  });

  emitText(socket, '\r\n');
  // express.e:11399-11400 - redoTrans: aePuts('\b\nLanguage (num) >: ')
  emitPrompt(socket, 'Language (num) >: ');

  // Store languages for handler
  session.tempData.translatorLanguages = languages;
  session.subState = LoggedOnSubState.MSG_CHOOSE_TRANSLATOR;
}

/**
 * Handle language selection input
 * express.e:11400-11417 - chooseTranslator() input handling
 */
export async function handleChooseTranslatorInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // Lazy import to break circular dependency with messaging.handler
  const { displayMessageNavigationPrompt, returnToMessageReader } = require('./messaging.handler');

  const trimmed = input.trim();
  const languages = session.tempData.translatorLanguages || [];

  // Empty input = cancel - express.e:11401
  if (trimmed === '') {
    delete session.tempData.translatorLanguages;
    emitText(socket, '\r\n');
    await returnToMessageReader(socket, session);
    return;
  }

  // H - Toggle word highlight - express.e:11407-11414
  // loggedOnUser.translatorID:=Eor(loggedOnUser.translatorID,128)
  // Prints "WORD HIGHLIGHT ON" or "WORD HIGHLIGHT OFF", then JUMP redoTrans (re-prompts)
  if (trimmed.toUpperCase().startsWith('H')) {
    const currentId: number = session.user?.translatorID ?? 0;
    const newId = currentId ^ 128;
    if (session.user) {
      session.user.translatorID = newId;
    }
    const isOn = (newId & 128) !== 0;
    emitText(socket, `WORD HIGHLIGHT ${isOn ? 'ON' : 'OFF'}`);
    emitPrompt(socket, '\r\nLanguage (num) >: ');
    return;
  }

  // Parse language number
  const langNum = parseInt(trimmed, 10);
  if (isNaN(langNum) || langNum < 1 || langNum > languages.length) {
    // Invalid - redisplay prompt - express.e:11418 RETURN RESULT_SUCCESS (treats as cancel)
    // WEB_: re-prompt to avoid silently doing nothing
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Language (num) >: ');
    return;
  }

  // Set user's language - express.e:11417-11423
  const selectedLang = languages[langNum - 1];
  translationService.setUserLanguage(session.user?.id || 0, selectedLang);

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize(`Translation language set to: ${selectedLang}`, 'green'));
  emitText(socket, '\r\n');

  // Clean up and return to message reader
  delete session.tempData.translatorLanguages;

  // Now translate the current message - express.e:11096-11100
  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;
  const msg = messages[currentIndex];
  const hostLanguage = translationService.getHostLanguage();

  if (selectedLang !== hostLanguage && translationService.hasTranslator(selectedLang)) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize(`Translating to ${selectedLang}`, 'cyan'));
    emitText(socket, '\r\n\r\n');

    const highlightUntranslated = (session.user?.translatorID ?? 0) & 128 ? true : false;
    const translatedBody = translationService.translateText(
      msg.body,
      TranslatorMode.TRANS_HOST_TO_DEFINED,
      selectedLang,
      highlightUntranslated
    );
    emitText(socket, translatedBody);
    emitText(socket, '\r\n\r\n');
  }

  displayMessageNavigationPrompt(socket, session);
}
