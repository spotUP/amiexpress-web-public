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
import * as fs from 'fs';
import * as path from 'path';
import { LoggedOnSubState, BBSState } from '../constants/bbs-states';
import { displayScreen, doPause } from './screen.handler';
import { config } from '../config';
import { ConfigService } from '../services/config.service';

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

  if (await showScreen(socket, session, screenConfig.NONEWUSERS)) {
    doPause(socket, session);
    await abortNewUser(socket, session, '\r\n\x1b[31mNew user registrations are currently closed.\x1b[0m\r\n');
    return;
  }

  if (await showScreen(socket, session, screenConfig.NONEWATBAUD)) {
    doPause(socket, session);
    await abortNewUser(socket, session, '\r\n\x1b[31mNew user registrations are blocked at this connection speed.\x1b[0m\r\n');
    return;
  }

  // express.e:30047 - Create new account structure
  // Initialize registration data
  session.newUserData = {
    username: '', // Always re-prompt for handle like express.e
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
    computerChoices: undefined
  };

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
 * Prompt for name - express.e:30115-30168 (jLoop1)
 */
function promptForName(socket: Socket, session: any) {
  socket.emit('ansi-output', `\r\nEnter your Name: `);
}

/**
 * Handle name input - express.e:30115-30168
 */
export async function handleNameInput(socket: Socket, session: any, input: string) {
  const name = input.trim();
  session.newUserData.retryCount = session.newUserData.retryCount || 0;

  // express.e:30138-30145 - Blank line counts as error
  if (name === '') {
    session.newUserData.retryCount++;
    console.log(`[NEW USER] Retry count: ${session.newUserData.retryCount}/5 (empty name)`);

    // express.e:30142-30145 - Too many errors, disconnect
    if (session.newUserData.retryCount > 5) {
      console.log('[NEW USER] Too many errors, disconnecting');
      socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
      setTimeout(() => socket.disconnect(), 500);
      return;
    }
    socket.emit('ansi-output', '\r\n');
    promptForName(socket, session);
    return;
  }

  // express.e:30126-30129 - Check for single character
  if (name.length === 1) {
    socket.emit('ansi-output', '\r\n\x1b[31mGet REAL!!  One Character???\x1b[0m\r\n');
    promptForName(socket, session);
    return;
  }

  // express.e:30135-30144 - Check for duplicate name
  socket.emit('ansi-output', '\r\nChecking for duplicate name...');

  const existingUser = await db.getUserByUsername(name);
  if (existingUser) {
    socket.emit('ansi-output', '\x1b[31mAlready in use!, try another.\x1b[0m\r\n');
    promptForName(socket, session);
    return;
  }

  socket.emit('ansi-output', '\x1b[32mOk!\x1b[0m\r\n\r\n');

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
  socket.emit('ansi-output', 'City, State: ');
}

/**
 * Handle location input - express.e:30172-30179
 */
export async function handleLocationInput(socket: Socket, session: any, input: string) {
  const location = input.trim();

  // Blank line - go back to name
  if (location === '') {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.NEW_USER_NAME;
    promptForName(socket, session);
    return;
  }

  session.newUserData.location = location;
  socket.emit('ansi-output', '\r\n');
  session.subState = LoggedOnSubState.NEW_USER_PHONE;
  promptForPhone(socket, session);
}

/**
 * Prompt for phone - express.e:30181
 */
function promptForPhone(socket: Socket, session: any) {
  socket.emit('ansi-output', 'Phone Number: ');
}

/**
 * Handle phone input - express.e:30181-30189
 */
export async function handlePhoneInput(socket: Socket, session: any, input: string) {
  const phone = input.trim();

  // Blank line - go back to location
  if (phone === '') {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.NEW_USER_LOCATION;
    promptForLocation(socket, session);
    return;
  }

  session.newUserData.phone = phone;
  socket.emit('ansi-output', '\r\n');
  session.subState = LoggedOnSubState.NEW_USER_EMAIL;
  promptForEmail(socket, session);
}

/**
 * Prompt for email - express.e:30191
 */
function promptForEmail(socket: Socket, session: any) {
  socket.emit('ansi-output', 'E-Mail Address: ');
}

/**
 * Handle email input - express.e:30191-30199
 */
export async function handleEmailInput(socket: Socket, session: any, input: string) {
  const email = input.trim();

  // Blank line - go back to phone
  if (email === '') {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.NEW_USER_PHONE;
    promptForPhone(socket, session);
    return;
  }

  // Validate email format
  // Must contain @ with local part and domain with TLD
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid email format. Please include @ and domain (e.g., user@example.com)\x1b[0m\r\n\r\n');
    promptForEmail(socket, session);
    return;
  }

  session.newUserData.email = email;
  socket.emit('ansi-output', '\r\n');
  session.subState = LoggedOnSubState.NEW_USER_PASSWORD;
  promptForPassword(socket, session);
}

/**
 * Prompt for pre-screen new user password (express.e:30008-30042)
 */
function promptForAccessPassword(socket: Socket, session: any) {
  session.inputBuffer = '';
  setPasswordMask(socket, session, true);
  socket.emit('ansi-output', 'Enter New User Password: ');
}

export async function handleAccessPasswordInput(socket: Socket, session: any, input: string) {
  const attempt = input.trim();
  session.newUserData.accessPasswordTries = session.newUserData.accessPasswordTries || 0;

  if (!attempt || attempt !== newUserAccessPassword) {
    session.newUserData.accessPasswordTries++;
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid Password\x1b[0m\r\n');

    if (session.newUserData.accessPasswordTries > 2) {
      await abortNewUser(socket, session, '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
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
  if (!session.newUserData.introShown) {
    if (await showScreen(socket, session, screenConfig.GUESTLOGON)) {
      doPause(socket, session);
    }
    if (await showScreen(socket, session, screenConfig.JOIN)) {
      doPause(socket, session);
    }
    socket.emit('ansi-output', '\r\n\x1b[36m-= New User Account Creation =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', 'Blank line to retreat\r\n\r\n');
    session.newUserData.introShown = true;
  }

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

  // Always ask for handle first (express.e jLoop1)
  session.subState = LoggedOnSubState.NEW_USER_NAME;
  promptForName(socket, session);
}

async function showScreen(socket: Socket, session: any, screenName?: string): Promise<boolean> {
  if (!screenName) return false;
  try {
    return await displayScreen(socket, session, screenName);
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
  setTimeout(() => socket.disconnect(), 500);
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
  socket.emit('ansi-output', 'Enter the auto-validation password (if known): ');
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
  socket.emit('ansi-output', 'Enter a PassWord: ');
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
 */
export async function handlePasswordInput(socket: Socket, session: any, input: string) {
  const password = input.trim();

  // Blank line - go back to email
  if (password === '') {
    socket.emit('ansi-output', '\r\n');
    setPasswordMask(socket, session, false);
    session.subState = LoggedOnSubState.NEW_USER_EMAIL;
    promptForEmail(socket, session);
    return;
  }

  const policy = getSecurityPolicy();
  if (password.length < policy.minLength) {
    socket.emit('ansi-output', `\r\n\x1b[31mPassword too short, must be at least ${policy.minLength} characters.\x1b[0m\r\n\r\n`);
    promptForPassword(socket, session);
    return;
  }

  if (!passwordMeetsStrength(password, policy.minStrength)) {
    socket.emit('ansi-output', '\r\n\x1b[31mPassword too weak. Use mixed case, numbers, and symbols.\x1b[0m\r\n\r\n');
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

  // Check if passwords match
  if (confirmation !== session.newUserData.password) {
    socket.emit('ansi-output', '\r\n\x1b[31mPasswords do not match, try again..\x1b[0m\r\n\r\n');
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
 * Prompt for lines per screen - express.e:30236-30237
 */
function promptForLines(socket: Socket, session: any) {
  if (!session.newUserData.linesCountdownShown) {
    session.newUserData.linesCountdownShown = true;
    for (let count = 70; count >= 2; count--) {
      socket.emit('ansi-output', ` ${count}\r\n`);
    }
    socket.emit('ansi-output', '\r\n');
  }
  socket.emit('ansi-output', 'Enter the number you see at the top of your screen (or 0 for Auto): ');
}

/**
 * Handle lines input - express.e:30236-30237
 */
export async function handleLinesInput(socket: Socket, session: any, input: string) {
  const lines = parseInt(input.trim()) || 0;

  session.newUserData.linesPerScreen = lines;
  socket.emit('ansi-output', '\r\n');
  session.subState = LoggedOnSubState.NEW_USER_COMPUTER;
  await promptForComputer(socket, session);
}

/**
 * Prompt for computer type - express.e:30238-30239
 */
async function promptForComputer(socket: Socket, session: any) {
  const choices = await getComputerChoices();
  session.newUserData.computerChoices = choices;

  socket.emit('ansi-output', '\r\n');
  for (let i = 0; i < choices.length; i += 2) {
    const leftIndex = i + 1;
    const rightIndex = i + 2;
    const left = `${String(leftIndex).padStart(2, ' ')} > ${choices[i]}`.padEnd(38, ' ');
    const right = rightIndex <= choices.length ? `${String(rightIndex).padStart(2, ' ')} > ${choices[rightIndex - 1]}` : '';
    socket.emit('ansi-output', `${left}${right}\r\n`);
  }
  socket.emit('ansi-output', '\r\nChoose computer type: ');
}

/**
 * Handle computer input - express.e:30238-30239
 */
export async function handleComputerInput(socket: Socket, session: any, input: string) {
  const selection = input.trim();
  const choices = session.newUserData.computerChoices || await getComputerChoices();

  if (selection === '') {
    session.newUserData.computerType = session.newUserData.computerType || choices[0] || 'AMiGA 500';
  } else {
    const numericChoice = parseInt(selection, 10);
    if (Number.isNaN(numericChoice) || numericChoice < 1 || numericChoice > choices.length) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid choice, try again.\x1b[0m\r\n\r\n');
      await promptForComputer(socket, session);
      return;
    }
    session.newUserData.computerType = choices[numericChoice - 1];
  }

  session.subState = LoggedOnSubState.NEW_USER_SCREEN_CLEAR;
  promptForScreenClear(socket, session);
}

/**
 * Prompt for screen clear preference - express.e:30250-30260
 */
function promptForScreenClear(socket: Socket, session: any) {
  socket.emit('ansi-output', '\r\nYou want Screen Clears after Messages ? ');
}

/**
 * Handle screen clear input - express.e:30250-30260
 */
export async function handleScreenClearInput(socket: Socket, session: any, input: string) {
  const response = input.trim().toUpperCase();

  // reference-board default: No; only Y/YES enables
  session.newUserData.screenClear = response === 'Y' || response === 'YES';

  if (session.newUserData.screenClear) {
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

  socket.emit('ansi-output', `Handle: ${data.username}\r\n`);
  socket.emit('ansi-output', `City, St.: ${data.location}\r\n`);
  socket.emit('ansi-output', `Phone Num: ${data.phone}\r\n`);
  socket.emit('ansi-output', `E-Mail   : ${data.email}\r\n`);
  socket.emit('ansi-output', `Num Lines: ${data.linesPerScreen === 0 ? 'Auto' : data.linesPerScreen}\r\n`);
  socket.emit('ansi-output', `PassWord : ENCRYPTED\r\n`);
  socket.emit('ansi-output', `Computer : ${data.computerType || 'AMiGA 500'}\r\n`);
  socket.emit('ansi-output', `Scrn Clr : ${data.screenClear ? 'YES' : 'NO'}\r\n\r\n`);
  socket.emit('ansi-output', 'Is this Information Correct? (Y/n) ');
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

  // Proceed to real name / email / sex,age prompts per reference-board sequence
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'What is your real name: ');
  session.subState = LoggedOnSubState.NEW_USER_REALNAME;
  session.inputBuffer = '';
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
  await persistQuestionnaireAnswers(session);
  session.newUserData.questionnaire = undefined;
  await createAccount(socket, session);
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
      socket.emit('ansi-output', `${step.content}\r\n\r\n`);
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
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  try {
    const entries = fs.readdirSync(nodeDir);
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
    const raw = fs.readFileSync(scriptPath, 'utf8');
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

async function persistQuestionnaireAnswers(session: any): Promise<void> {
  const questionnaire: QuestionnaireState | undefined = session.newUserData.questionnaire;
  if (!questionnaire) return;

  const nodeDir = getNodeDirectory(session);
  if (!fs.existsSync(nodeDir)) {
    fs.mkdirSync(nodeDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];
  const header: string[] = [
    '**************************************************************',
    `${dateStr} ${timeStr} [${session.nodeId || 0}] ${session.newUserData.username || 'NEW'} (${session.newUserData.location || 'Unknown'})`,
    ''
  ];

  for (const entry of questionnaire.transcript) {
    header.push(entry);
  }
  header.push('');

  const content = header.join('\r\n');

  try {
    fs.writeFileSync(questionnaire.tempAnswerPath, `${content}\r\n`, 'utf8');
  } catch (error) {
    console.warn('[NEW USER] Failed to write TempAns file:', error);
  }

  try {
    fs.appendFileSync(questionnaire.finalAnswerPath, `${content}\r\n`, 'utf8');
  } catch (error) {
    console.warn('[NEW USER] Failed to append Answers file:', error);
  }
}

function getNodeDirectory(session: any): string {
  const baseDir = config.getConfig().dataDir;
  const nodeIndex = Math.max(0, (session.nodeId || 1) - 1);
  const preferred = path.join(baseDir, `Node${nodeIndex}`);
  if (fs.existsSync(preferred)) {
    return preferred;
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

    // Create user in database
    const now = new Date();
    const newUserId = await db.createUser({
      username: data.username,
      passwordHash: passwordHash,
      realname: data.username, // Can be changed later
      location: data.location,
      phone: data.phone,
      email: data.email,
      secLevel: data.autoValidated ? autoValidationSecLevel : defaultSecLevel,
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
      byteLimit: 0
    });

    if (!newUserId) {
      socket.emit('ansi-output', '\r\n\x1b[31mError creating account. Please try again.\x1b[0m\r\n');
      session.state = BBSState.AWAIT;
      return;
    }

    // Trigger webhook for new user registration
    try {
      const { webhookService, WebhookTrigger } = await import('../services/webhook.service');
      await webhookService.sendWebhook(WebhookTrigger.NEW_USER, {
        username: data.username,
        userId: newUserId,
        location: data.location,
        computerType: data.computerType
      });
    } catch (error) {
      console.error('[Webhook] Error sending new user webhook:', error);
    }

    // Fetch the full user object
    const newUser = await db.getUserByUsername(data.username);
    if (!newUser) {
      socket.emit('ansi-output', '\r\n\x1b[31mError fetching account. Please try again.\x1b[0m\r\n');
      session.state = BBSState.AWAIT;
      return;
    }

    socket.emit('ansi-output', '\x1b[32mAccount created successfully!\x1b[0m\r\n\r\n');

    // Log them in automatically
    session.state = BBSState.LOGGEDON;
    session.subState = LoggedOnSubState.DISPLAY_BULL;
    session.user = newUser;

    // Initialize security
    const { initializeSecurity } = require('../index');
    if (initializeSecurity) {
      initializeSecurity(session);
    }

    // Set user preferences
    session.confRJoin = 1; // Default to General conference
    session.msgBaseRJoin = 1;
    session.cmdShortcuts = false;
    if (session.shortcuts) session.shortcuts.clear();

    // Clean up registration data
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

    // Show welcome screen and bulletins
    socket.emit('ansi-output', '\r\n\x1b[36mWelcome to the BBS!\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m\r\n');
  } catch (error) {
    console.error(' [NEW USER] Account creation error:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError creating account. Please try again.\x1b[0m\r\n');
    session.state = BBSState.AWAIT;
  }
}
