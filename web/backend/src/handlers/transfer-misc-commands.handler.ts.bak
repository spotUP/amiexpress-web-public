/**
 * Transfer & Miscellaneous Commands Handler
 * Handles file transfer variants and miscellaneous commands
 * 1:1 port from AmiExpress express.e commands
 */

import { BBSSession, LoggedOnSubState } from '../index';
import { checkSecurity } from '../utils/acs.util';
import { ACSCode } from '../constants/acs-codes';
import { EnvStat } from '../constants/env-codes';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';

// Dependencies (injected)
let _setEnvStat: any;
let _displayUploadInterface: any;
let _displayDownloadInterface: any;
let _fileAreas: any[] = [];
let _getActiveVoteTopics: any;
let _getVoteTopic: any;
let _getVoteQuestions: any;
let _getVoteAnswers: any;
let _hasUserVoted: any;
let _submitVote: any;
let _getVoteStatistics: any;
let _createVoteTopic: any;
let _createVoteQuestion: any;
let _createVoteAnswer: any;
let _deleteVoteTopic: any;
let _getNextTopicNumber: any;

/**
 * Dependency injection setter
 */
export function setTransferMiscCommandsDependencies(deps: {
  setEnvStat: any;
  displayUploadInterface: any;
  displayDownloadInterface: any;
  fileAreas: any[];
  getActiveVoteTopics: any;
  getVoteTopic: any;
  getVoteQuestions: any;
  getVoteAnswers: any;
  hasUserVoted: any;
  submitVote: any;
  getVoteStatistics: any;
  createVoteTopic: any;
  createVoteQuestion: any;
  createVoteAnswer: any;
  deleteVoteTopic: any;
  getNextTopicNumber: any;
}) {
  _setEnvStat = deps.setEnvStat;
  _displayUploadInterface = deps.displayUploadInterface;
  _displayDownloadInterface = deps.displayDownloadInterface;
  _fileAreas = deps.fileAreas;
  _getActiveVoteTopics = deps.getActiveVoteTopics;
  _getVoteTopic = deps.getVoteTopic;
  _getVoteQuestions = deps.getVoteQuestions;
  _getVoteAnswers = deps.getVoteAnswers;
  _hasUserVoted = deps.hasUserVoted;
  _submitVote = deps.submitVote;
  _getVoteStatistics = deps.getVoteStatistics;
  _createVoteTopic = deps.createVoteTopic;
  _createVoteQuestion = deps.createVoteQuestion;
  _createVoteAnswer = deps.createVoteAnswer;
  _deleteVoteTopic = deps.deleteVoteTopic;
  _getNextTopicNumber = deps.getNextTopicNumber;
}

/**
 * RZ Command: Zmodem Upload (internalCommandRZ)
 * Original: express.e:25608-25621
 *
 * Immediate Zmodem upload protocol initiation.
 * In AmiExpress, this called uploadaFile(1, cmdcode, FALSE) for Zmodem.
 * Web version: Shows file area selection for upload target.
 */
export function handleZmodemUploadCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:25609
  if (!checkSecurity(session, ACSCode.UPLOAD)) {
    ErrorHandler.permissionDenied(socket, 'upload files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:25610
  _setEnvStat(session, EnvStat.UPLOADING);

  console.log('[ENV] Uploading');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Zmodem Upload'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'This command starts an immediate Zmodem upload.\r\n');
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:25612-25618):
  // - Checks if BGFILECHECK is enabled for remote logon
  // - Calls uploadaFile(1, cmdcode, FALSE) where 1 = Zmodem protocol
  // - Returns RESULT_GOODBYE if modem should hang up
  // Web version: Show file area selection

  // Check if there are file directories to upload to
  const uploadFileAreas = _fileAreas.filter((area: any) => area.conferenceId === session.currentConf);
  if (uploadFileAreas.length === 0) {
    socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  socket.emit('ansi-output', 'Available file areas:\r\n');
  uploadFileAreas.forEach((area: any, index: number) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.complexPrompt([
    { text: 'Select file area ', color: 'white' },
    { text: `(1-${uploadFileAreas.length})`, color: 'cyan' },
    { text: ' or press Enter to cancel: ', color: 'white' }
  ]));

  session.subState = LoggedOnSubState.FILE_AREA_SELECT;
  session.tempData = { rzUploadMode: true, fileAreas: uploadFileAreas };
}

/**
 * US Command: Sysop Upload (internalCommandUS)
 * Original: express.e:25660-25665
 *
 * Special upload mode for sysops that bypasses ratio checks.
 * In AmiExpress, this called sysopUpload() with no restrictions.
 * Web version: Shows upload interface with sysop privileges.
 */
export function handleSysopUploadCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Check security - express.e:25661
  if (!checkSecurity(session, ACSCode.SYSOP_COMMANDS)) {
    ErrorHandler.permissionDenied(socket, 'use sysop upload', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:25662
  _setEnvStat(session, EnvStat.UPLOADING);

  console.log('[ENV] Uploading');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Sysop Upload'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Special sysop upload mode - bypasses ratio checks.\r\n');
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:25664):
  // - Calls sysopUpload()
  // - No ratio checks
  // - No security restrictions beyond ACS_SYSOP_COMMANDS
  // Web version: Call upload interface

  _displayUploadInterface(socket, session, params);
}

/**
 * UP Command: Node Uptime (internalCommandUP)
 * Original: express.e:25667-25673
 *
 * Displays when the node was started and current uptime.
 * In AmiExpress, this showed nodeStart time formatted.
 * Web version: Shows when the node started and total uptime.
 */
export function handleNodeUptimeCommand(socket: any, session: BBSSession): void {
  console.log('[ENV] Stats');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Node Uptime'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:25670-25672):
  // - formatLongDateTime(nodeStart, tempStr2)
  // - StringF(tempStr, 'Node %d was started at %s.', node, tempStr2)
  // - aePuts(tempStr)

  // Web version: Show node start time and uptime
  const nodeStartTime = session.nodeStartTime || Date.now();
  const startTime = new Date(nodeStartTime).toLocaleString();
  const uptimeMs = Date.now() - nodeStartTime;
  const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
  const uptimeMins = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));

  socket.emit('ansi-output', AnsiUtil.colorize('Node 1 was started at ', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize(startTime, 'yellow'));
  socket.emit('ansi-output', '.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Uptime: ', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize(`${uptimeHours}h ${uptimeMins}m`, 'green'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * VO Command: Voting Booth (internalCommandVO)
 * Original: express.e:25700-25710
 *
 * BBS voting/polling system for user feedback.
 * In AmiExpress, this called either voteMenu() (sysops) or vote() (users).
 * Web version: Not yet implemented, stubbed with explanation.
 */
/**
 * VO Command: Voting Booth (internalCommandVO)
 * Original: express.e:25700-25709
 */
export async function handleVotingBoothCommand(socket: any, session: BBSSession): Promise<void> {
  // Check security - express.e:25701
  if (!checkSecurity(session, ACSCode.VOTE)) {
    ErrorHandler.permissionDenied(socket, 'access voting booth', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:25703
  _setEnvStat(session, EnvStat.DOORS);

  console.log('[ENV] Doors');

  // Check if user has modify vote permission (express.e:25704-25709)
  const canModify = checkSecurity(session, ACSCode.MODIFY_VOTE);

  if (canModify) {
    // Sysop: Show vote maintenance menu
    await displayVoteMenu(socket, session);
  } else {
    // Regular user: Show voting topics
    await displayVoteTopics(socket, session);
  }
}

/**
 * Display voting topics menu for regular users (vote() function - express.e:20782-20900)
 */
async function displayVoteTopics(socket: any, session: BBSSession): Promise<void> {
  const topics = await _getActiveVoteTopics(session.currentConf || 1);

  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', '                  ');
  socket.emit('ansi-output', AnsiUtil.colorize('*', 'blue'));
  socket.emit('ansi-output', '--');
  socket.emit('ansi-output', AnsiUtil.colorize('VOTING TOPICS MENU', 'yellow'));
  socket.emit('ansi-output', '--');
  socket.emit('ansi-output', AnsiUtil.colorize('*', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  if (topics.length === 0) {
    socket.emit('ansi-output', AnsiUtil.colorize('VOTING IS NOT ESTABLISHED FOR THIS CONFERENCE', 'white'));
    socket.emit('ansi-output', '\r\n\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Display topics with voted status
  for (const topic of topics) {
    const hasVoted = await _hasUserVoted(session.user.id, topic.id);
    const votedStatus = hasVoted ? 'VOTED' : '     ';

    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize(String(topic.topic_number).padStart(2, ' '), 'white'));
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize(topic.title, 'green'));
    socket.emit('ansi-output', ' ');
    socket.emit('ansi-output', AnsiUtil.colorize(votedStatus, 'magenta'));
    socket.emit('ansi-output', '\r\n');

    // Show description if available
    if (topic.description) {
      const descLines = topic.description.split('\n');
      descLines.forEach((line: string) => {
        socket.emit('ansi-output', '           ');
        socket.emit('ansi-output', AnsiUtil.colorize(line, 'magenta'));
        socket.emit('ansi-output', '\r\n');
      });
    }
  }

  socket.emit('ansi-output', AnsiUtil.colorize('[ Q] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('QUIT', 'yellow'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '>: ');

  session.tempData = session.tempData || {};
  session.tempData.voteTopics = topics;
  session.subState = 'VO_TOPIC_SELECT';
}

/**
 * Handle vote topic selection (express.e:20820-20850)
 */
export async function handleVoteTopicSelect(socket: any, session: BBSSession, input: string): Promise<void> {
  const choice = input.trim().toUpperCase();

  if (choice === 'Q' || choice === '') {
    socket.emit('ansi-output', '\r\n');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.tempData.voteTopics;
    return;
  }

  const topicNum = parseInt(choice);
  if (isNaN(topicNum) || topicNum < 1 || topicNum > 25) {
    await displayVoteTopics(socket, session);
    return;
  }

  const topic = await _getVoteTopic(session.currentConf || 1, topicNum);
  if (!topic) {
    await displayVoteTopics(socket, session);
    return;
  }

  const hasVoted = await _hasUserVoted(session.user.id, topic.id);

  if (hasVoted) {
    // Show results if already voted (express.e:20844-20847)
    await displayVoteResults(socket, session, topic);
  } else {
    // Allow voting (express.e:20848-20850)
    await conductVoting(socket, session, topic);
  }
}

/**
 * Display vote results for a topic (showTopicVotes() - express.e:20852-20900)
 */
async function displayVoteResults(socket: any, session: BBSSession, topic: any): Promise<void> {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('TOPIC [', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize(String(topic.topic_number), 'white'));
  socket.emit('ansi-output', AnsiUtil.colorize(']\r\n', 'yellow'));

  const stats = await _getVoteStatistics(topic.id);

  // Group by question
  const questionMap: any = {};
  stats.forEach((row: any) => {
    if (!questionMap[row.question_id]) {
      questionMap[row.question_id] = {
        number: row.question_number,
        text: row.question_text,
        totalVotes: row.total_question_votes || 0,
        answers: []
      };
    }
    if (row.answer_id) {
      questionMap[row.question_id].answers.push({
        letter: row.answer_letter,
        text: row.answer_text,
        count: row.vote_count || 0
      });
    }
  });

  // Display each question and its results
  for (const questionId in questionMap) {
    const question = questionMap[questionId];

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', question.text + '\r\n');
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.colorize('TOTAL VOTES FOR THIS QUESTION', 'magenta'));
    socket.emit('ansi-output', ' = ');
    socket.emit('ansi-output', AnsiUtil.colorize(String(question.totalVotes), 'yellow'));
    socket.emit('ansi-output', '\r\n');

    question.answers.forEach((answer: any) => {
      const percentage = question.totalVotes > 0 ? ((answer.count / question.totalVotes) * 100).toFixed(1) : '0.0';

      socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
      socket.emit('ansi-output', AnsiUtil.colorize(answer.letter, 'white'));
      socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
      socket.emit('ansi-output', answer.text.substring(0, 40).padEnd(40));
      socket.emit('ansi-output', ' ');
      socket.emit('ansi-output', AnsiUtil.colorize('VOTES', 'magenta'));
      socket.emit('ansi-output', AnsiUtil.colorize(': ', 'yellow'));
      socket.emit('ansi-output', AnsiUtil.colorize(String(answer.count), 'white'));
      socket.emit('ansi-output', ', ' + percentage + '%\r\n');
    });
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  // Return to topic menu
  await displayVoteTopics(socket, session);
}

/**
 * Conduct voting on a topic (topicVote() - express.e:20903-21033)
 */
async function conductVoting(socket: any, session: BBSSession, topic: any): Promise<void> {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('TOPIC [', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize(String(topic.topic_number), 'white'));
  socket.emit('ansi-output', AnsiUtil.colorize(']\r\n', 'yellow'));

  const questions = await _getVoteQuestions(topic.id);

  if (questions.length === 0) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.warningLine('No questions available for this topic'));
    await displayVoteTopics(socket, session);
    return;
  }

  session.tempData.voteTopic = topic;
  session.tempData.voteQuestions = questions;
  session.tempData.voteAnswers = [];
  session.tempData.currentQuestionIndex = 0;

  await displayNextQuestion(socket, session);
}

/**
 * Display next question in voting sequence
 */
async function displayNextQuestion(socket: any, session: BBSSession): Promise<void> {
  const questions = session.tempData.voteQuestions;
  const currentIndex = session.tempData.currentQuestionIndex;

  if (currentIndex >= questions.length) {
    // All questions answered, submit votes
    await submitAllVotes(socket, session);
    return;
  }

  const question = questions[currentIndex];
  const answers = await _getVoteAnswers(question.id);

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', question.question_text + '\r\n');
  socket.emit('ansi-output', '\r\n');

  // Display current vote totals for each answer
  answers.forEach((answer: any) => {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize(answer.answer_letter, 'white'));
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', answer.answer_text.substring(0, 40).padEnd(40));
    socket.emit('ansi-output', '\r\n');
  });

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('CHOICE >: ', 'white'));

  session.tempData.currentQuestion = question;
  session.tempData.currentAnswers = answers;
  session.subState = 'VO_ANSWER_INPUT';
}

/**
 * Handle vote answer input
 */
export async function handleVoteAnswerInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const choice = input.trim().toUpperCase();
  const answers = session.tempData.currentAnswers;
  const question = session.tempData.currentQuestion;

  // Find matching answer
  const selectedAnswer = answers.find((a: any) => a.answer_letter === choice);

  if (selectedAnswer) {
    // Save this vote
    session.tempData.voteAnswers.push({
      questionId: question.id,
      answerId: selectedAnswer.id
    });

    // Move to next question
    session.tempData.currentQuestionIndex++;
    await displayNextQuestion(socket, session);
  } else {
    // Invalid choice, redisplay question
    await displayNextQuestion(socket, session);
  }
}

/**
 * Submit all collected votes (express.e:20996-21029)
 */
async function submitAllVotes(socket: any, session: BBSSession): Promise<void> {
  const topic = session.tempData.voteTopic;
  const votes = session.tempData.voteAnswers;

  const success = await _submitVote(session.user.id, topic.id, session.currentConf || 1, votes);

  if (success) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.successLine('Your votes have been recorded!'));
  } else {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Error recording votes'));
  }

  // Clean up temp data
  delete session.tempData.voteTopic;
  delete session.tempData.voteQuestions;
  delete session.tempData.voteAnswers;
  delete session.tempData.currentQuestionIndex;
  delete session.tempData.currentQuestion;
  delete session.tempData.currentAnswers;

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  // Return to topic menu
  await displayVoteTopics(socket, session);
}

/**
 * Display vote maintenance menu for sysops (voteMenu() - express.e:21036-21063)
 */
async function displayVoteMenu(socket: any, session: BBSSession): Promise<void> {
  socket.emit('ansi-output', '\x1b[2J'); // Clear screen
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '                 ');
  socket.emit('ansi-output', AnsiUtil.colorize('*', 'blue'));
  socket.emit('ansi-output', '--');
  socket.emit('ansi-output', AnsiUtil.colorize('VOTE MAINTENANCE', 'yellow'));
  socket.emit('ansi-output', '--');
  socket.emit('ansi-output', AnsiUtil.colorize('*', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[ 1] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('SHOW VOTING STATISTICS', 'magenta'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[ 2] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('SHOW TOPICS', 'magenta'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[ 3] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('CREATE VOTE TOPIC', 'magenta'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[ 4] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('DELETE VOTE TOPIC', 'magenta'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[ 5] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('EDIT   VOTE TOPIC', 'magenta'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[ 6] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('VOTE', 'magenta'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[ 7] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('EXIT VOTE MAINTENANCE', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', '\r\n>');

  session.subState = 'VO_MENU_CHOICE';
}

/**
 * Handle vote maintenance menu choice
 */
export async function handleVoteMenuChoice(socket: any, session: BBSSession, input: string): Promise<void> {
  const choice = input.trim();

  switch (choice) {
    case '1': // Show voting statistics
      await showAllVoteStatistics(socket, session);
      break;

    case '2': // Show topics
      await displayVoteTopics(socket, session);
      break;

    case '3': // Create vote topic
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.warningLine('Vote topic creation not yet implemented'));
      socket.emit('ansi-output', '\r\n');
      await displayVoteMenu(socket, session);
      break;

    case '4': // Delete vote topic
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.warningLine('Vote topic deletion not yet implemented'));
      socket.emit('ansi-output', '\r\n');
      await displayVoteMenu(socket, session);
      break;

    case '5': // Edit vote topic
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.warningLine('Vote topic editing not yet implemented'));
      socket.emit('ansi-output', '\r\n');
      await displayVoteMenu(socket, session);
      break;

    case '6': // Vote
      await displayVoteTopics(socket, session);
      break;

    case '7': // Exit
    case '':
      socket.emit('ansi-output', '\r\n');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      break;

    default:
      await displayVoteMenu(socket, session);
      break;
  }
}

/**
 * Show all vote statistics (showVoteStats() - express.e:21123-21130)
 */
async function showAllVoteStatistics(socket: any, session: BBSSession): Promise<void> {
  const topics = await _getActiveVoteTopics(session.currentConf || 1);

  if (topics.length === 0) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.warningLine('No voting topics found'));
    socket.emit('ansi-output', '\r\n');
    await displayVoteMenu(socket, session);
    return;
  }

  for (const topic of topics) {
    await displayVoteResults(socket, session, topic);
  }

  await displayVoteMenu(socket, session);
}

/**
 * DS Command: Download with Status (variant of D command)
 * Original: express.e:28302 (mapped to internalCommandD)
 *
 * Download files with status/progress display.
 * In AmiExpress, DS was just an alias to D command.
 * Web version: Shows download interface (same as D command).
 */
export function handleDownloadWithStatusCommand(socket: any, session: BBSSession, params: string = ''): void {
  // DS is handled by same function as D in express.e
  // The difference is DS shows download status/progress
  // express.e:28302 maps DS -> internalCommandD

  console.log('[ENV] Files');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Download Files (with status)'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress:
  // DS is just an alias to D command with status display enabled
  // Web version: Call download interface

  _displayDownloadInterface(socket, session, params);
}
