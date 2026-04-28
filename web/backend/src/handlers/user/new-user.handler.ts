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

import { Socket } from 'socket.io';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';
import { LoggedOnSubState, BBSState } from '../../constants/bbs-states';
import { displayScreen, doPause } from '../screen.handler';
import { config } from '../../config';
import { ConfigService } from '../../services/config.service';
import { userFileManager } from '../../services/UserFileManager';
import { userDatabaseManager } from '../../services/UserDatabaseManager';
import { emitUserLogin } from '../../services/bbs-event-emitter';
import { runExecuteOn } from '../../services/batch-scheduler';
import { mailOnNewUser } from '../../services/mail-notification.service';
import { getSystemTime } from '../../utils/date-time.util';
import { loadBBSConfig } from '../../services/bbs-config-file.service';
import { parseInfoFile } from '../../utils/info-file.util';

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
let newUserAccessPassword = '';
let autoValidationPassword = '';
let autoValidationSecLevel = 50;
let cachedComputerChoices: string[] | null = null;
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
  finalAnswerPath: string;
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
    newUserAccessPassword = deps.newUserPassword.trim();
  }
  if (typeof deps.autoValidationPassword === 'string') {
    autoValidationPassword = deps.autoValidationPassword.trim();
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

  // These screens are optional gates: their presence signals "block registration".
  // Missing is the common case, so suppress the "Screen not found" sysop alert.
  if (await showScreen(socket, session, screenConfig.NONEWUSERS, /* silent */ true)) {
    doPause(socket, session);
    await abortNewUser(socket, session, '\r\n\x1b[31mNew user registrations are currently closed.\x1b[0m\r\n');
    return;
  }

  if (await showScreen(socket, session, screenConfig.NONEWATBAUD, /* silent */ true)) {
    doPause(socket, session);
    await abortNewUser(socket, session, '\r\n\x1b[31mNew user registrations are blocked at this connection speed.\x1b[0m\r\n');
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
    autoValidationComplete: !autoValidationPassword,
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
  if (newUserAccessPassword) {
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
 * Load banned names from NamesNotAllowed.info tooltypes (NAME.1, NAME.2, ...).
 * express.e:11254-11266 — TOOLTYPE_NAMESNOTALLOWED, NAME.n tooltype entries.
 */
function loadBannedNames(): string[] {
  const banned: string[] = [];
  try {
    const baseDir = config.getConfig().dataDir;
    const candidates = [
      path.join(baseDir, 'NamesNotAllowed.info'),
      path.join(baseDir, '..', 'NamesNotAllowed.info')
    ];
    let infoPath: string | null = null;
    for (const p of candidates) {
      if (amigafs.existsSync(p)) {
        infoPath = p;
        break;
      }
    }
    if (!infoPath) return banned;
    const info = parseInfoFile(infoPath);
    for (const tt of info.tooltypes) {
      if (tt.commented) continue;
      if (/^NAME\.\d+$/i.test(tt.key) && tt.value) {
        banned.push(tt.value.toLowerCase());
      }
    }
  } catch (error) {
    console.warn('[NEW USER] Unable to load NamesNotAllowed.info:', error);
  }
  return banned;
}

/**
 * Check if a name contains wildcards (express.e:11226-11232 checkForAst).
 * Returns true if the name contains '*' (wildcard).
 */
function checkForAst(name: string): boolean {
  return name.includes('*');
}

/**
 * Check if a name is allowed (express.e:11234-11268 checkIfNameAllowed).
 * Returns null if allowed, or the rejection message string if disallowed.
 * Checks: empty, 'NEW', starts with 'ACS.', banned list.
 */
function checkIfNameAllowed(name: string): string | null {
  const upper = name.toUpperCase();
  // express.e:11239-11241
  if (name === '') return 'Username not allowed!!';
  // express.e:11244-11246
  if (upper === 'NEW') return 'Username not allowed!!';
  // express.e:11249-11251
  if (upper.startsWith('ACS.')) return 'Username not allowed!!';
  // express.e:11254-11266 — banned names from NamesNotAllowed.info
  const banned = loadBannedNames();
  for (const b of banned) {
    if (b === upper.toLowerCase()) return 'Username not allowed!!';
  }
  return null;
}

/**
 * Prompt for name - express.e:30141
 */
function promptForName(socket: Socket, session: any) {
  const prefill = session.newUserData?.username || '';
  // express.e:30141 - StringF(string,'\b\n\s ',namePrompt) where namePrompt defaults to 'Enter your Name: '
  socket.emit('ansi-output', `\r\nEnter your Name: `);
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
      socket.emit('ansi-output', '\r\nToo Many Errors, Goodbye!\r\n');
      setTimeout(() => socket.disconnect(), 500);
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
      socket.emit('ansi-output', '\r\nToo Many Errors, Goodbye!\r\n');
      setTimeout(() => socket.disconnect(), 500);
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
      socket.emit('ansi-output', '\r\nToo Many Errors, Goodbye!\r\n');
      setTimeout(() => socket.disconnect(), 500);
      return;
    }
    promptForName(socket, session);
    return;
  }

  // express.e:30169-30175 - checkForAst: no wildcards in name
  if (checkForAst(name)) {
    socket.emit('ansi-output', '\r\nNo wildcards allowed in a name.\r\n');
    // express.e:30174 JUMP floopc - counts toward retry limit
    session.newUserData.retryCount++;
    if (session.newUserData.retryCount >= 5) {
      socket.emit('ansi-output', '\r\nToo Many Errors, Goodbye!\r\n');
      setTimeout(() => socket.disconnect(), 500);
      return;
    }
    promptForName(socket, session);
    return;
  }

  // express.e:30169 - aePuts('\b\nChecking for duplicate name...')
  socket.emit('ansi-output', '\r\nChecking for duplicate name...');

  const existingUser = await db.getUserByUsername(name);
  if (existingUser) {
    // express.e:30179 - aePuts('Already in use!, try another.\b\n')
    socket.emit('ansi-output', 'Already in use!, try another.\r\n');
    // express.e:30180 JUMP floopc - counts toward retry limit
    session.newUserData.retryCount++;
    if (session.newUserData.retryCount >= 5) {
      socket.emit('ansi-output', '\r\nToo Many Errors, Goodbye!\r\n');
      setTimeout(() => socket.disconnect(), 500);
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
  // WEB_: label changed from "City, State" to "Group Affiliation" for scene BBS context.
  // Backend field remains `location` to preserve door compatibility.
  socket.emit('ansi-output', '\r\nGroup Affiliation: ');
  session.inputBuffer = '';
}

/**
 * Handle location input - express.e:30172-30179
 * WEB_: blank no longer retreats to name; field is required and re-prompts.
 */
export async function handleLocationInput(socket: Socket, session: any, input: string) {
  const location = input.trim();

  if (location === '') {
    socket.emit('ansi-output', '\r\nGroup Affiliation is required.\r\n');
    promptForLocation(socket, session);
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
  socket.emit('ansi-output', '\r\nPhone Number (Enter to skip): ');
  session.inputBuffer = '';
}

/**
 * Handle phone input - express.e:30181-30189
 * WEB_: phone is optional; blank is accepted and advances to email.
 * Diverges from express.e:30186 retreat-to-location behavior.
 */
export async function handlePhoneInput(socket: Socket, session: any, input: string) {
  session.newUserData.phone = input.trim();
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
 * Handle email input - express.e:30191-30199
 * WEB_: blank no longer retreats to phone; field is required and re-prompts.
 */
export async function handleEmailInput(socket: Socket, session: any, input: string) {
  const email = input.trim();

  if (email === '') {
    socket.emit('ansi-output', '\r\nE-Mail Address is required.\r\n');
    promptForEmail(socket, session);
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    socket.emit('ansi-output', '\r\nInvalid email format. Please include @ and domain.\r\n\r\n');
    promptForEmail(socket, session);
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

  if (!attempt || attempt !== newUserAccessPassword) {
    session.newUserData.accessPasswordTries++;
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid Password\x1b[0m\r\n');

    if (session.newUserData.accessPasswordTries > 2) {
      // express.e:29634: '\b\nToo Many Errors, Goodbye!\b\n' — plain text, no color
      await abortNewUser(socket, session, '\r\nToo Many Errors, Goodbye!\r\n');
      return;
    }

    promptForAccessPassword(socket, session);
    return;
  }

  setPasswordMask(socket, session, false);
  socket.emit('ansi-output', '\x1b[32mCorrect\x1b[0m\r\n');
  session.newUserData.accessPasswordTries = 0;
  await beginRegistrationPrompts(socket, session, session.newUserData.username || 'NEW');
}

async function beginRegistrationPrompts(socket: Socket, session: any, username: string) {
  // express.e:30128+ doNewUser() - show intro screens with proper pause handling
  // Note: "Now, part one of our questioning" comes from SCRIPT questionnaire (join.txt), not core flow

  if (!session.newUserData.introShown) {
    // Clear screen before showing intro screens (express.e clears before JOIN/GUESTLOGON)
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
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
      // Placeholder if missing
      socket.emit('ansi-output', '\r\n\x1b[1;33mWelcome to AmiExpress!\x1b[0m\r\n');
      socket.emit('ansi-output', 'Guest access is restricted to browsing only.\r\n');
      doPause(socket, session, () => continueIntroFlow(socket, session, 'join'));
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
        // Placeholder if missing
        socket.emit('ansi-output', '\r\n\x1b[1;32mJoining AmiExpress...\x1b[0m\r\n');
        socket.emit('ansi-output', 'Please answer the following questions to register.\r\n');
        doPause(socket, session, () => continueIntroFlow(socket, session, 'name'));
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
  // Authentic AmiExpress/modem behaviour: line-drop is announced as NO CARRIER.
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
  socket.emit('ansi-output', '\r\nEnter the auto-validation password (if known): ');
}

async function getComputerChoices(): Promise<string[]> {
  if (cachedComputerChoices && cachedComputerChoices.length > 0) {
    return cachedComputerChoices;
  }

  let choices: string[] = [];
  try {
    if (db && typeof db.getConfigRepository === 'function') {
      const repo = db.getConfigRepository();
      if (repo && typeof repo.getAllComputerTypes === 'function') {
        const records = repo.getAllComputerTypes();
        if (Array.isArray(records) && records.length > 0) {
          choices = records
            .filter((c: any) => c.enabled !== false)
            .sort((a: any, b: any) => a.computer_number - b.computer_number)
            .map((c: any) => c.computer_name);
        }
      }
    }
  } catch (error) {
console.warn('[NEW USER] Unable to load computer types from repository:', error);
  }

  if (choices.length === 0) {
    choices = [
      'AMiGA 500',
      'AMiGA 2000',
      'AMiGA 3000',
      'AMiGA 4000',
      'AMiGA 1200',
      'PC',
      'mAC',
      'OTHER!'
    ];
  }

  cachedComputerChoices = choices;
  return choices;
}

/**
 * Prompt for password - express.e:30203
 */
function promptForPassword(socket: Socket, session: any) {
  setPasswordMask(socket, session, true);
  socket.emit('ansi-output', '\r\nEnter a PassWord: ');
}

function getSecurityPolicy(): SecurityPolicy {
  const defaults: SecurityPolicy = { minLength: 4, minStrength: 0, strictPolicy: false };
  try {
    if (db && typeof db.getConfigRepository === 'function') {
      const repo = db.getConfigRepository();
      if (repo && typeof repo.getSystemConfig === 'function') {
        const sys = repo.getSystemConfig();
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
    socket.emit('ansi-output', '\r\nPassword is required.\r\n');
    promptForPassword(socket, session);
    return;
  }

  const policy = getSecurityPolicy();
  if (password.length < policy.minLength) {
    socket.emit('ansi-output', `\r\nPassword length must be at least ${policy.minLength} chars, try again..\r\n`);
    promptForPassword(socket, session);
    return;
  }

  if (!passwordMeetsStrength(password, policy.minStrength)) {
    socket.emit('ansi-output', `\r\nPassword must have at least ${policy.minStrength} of these:\r\n  upper case,lower case, numeric and symbols, try again..\r\n`);
    promptForPassword(socket, session);
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
  if (confirmation !== session.newUserData.password) {
    socket.emit('ansi-output', '\r\nPasswords do not match, try again..\r\n');
    session.subState = LoggedOnSubState.NEW_USER_PASSWORD;
    promptForPassword(socket, session);
    return;
  }

  // Password confirmed, move to lines per screen
  setPasswordMask(socket, session, false);
  socket.emit('ansi-output', '\r\n');
  session.subState = LoggedOnSubState.NEW_USER_LINES;
  promptForLines(socket, session);
}

/**
 * Prompt for lines per screen - express.e:11303-11306
 */
function promptForLines(socket: Socket, session: any) {
  if (!session.newUserData.linesCountdownShown) {
    session.newUserData.linesCountdownShown = true;
    for (let count = 70; count >= 2; count--) {
      socket.emit('ansi-output', ` ${count}\r\n`);
    }
  }
  socket.emit('ansi-output', '\r\nEnter the number you see at the top of your screen (0 or Enter for Auto): ');
  session.inputBuffer = '';
}

/**
 * Handle lines input - express.e:30236-30237
 */
export async function handleLinesInput(socket: Socket, session: any, input: string) {
  const val = input.trim();
  if (val === '') {
    // Blank line - return RESULT_SUCCESS (keep current or default)
    session.newUserData.linesPerScreen = 0;
  } else {
    const lines = parseInt(val) || 0;
    session.newUserData.linesPerScreen = lines;
  }
  
  socket.emit('ansi-output', '\r\n');
  session.subState = LoggedOnSubState.NEW_USER_COMPUTER;
  await promptForComputer(socket, session);
}

/**
 * Prompt for computer type - express.e:11315-11325
 */
async function promptForComputer(socket: Socket, session: any) {
  const choices = await getComputerChoices();
  session.newUserData.computerChoices = choices;

  // express.e:11315 - FOR stat:=0 TO computerTypes.count()-1 STEP 2
  for (let i = 0; i < choices.length; i += 2) {
    // StringF(tempStr,'\d[2]> \l\s[34] ',stat+1,computerTypes.item(stat))
    const left = `${String(i + 1).padStart(2, ' ')}> ${choices[i].padEnd(34, ' ')}`;
    let right = '';
    if (i + 1 < choices.length) {
      // StringF(tempStr,'\d[2]> \l\s[34]\b\n',stat+2,computerTypes.item(stat+1))
      right = `${String(i + 2).padStart(2, ' ')}> ${choices[i+1].padEnd(34, ' ')}\r\n`;
    } else {
      right = '\r\n';
    }
    socket.emit('ansi-output', `${left}${right}`);
  }
  socket.emit('ansi-output', '\r\nChoose computer type (Enter for default): ');
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
      await promptForComputer(socket, session);
      return;
    }
    session.newUserData.computerType = choices[numericChoice - 1];
    // express.e:11333 - loggedOnUser.secBulletin:=stat-1
    session.newUserData.computerIndex = numericChoice - 1;
  }

  socket.emit('ansi-output', '\r\n');
  session.subState = LoggedOnSubState.NEW_USER_SCREEN_CLEAR;
  promptForScreenClear(socket, session);
}

/**
 * Prompt for screen clear preference - express.e:30250
 */
function promptForScreenClear(socket: Socket, session: any) {
  socket.emit('ansi-output', 'You want Screen Clears after Messages ? (y/N) ');
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

  // Format matches express.e StringF calls 30264-30281
  socket.emit('ansi-output', `Handle: ${data.username}\r\n`);
  socket.emit('ansi-output', `Group Aff: ${data.location}\r\n`);
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
  if (autoValidationPassword && !session.newUserData.autoValidationComplete) {
    session.subState = LoggedOnSubState.NEW_USER_AUTOVAL;
    promptForAutoValidation(socket, session);
    return;
  }

  const questionnaireStarted = await beginQuestionnaire(socket, session);
  if (questionnaireStarted) {
    return;
  }

  await createAccount(socket, session);
}

/**
 * Handle confirmation - create account or go back
 * express.e:30109 - After doNewUser(), calls doNewUserQuestions() for questionnaire
 */
export async function handleConfirmInput(socket: Socket, session: any, input: string) {
  const response = input.trim().toUpperCase();

  if (response === 'N' || response === 'NO') {
    // Go back to name entry
    socket.emit('ansi-output', '\r\n\x1b[33mStarting over...\x1b[0m\r\n\r\n');
    session.subState = LoggedOnSubState.NEW_USER_NAME;
    session.newUserData.linesCountdownShown = false;
    promptForName(socket, session);
    return;
  }

  // express.e flow: after confirmation, go directly to questionnaire
  // The script file (e.g., Node1/script57600) contains realname/sexage/tricky prompts
  // We don't duplicate those prompts in code
  socket.emit('ansi-output', '\r\n');
  await continueRegistrationFlow(socket, session);
}

export async function handleRealnameInput(socket: Socket, session: any, input: string) {
  const realname = input.trim();
  session.newUserData.realname = realname;
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'What is your sex,age: ');
  session.subState = LoggedOnSubState.NEW_USER_SEXAGE;
  session.inputBuffer = '';
}

export async function handleSexAgeInput(socket: Socket, session: any, input: string) {
  const sexAge = input.trim();
  session.newUserData.sexAge = sexAge;
  session.inputBuffer = '';
  socket.emit('ansi-output', '\r\n\r\nNow to the tricky part... . .\r\n\r\n');

  // After sex/age, proceed to questionnaire or account creation
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

  if (attempt.toUpperCase() === autoValidationPassword.toUpperCase()) {
    data.autoValidated = true;
    data.autoValidationComplete = true;
    socket.emit('ansi-output', '\r\n\x1b[32mAuto-validation password accepted.\x1b[0m\r\n');
    setPasswordMask(socket, session, false);
    await continueRegistrationFlow(socket, session);
    return;
  }

  data.autoValidationTries--;
  if (data.autoValidationTries > 0) {
    socket.emit('ansi-output', '\r\n\x1b[33mIncorrect password, try again or leave blank if not known.\x1b[0m\r\n\r\n');
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
      socket.emit('ansi-output', '\r\nIs the above Correct? (Y/n) ');
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
  // Save questionnaire data BEFORE createAccount deletes session.newUserData
  const savedQuestionnaire = questionnaire;
  const savedNewUserData = session.newUserData;
  // Create account first to get the slot number (express.e:30054-30060 creates user before answers)
  await createAccount(socket, session);
  // Now persist questionnaire answers with the correct slot number
  // The slot number is the user's position in USER.DATA (0-indexed)
  const slotNumber = userDatabaseManager.getUserCount() - 1;
  // Temporarily restore newUserData for persistQuestionnaireAnswers
  session.newUserData = savedNewUserData;
  await persistQuestionnaireAnswers(session, slotNumber);
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
  const answersPath = path.join(nodeDir, 'Answers');

  session.newUserData.questionnaire = {
    steps,
    currentIndex: 0,
    answers: [],
    scriptPath,
    tempAnswerPath: tempPath,
    finalAnswerPath: answersPath,
    transcript: []
  };

  socket.emit('ansi-output', '\r\n');
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
      socket.emit('ansi-output', `${step.content}\r\n`);
      continue;
    }
    questionnaire.awaitingPromptIndex = questionnaire.currentIndex - 1;
    socket.emit('ansi-output', `${step.content} `);
    session.inputBuffer = '';
    return;
  }

  session.subState = LoggedOnSubState.NEW_USER_SCRIPT_CONFIRM;
  socket.emit('ansi-output', '\r\nIs the above Correct? (Y/n) ');
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

      if (line.includes('~')) {
        const prompt = line.replace(/~/g, '').trimEnd();
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

  const now = getSystemTime();
  // Format: MM-DD-YY (HH:MM:SS) [slotNumber] username (CONNECT baudRate) location
  // Per express.e:30354 - uses loggedOnUser.slotNumber (user's slot in USER.DATA)
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const dateStr = `${month}-${day}-${year}`;
  const timeStr = `(${hours}:${minutes}:${seconds})`;
  const baudRate = session.connectionBaud || '115200';
  const header: string[] = [
    '**************************************************************',
    `${dateStr} ${timeStr} [${slotNumber}] ${session.newUserData.username || 'NEW'} (CONNECT ${baudRate}) ${session.newUserData.location || 'Unknown'}`,
    ''
  ];

  for (const entry of questionnaire.transcript) {
    header.push(entry);
  }
  header.push('');

  // Use Unix line endings (LF) to match original AmiExpress format
  const content = header.join('\n');

  try {
    amigafs.writeFileSync(questionnaire.tempAnswerPath, `${content}\n`, 'utf8');
  } catch (error) {
console.warn('[NEW USER] Failed to write TempAns file:', error);
  }

  try {
    amigafs.appendFileSync(questionnaire.finalAnswerPath, `${content}\n`, 'utf8');
  } catch (error) {
console.warn('[NEW USER] Failed to append Answers file:', error);
  }
}

function getNodeDirectory(session: any): string {
  const baseDir = config.getConfig().dataDir;
  const nodeIndex = Math.max(0, (session.nodeId || 1) - 1);
  const preferred = path.join(baseDir, `Node${nodeIndex}`);
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
      confAccess: systemConfig.new_user_conf_access,
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
async function createAccount(socket: Socket, session: any) {
  const data = session.newUserData;
  setPasswordMask(socket, session, false);

  try {
    socket.emit('ansi-output', '\r\n\x1b[32mCreating your account...\x1b[0m\r\n');

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
    const confAccess = defaults?.confAccess || 'XXX';
    const availableForChat = defaults?.availableForChat !== false;
    const quietNode = defaults?.quietNode || false;
    const autoRejoin = defaults?.autoRejoin !== false ? 1 : 0;

    // Check if this is the first user (should become sysop)
    const firstUserIsSysop = (global as any).firstUserIsSysop === true;
    let assignedSecLevel = data.autoValidated ? autoValidationSecLevel : defaultSecLevel;

    if (firstUserIsSysop) {
      assignedSecLevel = 255; // Auto-promote first user to sysop
      socket.emit('ansi-output', '\r\n\x1b[33;1m*** FIRST USER DETECTED ***\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[33;1mYou have been automatically assigned System Operator status (Level 255)\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[33;1mWelcome, Sysop!\x1b[0m\r\n\r\n');
console.log(`[SETUP] First user created: ${data.username} - Auto-assigned sysop level 255`);
      // Clear the flag so subsequent users get normal security level
      (global as any).firstUserIsSysop = false;
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
      availableForChat,
      quietNode,
      autoRejoin,
      confAccess,
      newUser: !data.autoValidated, // Auto-validated users skip new user flags
      firstLogin: now,
      lastLogin: now,
      // Required fields with defaults
      uploads: 0,
      downloads: 0,
      bytesUpload: 0,
      bytesDownload: 0,
      ratio: 0,
      ratioType: 0,
      timeTotal: 0,
      timeLimit: defaultTimeLimit,
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
      byteLimit: 0,
      // WEB_: GDPR consent captured pre-registration (Phase 1).
      gdprConsentAt: data.gdprConsentAt,
      gdprNoticeVersion: data.gdprNoticeVersion,
      gdprConsentSource: data.gdprConsentSource
    });

    if (!newUserId) {
      socket.emit('ansi-output', '\r\n\x1b[31mError creating account. Please try again.\x1b[0m\r\n');
      session.state = BBSState.AWAIT;
      return;
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
      socket.emit('ansi-output', '\r\n\x1b[31mError fetching account. Please try again.\x1b[0m\r\n');
      session.state = BBSState.AWAIT;
      return;
    }

    // DISK-BASED: Append to user.data/keys/misc for Amiga door compatibility.
    // Only BBS terminal registrations reach here — web/admin/test users must NOT be written.
    await db.appendUserToDisk(newUserId);

    socket.emit('ansi-output', '\x1b[32mAccount created successfully!\x1b[0m\r\n\r\n');

    // Log them in automatically
    session.state = BBSState.LOGGEDON;
    session.subState = LoggedOnSubState.DISPLAY_BULL;
    session.user = newUser;

    // Initialize security
    const { initializeSecurity } = require('../../utils/acs.util');
    initializeSecurity(session);

    // Set user preferences
    session.confRJoin = 1; // Default to General conference
    session.msgBaseRJoin = 1;
    session.cmdShortcuts = false;
    if (session.shortcuts) session.shortcuts.clear();

    // Clean up registration data (questionnaire path saves/restores it)
    delete session.newUserData;

    // Send success to frontend
    socket.emit('login-success', {
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

    // Show welcome screen and bulletins
    socket.emit('ansi-output', '\r\n\x1b[36mWelcome to the BBS!\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m\r\n');
  } catch (error) {
console.error(' [NEW USER] Account creation error:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError creating account. Please try again.\x1b[0m\r\n');
    session.state = BBSState.AWAIT;
  }
}
