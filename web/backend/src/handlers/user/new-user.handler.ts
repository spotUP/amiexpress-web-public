/**
 * New User Registration Handler
 *
 * 1:1 port from express.e:30003+ (newUserAccount, doNewUser)
 *
 * Implements the authentic AmiExpress new user account creation flow:
 * - Name entry with duplicate checking
 * - Location, phone, email
 * - Password with confirmation and strength checking
 * - Lines per screen, computer type, preferences
 * - Backward navigation with blank lines
 * - Summary and confirmation
 */

import { issueResumeTokenForLogin } from '../../server/resume-tokens';
import { linesCountdown, LINES_PROMPT } from '../../utils/lines-test.util';
import { Socket } from 'socket.io';
import { autoLinesFor } from '../../utils/auto-lines.util';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';
import { LoggedOnSubState, BBSState } from '../../constants/bbs-states';
import { displayScreen, doPause } from '../screen.handler';
import { config } from '../../config';
import { boardRoot } from '../../utils/board-root.util';
import { ConfigService } from '../../services/config.service';
import { userFileManager } from '../../services/UserFileManager';
import { userDatabaseManager } from '../../services/UserDatabaseManager';
import { emitUserLogin } from '../../services/bbs-event-emitter';
import { beginLogoff } from '../../server/logoff';
import { runExecuteOn } from '../../services/batch-scheduler';
import { mailOnNewUser } from '../../services/mail-notification.service';
import { getSystemTime } from '../../utils/date-time.util';
import { loadBBSConfig, getBoardConfig } from '../../services/bbs-config-file.service';
import { checkIfNameAllowed } from '../../utils/name-allowed.util';
import { newUserConferenceAccess, newUserPreset } from '../../utils/new-user-preset';
import { UserFlag } from '../../constants/express-flags';
import { nodeFlag, namePromptText } from '../../utils/node-tooltypes.util';
import { claimSysopPromotion, firstInstallPending, setupCodeMatches } from '../../utils/first-user-sysop.util';
import { computerTypeChoices, computerTypeRows } from '../../utils/computer-types.util';

// WEB_: GDPR privacy notice version (bump when Screens/PRIVACY.TXT changes
// materially, so re-consent can be forced for existing users).
const GDPR_NOTICE_VERSION = '1.0';

// Dependencies (injected from index.ts)
let db: any;
let sessions: Map<string, any>;
let screenConfig = {
  NONEWUSERS: 'NoNewUsers',
  NONEWATBAUD: 'NoNewAtBaud',
  NEWUSERPW: 'NewUserPw',
  GUESTLOGON: 'GuestLogon',
  JOIN: 'JOIN'
};
/**
 * The dependency-injected values, kept as a FALLBACK ONLY.
 *
 * These used to be the answer, and they came from environment variables - so
 * `NEWUSER_PASSWORD` and `AUTOVAL_PASSWORD` in `bbsConfig.info`, the only
 * place express looks (ACP.e:2632, express.e:30063), did nothing at all. The
 * board file is asked first now, at the moment the caller is standing at the
 * prompt; these still answer for a board configured the old way, and for a
 * test that injects them.
 */
let injectedNewUserPassword = '';
let injectedAutoValidationPassword = '';

/** The board's answer, with the injected value behind it. */
function accessPasswordNow(): string {
  const { newUserAccessPassword } = require('../../services/new-user-policy.service');
  return newUserAccessPassword() || injectedNewUserPassword;
}

/** The same, for auto-validation - node icon, then board, then injected. */
function autoValidationPasswordNow(session?: { nodeId?: number }): string {
  const { autoValidationPassword } = require('../../services/new-user-policy.service');
  return autoValidationPassword(session?.nodeId) || injectedAutoValidationPassword;
}
let autoValidationSecLevel = 50;
let configService: ConfigService | null = null;

interface SecurityPolicy {
  minLength: number;
  minStrength: number;
  strictPolicy: boolean;
}

interface ScriptStep {
  type: 'text' | 'prompt';
  content: string;
}

interface QuestionnaireAnswer {
  prompt: string;
  response: string;
}

interface QuestionnaireState {
  steps: ScriptStep[];
  currentIndex: number;
  awaitingPromptIndex?: number;
  answers: QuestionnaireAnswer[];
  scriptPath: string;
  tempAnswerPath: string;
  transcript: string[];
}

interface NewUserDependencies {
  db: any;
  sessions: Map<string, any>;
  screens?: Partial<typeof screenConfig>;
  newUserPassword?: string;
  autoValidationPassword?: string;
  autoValidationSecLevel?: number;
}

export function setNewUserDependencies(deps: NewUserDependencies) {
  db = deps.db;
  sessions = deps.sessions;
  configService = new ConfigService(db as any);
  if (deps.screens) {
    screenConfig = { ...screenConfig, ...deps.screens };
  }
  if (typeof deps.newUserPassword === 'string') {
    injectedNewUserPassword = deps.newUserPassword.trim();
  }
  if (typeof deps.autoValidationPassword === 'string') {
    injectedAutoValidationPassword = deps.autoValidationPassword.trim();
  }
  if (typeof deps.autoValidationSecLevel === 'number' && !Number.isNaN(deps.autoValidationSecLevel)) {
    autoValidationSecLevel = deps.autoValidationSecLevel;
  }
}

/**
 * Start new user registration flow
 * express.e:30003-30050 (newUserAccount)
 */
export async function startNewUserRegistration(socket: Socket, session: any, username: string) {
console.log(' [NEW USER] Starting registration for:', username);

  session.state = BBSState.REGISTERING;
  session.inputBuffer = '';
  session.cmdShortcuts = false;
  if (session.shortcuts && typeof session.shortcuts.clear === 'function') {
    session.shortcuts.clear();
  }
  // Clear any leftover display/menu state so we stay in line-input mode
  session.commandText = undefined;
  session.paginatedScreen = undefined;
  session.queuedScreenCommands = [];
  session.pendingDisplayInputs = [];
  session.replayingDisplayInputs = false;
  session.menuPause = false;

  // WEB_: a board with no sysop yet. Only the owner, who can read the server
  // log, may create the first account, because that account becomes sysop
  // (first-user-sysop.util.ts). Asked before NONEWUSERS: a fresh board must
  // be able to make its sysop whatever the new-user screens say.
  if (firstInstallPending()) {
    session.newUserSetupUsername = username || '';
    session.subState = LoggedOnSubState.NEW_USER_SETUP_CODE;
    promptForSetupCode(socket, session);
    return;
  }

  await beginNewUserRegistration(socket, session, username);
}

function promptForSetupCode(socket: Socket, session: any) {
  socket.emit('ansi-output',
    '\r\n\x1b[1;33m[SETUP] This board has no sysop yet.\x1b[0m\r\n' +
    'The account you create now becomes the sysop.\r\n' +
    '\r\n\x1b[1;37mSetup code (from the server log): \x1b[0m');
  session.inputBuffer = '';
}

/**
 * WEB_: the answer to the setup-code prompt. The right code continues into
 * the ordinary registration; anything else disconnects, so the code cannot
 * be guessed in one call.
 */
export async function handleSetupCodeInput(socket: Socket, session: any, input: string) {
  const username = session.newUserSetupUsername || '';
  session.newUserSetupUsername = undefined;
  if (!firstInstallPending()) {
    // Someone else finished setting up while this caller typed: an ordinary
    // registration from here.
    await beginNewUserRegistration(socket, session, username);
    return;
  }
  if (!setupCodeMatches(input)) {
    console.warn('[SETUP] Wrong setup code entered - caller disconnected');
    await abortNewUser(socket, session, '\r\n\x1b[31mWrong setup code.\x1b[0m\r\n');
    return;
  }
  socket.emit('ansi-output', '\r\n\x1b[32m[OK] Setup code accepted.\x1b[0m\r\n');
  await beginNewUserRegistration(socket, session, username);
}

async function beginNewUserRegistration(socket: Socket, session: any, username: string) {
  // These screens are optional gates: their presence signals "block registration".
  // Missing is the common case, so suppress the "Screen not found" sysop alert.
  if (await showScreen(socket, session, screenConfig.NONEWUSERS, /* silent */ true)) {
    doPause(socket, session);
    await abortNewUser(socket, session, ''); // express.e:30008 - the screen is the whole answer
    return;
  }

  if (await showScreen(socket, session, screenConfig.NONEWATBAUD, /* silent */ true)) {
    doPause(socket, session);
    await abortNewUser(socket, session, ''); // express.e:30010
    return;
  }

  // express.e:30047 - Create new account structure
  // Initialize registration data
  // express.e:30055 - AstrCopy(loggedOnUser.name,userName,31) preserves login name
  session.newUserData = {
    username: username || '', // Preserve login name for prefill (express.e:30055)
    location: '',
    phone: '',
    email: '',
    password: '',
    linesPerScreen: 0, // 0 = auto
    computerType: 'AMiGA 500',
    screenClear: true,
    retryCount: 0,
    accessPasswordTries: 0,
    introShown: false,
    autoValidationTries: 0,
    autoValidationComplete: !autoValidationPasswordNow(session),
    autoValidated: false,
    linesCountdownShown: false,
    questionnaire: undefined,
    computerChoices: undefined,
    // WEB_: GDPR consent captured before any PII is requested.
    gdprConsentAt: undefined,
    gdprConsentSource: undefined
  };

  // WEB_: require explicit consent to the privacy notice before prompting
  // for any PII (name, location, etc.). See thoughts/shared/plans/
  // 2026-04-24-gdpr-hobby-baseline.md Phase 1.
  session.subState = LoggedOnSubState.NEW_USER_GDPR_CONSENT;
  await promptForGdprConsent(socket, session);
  return;
}

/**
 * WEB_: show the privacy notice and prompt accept/decline.
 * Called before any PII-gathering prompt in startNewUserRegistration.
 */
async function promptForGdprConsent(socket: Socket, session: any) {
  const baseDir = config.getConfig().dataDir;
  const screenPath = path.join(baseDir, 'Screens', 'PRIVACY.TXT');
  let body = '';
  try {
    body = amigafs.readFileSync(screenPath, 'utf8') as string;
  } catch (error) {
    console.warn('[NEW USER] Unable to read PRIVACY.TXT:', error);
    // Fallback minimal notice so consent can still be captured if file is missing.
    body = '\r\nPrivacy notice unavailable. Contact the sysop before registering.\r\n';
  }

  let sysopEmail = '';
  try {
    const bbsCfg = loadBBSConfig(baseDir);
    sysopEmail = (bbsCfg.sysop_email || '').trim();
  } catch (error) {
    console.warn('[NEW USER] Unable to load bbsConfig for sysop email:', error);
  }
  const emailReplacement = sysopEmail.length > 0 ? sysopEmail : '(not configured)';
  body = body.replace(/\$SYSOP_EMAIL\$/g, emailReplacement);

  socket.emit('ansi-output', body);
  socket.emit('ansi-output', '\r\n\x1b[1;37mAccept privacy notice (Y/n)? \x1b[0m');
  session.inputBuffer = '';
}

/**
 * WEB_: handle the consent answer. `y`/`yes` stamps consent and proceeds to
 * the access-password screen or the intro screens. Anything else is a
 * decline and disconnects.
 */
export async function handleGdprConsentInput(socket: Socket, session: any, input: string) {
  const answer = input.trim().toLowerCase();
  // Blank (Enter) or y/yes accepts. Default is Y to match the (Y/n) prompt.
  if (answer === '' || answer === 'y' || answer === 'yes') {
    session.newUserData.gdprConsentAt = new Date().toISOString();
    session.newUserData.gdprNoticeVersion = GDPR_NOTICE_VERSION;
    session.newUserData.gdprConsentSource = 'registration';
    socket.emit('ansi-output', '\r\n');
    await continueAfterGdprConsent(socket, session);
    return;
  }
  if (answer === 'n' || answer === 'no') {
    await abortNewUser(socket, session, '\r\n\x1b[33mRegistration cancelled. No data has been stored.\x1b[0m\r\n');
    return;
  }
  socket.emit('ansi-output', '\r\n\x1b[31mPlease answer Y or n (blank = yes).\x1b[0m\r\n');
  await promptForGdprConsent(socket, session);
}

async function continueAfterGdprConsent(socket: Socket, session: any) {
  const username = session.newUserData?.username || '';
  if (accessPasswordNow()) {
    if (await showScreen(socket, session, screenConfig.NEWUSERPW)) {
      doPause(socket, session);
    }
    session.subState = LoggedOnSubState.NEW_USER_ACCESS_PASSWORD;
    promptForAccessPassword(socket, session);
    return;
  }

  await beginRegistrationPrompts(socket, session, username);
}

/**
 * Check if a name contains wildcards (express.e:11226-11232 checkForAst).
 * Returns true if the name contains '*' (wildcard).
 */
function checkForAst(name: string): boolean {
  return name.includes('*');
}

/**
 * Prompt for name - express.e:30141
 */
function promptForName(socket: Socket, session: any) {
  const prefill = session.newUserData?.username || '';
  // express.e:30141 - StringF(string,'\b\n\s ',namePrompt) where namePrompt defaults to 'Enter your Name: '
  socket.emit('ansi-output', namePromptText(session.nodeId ?? 0));
  // We send the prefill as actual input to the frontend so it appears at the prompt
  socket.emit('ansi-output', prefill);
  // Set input buffer to prefill so just pressing Enter accepts it
  session.inputBuffer = prefill;
}

/**
 * Handle name input - express.e:30128-30189
 *
 * express.e uses a FOR i:=0 TO 4 loop (5 iterations) where any rejection
 * (blank, 1-char, checkIfNameAllowed, wildcard, duplicate) loops back via
 * JUMP floopc.  After 5 total iterations the loop falls through and prints
 * "Too Many Errors, Goodbye!".  A separate `ch` counter tracks blank-only
 * entries and disconnects after >5 consecutive blanks (express.e:30148-30154).
 *
 * We mirror this with a single retryCount that increments for every failure
 * regardless of type, disconnecting after 5.  Blank also gets the extra
 * early-exit at >5 blank-only attempts (expressed as the same counter here
 * since the outer loop already caps at 5).
 */
export async function handleNameInput(socket: Socket, session: any, input: string) {
  // If input is empty but we have a prefill in inputBuffer, use that
  // This happens if the user just presses Enter
  let name = input.trim();
  if (name === '' && session.inputBuffer) {
    name = session.inputBuffer.trim();
  }

  session.newUserData.retryCount = session.newUserData.retryCount || 0;

  // express.e:30148-30154 - IF(StrLen(loggedOnUser.name)=0) ch++ IF(ch>5) TooMany
  if (name === '') {
    session.newUserData.retryCount++;
    if (session.newUserData.retryCount > 5) {
      // express.e:30148-30154 — STATE_LOGGING_OFF; RETURN.
      beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
      return;
    }
    socket.emit('ansi-output', '\r\n');
    promptForName(socket, session);
    return;
  }

  // express.e:30157-30159 - IF(StrLen(loggedOnUser.name)=1) "Get REAL!!"
  if (name.length === 1) {
    socket.emit('ansi-output', '\r\nGet REAL!!  One Character???\r\n');
    // express.e:30159 JUMP floopc - counts toward the retry limit
    session.newUserData.retryCount++;
    if (session.newUserData.retryCount >= 5) {
      // express.e:30148-30154 — STATE_LOGGING_OFF; RETURN.
      beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
      return;
    }
    promptForName(socket, session);
    return;
  }

  // express.e:30163-30165 - checkIfNameAllowed
  const notAllowedMsg = checkIfNameAllowed(name);
  if (notAllowedMsg !== null) {
    socket.emit('ansi-output', `\r\n${notAllowedMsg}\r\n\r\n`);
    // express.e:30164 JUMP floopc - counts toward retry limit
    session.newUserData.retryCount++;
    if (session.newUserData.retryCount >= 5) {
      // express.e:30148-30154 — STATE_LOGGING_OFF; RETURN.
      beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
      return;
    }
    promptForName(socket, session);
    return;
  }

  // express.e:30169-30175: lineInput's line break, '\b\nChecking for
  // duplicate name...', and only then the wildcard check.
  socket.emit('ansi-output', '\r\n\r\nChecking for duplicate name...');
  if (checkForAst(name)) {
    socket.emit('ansi-output', 'No wildcards allowed in a name.\r\n');
    // express.e:30174 JUMP floopc - counts toward retry limit
    session.newUserData.retryCount++;
    if (session.newUserData.retryCount >= 5) {
      // express.e:30148-30154 — STATE_LOGGING_OFF; RETURN.
      beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
      return;
    }
    promptForName(socket, session);
    return;
  }

  const existingUser = await db.getUserByUsername(name);
  if (existingUser) {
    // express.e:30179 - aePuts('Already in use!, try another.\b\n')
    socket.emit('ansi-output', 'Already in use!, try another.\r\n');
    // express.e:30180 JUMP floopc - counts toward retry limit
    session.newUserData.retryCount++;
    if (session.newUserData.retryCount >= 5) {
      // express.e:30148-30154 — STATE_LOGGING_OFF; RETURN.
      beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
      return;
    }
    promptForName(socket, session);
    return;
  }

  // express.e:30182 - aePuts('Ok!\b\n\b\n') then JUMP jLoop2
  socket.emit('ansi-output', 'Ok!\r\n\r\n');

  // Save name and move to next question
  session.newUserData.username = name;
  session.newUserData.retryCount = 0;
  session.subState = LoggedOnSubState.NEW_USER_LOCATION;
  promptForLocation(socket, session);
}

/**
 * Prompt for location - express.e:30172
 */
function promptForLocation(socket: Socket, session: any) {
  // express.e:30194 asks 'City, State: '. WEB_: this board's callers give
  // their group (sysop, 2026-10-05); the field is still the location.
  socket.emit('ansi-output', 'Group: ');
  session.inputBuffer = '';
}

/**
 * Handle location input - express.e:30193-30201
 */
export async function handleLocationInput(socket: Socket, session: any, input: string) {
  const location = input.trim();

  if (location === '') {
    // express.e:30198-30200: lineInput's break, '\b\n', JUMP iJLoop - the
    // name prompt again, with the name typed so far in it (30143).
    socket.emit('ansi-output', '\r\n\r\n');
    session.subState = LoggedOnSubState.NEW_USER_NAME;
    promptForName(socket, session);
    return;
  }

  session.newUserData.location = location;
  session.subState = LoggedOnSubState.NEW_USER_PHONE;
  promptForPhone(socket, session);
}

/**
 * Prompt for phone - express.e:30181
 */
function promptForPhone(socket: Socket, session: any) {
  // express.e:30204: aePuts('Phone Number: ')
  socket.emit('ansi-output', '\r\nPhone Number: ');
  session.inputBuffer = '';
}

/**
 * Handle phone input - express.e:30181-30189
 * WEB_: phone is optional; blank is accepted and advances to email.
 * Diverges from express.e:30186 retreat-to-location behavior.
 */
export async function handlePhoneInput(socket: Socket, session: any, input: string) {
  const phone = input.trim();
  if (phone === '') {
    // express.e:30209-30212: lineInput's break, '\b\n', JUMP jLoop2 - City again.
    socket.emit('ansi-output', '\r\n\r\n');
    session.subState = LoggedOnSubState.NEW_USER_LOCATION;
    promptForLocation(socket, session);
    return;
  }
  session.newUserData.phone = phone;
  session.subState = LoggedOnSubState.NEW_USER_EMAIL;
  promptForEmail(socket, session);
}

/**
 * Prompt for email - express.e:30191
 */
function promptForEmail(socket: Socket, session: any) {
  socket.emit('ansi-output', '\r\nE-Mail Address: ');
  session.inputBuffer = '';
}

/**
 * Handle email input - express.e:30214-30223. Anything typed is taken; a
 * blank answer goes back to the phone number.
 */
export async function handleEmailInput(socket: Socket, session: any, input: string) {
  const email = input.trim();

  if (email === '') {
    // express.e:30220-30222: lineInput's break, '\b\n', JUMP jLoop3.
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.NEW_USER_PHONE;
    promptForPhone(socket, session);
    return;
  }

  session.newUserData.email = email;
  session.subState = LoggedOnSubState.NEW_USER_PASSWORD;
  promptForPassword(socket, session);
}

/**
 * Prompt for pre-screen new user password (express.e:30008-30042)
 */
function promptForAccessPassword(socket: Socket, session: any) {
  session.inputBuffer = '';
  setPasswordMask(socket, session, true);
  socket.emit('ansi-output', '\r\nEnter New User Password: ');
}

export async function handleAccessPasswordInput(socket: Socket, session: any, input: string) {
  const attempt = input.trim();
  session.newUserData.accessPasswordTries = session.newUserData.accessPasswordTries || 0;

  if (!attempt || attempt !== accessPasswordNow()) {
    session.newUserData.accessPasswordTries++;
    // express.e:30036 aePuts('Invalid PassWord\b\n') - plain, that case. The
    // leading CRLF is lineInput's own after Enter (express.e:2378).
    socket.emit('ansi-output', '\r\nInvalid PassWord\r\n');

    // express.e:30029-30035 - every failure is logged, and the node's
    // SHOWPWFAIL decides whether the log holds what was typed or `xxxx`. The
    // login path already does this (command.handler.ts:2035); a new-user
    // password failure left no trace at all.
    try {
      const { callersLogManager } = require('../../services/CallersLogManager');
      const { nodeFlag } = require('../../utils/node-tooltypes.util');
      const shown = nodeFlag(session.nodeId || 1, 'SHOWPWFAIL') ? attempt : 'xxxx';
      callersLogManager.logActivity(session.nodeId || 1, `\tPassword Failure (${shown})`);
    } catch (error) {
      console.error('[NEW USER] could not log the password failure:', error);
    }

    if (session.newUserData.accessPasswordTries > 2) {
      socket.emit('ansi-output', '\r\nExcessive Password Failure\r\n');
      // express.e:30040 - `runSysCommand('NUPFAIL','')`. A board that has no
      // NUPFAIL registered loses nothing: runSysCommand answers "not found"
      // and the caller is dropped exactly as before.
      try {
        const { runSysCommand } = require('../../handlers/command-execution.handler');
        await runSysCommand(socket, session, 'NUPFAIL', '');
      } catch (error) {
        console.error('[NEW USER] NUPFAIL failed:', error);
      }
      // express.e:30038-30041 - "Excessive Password Failure" above is all it
      // says. "Too Many Errors, Goodbye!" is the name prompt's (29634).
      await abortNewUser(socket, session, '');
      return;
    }

    // express.e:30017 - the REPEAT asks again with no line break before it.
    session.inputBuffer = '';
    socket.emit('ansi-output', 'Enter New User Password: ');
    return;
  }

  setPasswordMask(socket, session, false);
  // express.e:30046 aePuts('Correct\b\n') - plain, after lineInput's own
  // CRLF (express.e:2378); without it the word ran on from the masked input.
  socket.emit('ansi-output', '\r\nCorrect\r\n');
  session.newUserData.accessPasswordTries = 0;
  await beginRegistrationPrompts(socket, session, session.newUserData.username || 'NEW');
}

async function beginRegistrationPrompts(socket: Socket, session: any, username: string) {
  // express.e:30128+ doNewUser() - show intro screens with proper pause handling
  // Note: "Now, part one of our questioning" comes from SCRIPT questionnaire (join.txt), not core flow

  if (!session.newUserData.introShown) {
    // Show GUESTLOGON screen if it exists
    const guestShown = await showScreen(socket, session, screenConfig.GUESTLOGON);
    if (guestShown) {
      // If displayScreen already set up a pause (from ~SP in screen), attach our callback
      // Don't call doPause again - that would show double "(Pause)...Space To Resume:"
      if (session.paginatedScreen) {
        session.paginatedScreen.onComplete = () => continueIntroFlow(socket, session, 'join');
      } else {
        // Screen didn't have pause, add one manually
        doPause(socket, session, () => continueIntroFlow(socket, session, 'join'));
      }
      return; // Wait for user to press space
    } else {
      // express.e:30049 - no GUESTLOGON, no text and no pause.
      continueIntroFlow(socket, session, 'join');
      return;
    }
  }

  finishIntroAndPromptName(socket, session);
}

function continueIntroFlow(socket: Socket, session: any, phase: string) {
  if (phase === 'join') {
    // Show JOIN screen after GUESTLOGON
    showScreen(socket, session, screenConfig.JOIN).then(joinShown => {
      if (joinShown) {
        if (session.paginatedScreen) {
          session.paginatedScreen.onComplete = () => continueIntroFlow(socket, session, 'name');
        } else {
          doPause(socket, session, () => continueIntroFlow(socket, session, 'name'));
        }
      } else {
        // express.e:30057 - no JOIN, no text and no pause.
        continueIntroFlow(socket, session, 'name');
      }
    });
    return;
  }

  if (phase === 'name') {
    // All intro screens shown, proceed to name prompt
    session.newUserData.introShown = true;
    session.newUserData.pendingIntroPhase = undefined;
    finishIntroAndPromptName(socket, session);
  }
}

function finishIntroAndPromptName(socket: Socket, session: any) {
  // Reset any pagination/shortcut state before line prompts
  session.paginatedScreen = undefined;
  session.queuedScreenCommands = [];
  session.pendingScreenCommand = undefined;
  session.screenCommandResolver = null;
  session.cmdShortcuts = false;
  if (session.shortcuts && typeof session.shortcuts.clear === 'function') {
    session.shortcuts.clear();
  }
  session.inputBuffer = '';

  // WEB_: retreat-on-blank disabled; required fields re-prompt instead of jumping back.
  // Diverges from express.e:30135 "Blank line to retreat" UX by design.

  // Blank line separates the intro screen (join.txt ends without trailing newline)
  // from the first registration prompt, matching the visual spacing in express.e.
  socket.emit('ansi-output', '\r\n');

  // Always ask for handle first (express.e jLoop1)
  session.subState = LoggedOnSubState.NEW_USER_NAME;
  promptForName(socket, session);
}

async function showScreen(socket: Socket, session: any, screenName?: string, silent: boolean = false): Promise<boolean> {
  if (!screenName) return false;
  try {
    return await displayScreen(socket, session, screenName, true, silent);
  } catch (error) {
console.warn('[NEW USER] Failed to display screen', screenName, error);
    return false;
  }
}

async function abortNewUser(socket: Socket, session: any, message: string) {
  if (message) {
    socket.emit('ansi-output', message);
  }
  setPasswordMask(socket, session, false);
  // Park the session in AWAIT so any stray input in the 500ms window can't
  // re-enter the registration flow; clear volatile scratch data.
  session.state = BBSState.AWAIT;
  session.subState = undefined;
  session.newUserData = undefined;
  // WEB_: the modem's NO CARRIER. express.e prints nothing here (its logoff
  // text sits inside IF loggedOnUser<>NIL, 8163); a dial-up caller saw the modem drop.
  socket.emit('ansi-output', '\r\nNO CARRIER\r\n');
  // socket.io v4: pass true to close the underlying transport, not just this
  // namespace — otherwise the terminal sees no obvious end.
  setTimeout(() => {
    try {
      (socket as any).disconnect(true);
    } catch {
      socket.disconnect();
    }
  }, 500);
}

function setPasswordMask(socket: Socket, session: any, enabled: boolean) {
  if (!!session.maskInput === enabled) {
    return;
  }
  session.maskInput = enabled;
  socket.emit('password-mode', enabled);
}

function promptForAutoValidation(socket: Socket, session: any) {
  const data = session.newUserData;
  data.autoValidationTries = data.autoValidationTries || 5;
  session.inputBuffer = '';
  setPasswordMask(socket, session, true);
  // express.e:30068 - the prompt alone: "Yes..\b\n\b\n" (30319) or the
  // "Incorrect password" lines (30084) already end in the break.
  socket.emit('ansi-output', 'Enter the auto-validation password (if known): ');
}

async function getComputerChoices(): Promise<string[]> {
  // The one list sign-up and W both offer (utils/computer-types.util).
  return computerTypeChoices(db);
}

/**
 * Prompt for password - express.e:30203
 */
/** `lead` is the break before it: the last answer's (lineInput's, getPass2's), or none after a message that ends in one. */
function promptForPassword(socket: Socket, session: any, lead = '\r\n') {
  setPasswordMask(socket, session, true);
  socket.emit('ansi-output', `${lead}Enter a PassWord: `);
}

function getSecurityPolicy(): SecurityPolicy {
  const defaults: SecurityPolicy = { minLength: 4, minStrength: 0, strictPolicy: false };
  try {
    {
      const sys = getBoardConfig(config.get('dataDir'));
      {
        return {
          minLength: typeof sys?.min_password_length === 'number' ? sys.min_password_length : defaults.minLength,
          minStrength: typeof sys?.min_password_strength === 'number' ? sys.min_password_strength : defaults.minStrength,
          strictPolicy: Boolean(sys?.strict_password_policy)
        };
      }
    }
  } catch (error) {
console.warn('[NEW USER] Unable to load security policy from config:', error);
  }
  return defaults;
}

function passwordMeetsStrength(password: string, minStrength: number): boolean {
  if (minStrength <= 0) return true;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  switch (minStrength) {
    case 1:
      return classes >= 2;
    case 2:
      return classes >= 3;
    case 3:
      return classes >= 4;
    case 4:
      return classes >= 4 && password.length >= 12;
    default:
      return true;
  }
}

/**
 * Handle password input - express.e:30203-30234
 * WEB_: blank no longer retreats to email; field is required and re-prompts.
 */
export async function handlePasswordInput(socket: Socket, session: any, input: string) {
  const password = input.trim();

  if (password === '') {
    // express.e:30228-30231: getPass2's break, '\b\n', JUMP jLoop4 - the
    // e-mail address again.
    setPasswordMask(socket, session, false);
    socket.emit('ansi-output', '\r\n\r\n');
    session.subState = LoggedOnSubState.NEW_USER_EMAIL;
    promptForEmail(socket, session);
    return;
  }

  // Save password and prompt for confirmation
  session.newUserData.password = password;
  session.subState = LoggedOnSubState.NEW_USER_PASSWORD_CONFIRM;
  setPasswordMask(socket, session, true);
  socket.emit('ansi-output', '\r\nReenter the PassWord: ');
}

/**
 * Handle password confirmation - express.e:30207-30234
 */
export async function handlePasswordConfirm(socket: Socket, session: any, input: string) {
  const confirmation = input.trim();

  // Check if passwords match (express.e:30207 - IF(StrCmp(string,str2)=0))
  // getPass2's break, then 30235-30238's '\b\nPasswords do not match...'.
  if (confirmation !== session.newUserData.password) {
    socket.emit('ansi-output', '\r\n\r\nPasswords do not match, try again..\r\n');
    session.subState = LoggedOnSubState.NEW_USER_PASSWORD;
    promptForPassword(socket, session, '');
    return;
  }

  // express.e:30240-30253 checkPasswordStrength - after the two agree.
  const policy = getSecurityPolicy();
  const weak = (password: string) => password.length < policy.minLength
    ? `\r\n\r\nPassword length must be at least ${policy.minLength} chars, try again..\r\n`
    : !passwordMeetsStrength(password, policy.minStrength)
      ? `\r\n\r\nPassword must have at least ${policy.minStrength} of these:\r\n  upper case,lower case, numeric and symbols, try again..\r\n`
      : null;
  const refused = weak(confirmation);
  if (refused) {
    socket.emit('ansi-output', refused);
    session.subState = LoggedOnSubState.NEW_USER_PASSWORD;
    promptForPassword(socket, session, '');
    return;
  }

  // Password confirmed, move to lines per screen - getPass2's line break,
  // then 30259's aePuts('\b\n').
  setPasswordMask(socket, session, false);
  socket.emit('ansi-output', '\r\n\r\n');
  session.subState = LoggedOnSubState.NEW_USER_LINES;
  promptForLines(socket, session);
}

/**
 * Prompt for lines per screen - express.e:11303-11306
 */
function promptForLines(socket: Socket, session: any) {
  if (!session.newUserData.linesCountdownShown) {
    session.newUserData.linesCountdownShown = true;
    socket.emit('ansi-output', linesCountdown());
  }
  socket.emit('ansi-output', LINES_PROMPT);
  session.inputBuffer = '';
}

/**
 * Handle lines input - express.e:30236-30237
 */
export async function handleLinesInput(socket: Socket, session: any, input: string) {
  const val = input.trim();
  const typed = val === '' ? 0 : (parseInt(val) || 0);
  session.newUserData.linesPerScreen = typed > 0 ? typed : autoLinesFor(session);

  // lineInput's line break, then 30263's aePuts('\b\n').
  socket.emit('ansi-output', '\r\n\r\n');
  session.subState = LoggedOnSubState.NEW_USER_COMPUTER;
  await promptForComputer(socket, session);
}

/**
 * Prompt for computer type - express.e:11315-11325
 */
async function promptForComputer(socket: Socket, session: any) {
  const choices = await getComputerChoices();
  session.newUserData.computerChoices = choices;
  // express.e:11318-11337 - the list (utils/computer-types.util), '\b\n',
  // and the prompt.
  for (const row of computerTypeRows(choices, session)) socket.emit('ansi-output', row);
  socket.emit('ansi-output', '\r\nChoose computer type: ');
  session.inputBuffer = '';
}

/**
 * Handle computer input - express.e:30238-30239
 */
export async function handleComputerInput(socket: Socket, session: any, input: string) {
  const selection = input.trim();
  const choices = session.newUserData.computerChoices || await getComputerChoices();

  if (selection === '') {
    // Blank line - RESULT_SUCCESS
    session.newUserData.computerType = choices[0];
  } else {
    const numericChoice = parseInt(selection, 10);
    if (Number.isNaN(numericChoice) || numericChoice < 1 || numericChoice > choices.length) {
      // express.e:11342 JUMP jLoop6 - lineInput's break, then the prompt
      // again; the list is not drawn twice.
      socket.emit('ansi-output', '\r\nChoose computer type: ');
      session.inputBuffer = '';
      return;
    }
    session.newUserData.computerType = choices[numericChoice - 1];
    // express.e:11333 - loggedOnUser.secBulletin:=stat-1
    session.newUserData.computerIndex = numericChoice - 1;
  }

  // lineInput's line break, then 30266's aePuts('\b\n').
  socket.emit('ansi-output', '\r\n\r\n');
  session.subState = LoggedOnSubState.NEW_USER_SCREEN_CLEAR;
  promptForScreenClear(socket, session);
}

/**
 * Prompt for screen clear preference - express.e:30272-30281.
 *
 * **WEB_**: express.e uses `readChar()` so the user answers with a
 * single keypress (no Enter required). The web terminal pipeline runs
 * line-buffered for new-user input fields — the Enter key is what
 * delivers the answer to the server. We accept either Y/N + Enter or
 * just Enter (defaults to N), which is the closest equivalent.
 * (Audit A-20.)
 */
/**
 * express.e:30284: `IF bgFileCheck AND DEFAULT_BGFILECHECK THEN userFlags OR USER_BGFILECHECK`.
 * `bgFileCheck` is express.e's global (session.bgFileCheck here): it is set
 * only by an upload the node started, so a fresh new-user session has it
 * clear and gets no flag - exactly as express.e's first caller on a node does.
 */
export function newUserDefaultFlags(
  session: { bgFileCheck?: boolean; nodeId?: number },
  screenClear = false
): number {
  // express.e:30270 `userFlags:=USER_NEWMSG`, 30278 `OR USER_SCRNCLR` on a Y answer.
  let flags: number = UserFlag.NEWMSG;
  if (screenClear) flags |= UserFlag.SCRNCLR;
  if (session.bgFileCheck && nodeFlag(session.nodeId || 1, 'DEFAULT_BGFILECHECK')) flags |= UserFlag.BGFILECHECK;
  return flags;
}

function promptForScreenClear(socket: Socket, session: any) {
  // express.e:30272 prints no (y/N) hint; any answer but Y is No (30276-30281).
  socket.emit('ansi-output', 'You want Screen Clears after Messages ? ');
  session.inputBuffer = '';
}

/**
 * Handle screen clear input - express.e:30250-30260
 */
export async function handleScreenClearInput(socket: Socket, session: any, input: string) {
  const response = input.trim().toUpperCase();

  // express.e:30256 - IF((ch="Y") OR (ch="y"))
  const enabled = response === 'Y' || response === 'YES';
  session.newUserData.screenClear = enabled;

  if (enabled) {
    socket.emit('ansi-output', 'Yes..\r\n\r\n');
  } else {
    socket.emit('ansi-output', 'No!\r\n\r\n');
  }

  // Show summary and ask for confirmation
  session.subState = LoggedOnSubState.NEW_USER_CONFIRM;
  showSummaryAndConfirm(socket, session);
}

/**
 * Show summary and ask for confirmation - express.e:30264-30281
 */
function showSummaryAndConfirm(socket: Socket, session: any) {
  const data = session.newUserData;

  // express.e:30286-30304, one StringF per line
  socket.emit('ansi-output', `Handle: ${data.username}\r\n`);
  socket.emit('ansi-output', `City, St.: ${data.location}\r\n`); // express.e:30288
  socket.emit('ansi-output', `Phone Num: ${data.phone}\r\n`);
  socket.emit('ansi-output', `E-Mail   : ${data.email}\r\n`);
  
  const lineStr = data.linesPerScreen === 0 ? 'Auto' : String(data.linesPerScreen);
  socket.emit('ansi-output', `Num Lines: ${lineStr}\r\n`);
  socket.emit('ansi-output', `PassWord : ENCRYPTED\r\n`);
  socket.emit('ansi-output', `Computer : ${data.computerType}\r\n`);
  socket.emit('ansi-output', `Scrn Clr : ${data.screenClear ? 'YES' : 'NO'}\r\n\r\n`);
  
  socket.emit('ansi-output', 'Is the above Correct? ');
  session.inputBuffer = '';
}

async function continueRegistrationFlow(socket: Socket, session: any) {
  if (autoValidationPasswordNow(session) && !session.newUserData.autoValidationComplete) {
    session.subState = LoggedOnSubState.NEW_USER_AUTOVAL;
    promptForAutoValidation(socket, session);
    return;
  }

  /*
   * express.e:30356 - `IF (runSysCommand('SCRIPT','')<>RESULT_SUCCESS)`: the
   * board first offers a SYSCMD door named SCRIPT, and only when there is no
   * such command does it read the Node<n>/Script<baud> text. The port went
   * straight to the text, so there was no way to put a DOOR at this point in
   * a new caller's life. That door is where onboarding goes - theme setup,
   * the achievements sign-up - because a script line can only ask and print.
   * Register it as Commands/SysCmd/SCRIPT.info and it runs here; when it
   * answers success the text questionnaire is skipped, exactly as on the Amiga.
   */
  // The account FIRST - express.e:30096-30112 assigns the slot before
  // doNewUserQuestions. The port used to ask first and create after, which
  // meant nothing a script launched could see the caller: processCommand
  // ignores a session that is not LOGGEDON, and a theme picker or the
  // achievements sign-up has no user to work on.
  //
  // Once only: the questionnaire's confirm handler comes back through here
  // when it finds no questionnaire on the session, and the caller by then
  // already HAS an account.
  if (!session.user && !(await createAccountRecord(socket, session))) return;

  if (await scriptDoorRan(socket, session)) {
    await enterBoard(socket, session);
    return;
  }

  const questionnaireStarted = await beginQuestionnaire(socket, session);
  if (questionnaireStarted) {
    return;
  }

  await enterBoard(socket, session);
}

/**
 * Into the board: JOINED and the pause that leads to the bulletins.
 *
 * Split from account creation so the questionnaire - and any onboarding it
 * runs - happens with the account IN EXISTENCE and BEFORE the caller is
 * shown the board, which is express.e's order (30096-30112: the slot is
 * assigned, then doNewUserQuestions, then the logon carries on).
 */
async function enterBoard(socket: Socket, session: any): Promise<void> {
  delete session.newUserData;
  const newUser = session.user;
  // Nothing printed here: express.e goes from the questionnaire straight on
  // with the logon (30096-30112); there is no "account created" line.
  // The questionnaire ran in its own sub-states, REGISTERING; the board
  // starts here at the bulletins, which is where account creation used to
  // leave the caller - and the browser learns it is logged on only now.
  session.state = BBSState.LOGGEDON;
  session.subState = LoggedOnSubState.DISPLAY_BULL;
  const resumeToken = issueResumeTokenForLogin(session, String(newUser.id));
  socket.emit('login-success', {
    resumeToken,
    user: {
      id: newUser.id,
      username: newUser.username,
      realname: newUser.realname,
      secLevel: newUser.secLevel,
      expert: newUser.expert,
      ansi: newUser.ansi
    }
  });

  // Emit BBS event for LiveChat integration
  try {
    emitUserLogin({
      username: newUser.username,
      nodeId: session.nodeId || 1,
      location: newUser.location || 'Unknown',
      timestamp: Date.now()
    });
  } catch (error) {
console.error('[BBSEvent] Error emitting new user login event:', error);
  }
    try {
      const { displayScreen, doPause } = require('../screen.handler');
      const shown = await displayScreen(socket, session, 'JOINED', true, /* silent */ true);
      // express.e:30125 - JOINED and its pause, or nothing.
      if (shown && typeof doPause === 'function') doPause(socket, session);
    } catch (error) {
      console.error('[NEW USER] JOINED screen failed:', error);
    }
}

/**
 * The SCRIPT sys-command, if this board has one. `0` is RESULT_SUCCESS; a
 * missing command, a refused one or a door that failed all mean the text
 * questionnaire is what the caller gets, which is express.e's fallback too.
 */
async function scriptDoorRan(socket: Socket, session: any): Promise<boolean> {
  try {
    // require(), not import: command-execution reaches back into the user
    // handlers, and the cycle is only harmless when resolved at call time.
    const { runSysCommand } = require('../command-execution.handler');
    const result = await runSysCommand(socket, session, 'SCRIPT', '');
    return result === 0;
  } catch (error) {
    console.warn('[NEW USER] SCRIPT sys-command failed; falling back to the text questionnaire:', (error as Error).message);
    return false;
  }
}

/**
 * Handle confirmation - create account or go back
 * express.e:30109 - After doNewUser(), calls doNewUserQuestions() for questionnaire
 *
 * **WEB_**: express.e:30306-30318 / 30391-30404 read the y/n answer
 * with `readChar()` (single keypress). Same constraint as A-20 — the
 * web flow is line-buffered, so the user types Y/N then Enter.
 * (Audit A-21.)
 */
export async function handleConfirmInput(socket: Socket, session: any, input: string) {
  // express.e:30308-30318 - ONE key (readChar): N or Q is no, Y is yes, and
  // any other key is read past. The port took a typed line and treated
  // everything but N as yes.
  const response = input.trim().toUpperCase().charAt(0);

  // express.e:30313-30316 - N or Q: aePuts('No!\b\n\b\n') and JUMP jLoop1,
  // back to the name prompt (30133).
  if (response === 'N' || response === 'Q') {
    socket.emit('ansi-output', 'No!\r\n\r\n');
    session.subState = LoggedOnSubState.NEW_USER_NAME;
    session.newUserData.linesCountdownShown = false;
    promptForName(socket, session);
    return;
  }

  if (response !== 'Y') return;

  // express.e:30319, then the questionnaire.
  socket.emit('ansi-output', 'Yes..\r\n\r\n');
  await continueRegistrationFlow(socket, session);
}

export async function handleAutoValidationInput(socket: Socket, session: any, input: string) {
  const data = session.newUserData;
  data.autoValidationTries = data.autoValidationTries || 5;

  const attempt = input.trim();
  if (attempt.length === 0) {
    data.autoValidationComplete = true;
    socket.emit('ansi-output', '\r\n');
    setPasswordMask(socket, session, false);
    await continueRegistrationFlow(socket, session);
    return;
  }

  if (attempt.toUpperCase() === autoValidationPasswordNow(session).toUpperCase()) {
    data.autoValidated = true;
    data.autoValidationComplete = true;
    // express.e:30072, plain: lineInput's CRLF after Enter (2378), then '\b\n...'.
    socket.emit('ansi-output', '\r\n\r\nAuto-validation password accepted.\r\n');
    setPasswordMask(socket, session, false);
    await continueRegistrationFlow(socket, session);
    return;
  }

  data.autoValidationTries--;
  if (data.autoValidationTries > 0) {
    // express.e:30084, plain: lineInput's CRLF after Enter (2378), then '\b\n...'.
    socket.emit('ansi-output', '\r\n\r\nIncorrect password, try again or leave blank if not known.\r\n\r\n');
    promptForAutoValidation(socket, session);
    return;
  }

  data.autoValidationComplete = true;
  socket.emit('ansi-output', '\r\n');
  setPasswordMask(socket, session, false);
  await continueRegistrationFlow(socket, session);
}

export async function handleQuestionnaireAnswer(socket: Socket, session: any, input: string) {
  const questionnaire: QuestionnaireState | undefined = session.newUserData.questionnaire;
  if (!questionnaire) {
    await continueRegistrationFlow(socket, session);
    return;
  }

  if (typeof questionnaire.awaitingPromptIndex !== 'number') {
    // Re-enter questionnaire loop cleanly
    session.subState = LoggedOnSubState.NEW_USER_SCRIPT;
    await advanceQuestionnaire(socket, session);
    // If still no awaiting prompt and we've exhausted steps, move to confirm
    if (typeof questionnaire.awaitingPromptIndex !== 'number' && questionnaire.currentIndex >= questionnaire.steps.length) {
      session.subState = LoggedOnSubState.NEW_USER_SCRIPT_CONFIRM;
      socket.emit('ansi-output', '\r\nIs the above Correct? '); // express.e:30391, no hint
    }
    return;
  }

  const response = input.trim();
  const promptStep = questionnaire.steps[questionnaire.awaitingPromptIndex];
  questionnaire.answers.push({
    prompt: promptStep.content,
    response
  });
  questionnaire.transcript.push(`${promptStep.content} ${response}`);
  questionnaire.awaitingPromptIndex = undefined;
  session.inputBuffer = '';

  // express.e:30376 - lineInput echoes Enter key as linebreak
  // We need to add the linebreak after user's response before showing next step
  socket.emit('ansi-output', '\r\n');

  await advanceQuestionnaire(socket, session);
}

export async function handleQuestionnaireConfirmInput(socket: Socket, session: any, input: string) {
  const questionnaire: QuestionnaireState | undefined = session.newUserData.questionnaire;
  if (!questionnaire) {
    await continueRegistrationFlow(socket, session);
    return;
  }

  const response = input.trim().toUpperCase();
  if (response === 'N' || response === 'NO' || response === 'Q' || response === 'QUIT') {
    socket.emit('ansi-output', 'No!\r\n\r\n');
    questionnaire.currentIndex = 0;
    questionnaire.answers = [];
    questionnaire.transcript = [];
    questionnaire.awaitingPromptIndex = undefined;
    await advanceQuestionnaire(socket, session);
    return;
  }

  socket.emit('ansi-output', 'Yes..\r\n\r\n');
  // The account was created before the questionnaire began (express.e's
  // order), so the slot number is already on the session.
  const savedQuestionnaire = questionnaire;
  const savedNewUserData = session.newUserData;
  // The account's own slot - the record created before the questionnaire
  // began, read back where it LANDED (createAccountRecord). The count of
  // accounts is not it: a record can reuse a freed slot, and every answer
  // header on the live board named someone else's slot until 2026-10-05.
  const slotNumber = Number(session.user?.slotNumber) || userDatabaseManager.getUserCount();
  // Temporarily restore newUserData for persistQuestionnaireAnswers
  session.newUserData = savedNewUserData;
  await persistQuestionnaireAnswers(session, slotNumber);
  await enterBoard(socket, session);
  // Final cleanup
  delete session.newUserData;
}

async function beginQuestionnaire(socket: Socket, session: any): Promise<boolean> {
  const scriptPath = findQuestionnaireScript(session);
  if (!scriptPath) {
    return false;
  }

  const steps = loadScriptSteps(scriptPath);
  if (steps.length === 0) {
    return false;
  }

  const nodeDir = getNodeDirectory(session);
  const tempPath = path.join(nodeDir, 'TempAns');

  session.newUserData.questionnaire = {
    steps,
    currentIndex: 0,
    answers: [],
    scriptPath,
    tempAnswerPath: tempPath,
    transcript: []
  };

  // express.e:30356-30366 prints the script's first line with nothing before
  // it: what came last - "Yes..\b\n\b\n" or the auto-validation answer -
  // already ended in a break.
  await advanceQuestionnaire(socket, session);
  return true;
}

async function advanceQuestionnaire(socket: Socket, session: any): Promise<void> {
  const questionnaire: QuestionnaireState | undefined = session.newUserData.questionnaire;
  if (!questionnaire) return;

  session.subState = LoggedOnSubState.NEW_USER_SCRIPT;
  while (questionnaire.currentIndex < questionnaire.steps.length) {
    const step = questionnaire.steps[questionnaire.currentIndex];
    questionnaire.currentIndex++;
    if (step.type === 'text') {
      questionnaire.transcript.push(step.content);
      if (step.content.startsWith('~')) {
        // A line that OPENS with a tilde is MCI, exactly as in a screen file:
        // `~CC_THEME|` runs the theme picker, `~CC_ACHIEVE|` the achievements
        // sign-up, `~SS_` pulls a file in. The sysop's ask - "it doesnt even
        // have to be a door it can run our theme settings etc apps from a
        // script" - and the reason the account is created before this runs:
        // processCommand ignores a session that is not LOGGEDON.
        //
        // The board's own parser, not a second one, so a door launched here
        // is the same door with the same subState bookkeeping. The segment
        // marker is what door exit looks for to know it is INSIDE a flow and
        // must not draw the menu; it is cleared as soon as the line is done.
        const { parseMciCodes } = require('../screen.handler');
        const hadSegments = session.screenSegments;
        if (!hadSegments) {
          session.screenSegments = { segments: [], currentIndex: 0, screenName: 'QUESTIONNAIRE', inlineMode: true, isFlowScreen: true };
        }
        // processCommand ignores a session that is not LOGGEDON, and the
        // caller is REGISTERING until the questionnaire is done - so the line
        // runs as a logged-on caller and the state is handed straight back,
        // or the next keystroke would miss the questionnaire.
        const stateBefore = session.state;
        session.state = BBSState.LOGGEDON;
        try {
          const result = await parseMciCodes(step.content, session, undefined, undefined, undefined, socket);
          if (result?.parsed && !result.inlineEmitted) socket.emit('ansi-output', `${result.parsed}\r\n`);
        } catch (error) {
console.warn('[NEW USER] questionnaire MCI line failed:', step.content, (error as Error).message);
        } finally {
          if (!hadSegments) delete session.screenSegments;
          session.state = stateBefore;
          session.subState = LoggedOnSubState.NEW_USER_SCRIPT;
        }
        continue;
      }
      socket.emit('ansi-output', `${step.content}\r\n`);
      continue;
    }
    questionnaire.awaitingPromptIndex = questionnaire.currentIndex - 1;
    socket.emit('ansi-output', `${step.content} `);
    session.inputBuffer = '';
    return;
  }

  session.subState = LoggedOnSubState.NEW_USER_SCRIPT_CONFIRM;
  socket.emit('ansi-output', '\r\nIs the above Correct? '); // express.e:30391, no hint
}

function findQuestionnaireScript(session: any): string | null {
  const nodeDir = getNodeDirectory(session);
  const candidates: string[] = [];
  if (session.connectionBaud) {
    candidates.push(String(session.connectionBaud));
  }
  candidates.push('57600', '38400', '33600', '28800', '19200', '14400');

  for (const baud of candidates) {
    const candidatePath = path.join(nodeDir, `script${baud}`);
    // Use amigafs for case-insensitive file access
    if (amigafs.existsSync(candidatePath)) {
      // Resolve to actual path with correct casing
      return amigafs.resolvePath(candidatePath) || candidatePath;
    }
  }

  try {
    const entries = amigafs.readdirSync(nodeDir);
    const match = entries.find(name => name.toLowerCase().startsWith('script'));
    if (match) {
      return path.join(nodeDir, match);
    }
  } catch (error) {
console.warn('[NEW USER] Unable to scan node directory for scripts:', error);
  }

  return null;
}

function loadScriptSteps(scriptPath: string): ScriptStep[] {
  try {
    const raw = amigafs.readFileSync(scriptPath, 'utf8') as string;
    const lines = raw.split(/\r?\n/);
    const steps: ScriptStep[] = [];

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r/g, '');
      if (line.trim().length === 0) {
        steps.push({ type: 'text', content: '' });
        continue;
      }

      // express.e:30368-30373 — only lines ending in `~` are prompts.
      // The audit (A-22) flagged that `includes('~')` matched lines with
      // a `~` anywhere, so questionnaire scripts containing the char in
      // a sentence were silently turned into input prompts. Match the
      // express.e contract: only the trailing `~`, and strip exactly one.
      if (line.endsWith('~')) {
        const prompt = line.slice(0, -1).trimEnd();
        steps.push({ type: 'prompt', content: prompt });
      } else {
        steps.push({ type: 'text', content: line });
      }
    }
    return steps;
  } catch (error) {
console.warn('[NEW USER] Unable to load questionnaire script:', scriptPath, error);
    return [];
  }
}

async function persistQuestionnaireAnswers(session: any, slotNumber: number): Promise<void> {
  const questionnaire: QuestionnaireState | undefined = session.newUserData?.questionnaire;
  if (!questionnaire) return;

  const nodeDir = getNodeDirectory(session);
  if (!amigafs.existsSync(nodeDir)) {
    amigafs.mkdirSync(nodeDir, { recursive: true });
  }

  // express.e:30344-30356: the TempAns header is the CallersLog's logon line -
  // `MM-DD-YY (HH:MM:SS) [slot] name (connectString) location` - with the
  // same connect string (CallersLogManager), and no blank line after it.
  const { formatCallerLogonLine, SOCKET_CONNECT_STRING } = require('../../services/CallersLogManager');
  const header: string[] = [
    '**************************************************************',
    formatCallerLogonLine({
      isNew: false,
      slotNumber,
      name: session.newUserData.username || 'NEW',
      connectString: SOCKET_CONNECT_STRING,
      location: session.newUserData.location || '',
    }, getSystemTime()),
  ];

  for (const entry of questionnaire.transcript) {
    header.push(entry);
  }

  // Use Unix line endings (LF) to match original AmiExpress format
  const content = header.join('\n');

  try {
    amigafs.writeFileSync(questionnaire.tempAnswerPath, `${content}\n`, 'latin1');
  } catch (error) {
console.warn('[NEW USER] Failed to write TempAns file:', error);
  }

  try {
    amigafs.appendFileSync(answersFileFor(session.nodeId || 0, slotNumber, nodeDir), `${content}\n`, 'latin1');
  } catch (error) {
console.warn('[NEW USER] Failed to append Answers file:', error);
  }
}

/**
 * Where a new caller's answers are appended (express.e:30332-30340): with the
 * node's CENTRAL_ANSWERS switch, one file per account under the board's
 * Answers/ (made if missing), named by slot; otherwise the node's own Answers.
 */
export function answersFileFor(nodeId: number, slotNumber: number, nodeDir: string): string {
  if (!nodeFlag(nodeId, 'CENTRAL_ANSWERS')) return path.join(nodeDir, 'Answers');
  // express.e:30333/30337 `\sAnswers` with cmds.bbsLoc: the board's root.
  const central = path.join(boardRoot(), 'Answers');
  if (!amigafs.existsSync(central)) amigafs.mkdirSync(central, { recursive: true });
  return path.join(central, String(slotNumber));
}

function getNodeDirectory(session: any): string {
  // express.e:30331/30339/30344 `\sNode\d` with cmds.bbsLoc: the board's root.
  const baseDir = boardRoot();
  // express.e:30339/30344 `Node\d` with `node` - the caller's own node, as
  // its CallersLog is. This took one off, so node 2's answers went to Node1.
  const preferred = path.join(baseDir, `Node${session.nodeId || 0}`);
  if (amigafs.existsSync(preferred)) {
    return amigafs.resolvePath(preferred) || preferred;
  }
  return path.join(baseDir, 'Node0');
}

async function getNewUserDefaults() {
  try {
    if (!configService && db) {
      configService = new ConfigService(db as any);
    }
    const systemConfig = configService ? await configService.getSystemConfig() : null;
    if (!systemConfig) {
      return null;
    }

    return {
      secLevel: systemConfig.new_user_sec_level,
      timeLimit: systemConfig.new_user_time_limit,
      chatLimit: systemConfig.new_user_chat_limit,
      linesPerScreen: systemConfig.new_user_lines_per_screen,
      expert: systemConfig.new_user_expert,
      ansi: systemConfig.new_user_ansi,
      protocol: systemConfig.new_user_protocol,
      screenType: systemConfig.new_user_screen_type,
      editor: systemConfig.new_user_editor,
      availableForChat: systemConfig.new_user_available_chat,
      quietNode: systemConfig.new_user_quiet_node,
      autoRejoin: systemConfig.new_user_auto_rejoin
    };
  } catch (error) {
console.warn('[NEW USER] Failed to load system defaults for new users:', error);
    return null;
  }
}

/**
 * Create the user account in database
 */
async function createAccountRecord(socket: Socket, session: any): Promise<boolean> {
  const data = session.newUserData;
  setPasswordMask(socket, session, false);

  try {
    // No "Creating your account..." - express.e assigns the slot silently
    // (30096-30112).

    // Hash password with bcrypt
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(data.password, 10);

    const defaults = await getNewUserDefaults();
    const defaultSecLevel = defaults?.secLevel ?? 10;
    const defaultTimeLimit = defaults?.timeLimit ?? 60;
    const defaultChatLimit = defaults?.chatLimit ?? 30;
    const defaultLines = defaults?.linesPerScreen ?? 23;
    const expertFlag = defaults?.expert ? 'X' : 'N';
    const ansiFlag = defaults?.ansi !== false;
    const protocol = defaults?.protocol || 'ZMODEM';
    const screenType = defaults?.screenType || 'ANSI';
    const editor = defaults?.editor || 'FULL';
    // express.e:30438-30443 initNewUser applies Preset.1 - PRESET.AREA is
    // the new record's conferenceAccess (29369). Read from disk, never the
    // database copy; see utils/new-user-preset.ts.
    const confAccess = newUserConferenceAccess(config.getConfig().dataDir, session.nodeId || 1);
    // The rest of Preset.1 (applyPreset, 29360-29367): level, ratio, time,
    // rejoin and daily bytes. Without a PRESET.AREA nothing is applied and
    // the board's own defaults stand.
    const preset = newUserPreset(config.getConfig().dataDir, session.nodeId || 1);
    const presetTimeLimit = preset ? preset.timeLimit : defaultTimeLimit;
    const availableForChat = defaults?.availableForChat !== false;
    const quietNode = defaults?.quietNode || false;
    const autoRejoin = defaults?.autoRejoin !== false ? 1 : 0;

    // Check if this is the first user (should become sysop)
    const firstUserIsSysop = claimSysopPromotion();
    let assignedSecLevel = data.autoValidated ? autoValidationSecLevel : (preset ? preset.secLevel : defaultSecLevel);

    if (firstUserIsSysop) {
      // Promoted silently: express.e makes the sysop's account without a
      // word (processSysopLogon, 29039-29041). Sysop decision 2026-10-05.
      assignedSecLevel = 255; // Auto-promote first user to sysop
console.warn(`[SETUP] First user created: ${data.username} - Auto-assigned sysop level 255`);
    }

    // Create user in database
    const now = getSystemTime();
    const newUserId = await db.createUser({
      username: data.username,
      passwordHash: passwordHash,
      realname: data.username, // Can be changed later
      location: data.location,
      phone: data.phone,
      email: data.email,
      secLevel: assignedSecLevel,
      linesPerScreen: data.linesPerScreen || defaultLines,
      computer: data.computerType,
      ansi: ansiFlag,
      expert: expertFlag,
      screenClear: data.screenClear,
      // express.e:30270-30284 - USER_NEWMSG, USER_SCRNCLR on a Y answer, USER_BGFILECHECK per the node default.
      userFlags: newUserDefaultFlags(session, data.screenClear === true),
      availableForChat,
      quietNode,
      // The rejoin conference: users.autorejoin is the same number as the
      // record's confRJoin (conference.handler sets both on a join).
      autoRejoin: preset ? preset.confRJoin : autoRejoin,
      confAccess,
      newUser: !data.autoValidated, // Auto-validated users skip new user flags
      firstLogin: now,
      lastLogin: now,
      // Required fields with defaults
      uploads: 0,
      downloads: 0,
      bytesUpload: 0,
      bytesDownload: 0,
      ratio: preset ? preset.ratio : 0,
      ratioType: preset ? preset.ratioType : 0,
      // express.e:30447 timeTotal:=timeLimit
      timeTotal: presetTimeLimit,
      timeLimit: presetTimeLimit,
      ...(preset ? { confRJoin: preset.confRJoin } : {}),
      timeUsed: 0,
      chatLimit: defaultChatLimit,
      chatUsed: 0,
      calls: 1, // First call
      callsToday: 1,
      screenType,
      protocol,
      editor,
      zoomType: 'NONE',
      areaName: '',
      uuCP: false,
      topUploadCPS: 0,
      topDownloadCPS: 0,
      byteLimit: preset ? preset.byteLimit : 0,
      // WEB_: GDPR consent captured pre-registration (Phase 1).
      gdprConsentAt: data.gdprConsentAt,
      gdprNoticeVersion: data.gdprNoticeVersion,
      gdprConsentSource: data.gdprConsentSource
    });

    if (!newUserId) {
      // WEB_: express.e's saveAccount cannot fail visibly; a write this board could not make can.
      socket.emit('ansi-output', '\r\n\x1b[31mError creating account. Please try again.\x1b[0m\r\n');
      session.state = BBSState.AWAIT;
      return false;
    }

    // Trigger webhook for new user registration
    try {
      const { webhookService, WebhookTrigger } = await import('../../services/webhook.service');
      await webhookService.sendWebhook(WebhookTrigger.NEW_USER, {
        username: data.username,
        userId: newUserId,
        gdprConsented: !!data.gdprConsentAt,
        location: data.location,
        computerType: data.computerType
      });
    } catch (error) {
console.error('[Webhook] Error sending new user webhook:', error);
    }

    // Run EXECUTE_ON_NEW_USER command from bbsConfig.info (express.e:6726)
    try {
      await runExecuteOn('NEW_USER', session.nodeId || 1, {
        username: data.username,
        location: data.location
      });
    } catch (error) {
console.error('[NewUser] Error running EXECUTE_ON_NEW_USER:', error);
    }

    // MAIL_ON_NEW_USER tooltype - express.e:6728-6732
    try {
      await mailOnNewUser(data.username, data.location);
    } catch (error) {
console.error('[NewUser] Error running MAIL_ON_NEW_USER:', error);
    }

    // Fetch the full user object
    const newUser = await db.getUserByUsername(data.username);
    if (!newUser) {
      // WEB_: as above - no express.e counterpart.
      socket.emit('ansi-output', '\r\n\x1b[31mError fetching account. Please try again.\x1b[0m\r\n');
      session.state = BBSState.AWAIT;
      return false;
    }

    // DISK-BASED: Append to user.data/keys/misc for Amiga door compatibility.
    // Only BBS terminal registrations reach here — web/admin/test users must NOT be written.
    // express.e:11344 secBulletin is the chosen index into the board's computer
    // list (a blank answer leaves the record's 0); 30269 userKeys.baud:=onlineBaud.
    const { SOCKET_CONNECT_BAUD } = require('../../services/CallersLogManager');
    await db.appendUserToDisk(newUserId, {
      computerIndex: data.computerIndex ?? 0,
      connectBaud: SOCKET_CONNECT_BAUD,
    });

    // The slot is the one the record LANDED in (appendUserToDisk), which is
    // where every Conf.DB keeps this caller's per-conference record.
    const landed = await db.getUserById(newUserId);
    if (landed?.slotNumber) newUser.slotNumber = landed.slotNumber;

    // express.e:30121-30122 clearMsgPointers() + masterSavePointers(loggedOnUser).
    try {
      const { clearMsgPointers } = require('../../utils/message-pointers.util');
      await clearMsgPointers(String(newUserId));
    } catch (err) {
console.error('[NewUser] Could not start the conference records:', err);
    }

    // The caller stays REGISTERING until enterBoard(): the input dispatcher
    // (command.handler, `if (session.state === BBSState.REGISTERING)`) only
    // routes keystrokes to the questionnaire in that state. Flipping to
    // LOGGEDON here - which this did for one deploy - left a live caller at
    // "What is your real name:" with nothing reading his answer.
    session.user = newUser;

    // Initialize security
    const { initializeSecurity } = require('../../utils/acs.util');
    initializeSecurity(session);

    // Set user preferences
    // The record's rejoin (Preset.1's PRESET.CONFRJOIN, else 1 - 30446).
    session.confRJoin = (newUser as { confRJoin?: number }).confRJoin || 1;
    session.msgBaseRJoin = 1;
    session.cmdShortcuts = false;
    if (session.shortcuts) session.shortcuts.clear();

    // Clean up registration data (questionnaire path saves/restores it)

    // Send success to frontend

    // express.e:30124-30125 — show the sysop-configured JOINED screen
    // file (BBS:Screens/JOINED.txt) followed by doPause(). Audit A-13
    // flagged the previous shape (hardcoded "Welcome to the BBS!" emit)
    // as breaking customisation: every BBS got the same generic line
    // instead of the sysop's screen. With no JOINED file express.e says
    // nothing, and neither does this.
    return true;
  } catch (error) {
console.error(' [NEW USER] Account creation error:', error);
    // WEB_: as above - no express.e counterpart.
    socket.emit('ansi-output', '\r\n\x1b[31mError creating account. Please try again.\x1b[0m\r\n');
    session.state = BBSState.AWAIT;
    return false;
  }
}
