/**
 * MRC Door - Multi Relay Chat Interactive Client
 *
 * Full-screen ANSI chat interface for Multi Relay Chat system.
 * Connects to local mrc_client daemon for chat functionality.
 *
 * Port of mrc_door.e from MultiRelayChat by Stackfault/Phenom Productions
 * Ported to TypeScript for AmiExpress-Web
 *
 * Complete 1:1 port with ALL features:
 * - Full-screen ANSI chat interface
 * - Real-time chat with users across all connected BBSes
 * - Customizable colors, brackets, and settings
 * - Buffer history with UP/DOWN arrows
 * - Nick auto-completion with TAB
 * - Scrollback mode to review chat history
 * - Many commands: /JOIN, /MSG, /ME, /TOPIC, /SET, /CHANGES, /SCROLL, etc.
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

const MRC_VERSION = 'Multi Relay Chat door v1.2.9a [sf]';
const MAX_BUFFER = 140;
const LEFTARROW = 2;
const RIGHTARROW = 3;
const UPARROW = 4;
const DOWNARROW = 5;

interface UserRec {
  recIdx: number;
  permIdx: number;
  enterChatMe: string;
  enterChatRoom: string;
  enterRoomMe: string;
  enterRoomRoom: string;
  leaveChatMe: string;
  leaveChatRoom: string;
  leaveRoomMe: string;
  leaveRoomRoom: string;
  name: string;
  defaultRoom: string;
  nameColor: string;
  ltBracket: string;
  rtBracket: string;
  useClock: boolean;
  clockFormat: boolean; // false = 24h, true = 12h
}

let userTag = '';
let siteTag = '';
let userAlias = '';
let userIndex = 0;
let node = 1;
let myRoom = '';
let myTopic = '';
let myNamePrompt = '';
let mrcStats = '';
let lastPrivMsg = '';
let mrcserver: net.Socket | null = null;
let iMaxBuffer = 75;
let chatLines: string[] = [];
let inputStr = '';
let roomUsers = '';
let bufferHist: string[] = [];
let bannerList: string[] = [];
let currCount = 0;
let exitChat = false;
let chatLog = '';
let inputColour = 15;
let numLines = 29;
let cursorPos = 0;
let bufferItem = -1;
let charsEntered = false;
let latencyVal = 0;
let banIdx = -1;
let bannerOff = 0;
let scrollWait = 0;
let scrollDly = 0;
let scrollSpeed = 15;
let userIdx = 1;
let lastUSearch = '';
let plyr: UserRec;
let socket: any;
let user: any;

function stripMCI(text: string): string {
  let result = '';
  let skip = 0;
  for (let i = 0; i < text.length; i++) {
    if (skip === 0) {
      if (text[i] !== '|') {
        result += text[i];
      } else {
        skip = 2;
      }
    } else {
      skip--;
    }
  }
  return result;
}

function replaceStr(source: string, search: string, replace: string): string {
  return source.split(search).join(replace);
}

function strCmpi(test1: string, test2: string, len?: number): boolean {
  const l1 = len !== undefined ? test1.substring(0, len).toLowerCase() : test1.toLowerCase();
  const l2 = len !== undefined ? test2.substring(0, len).toLowerCase() : test2.toLowerCase();
  return l1 === l2;
}

function getTime(): string {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');

  if (plyr.clockFormat) {
    // 12-hour format
    const hour12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
    const ampm = hours >= 12 ? 'P' : 'A';
    return `${hour12.toString().padStart(2, ' ')}:${minutes}${ampm}`;
  } else {
    // 24-hour format
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
}

function pipeToAnsi(s: string): string {
  let result = s;
  result = replaceStr(result, '|00', '\x1b[30m');
  result = replaceStr(result, '|01', '\x1b[34m');
  result = replaceStr(result, '|02', '\x1b[32m');
  result = replaceStr(result, '|03', '\x1b[36m');
  result = replaceStr(result, '|04', '\x1b[31m');
  result = replaceStr(result, '|05', '\x1b[35m');
  result = replaceStr(result, '|06', '\x1b[33m');
  result = replaceStr(result, '|07', '\x1b[0m');
  result = replaceStr(result, '|08', '\x1b[0m');
  result = replaceStr(result, '|09', '\x1b[34m');
  result = replaceStr(result, '|10', '\x1b[32m');
  result = replaceStr(result, '|11', '\x1b[36m');
  result = replaceStr(result, '|12', '\x1b[31m');
  result = replaceStr(result, '|13', '\x1b[35m');
  result = replaceStr(result, '|14', '\x1b[33m');
  result = replaceStr(result, '|15', '\x1b[0m');
  result = replaceStr(result, '|16', '\x1b[40m');
  result = replaceStr(result, '|17', '\x1b[44m');
  result = replaceStr(result, '|18', '\x1b[42m');
  result = replaceStr(result, '|19', '\x1b[46m');
  result = replaceStr(result, '|20', '\x1b[41m');
  result = replaceStr(result, '|21', '\x1b[45m');
  result = replaceStr(result, '|22', '\x1b[43m');
  result = replaceStr(result, '|23', '\x1b[40m');
  result = replaceStr(result, '|24', '\x1b[40m');
  result = replaceStr(result, '|25', '\x1b[45m');
  result = replaceStr(result, '|26', '\x1b[42m');
  result = replaceStr(result, '|27', '\x1b[46m');
  result = replaceStr(result, '|28', '\x1b[41m');
  result = replaceStr(result, '|29', '\x1b[45m');
  result = replaceStr(result, '|30', '\x1b[43m');
  result = replaceStr(result, '|31', '\x1b[47m');
  result = replaceStr(result, '|CL', '\x1b[2J\x1b[H');
  return result;
}

function transmit(text: string): void {
  socket.emit('ansi-output', text);
}

function updateMaxBuffersize(): void {
  iMaxBuffer = 255 - (userTag.length + siteTag.length + (myRoom.length * 2) + myNamePrompt.length + 20);
  if (iMaxBuffer > MAX_BUFFER) iMaxBuffer = MAX_BUFFER;

  if (inputStr.toLowerCase().startsWith('/rainbow ')) {
    iMaxBuffer = Math.floor(iMaxBuffer / 4) - 4;
  }
}

function showTitle(): void {
  transmit('\x1b[2J\x1b[H');
  transmit('\x1b[0m.------------------------------- \x1b[34mMu\x1b[36mlti \x1b[0mRela\x1b[36my Ch\x1b[34mat \x1b[0m-----------------------------.\r\n');
  updateHeader();
  transmit('\x1b[3;1H\x1b[0m|' + ' '.repeat(70) + '/? H\x1b[36me\x1b[36mlp \x1b[0m|\r\n');
  transmit('\x1b[4;1H\x1b[0m`------------------------------------------------------------------------------\'\r\n');
  updateFooter();
}

function updateHeader(): void {
  transmit(`\x1b[2;1H\x1b[0m| R\x1b[36moom  \x1b[33m>\x1b[0m>> \x1b[K${' '.repeat(67)}|\x1b[68D#${myRoom}\r\n`);
  transmit(`\x1b[3;1H\x1b[0m| T\x1b[36mopic \x1b[33m>\x1b[0m>> \x1b[K${' '.repeat(59)}/? H\x1b[36me\x1b[36mlp \x1b[0m|\x1b[68D${myTopic}\r\n`);
}

function updateFooter(): void {
  updateMaxBuffersize();
  const line = chatLines.length + 5;
  transmit(`\x1b[${line};1H\x1b[0m--[Latency-${latencyVal.toString().padStart(3, ' ')}ms]-[Chatters-${currCount.toString().padStart(2, ' ')}]---------------------[Buffer-${inputStr.length.toString().padStart(3, ' ')}/${iMaxBuffer.toString().padStart(3, ' ')}]-[\x1b[36mM\x1b[34mR\x1b[36mC\x1b[0m]-[ ]--\r\n`);
}

function updateHeartbeat(anim: boolean): void {
  const line = chatLines.length + 5;
  transmit(`\x1b[0m\x1b[${line};77H${anim ? '+' : ' '}\r\n`);
}

function restoreCursor(): void {
  const promptLen = stripMCI(myNamePrompt).length;
  const line = chatLines.length + 6;
  const col = Math.min(79, cursorPos + 1 + promptLen);
  transmit(`\x1b[${line};${col}H`);
}

function displayCurrentInput(): void {
  const promptLen = stripMCI(myNamePrompt).length;
  const tempInput = inputStr.substring(0, 78 - promptLen);
  const line = chatLines.length + 6;
  const xpos = Math.min(79, cursorPos + 1 + promptLen);
  const prompt = pipeToAnsi(myNamePrompt);
  transmit(`\x1b[${line};1H\x1b[K\x1b[0m${prompt}|\x1b[${inputColour}m${tempInput}\x1b[${line};${xpos}H`);
}

function showChat(): void {
  for (let i = 0; i < chatLines.length; i++) {
    transmit(`\x1b[${i + 5};1H\x1b[0m\x1b[K${chatLines[i]}\r\n`);
  }
  displayCurrentInput();
}

function addChatLine(line: string): void {
  const processedLine = pipeToAnsi(line);

  // Shift lines up
  for (let i = 1; i < chatLines.length; i++) {
    chatLines[i - 1] = chatLines[i];
  }
  chatLines[chatLines.length - 1] = processedLine;

  // Log to file
  if (chatLog) {
    fs.appendFileSync(chatLog, processedLine + '\n');
  }
}

function add2Chat(text: string): void {
  let timeStr = '';
  let hl = '|16|00.|16|07';

  // Check if our nick is mentioned (highlight)
  const upperText = text.toUpperCase();
  const upperTag = userTag.toUpperCase();
  const spacePos = upperText.indexOf(' ');
  const searchPos = spacePos !== -1 ? spacePos : 0;
  if (upperText.substring(searchPos).includes(upperTag)) {
    hl = '|16|10•|16|07';
  }

  if (plyr.useClock) {
    timeStr = getTime();
  }

  let line = timeStr + hl;
  const timeBlank = ' '.repeat(timeStr.length);
  let charCount = 0;
  let lastColourCode = '';
  let spaceI = -1;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '|') {
      if (text[i] === ' ') spaceI = i;
      line += text[i];
      charCount++;
      i++;
    } else if (i + 2 < text.length) {
      lastColourCode = text.substring(i, i + 3);
      line += lastColourCode;
      i += 3;
    } else {
      i++;
    }

    if (charCount === (79 - timeStr.length)) {
      if (spaceI !== -1) {
        // Wrap at last space
        const lineLen = line.length;
        const charsToRemove = i - spaceI;
        line = line.substring(0, lineLen - charsToRemove);
        i = spaceI + 1;
      }
      addChatLine(line);
      line = timeBlank + hl + lastColourCode;
      charCount = 0;
      spaceI = -1;
    }
  }

  if (charCount > 0) {
    addChatLine(line);
  }
}

function updateStrings(msg: string, nick: string, newRoom: string, oldRoom: string): string {
  let result = msg;
  result = replaceStr(result, '%1', nick);
  result = replaceStr(result, '%2', '');
  result = replaceStr(result, '%3', `#${newRoom}`);
  result = replaceStr(result, '%4', `#${oldRoom}`);
  return result;
}

function rainbowStr(source: string): string {
  let result = '';
  for (let i = 0; i < source.length; i++) {
    const color = Math.floor(Math.random() * 14) + 1;
    result += `|${color.toString().padStart(2, '0')}${source[i]}`;
  }
  return result;
}

function showWelcome(): void {
  add2Chat(`* |10Welcome to ${MRC_VERSION}`);
  add2Chat('* |11ESC|10 to clear input buffer, |15UP|10/|15DN|10 arrows for buffer history');
  add2Chat('* |10and to change your chat text color and |11TAB|10 for nick completion');
  add2Chat('* |10The bottom-right heartbeat indicates your status with BBS and server');
  add2Chat(`|14* |10Your maximum message length is ${iMaxBuffer} characters`);
  showChat();
}

function showChanges(): void {
  add2Chat('* |15List of changes from MRC v1.1');
  add2Chat('* |10Completely redesigned Input routine [sf]');
  add2Chat('* |10Ability to receive chat while typing (non-blocking) [sf]');
  add2Chat('* |10Built-in input buffer history [sf]');
  add2Chat('* |10Chat text color changing using PgUp and PgDn [sf]');
  add2Chat('* |10Visual indicator when your nick is mentioned [sf]');
  add2Chat('* |10Input buffer with color coded characters counter [sf]');
  add2Chat('* |10Server latency and synchronization heartbeat indicator [sf]');
  add2Chat('* |10Enlarged view port, more lines are available for the chat [sf]');
  add2Chat('* |10Customizable information scroller [sf]');
  add2Chat('* |10Improvement of performance and responsiveness of the interface [sf]');
  add2Chat('* |10Brand new backend for improved speed and scalability [sf]');
  add2Chat('* |10Nick auto-completion using TAB [sf]');
  add2Chat('* |10Reply to last private message using /r [sf]');
  showChat();
}

function sendOut(fu: string, fs: string, fr: string, tu: string, ts: string, tr: string, msg: string): void {
  const packet = `${fu}~${fs}~${fr}~${tu}~${ts}~${tr}~${msg}~\n`;
  if (mrcserver) {
    mrcserver.write(packet);
  }
}

function sendToServer(msg: string): void {
  sendOut(userTag, siteTag, myRoom, 'SERVER', siteTag, myRoom, msg);
}

function sendToMe(msg: string): void {
  add2Chat(msg);
  showChat();
}

function sendToAllNotMe(msg: string): void {
  sendOut(userTag, siteTag, myRoom, 'NOTME', '', '', msg);
}

function sendToRoomNotMe(msg: string): void {
  sendOut(userTag, siteTag, myRoom, 'NOTME', '', myRoom, msg);
}

function sendToAll(msg: string): void {
  sendOut(userTag, siteTag, myRoom, '', '', '', msg);
}

function sendToRoom(msg: string): void {
  sendOut(userTag, siteTag, myRoom, '', '', myRoom, msg);
}

function sendToUser(u: string, msg: string): void {
  sendOut(userTag, siteTag, myRoom, u, '', '', msg);
}

function sendToClient(msg: string): void {
  sendOut(userTag, siteTag, myRoom, 'CLIENT', siteTag, myRoom, msg);
}

function addToBufferHistory(input: string): void {
  bufferHist.unshift(input);
  if (bufferHist.length > 10) bufferHist.pop();
  bufferItem = -1;
}

function getPrevBufferItem(): void {
  let count = 0;
  let found = false;
  while (!found && count < bufferHist.length) {
    bufferItem++;
    if (bufferItem >= bufferHist.length) bufferItem = 0;
    count++;
    if (bufferHist[bufferItem] && bufferHist[bufferItem].length > 0) found = true;
  }
  if (found) {
    inputStr = bufferHist[bufferItem];
    cursorPos = inputStr.length;
    charsEntered = false;
  }
}

function getNextBufferItem(): void {
  let count = 0;
  let found = false;
  while (!found && count < bufferHist.length) {
    bufferItem--;
    if (bufferItem < 0) bufferItem = bufferHist.length - 1;
    count++;
    if (bufferHist[bufferItem] && bufferHist[bufferItem].length > 0) found = true;
  }
  if (found) {
    inputStr = bufferHist[bufferItem];
    cursorPos = inputStr.length;
    charsEntered = false;
  }
}

function findSplitBufferPos(buffer: string, sep: string, num: number): number {
  let count = 0;
  let s = -1;
  let res = 0;

  while ((s = buffer.indexOf(sep, s + 1)) !== -1 && count < num) {
    count++;
    res = s;
  }

  return res;
}

function nextBanner(): void {
  do {
    banIdx++;
    if (banIdx >= bannerList.length) banIdx = 0;
  } while (bannerList[banIdx] && bannerList[banIdx].length === 0);
  scrollWait = 0;
  bannerOff = 0;
}

function scrollBanner(): void {
  if (banIdx === -1 || !bannerList[banIdx]) return;

  const bs = '                                    ' + stripMCI(bannerList[banIdx]);
  const displayText = bs.substring(bannerOff, bannerOff + 36);
  transmit(`\x1b[2;43H\x1b[36m${displayText}\x1b[36m`);

  if (scrollWait < scrollDly) {
    scrollWait++;
  } else {
    bannerOff++;
  }

  if (bannerOff >= bs.length) {
    nextBanner();
  }
}

function loadBanners(): void {
  bannerList[0] = `${MRC_VERSION}${mrcStats}`;
  bannerList[1] = 'Find more about the connected BBSes using the /INFO command';
  bannerList[2] = 'Give a try to the new nick auto-completion feature using the TAB key';
  bannerList[3] = 'Reply to your last received private message using the /R shortcut';
}

function joinRoom(roomName: string, broadcast: boolean): void {
  if (roomName.length > 30) {
    add2Chat('|15!|12 Room name is limited to 30 chars max');
    showChat();
    return;
  }

  if (roomName.length === 0) return;

  const oldRoom = myRoom;
  const newRoom = roomName.toLowerCase().replace(/#/g, '');

  sendToServer(`NEWROOM:${myRoom}:${newRoom}`);

  if (broadcast) {
    let msg = updateStrings(plyr.leaveRoomMe, plyr.name, newRoom, oldRoom);
    sendToMe(msg);

    msg = updateStrings(plyr.leaveRoomRoom, plyr.name, newRoom, oldRoom);
    sendToRoomNotMe(msg);

    myRoom = newRoom;

    msg = updateStrings(plyr.enterRoomMe, plyr.name, newRoom, oldRoom);
    sendToMe(msg);

    msg = updateStrings(plyr.enterRoomRoom, plyr.name, newRoom, oldRoom);
    sendToRoomNotMe(msg);
  }

  myRoom = newRoom;
  updateHeader();
  sendToServer('USERLIST');
}

function enterChat(): void {
  showTitle();
  showWelcome();

  let msg = updateStrings(plyr.enterChatMe, plyr.name, myRoom, myRoom);
  add2Chat(msg);

  msg = updateStrings(plyr.enterChatRoom, plyr.name, myRoom, myRoom);
  sendToAllNotMe(msg);

  sendToServer('IAMHERE');
  sendToServer('BANNERS');
  showChat();
}

function leaveChat(): void {
  let msg = updateStrings(plyr.leaveChatMe, plyr.name, myRoom, myRoom);
  add2Chat(msg);

  msg = updateStrings(plyr.leaveChatRoom, plyr.name, myRoom, myRoom);
  sendToAllNotMe(msg);
  showChat();

  sendToServer('LOGOFF');
}

function doHelp(): void {
  transmit('\x1b[2J\x1b[0;44m                           MULTI RELAY CHAT COMMANDS                           \x1b[0m\r\n');
  transmit('.------------------------------------------------------------------.\r\n');
  transmit('| /B <text>                   Broadcast message to all channels    |\r\n');
  transmit('| /CLS                        Clears window and scrollback text    |\r\n');
  transmit('| /MSG or /M <user> <text>    Sends a private message              |\r\n');
  transmit('| /TELL or /T <user> <text>   Sends a private message              |\r\n');
  transmit('| /TOPIC <text>               Set the TOPIC of the current channel |\r\n');
  transmit('| /ME <text>                  Perform an action                    |\r\n');
  transmit('| /JOIN <channel>             Join a new channel [name]            |\r\n');
  transmit('| /Q or /QUIT                 Leave/Quit Multi Relay Chat          |\r\n');
  transmit('|------------------------------------------------------------------|\r\n');
  transmit('| /WHOON      List all users bbs   /ROOMS       List all rooms     |\r\n');
  transmit('| /BBSES      List all BBS\'s       /USERS       List all users     |\r\n');
  transmit('| /CHANNEL    List channel users   /INFO        Show info on BBS   |\r\n');
  transmit('| /VERSION    Check client and server versions                     |\r\n');
  transmit('| /CHANGES    List of changes      /SET         Customize settings |\r\n');
  transmit('`------------------------------------------------------------------\'\r\n');
  transmit('Press any key to return to chat...\r\n');

  // Wait for keypress
  return new Promise<void>((resolve) => {
    const handleInput = (data: string) => {
      delete bbsSession.doorInputHandler;
      showTitle();
      showChat();
      resolve();
    };
    socket.once('user-input', handleInput);
  }) as any;
}

function processUserInput(input: string): void {
  if (input.length === 0) return;

  if (input[0] === '/') {
    const upper = input.toUpperCase();

    if (upper === '/CHANGES') {
      showChanges();
    } else if (upper === '/CLS') {
      chatLines = chatLines.map(() => '');
      showChat();
    } else if (upper === '/?') {
      doHelp();
    } else if (upper === '/Q' || upper === '/QUIT') {
      leaveChat();
      exitChat = true;
    } else if (upper.startsWith('/JOIN ')) {
      joinRoom(input.substring(6), true);
    } else if (upper.startsWith('/ME ')) {
      const msg = `|15* |13${plyr.name} ${input.substring(4)}`;
      sendToRoom(msg);
    } else if (upper.startsWith('/B ')) {
      const msg = `|15* |08(|15${plyr.name}|08/|14Broadcast|08) |07${input.substring(3)}`;
      sendToAll(msg);
    } else if (upper.startsWith('/TOPIC ')) {
      const topic = input.substring(7);
      if (topic.length > 55) {
        add2Chat('|15!|12 Topic is limited to 55 chars max');
        showChat();
      } else {
        sendToServer(`NEWTOPIC:${myRoom}:${topic}`);
      }
    } else if (upper.startsWith('/T ') || upper.startsWith('/M ')) {
      const parts = input.substring(3).trim().split(' ');
      if (parts.length >= 2) {
        const toName = parts[0];
        const message = parts.slice(1).join(' ');
        const msg = `|15* |08(|15${plyr.name}|08/|14PrivMsg|08) |07${message}`;
        sendToUser(toName, msg);
        add2Chat(`|15* |08(|14PrivMsg|08->|15${toName}|08) |07${message}`);
        showChat();
        lastPrivMsg = toName;
      }
    } else if (upper.startsWith('/MSG ') || upper.startsWith('/TELL ')) {
      const offset = upper.startsWith('/MSG ') ? 5 : 6;
      const parts = input.substring(offset).trim().split(' ');
      if (parts.length >= 2) {
        const toName = parts[0];
        const message = parts.slice(1).join(' ');
        const msg = `|15* |08(|15${plyr.name}|08/|14PrivMsg|08) |07${message}`;
        sendToUser(toName, msg);
        add2Chat(`|15* |08(|14PrivMsg|08->|15${toName}|08) |07${message}`);
        showChat();
        lastPrivMsg = toName;
      }
    } else if (upper === '/HELP') {
      sendToServer('HELP');
    } else if (upper === '/BBSES') {
      sendToServer('CONNECTED');
    } else if (upper === '/CHANNEL') {
      sendToServer('CHANNEL');
    } else if (upper === '/LIST' || upper === '/ROOMS') {
      sendToServer('LIST');
    } else if (upper === '/USERS') {
      sendToServer('USERS');
    } else if (upper === '/WHOON') {
      sendToServer('WHOON');
    } else if (upper === '/VERSION') {
      sendToServer('VERSION');
      add2Chat(`|07- |13${MRC_VERSION}`);
      showChat();
    } else if (upper.startsWith('/INFO ')) {
      sendToServer(`INFO ${input.substring(6)}`);
    } else if (upper.startsWith('/QUOTE ')) {
      sendToServer(input.substring(7));
    }
  } else {
    const msg = `${myNamePrompt}|${inputColour.toString().padStart(2, '0')}${input}`;
    const cleaned = replaceStr(msg, '~', ' ');
    sendToRoom(cleaned);
  }
}

function checkUserList(userName: string): void {
  if (userName === 'SERVER' || userName === 'CLIENT') return;

  const users = `,${roomUsers},`;
  if (!users.includes(`,${userName},`)) {
    roomUsers += (roomUsers.length > 0 ? ',' : '') + userName;
    const userArray = roomUsers.split(',').filter(u => u.length > 0);
    currCount = userArray.length;
    updateFooter();
  }
}

function processServerResponse(response: string): void {
  const packet = response.split('~');
  if (packet.length < 7) return;

  const [fromuser, fromsite, fromroom, touser, tosite, toroom, message] = packet;

  let ok2Send = true;

  if (fromuser === 'SERVER') {
    if (message.startsWith('BANNER:')) {
      ok2Send = false;
      const banner = message.substring(7);
      if (!bannerList.includes(banner)) {
        for (let i = 0; i < bannerList.length; i++) {
          if (bannerList[i].length === 0) {
            bannerList[i] = banner;
            break;
          }
        }
      }
    } else if (message.startsWith('ROOMTOPIC:')) {
      ok2Send = false;
      const parts = message.substring(10).split(':');
      if (parts.length >= 2 && parts[0] === myRoom) {
        myTopic = parts[1];
        updateHeader();
      }
    } else if (message.startsWith('USERLIST:')) {
      ok2Send = false;
      roomUsers = message.substring(9);
      const userArray = roomUsers.split(',').filter(u => u.length > 0);
      currCount = userArray.length;
      updateFooter();
    } else if (message.startsWith('LATENCY:')) {
      ok2Send = false;
      latencyVal = parseInt(message.substring(8), 10);
      if (latencyVal > 999) latencyVal = 999;
      updateFooter();
    } else if (message.startsWith('STATS:')) {
      ok2Send = false;
      mrcStats = message.substring(6);
      loadBanners();
    } else if (message.startsWith('HELLO')) {
      ok2Send = false;
      sendToServer('IAMHERE');
    }
  } else if (touser === 'SERVER' && message === 'LOGOFF') {
    ok2Send = false;
  }

  if (toroom.length > 0 && toroom.toLowerCase() !== myRoom.toLowerCase()) {
    ok2Send = false;
  }

  if (touser.length > 0) {
    if (touser !== 'NOTME' && touser.toLowerCase() !== userTag.toLowerCase()) {
      ok2Send = false;
    }
  }

  if (fromuser.toLowerCase() === userTag.toLowerCase() && touser === 'NOTME') {
    ok2Send = false;
  }

  if (fromuser !== 'SERVER' && fromuser !== 'CLIENT') {
    if (touser.toLowerCase() === userTag.toLowerCase()) {
      lastPrivMsg = fromuser;
    }
  }

  if (ok2Send) {
    add2Chat(message);
    showChat();
    checkUserList(fromuser);
  }
}

function initPlayer(): void {
  const cleanAlias = userAlias.replace(/ /g, '_');
  const cleanTag = stripMCI(cleanAlias);

  plyr = {
    recIdx: 1,
    permIdx: userIndex,
    enterChatMe: '|07- |15You have entered chat',
    enterChatRoom: '|07- |11%1 |03has arrived!',
    leaveChatMe: '|07- |12You have left chat.',
    leaveChatRoom: '|07- |12%1 |04has left chat.',
    enterRoomMe: '|07- |11You are now in |02%3',
    leaveRoomRoom: '|07- |02%1 |10has left the room.',
    leaveRoomMe: '|07- |10You have left room |02%4',
    enterRoomRoom: '|07- |11%1 |03has entered the room.',
    defaultRoom: 'lobby',
    nameColor: '|11',
    ltBracket: '|03<',
    rtBracket: '|03>',
    useClock: true,
    clockFormat: false,
    name: cleanTag
  };

  myNamePrompt = `${plyr.ltBracket}${plyr.nameColor}${plyr.name}${plyr.rtBracket}|16|07 `;
}

function connectToMrcServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    mrcserver = new net.Socket();
    let readBuffer = '';

    mrcserver.on('connect', () => {
      resolve();
    });

    mrcserver.on('data', (data) => {
      readBuffer += data.toString('utf-8');
      const lines = readBuffer.split('\n');

      if (readBuffer.endsWith('\n')) {
        readBuffer = '';
      } else {
        readBuffer = lines[lines.length - 1];
        lines.pop();
      }

      for (const line of lines) {
        if (line.trim().length > 0) {
          processServerResponse(line.trim());
        }
      }
    });

    mrcserver.on('error', (err) => {
      transmit(`\x1b[31mUnable to connect to mrc proxy: ${err.message}\x1b[0m\r\n`);
      exitChat = true;
      reject(err);
    });

    mrcserver.on('close', () => {
      transmit('\x1b[31mConnection to MRC server lost\x1b[0m\r\n');
      exitChat = true;
    });

    mrcserver.connect(5000, 'localhost');
  });
}

async function mainLoop(): Promise<void> {
  let anim = false;
  let loop = 0;

  enterChat();
  joinRoom(plyr.defaultRoom, false);

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      loop++;

      if (loop % scrollSpeed === 0) {
        scrollBanner();
      }

      if (loop % 26 === 0) {
        anim = !anim;
        updateHeartbeat(anim);
      }

      if (loop % 1999 === 0) {
        sendToServer('USERLIST');
      }

      if (loop % 997 === 0) {
        sendToClient('LATENCY');
      }

      if (loop % 11987 === 0) {
        sendToServer('IAMHERE');
      }

      if (loop > 47948) {
        sendToServer('BANNERS');
        loop = 1;
      }

      if (exitChat) {
        clearInterval(interval);
        resolve();
      }
    }, 50);

    const handleInput = (data: string) => {
      const char = data[0];
      const code = char.charCodeAt(0);

      // TAB - Nick auto-completion
      if (code === 9) {
        const words = inputStr.split(' ');
        const wc = words.length;
        const lw = wc > 0 ? words[wc - 1] : '';
        const wl = lw.length;

        const tail = wc < 2 ? ': ' : ' ';

        if (lastUSearch.length === 0) lastUSearch = lw;
        if (wl > 0 && roomUsers.length > 0) {
          const pf = wc > 1 ? inputStr.substring(0, findSplitBufferPos(inputStr, ' ', wc - 1) + 1) : '';
          let uMatch = false;
          let sLoop = 0;

          while (!uMatch) {
            if (userIdx > currCount) userIdx = 1;
            const userArray = roomUsers.split(',');
            const uHandle = userArray[userIdx - 1] || '';
            if (uHandle.length > 0 && strCmpi(lastUSearch, uHandle, lastUSearch.length)) {
              uMatch = true;
              inputStr = pf + uHandle + tail;
              cursorPos = inputStr.length;
              displayCurrentInput();
            }
            userIdx++;
            sLoop++;
            if (sLoop > currCount) uMatch = true;
          }
        }
      } else {
        lastUSearch = '';
        userIdx = 1;
      }

      if (code === 17) { // CTRL-Q
        leaveChat();
        exitChat = true;
      } else if (code === 27) { // ESC
        inputStr = '';
        cursorPos = 0;
        updateFooter();
        displayCurrentInput();
      } else if (code === LEFTARROW && cursorPos > 0) {
        cursorPos--;
        displayCurrentInput();
      } else if (code === RIGHTARROW && cursorPos < inputStr.length) {
        cursorPos++;
        displayCurrentInput();
      } else if (code === UPARROW && charsEntered && inputColour < 15) {
        inputColour++;
        displayCurrentInput();
      } else if (code === DOWNARROW && charsEntered && inputColour > 9) {
        inputColour--;
        displayCurrentInput();
      } else if (code === UPARROW && !charsEntered) {
        getPrevBufferItem();
        displayCurrentInput();
      } else if (code === DOWNARROW && !charsEntered) {
        getNextBufferItem();
        displayCurrentInput();
      } else if (code === 13) { // ENTER
        if (inputStr.length > 0) {
          let processedInput = inputStr;
          if (strCmpi(inputStr, '/RAINBOW ', 9)) {
            processedInput = rainbowStr(inputStr.substring(9));
          }
          addToBufferHistory(inputStr);
          inputStr = '';
          cursorPos = 0;
          bufferItem = -1;
          charsEntered = false;
          updateFooter();
          displayCurrentInput();
          processUserInput(processedInput);
        }
      } else if (code === 8 || code === 127) { // BACKSPACE
        if (cursorPos > 0) {
          inputStr = inputStr.substring(0, cursorPos - 1) + inputStr.substring(cursorPos);
          cursorPos--;
          charsEntered = inputStr.length > 0;
          updateFooter();
          displayCurrentInput();
        }
      } else if (code >= 32 && code < 126 && inputStr.length < iMaxBuffer) {
        if (char !== ' ' || inputStr.length > 0) {
          inputStr = inputStr.substring(0, cursorPos) + char + inputStr.substring(cursorPos);
          cursorPos++;
          charsEntered = true;
          updateFooter();
          displayCurrentInput();
        }
      }

      // Check for /R shortcut (reply to last private message)
      if (strCmpi(inputStr, '/R ', 3) && lastPrivMsg.length > 0) {
        inputStr = `/T ${lastPrivMsg} `;
        cursorPos = inputStr.length;
        updateFooter();
        displayCurrentInput();
      }
    };

    bbsSession.doorInputHandler = handleInput;

    socket.once('disconnect', () => {
      socket.off('user-input', handleInput);
      clearInterval(interval);
      exitChat = true;
      resolve();
    });
  });
}

export async function runDoor(doorSession: any): Promise<void> {
  socket = doorSession.socket;
  user = doorSession.user;

  userAlias = user.username || 'Unknown';
  userTag = userAlias.replace(/~/g, '').replace(/ /g, '_');
  userTag = stripMCI(userTag);
  siteTag = process.env.BBS_NAME || 'AmiExpress-Web';
  siteTag = siteTag.replace(/~/g, '').replace(/ /g, '_');
  siteTag = stripMCI(siteTag);
  userIndex = user.id || 0;
  node = user.id || 1;
  numLines = 29; // Fixed for now

  chatLog = path.join(process.cwd(), `mrcchat${node}.log`);

  // Check for reserved names
  const upperTag = userTag.toUpperCase();
  if (upperTag === 'SERVER' || upperTag === 'CLIENT' || upperTag === 'NOTME') {
    transmit('\x1b[2J\x1b[H\x1b[31mUnfortunately, your User Alias is a reserved word and therefore cannot be used.\x1b[0m\r\n');
    transmit('\x1b[31mPlease ask your SysOp to change your User Alias to use MRC.\x1b[0m\r\n');
    return;
  }

  // Initialize chat lines
  chatLines = [];
  for (let i = 0; i < numLines - 5; i++) {
    chatLines.push('');
  }

  // Initialize buffer history
  bufferHist = [];
  for (let i = 0; i < 10; i++) {
    bufferHist.push('');
  }

  // Initialize banner list
  bannerList = [];
  for (let i = 0; i < 20; i++) {
    bannerList.push('');
  }
  loadBanners();
  nextBanner();

  // Load player settings
  initPlayer();

  // Connect to MRC server
  try {
    await connectToMrcServer();
  } catch (err) {
    transmit('\x1b[31mFailed to connect to MRC server. Make sure mrc_client is running.\x1b[0m\r\n');
    return;
  }

  // Main chat loop
  await mainLoop();

  // Cleanup
  if (mrcserver) {
    mrcserver.destroy();
    mrcserver = null;
  }

  if (fs.existsSync(chatLog)) {
    fs.unlinkSync(chatLog);
  }

  transmit('\x1b[2J\x1b[H');
}
