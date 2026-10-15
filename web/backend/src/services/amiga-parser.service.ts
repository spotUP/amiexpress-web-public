/**
 * Amiga BBS Parser Service
 *
 * Parses all Amiga AmiExpress BBS files for import.
 * Handles User.data, Conf.DB, .info files, caller logs, and more.
 *
 * Reference: reference-boardBBS (~/Downloads/BBS_COPY)
 */

import * as fs from 'fs/promises';
import { SCREEN_EXTENSIONS as SHARED_SCREEN_EXTENSIONS } from '../screens/screen-tables';
import * as path from 'path';
import { InfoFileParser } from './info-file-parser';
// The user-file format has one owner; the importer reads another board's
// files through it rather than keeping a second field layout.
import { userFileManager } from './UserFileManager';
import { readTooltypeMap } from '../utils/info-file.util';

/**
 * What the loader treats as a screen (express.e:6544-6640, and
 * screen-index.service.ts's own list). The extension IS the routing: `.GR` is
 * the graphics variant, `.SEQ` is PETSCII.
 */
// THE list, from the table that owns it: four copies of this array meant
// four answers to "is this a screen", and the `.Header`/`.Tailer` art was a
// screen to one of them and not to the others.
const SCREEN_EXTENSIONS = SHARED_SCREEN_EXTENSIONS;
// The AmiExpress on-disk header layout, which is NOT MessageIndexManager's -
// see amiga-msgheader.ts for the two alignment pads and why they matter here.
import { parseConfDb } from './amiga-confbase';
import { parseAmigaHeaderFile } from './amiga-msgheader';
import { UserFileManager } from './UserFileManager';
import { getSystemTime } from '../utils/date-time.util';
import { expandAmigaYear, fromAmigaTime } from '../utils/date-time.util';
import { parseCallerLogonLine, parseLogoffLine } from './CallersLogManager';
import type {
  AmigaBBSArchive,
  AmigaUserData,
  AmigaConference,
  ConferenceDatabase,
  AmigaFileArea,
  AmigaMessageBase,
  AmigaMessage,
  AmigaCommand,
  AmigaAccessLevel,
  AmigaBBSConfig,
  AmigaNodeData,
  AmigaCallersLogEntry,
  AmigaDoorLogEntry,
  AmigaBulletin,
  AmigaScreen,
} from '../types/amiga-import';

interface ConferenceConfigEntry {
  name?: string;
  location?: string;
}

export class AmigaParserService {
  private infoParser: InfoFileParser;
  private userFileManager: UserFileManager;

  constructor() {
    this.infoParser = new InfoFileParser();
    this.userFileManager = new UserFileManager();
  }

  /**
   * Find the actual BBS root directory within extracted archive
   * Handles cases where BBS files are in a subdirectory (e.g., BBS_COPY/)
   * @param extractedPath - Path to extracted archive directory
   * @returns Path to actual BBS root directory
   */
  private async findBBSRoot(extractedPath: string): Promise<string> {
console.log('[AmigaParser] Finding BBS root in:', extractedPath);

    // Check if BBS files are at root
    const userDataAtRoot = await this.fileExists(path.join(extractedPath, 'User.data'));
    const confAtRoot = await this.fileExists(path.join(extractedPath, 'Conf1'));
    const bbsConfigAtRoot = await this.fileExists(path.join(extractedPath, 'bbsConfig.info'));

    if (userDataAtRoot || confAtRoot || bbsConfigAtRoot) {
console.log('[AmigaParser] BBS files found at root');
      return extractedPath;
    }

    // Check immediate subdirectories
console.log('[AmigaParser] BBS files not at root, checking subdirectories...');
    try {
      const entries = await fs.readdir(extractedPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(extractedPath, entry.name);
          const userDataInSub = await this.fileExists(path.join(subPath, 'User.data'));
          const confInSub = await this.fileExists(path.join(subPath, 'Conf1'));
          const bbsConfigInSub = await this.fileExists(path.join(subPath, 'bbsConfig.info'));

          if (userDataInSub || confInSub || bbsConfigInSub) {
console.log(`[AmigaParser] BBS files found in subdirectory: ${entry.name}`);
            return subPath;
          }
        }
      }
    } catch (error: any) {
console.error('[AmigaParser] Error searching subdirectories:', error.message);
    }

    // Fallback to original path
console.log('[AmigaParser] BBS root not found, using extraction path as-is');
    return extractedPath;
  }

  /**
   * Parse complete BBS archive
   * @param extractedPath - Path to extracted archive directory
   * @param archiveFormat - Original archive format
   * @param archivePath - Original archive file path
   */
  async parseBBSArchive(
    extractedPath: string,
    archiveFormat: 'lha' | 'lzx' | 'zip',
    archivePath: string
  ): Promise<AmigaBBSArchive> {
console.log('[AmigaParser] Parsing BBS archive:', extractedPath);

    // Find actual BBS root (handles nested directories)
    const bbsRoot = await this.findBBSRoot(extractedPath);
console.log('[AmigaParser] Using BBS root:', bbsRoot);

    const archive: AmigaBBSArchive = {
      users: [],
      conferences: [],
      nodes: [],
      commands: [],
      access: [],
      config: await this.parseBBSConfig(bbsRoot),
      archiveFormat,
      archivePath,
      extractedPath,
      importDate: getSystemTime(),
    };

    // Parse users
    try {
      archive.users = await this.parseUserFiles(bbsRoot);
console.log(`[AmigaParser] Parsed ${archive.users.length} users`);
    } catch (error: any) {
console.error('[AmigaParser] User parsing error:', error.message);
    }

    // Parse conferences
    try {
      archive.conferences = await this.parseConferences(bbsRoot);
console.log(`[AmigaParser] Parsed ${archive.conferences.length} conferences`);
    } catch (error: any) {
console.error('[AmigaParser] Conference parsing error:', error.message);
    }

    // Parse nodes
    try {
      archive.nodes = await this.parseNodes(bbsRoot);
console.log(`[AmigaParser] Parsed ${archive.nodes.length} nodes`);
    } catch (error: any) {
console.error('[AmigaParser] Node parsing error:', error.message);
    }

    // Parse commands
    try {
      archive.commands = await this.parseCommands(bbsRoot);
console.log(`[AmigaParser] Parsed ${archive.commands.length} commands`);
    } catch (error: any) {
console.error('[AmigaParser] Command parsing error:', error.message);
    }

    // Parse access levels
    try {
      archive.access = await this.parseAccessLevels(bbsRoot);
console.log(`[AmigaParser] Parsed ${archive.access.length} access levels`);
    } catch (error: any) {
console.error('[AmigaParser] Access level parsing error:', error.message);
    }

    // Parse bulletins (optional)
    try {
      archive.bulletins = await this.parseBulletins(bbsRoot);
console.log(`[AmigaParser] Parsed ${archive.bulletins?.length || 0} bulletins`);
    } catch (error: any) {
console.error('[AmigaParser] Bulletin parsing error:', error.message);
    }

    // Parse screens (optional)
    try {
      archive.screens = await this.parseScreens(bbsRoot);
console.log(`[AmigaParser] Parsed ${archive.screens?.length || 0} screens`);
    } catch (error: any) {
console.error('[AmigaParser] Screen parsing error:', error.message);
    }

    return archive;
  }

  /**
   * Parse user files (User.data, User.keys, user.misc)
   * Leverages existing UserDatabaseManager
   */
  async parseUserFiles(bbsPath: string): Promise<AmigaUserData[]> {
    const userDataPath = path.join(bbsPath, 'User.data');
    const userKeysPath = path.join(bbsPath, 'User.keys');
    const userMiscPath = path.join(bbsPath, 'user.misc');

    // Check if files exist
    const dataExists = await this.fileExists(userDataPath);
    const keysExists = await this.fileExists(userKeysPath);
    const miscExists = await this.fileExists(userMiscPath);

    if (!dataExists) {
console.warn('[AmigaParser] User.data not found');
      return [];
    }

console.log('[AmigaParser] Reading user files:');
console.log(`  User.data: ${dataExists ? 'found' : 'missing'}`);
console.log(`  User.keys: ${keysExists ? 'found' : 'missing'}`);
console.log(`  user.misc: ${miscExists ? 'found' : 'missing'}`);

    // Parse binary user data files
    const users = await this.parseUserDataBinary(userDataPath, userKeysPath, userMiscPath);

    // Convert to AmigaUserData format
    const amigaUsers: AmigaUserData[] = users.map((user: any) => ({
      username: user.username,
      passwordHash: user.passwordHash || '',
      realname: user.realname,
      location: user.location,
      phone: user.phone,
      email: user.email,
      secLevel: user.secLevel,
      userFlags: user.userFlags || 0,
      uploads: user.uploads,
      downloads: user.downloads,
      bytesUpload: user.bytesUpload,
      bytesDownload: user.bytesDownload,
      ratio: user.ratio,
      ratioType: user.ratioType,
      timeTotal: user.timeTotal,
      timeLimit: user.timeLimit,
      timeUsed: user.timeUsed,
      chatLimit: user.chatLimit,
      chatUsed: user.chatUsed,
      lastLogin: user.lastLogin,
      firstLogin: user.firstLogin,
      calls: user.calls,
      callsToday: user.callsToday,
      newUser: user.newUser,
      expert: user.expert,
      ansi: user.ansi,
      linesPerScreen: user.linesPerScreen,
      computer: user.computer,
      screenType: user.screenType,
      protocol: user.protocol,
      editor: user.editor,
      zoomType: user.zoomType,
      availableForChat: user.availableForChat,
      quietNode: user.quietNode,
      autoRejoin: user.autoRejoin,
      confAccess: user.confAccess,
      areaName: user.areaName,
      uuCP: user.uuCP,
      topUploadCPS: user.topUploadCPS,
      topDownloadCPS: user.topDownloadCPS,
      byteLimit: user.byteLimit,
    }));

    return amigaUsers;
  }

  /**
   * Parse BBS configuration from bbsConfig.info
   */
  async parseBBSConfig(bbsPath: string): Promise<AmigaBBSConfig> {
    const configPath = path.join(bbsPath, 'bbsConfig.info');

    if (!(await this.fileExists(configPath))) {
console.warn('[AmigaParser] bbsConfig.info not found, using defaults');
      return {
        passwordSecurity: 'LEGACY',
        toolTypes: new Map(),
      };
    }

    const buffer = await fs.readFile(configPath);
    const toolTypes = this.infoParser.parseBBSConfig(buffer);

    // Convert tool types to config object
    const config: AmigaBBSConfig = {
      toolTypes,
      passwordSecurity: 'LEGACY',
    };

    // Extract common settings
    if (toolTypes.has('REGKEY')) config.regKey = toolTypes.get('REGKEY');
    if (toolTypes.has('SMTP_HOST')) config.smtpHost = toolTypes.get('SMTP_HOST');
    if (toolTypes.has('SMTP_PORT')) config.smtpPort = parseInt(toolTypes.get('SMTP_PORT') || '0', 10);
    if (toolTypes.has('SMTP_USERNAME')) config.smtpUsername = toolTypes.get('SMTP_USERNAME');
    if (toolTypes.has('SMTP_PASSWORD')) config.smtpPassword = toolTypes.get('SMTP_PASSWORD');
    if (toolTypes.has('SMTP_SSL')) config.smtpSSL = true;
    if (toolTypes.has('SYSOP_EMAIL')) config.sysopEmail = toolTypes.get('SYSOP_EMAIL');
    if (toolTypes.has('BBS_EMAIL')) config.bbsEmail = toolTypes.get('BBS_EMAIL');
    if (toolTypes.has('FTPPORT')) config.ftpPort = parseInt(toolTypes.get('FTPPORT') || '0', 10);
    if (toolTypes.has('FTPHOST')) config.ftpHost = toolTypes.get('FTPHOST');
    if (toolTypes.has('FTPDATAPORT')) config.ftpDataPorts = toolTypes.get('FTPDATAPORT');
    if (toolTypes.has('PASSWORD_SECURITY')) {
      const val = toolTypes.get('PASSWORD_SECURITY')?.toUpperCase();
      config.passwordSecurity = val === 'BCRYPT' ? 'BCRYPT' : 'LEGACY';
    }

    // Boolean flags
    config.mailOnNewUser = toolTypes.has('MAIL_ON_NEW_USER');
    config.mailOnSysopComment = toolTypes.has('MAIL_ON_SYSOP_COMMENT');
    config.mailOnPwdFail = toolTypes.has('MAIL_ON_PWD_FAIL');

    // Async execution
    if (toolTypes.has('EXECUTE_ASYNC_ON_LOGON')) {
      config.executeAsyncOnLogon = toolTypes.get('EXECUTE_ASYNC_ON_LOGON');
    }
    if (toolTypes.has('EXECUTE_ASYNC_ON_LOGOFF')) {
      config.executeAsyncOnLogoff = toolTypes.get('EXECUTE_ASYNC_ON_LOGOFF');
    }

    return config;
  }

  /**
   * Parse conferences (Conf1-Conf14 directories)
   */
  async parseConferences(bbsPath: string): Promise<AmigaConference[]> {
    const conferences: AmigaConference[] = [];
    const configMap = await this.parseConferenceConfig(bbsPath);

    // Scan for Conf* directories
    const entries = await fs.readdir(bbsPath, { withFileTypes: true });
    const confDirs = entries
      .filter(e => e.isDirectory() && /^Conf\d+$/i.test(e.name))
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || '0', 10);
        return numA - numB;
      });

    for (const confDir of confDirs) {
      const confNumber = parseInt(confDir.name.match(/\d+/)?.[0] || '0', 10);
      const confPath = path.join(bbsPath, confDir.name);
      const metadata = configMap.get(confNumber);

      try {
        const conference = await this.parseConference(confPath, confNumber, metadata);
        conferences.push(conference);
      } catch (error: any) {
console.error(`[AmigaParser] Error parsing ${confDir.name}:`, error.message);
      }
    }

    return conferences;
  }

  /**
   * Parse a single conference directory
   */
  async parseConference(
    confPath: string,
    confNumber: number,
    metadata?: ConferenceConfigEntry
  ): Promise<AmigaConference> {
console.log(`[AmigaParser] Parsing conference ${confNumber}...`);

    const conference: AmigaConference = {
      number: confNumber,
      database: await this.parseConferenceDB(confPath, confNumber, metadata),
      menu: await this.readTextFile(path.join(confPath, 'Menu.txt')),
      fileAreas: await this.parseFileAreas(confPath, this.conferenceDirCount(confPath, confNumber)),
      messageBases: await this.parseMessageBases(confPath, confNumber),
    };

    return conference;
  }

  /**
   * Parse conference database (Conf.DB)
   * TODO: Reverse engineer binary format
   */
  async parseConferenceDB(
    confPath: string,
    confNumber: number,
    metadata?: ConferenceConfigEntry
  ): Promise<ConferenceDatabase> {
    const dbPath = path.join(confPath, 'Conf.DB');

    if (!(await this.fileExists(dbPath))) {
console.warn(`[AmigaParser] Conf.DB not found in conference ${confNumber}`);
      return {
        conferenceNumber: confNumber,
        conferenceName: metadata?.name || `Conference ${confNumber}`,
        accessLevel: 10,
        flags: 0,
        type: 'BOTH',
      };
    }

    const buffer = await fs.readFile(dbPath);

    /*
     * Conf.DB is an array of per-USER records, not conference settings.
     * This used to read `TODO: Parse binary structure` over a hardcoded
     * accessLevel of 10, so an import threw away every caller's message
     * pointer, ratio, byte counters and new-scan flags for the conference
     * and invented an access level the source system does not have.
     * See services/amiga-confbase.ts for the layout and how it was checked.
     */
    const records = parseConfDb(buffer);
    console.log(
      `[AmigaParser] Conf.DB conference ${confNumber}: ${buffer.length} bytes, `
      + `${records.length} user slots`,
    );

    return {
      conferenceNumber: confNumber,
      conferenceName: metadata?.name || `Conference ${confNumber}`,
      // Not from this file - see the field's own comment.
      accessLevel: 10,
      flags: 0,
      type: 'BOTH',
      userRecords: records,
      userSlots: records.length,
      rawData: buffer,
    };
  }

  private async parseConferenceConfig(bbsPath: string): Promise<Map<number, ConferenceConfigEntry>> {
    const configPath = path.join(bbsPath, 'ConfConfig.info');
    const result = new Map<number, ConferenceConfigEntry>();

    if (!(await this.fileExists(configPath))) {
      return result;
    }

    try {
      const buffer = await fs.readFile(configPath);
      const parsed = this.infoParser.parse(buffer);

      for (const [key, value] of parsed.toolTypes.entries()) {
        const normalized = key.toUpperCase().trim();
        const match = normalized.match(/^(NAME|LOCATION)\.(\d+)$/);
        if (!match) continue;
        const confIndex = parseInt(match[2], 10);
        if (Number.isNaN(confIndex)) continue;

        const entry = result.get(confIndex) || {};

        if (match[1] === 'NAME') {
          entry.name = value.trim();
        } else if (match[1] === 'LOCATION') {
          entry.location = value.trim();
        }

        result.set(confIndex, entry);
      }
    } catch (error: any) {
console.error('[AmigaParser] Error parsing ConfConfig.info:', error.message);
    }

    return result;
  }

  /**
   * Parse file areas (Dir0.info, Dir1.info, etc.)
   */
  /**
   * How many file areas a conference HAS, from its own icon.
   *
   * `NDIRS` on `Conf<n>.info` is what AmiExpress reads (express.e:5006 and
   * 15264), and it bounds every directory operation the board does:
   * `Directory to Edit[1-<maxDirs>]`, refused outside
   * `1 <= which <= maxDirs` (express.e:10031-10042). Anything on disk past
   * that number is a leftover the board itself ignores.
   *
   * A conference with NO `NDIRS` has no file areas: `readToolTypeInt`
   * answers -1 for a key that is not there (tooltypes.e:176-181), and
   * `which <= -1` can never hold, so the board offers no directory at all.
   * 0 here reaches the same answer through the same test.
   */
  private conferenceDirCount(confPath: string, confNumber: number): number {
    try {
      const icon = path.join(path.dirname(confPath), `Conf${confNumber}.info`);
      const count = parseInt(readTooltypeMap(icon).get('NDIRS') ?? '', 10);
      return Number.isFinite(count) && count >= 0 ? count : 0;
    } catch {
      return 0;
    }
  }

  /**
   * A conference's file areas - the ones the BOARD has, not the ones left on
   * disk.
   *
   * This used to import every `Dir<n>.info` it could see. On the reference-boardBBS
   * reference tree Conf1 declares `NDIRS=1` and carries Dir0, Dir1 and Dir2,
   * so an import created three file areas where the board has one - and Dir0
   * is not a numbered area at all, because express.e numbers them from 1.
   */
  async parseFileAreas(confPath: string, maxDirs = 0): Promise<AmigaFileArea[]> {
    const fileAreas: AmigaFileArea[] = [];
    const entries = await fs.readdir(confPath);

    const dirInfoFiles = entries
      .filter(f => /^Dir\d+\.info$/i.test(f))
      .filter(f => {
        const n = parseInt(f.match(/\d+/)?.[0] || '0', 10);
        return n >= 1 && n <= maxDirs;
      });

    for (const file of dirInfoFiles) {
      const areaNumber = parseInt(file.match(/\d+/)?.[0] || '0', 10);
      const infoPath = path.join(confPath, file);
      const buffer = await fs.readFile(infoPath);
      const settings = this.infoParser.parseFileAreaInfo(buffer, `Dir${areaNumber}`);

      fileAreas.push({
        number: areaNumber,
        name: settings.get('NAME') || `File Area ${areaNumber}`,
        description: settings.get('DESCRIPTION'),
        path: settings.get('PATH') || `Dir${areaNumber}`,
        accessLevel: parseInt(settings.get('ACCESS_LEVEL') || '10', 10),
        uploadAccessLevel: parseInt(settings.get('UPLOAD_ACCESS') || '20', 10),
        settings,
      });
    }

    return fileAreas;
  }

  /**
   * Parse message bases for a conference
   * AmiExpress stores messages in MsgBase directory with binary HeaderFile
   * Format: HeaderFile contains message headers/bodies in proprietary binary format
   */
  /**
   * A conference's message bases, as the BOARD declares them.
   *
   * express.e reads `NMSGBASES` from `<conf>/MsgBases` and treats a missing
   * key as ONE base (getConfMsgBaseCount, express.e:2048-2052). Each base's
   * name is `NAME.<n>` (getMsgBaseName, 2054-2058) and its location is
   * `LOCATION.<n>`, falling back to `<conf>/MsgBase/` when the count is
   * absent or the index is out of range (getMsgBaseLocation, 2061-2073).
   *
   * This used to read none of that. It looked for a `MsgBase` directory, and
   * if one existed invented a single base called
   * `Conference <n> Messages` - so a board with three named message bases
   * imported as one, under a name it had never had.
   *
   * Message CONTENT is still not imported. The board reads its own
   * HeaderFile and bodies through `utils/message-file.util.ts`; wiring that
   * in here is the next piece, and until it is done an import brings the
   * bases and not the messages in them.
   */
  async parseMessageBases(confPath: string, confNumber: number): Promise<AmigaMessageBase[]> {
    const declared = this.messageBaseTooltypes(confPath);
    const count = this.messageBaseCount(declared);

    const bases: AmigaMessageBase[] = [];

    for (let n = 1; n <= count; n++) {
      // `LOCATION.<n>` is an Amiga path like `BBS:Conf1/MsgBase`, absolute
      // from the BOARD root and not from the conference - resolving it
      // against the conference gives Conf1/Conf1/MsgBase.
      const location = declared?.get(`LOCATION.${n}`)?.trim();
      const basePath = location
        ? path.resolve(path.dirname(confPath), location.replace(/^[^:]*:/, '').replace(/\/+$/, ''))
        : path.join(confPath, 'MsgBase');

      if (!(await this.fileExists(basePath))) continue;

      bases.push({
        // The board's own name for it. An unnamed base is unnamed - inventing
        // one is how `Conference 1 Messages` appeared on boards that never
        // used the phrase.
        name: declared?.get(`NAME.${n}`)?.trim() || `Message base ${n}`,
        path: basePath,
        messages: await this.readMessages(basePath),
      });
    }

    if (bases.length === 0) {
      // A board can keep messages in `Messages/` instead; express.e's
      // fallback location is MsgBase, so this is only reached when neither
      // is where the icon said.
      const messagesPath = path.join(confPath, 'Messages');
      if (await this.fileExists(messagesPath)) {
        bases.push({ name: `Message base 1`, path: messagesPath, messages: [] });
      }
    }

    return bases;
  }

  /**
   * The messages in one message base.
   *
   * `HeaderFile` is an array of 110-byte records holding from, to, subject,
   * date and the message number; the body of message N is the file `N` beside
   * it.
   *
   * Parsed by `amiga-msgheader.ts`, NOT by MessageIndexManager: the port's
   * own records put their two alignment pads at the END of the struct, and a
   * real Amiga board puts them after `status` and after `subject`. Reading a
   * real board with the port's layout gives message number 0 for every
   * message and names overlapped by the previous record.
   *
   * This used to return nothing at all, under a comment saying the format
   * `requires reverse engineering` - written before the project had read it.
   * An import brought conferences and no conversations.
   */
  private async readMessages(basePath: string): Promise<AmigaMessage[]> {
    const headerPath = path.join(basePath, 'HeaderFile');

    let headerBuffer: Buffer;
    try {
      headerBuffer = await fs.readFile(headerPath);
    } catch {
      // A base with no HeaderFile has no messages; an empty base is normal.
      return [];
    }

    const messages: AmigaMessage[] = [];

    for (const header of parseAmigaHeaderFile(headerBuffer)) {
      // A body that is gone is not a reason to lose the header: the message
      // still existed, and importing it with an empty body keeps the thread
      // readable.
      let body = '';
      try {
        body = await fs.readFile(path.join(basePath, String(header.msgNumb)), 'latin1');
      } catch {
        body = '';
      }

      messages.push({
        number: header.msgNumb,
        from: header.fromName,
        to: header.toName,
        subject: header.subject,
        // msgDate is express.e's getSystemTime() form (MiscFuncs.e:463-469).
        date: fromAmigaTime(header.msgDate),
        body: body.endsWith('\n') ? body.slice(0, -1) : body,
        flags: header.status,
      });
    }

    return messages;
  }

  /** The `<conf>/MsgBases` icon's tooltypes, or undefined when there is none. */
  private messageBaseTooltypes(confPath: string): Map<string, string> | undefined {
    try {
      return readTooltypeMap(path.join(confPath, 'MsgBases.info'));
    } catch {
      return undefined;
    }
  }

  /** `NMSGBASES`, or one - express.e:2051 turns a missing key into 1. */
  private messageBaseCount(declared: Map<string, string> | undefined): number {
    const raw = parseInt(declared?.get('NMSGBASES') ?? '', 10);
    return Number.isFinite(raw) && raw >= 1 ? raw : 1;
  }

  /**
   * Parse nodes (Node0-Node5 directories)
   */
  async parseNodes(bbsPath: string): Promise<AmigaNodeData[]> {
    const nodes: AmigaNodeData[] = [];
    const entries = await fs.readdir(bbsPath, { withFileTypes: true });
    const nodeDirs = entries.filter(e => e.isDirectory() && /^Node\d+$/i.test(e.name));

    for (const nodeDir of nodeDirs) {
      const nodeNumber = parseInt(nodeDir.name.match(/\d+/)?.[0] || '0', 10);
      const nodePath = path.join(bbsPath, nodeDir.name);

      try {
        const node = await this.parseNode(nodePath, nodeNumber);
        nodes.push(node);
      } catch (error: any) {
console.error(`[AmigaParser] Error parsing ${nodeDir.name}:`, error.message);
      }
    }

    return nodes;
  }

  /**
   * Parse a single node directory
   * Port from express.e:9493-9518 (callersLog), 9396-9406 (doorLog), 8968-8992 (errorLog)
   */
  async parseNode(nodePath: string, nodeNumber: number): Promise<AmigaNodeData> {
    const callersLog = await this.parseCallersLog(nodePath, nodeNumber);
    const doorLog = await this.parseDoorLog(nodePath);
    const errorLog = await this.parseErrorLog(nodePath);

    return {
      nodeNumber,
      callersLog,
      doorLog,
      errorLog,
    };
  }

  /**
   * Parse CallersLog file - the lines express.e writes:
   *   logon   express.e:16034-16042  `10-04-26 (17:37:02) [7] regress (CONNECT 19200) Test Account`
   *                                   (`NEW [n]` on an account's first call)
   *   logoff  express.e:9467-9471    `10-04-26 (17:41:11) regress Off Normally`
   * The date is formatLongDate's FORMAT_USA MM-DD-YY and the time HH:MM:SS
   * (MiscFuncs.e:278-318). Every other line is a tab-indented detail line.
   * The `[n]` is the account's slot, not the node: the node is the
   * directory the log lives in.
   */
  private async parseCallersLog(nodePath: string, nodeNumber: number): Promise<AmigaCallersLogEntry[]> {
    const logPath = path.join(nodePath, 'CallersLog');
    const entries: AmigaCallersLogEntry[] = [];

    if (!(await this.fileExists(logPath))) {
      return entries;
    }

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n');

      let currentEntry: Partial<AmigaCallersLogEntry> | null = null;

      for (const line of lines) {
        const logon = parseCallerLogonLine(line);
        if (logon) {
          if (currentEntry && currentEntry.username) {
            entries.push(this.finalizeCallersLogEntry(currentEntry));
          }
          currentEntry = {
            username: logon.name,
            loginTime: this.parseUsaDateTime(logon.date, logon.time),
            node: nodeNumber,
            location: logon.location.trim() || undefined,
            baud: this.extractBaudRate(logon.connectString),
            uploaded: 0,
            downloaded: 0,
            messagesRead: 0,
            messagesPosted: 0,
            duration: 0,
          };
          continue;
        }
        const logoff = currentEntry ? parseLogoffLine(line) : null;
        if (logoff && currentEntry) {
          const logoffTime = this.parseUsaDateTime(logoff.date, logoff.time);
          currentEntry.logoffTime = logoffTime;
          if (currentEntry.loginTime) {
            currentEntry.duration = Math.floor((logoffTime.getTime() - currentEntry.loginTime.getTime()) / 60000);
          }
          entries.push(this.finalizeCallersLogEntry(currentEntry));
          currentEntry = null;
        }
      }

      // Save last entry if exists
      if (currentEntry && currentEntry.username) {
        entries.push(this.finalizeCallersLogEntry(currentEntry));
      }

      return entries;
    } catch (error: any) {
console.error(`[AmigaParser] Error parsing CallersLog:`, error.message);
      return entries;
    }
  }

  /**
   * A CallersLog stamp: formatLongDate/formatLongTime, FORMAT_USA
   * (MiscFuncs.e:278-318) - `MM-DD-YY` and `HH:MM:SS`, the century by
   * expandAmigaYear.
   */
  private parseUsaDateTime(dateStr: string, timeStr: string): Date {
    const [mm, dd, yy] = dateStr.split('-').map(n => parseInt(n, 10));
    const [h, m, sec] = timeStr.split(':').map(n => parseInt(n, 10));
    return new Date(expandAmigaYear(yy), mm - 1, dd, h, m, sec);
  }

  /**
   * Parse DoorLog file
   * Format from express.e:9396-9406
   * Text log of door activity
   */
  private async parseDoorLog(nodePath: string): Promise<AmigaDoorLogEntry[]> {
    const logPath = path.join(nodePath, 'DoorLog');
    const entries: AmigaDoorLogEntry[] = [];

    if (!(await this.fileExists(logPath))) {
      return entries;
    }

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);

      for (const line of lines) {
        // Skip divider lines
        if (line.startsWith('---')) {
          continue;
        }

        // Parse door log entry: "Date (Time) Username DoorName Duration"
        const match = line.match(/^(\d{2}-\w{3}-\d{4})\s+\((\d{2}:\d{2}:\d{2})\)\s+(\S+)\s+(.+?)\s+(\d+)\s+min/);
        if (match) {
          const [, date, time, username, doorName, durationStr] = match;
          const startTime = this.parseAmigaDateTime(date, time);

          entries.push({
            username,
            doorName: doorName.trim(),
            startTime,
            duration: parseInt(durationStr, 10),
            node: parseInt(nodePath.match(/Node(\d+)/)?.[1] || '0', 10),
          });
        }
      }

      return entries;
    } catch (error: any) {
console.error(`[AmigaParser] Error parsing DoorLog:`, error.message);
      return entries;
    }
  }

  /**
   * Parse ErrorLog file
   * Format from express.e:8968-8992
   * Simple text log: "Date Time ErrorMessage"
   */
  private async parseErrorLog(nodePath: string): Promise<string[]> {
    const logPath = path.join(nodePath, 'ErrorLog');
    const errors: string[] = [];

    if (!(await this.fileExists(logPath))) {
      return errors;
    }

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);

      for (const line of lines) {
        // Each line is a complete error entry
        if (line.trim().length > 0) {
          errors.push(line.trim());
        }
      }

      return errors;
    } catch (error: any) {
console.error(`[AmigaParser] Error parsing ErrorLog:`, error.message);
      return errors;
    }
  }

  /**
   * Helper: Finalize a partial callers log entry
   */
  private finalizeCallersLogEntry(entry: Partial<AmigaCallersLogEntry>): AmigaCallersLogEntry {
    return {
      username: entry.username || 'Unknown',
      loginTime: entry.loginTime || getSystemTime(),
      logoffTime: entry.logoffTime,
      duration: entry.duration || 0,
      uploaded: entry.uploaded || 0,
      downloaded: entry.downloaded || 0,
      messagesRead: entry.messagesRead || 0,
      messagesPosted: entry.messagesPosted || 0,
      node: entry.node || 0,
      baud: entry.baud,
      location: entry.location,
    };
  }

  /**
   * Helper: Parse Amiga date/time format
   * Format: "01-Jan-2026" and "12:34:56"
   */
  /**
   * A CallersLog timestamp, in the shape a real board writes.
   *
   * This assumed `DD-Mon-YYYY` with `HH:MM:SS` and got neither. AmiExpress
   * builds the line from formatLongDate/formatLongTime (MiscFuncs.e:278-318),
   * which go through AmigaDOS DateToStr - a TWO digit year - and this board's
   * own logs read `26-May-26 16:55`, minutes and no seconds. Parsing
   * "26-May-26" as written gave `new Date(26, 4, 26)`: the year 26 AD, and a
   * missing seconds field made it an Invalid Date anyway.
   *
   * The century comes from expandAmigaYear, which is the board's own rule.
   */
  private parseAmigaDateTime(dateStr: string, timeStr: string): Date {
    try {
      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };

      const [dayStr, monthStr, yearStr] = dateStr.split('-');
      const [hour, minute, second] = timeStr.split(':');

      const month = months[String(monthStr).toLowerCase()] ?? 0;
      const year = expandAmigaYear(parseInt(yearStr, 10));

      return new Date(
        year,
        month,
        parseInt(dayStr, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        // FORMAT_DOS carries no seconds, and a NaN here is an Invalid Date.
        second === undefined ? 0 : parseInt(second, 10)
      );
    } catch (error) {
      return getSystemTime();
    }
  }

  /**
   * Helper: Extract baud rate from connect string
   * Example: "CONNECT 28800" -> 28800
   */
  private extractBaudRate(connectStr: string): number | undefined {
    const match = connectStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Parse commands (Commands/BBSCmd/*.info, etc.)
   */
  async parseCommands(bbsPath: string): Promise<AmigaCommand[]> {
    const commands: AmigaCommand[] = [];
    const commandsPath = path.join(bbsPath, 'Commands');

    if (!(await this.fileExists(commandsPath))) {
      return commands;
    }

    // Parse BBSCmd
    const bbsCmdPath = path.join(commandsPath, 'BBSCmd');
    if (await this.fileExists(bbsCmdPath)) {
      const bbsCmds = await this.parseCommandDirectory(bbsCmdPath, 'BBSCMD');
      commands.push(...bbsCmds);
    }

    // Parse SysCmd
    const sysCmdPath = path.join(commandsPath, 'SysCmd');
    if (await this.fileExists(sysCmdPath)) {
      const sysCmds = await this.parseCommandDirectory(sysCmdPath, 'SYSCMD');
      commands.push(...sysCmds);
    }

    return commands;
  }

  /**
   * Parse a command directory
   */
  async parseCommandDirectory(cmdPath: string, type: 'BBSCMD' | 'SYSCMD'): Promise<AmigaCommand[]> {
    const commands: AmigaCommand[] = [];
    const entries = await fs.readdir(cmdPath);
    const infoFiles = entries.filter(f => f.endsWith('.info'));

    for (const file of infoFiles) {
      const name = file.replace(/\.info$/i, '');
      const settings = readTooltypeMap(path.join(cmdPath, file));

      /*
       * The tooltype names AmiExpress actually uses.
       *
       * This read ACCESS_LEVEL, PATH and FLAGS - none of which appear on an
       * AmiExpress command icon. express.e reads ACCESS (4702), LOCATION
       * (4751) and TYPE (4682-4700). So every command imported at the default
       * level 10 with no location: on the reference-boardBBS reference tree that
       * turned DEL, a sysop-only file manager at ACCESS=255, into a command
       * any level-10 caller could run, and pointed it nowhere.
       */
      const access = parseInt(settings.get('ACCESS') ?? '', 10);

      commands.push({
        name,
        type,
        path: settings.get('LOCATION'),
        description: settings.get('NAME'),
        // No ACCESS on the icon means the board's own default, not ours. -1
        // is what readToolTypeInt answers for a missing key
        // (tooltypes.e:176-181), and it is not a level anyone can reach.
        accessLevel: Number.isFinite(access) ? access : -1,
        flags: 0,
        settings,
      });
    }

    return commands;
  }

  /**
   * Parse access levels (Access/ACS.*.info)
   */
  async parseAccessLevels(bbsPath: string): Promise<AmigaAccessLevel[]> {
    const accessLevels: AmigaAccessLevel[] = [];
    const accessPath = path.join(bbsPath, 'Access');

    if (!(await this.fileExists(accessPath))) {
      return accessLevels;
    }

    const entries = await fs.readdir(accessPath);
    const acsFiles = entries.filter(f => /^ACS\.\d+\.info$/i.test(f));

    for (const file of acsFiles) {
      const level = parseInt(file.match(/\d+/)?.[0] || '0', 10);
      const infoPath = path.join(accessPath, file);
      const buffer = await fs.readFile(infoPath);
      const settings = this.infoParser.parseAccessInfo(buffer, level);

      accessLevels.push({
        level,
        name: settings.get('NAME') || `Level ${level}`,
        description: settings.get('DESCRIPTION'),
        canUpload: settings.get('CAN_UPLOAD') === 'YES',
        canDownload: settings.get('CAN_DOWNLOAD') === 'YES',
        canPost: settings.get('CAN_POST') === 'YES',
        canRead: settings.get('CAN_READ') === 'YES',
        canChat: settings.get('CAN_CHAT') === 'YES',
        canUseDoors: settings.get('CAN_USE_DOORS') === 'YES',
        timeLimit: parseInt(settings.get('TIME_LIMIT') || '60', 10),
        downloadLimit: parseInt(settings.get('DOWNLOAD_LIMIT') || '0', 10),
        uploadRatio: parseInt(settings.get('UPLOAD_RATIO') || '0', 10),
        settings,
      });
    }

    return accessLevels;
  }

  /**
   * Parse bulletins
   */
  async parseBulletins(bbsPath: string): Promise<AmigaBulletin[]> {
    const bulletins: AmigaBulletin[] = [];
    const bulletinsPath = path.join(bbsPath, 'Bulletins');

    if (!(await this.fileExists(bulletinsPath))) {
      return bulletins;
    }

    const entries = await fs.readdir(bulletinsPath);
    const bulletinFiles = entries.filter(f => f.endsWith('.txt') || f.endsWith('.TXT'));

    for (const file of bulletinFiles) {
      const content = await this.readTextFile(path.join(bulletinsPath, file));
      bulletins.push({
        name: file,
        content,
      });
    }

    return bulletins;
  }

  /**
   * Parse screens
   */
  /**
   * Every screen on the board, wherever the board keeps it.
   *
   * This used to read `<bbs>/Screens/` and nothing else, so a node's own
   * screens and a conference's were never imported at all - and on a real
   * board that is most of them. It also matched only `.txt` and `.ans`,
   * missing `.gr`, `.ibm`, `.seq`, `.rip` and `.asc`, which the loader routes
   * on (express.e:6544-6640).
   */
  async parseScreens(bbsPath: string): Promise<AmigaScreen[]> {
    const screens: AmigaScreen[] = [];

    for (const dir of await this.screenDirectories(bbsPath)) {
      const full = path.join(bbsPath, dir);

      let entries: string[];
      try {
        entries = await fs.readdir(full);
      } catch {
        continue;
      }

      for (const file of entries) {
        if (!SCREEN_EXTENSIONS.some(ext => file.toLowerCase().endsWith(ext))) continue;

        const filePath = path.join(full, file);
        try {
          if (!(await fs.stat(filePath)).isFile()) continue;
        } catch {
          continue;
        }

        screens.push({
          name: file,
          relPath: path.join(dir, file),
          // Bytes. A screen is art, and reading it as UTF-8 replaces every
          // high-bit character with U+FFFD without raising anything.
          content: await fs.readFile(filePath),
          type: file.toLowerCase().endsWith('.ans') ? 'ANSI' : 'ASCII',
        });
      }
    }

    return screens;
  }

  /**
   * The directories a board keeps screens in.
   *
   * `Screens/` at the root, each node's own directory and its `Screens/`
   * subdirectory, and the same for every conference - which is where
   * express.e looks (screen-resolution mirrors it).
   */
  private async screenDirectories(bbsPath: string): Promise<string[]> {
    const dirs = ['Screens'];

    let entries: string[];
    try {
      entries = await fs.readdir(bbsPath);
    } catch {
      return dirs;
    }

    for (const entry of entries) {
      if (!/^(Node|Conf)\d+$/i.test(entry)) continue;
      dirs.push(entry, path.join(entry, 'Screens'));
    }

    return dirs;
  }

  /**
   * Helper: Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse Amiga binary user data files
   * Reads User.data (239 bytes), User.keys (54 bytes), and user.misc (256 bytes) per user
   */
  private async parseUserDataBinary(
    dataPath: string,
    keysPath: string,
    miscPath: string
  ): Promise<any[]> {
console.log('[AmigaParser] Parsing binary user data files');
console.log(`[AmigaParser]   Data file: ${dataPath}`);
console.log(`[AmigaParser]   Keys file: ${keysPath}`);
console.log(`[AmigaParser]   Misc file: ${miscPath}`);

    const users: any[] = [];

    try {
      // Read all three files
      const dataBuffer = await fs.readFile(dataPath);
      const keysBuffer = await fs.readFile(keysPath);
      const miscBuffer = await fs.readFile(miscPath);

      // Read the records through UserFileManager, which OWNS this format.
      //
      // This used to walk the fields itself, from the 239-byte struct listing
      // in axobjects.e:11-68. A door reads 232 (mtop.e, and Amiga E alignment
      // is why they differ), so it read 239 bytes at a 232-byte stride: every
      // record after the first was skewed, and the LAST one ran past the end
      // of the file, threw, and the catch below returned an empty array. The
      // importer produced zero users from every board it was ever pointed at -
      // proved against the reference-boardBBS reference tree, whose User.data is
      // exactly two records long.
      const size = userFileManager.USER_STRUCT_SIZE;
      const keysSize = userFileManager.USERKEYS_STRUCT_SIZE;
      const miscSize = userFileManager.USERMISC_STRUCT_SIZE;

      const numUsersData = Math.floor(dataBuffer.length / size);
      const numUsersKeys = Math.floor(keysBuffer.length / keysSize);
      const numUsersMisc = Math.floor(miscBuffer.length / miscSize);

console.log(`[AmigaParser] User counts: data=${numUsersData}, keys=${numUsersKeys}, misc=${numUsersMisc}`);

      const numUsers = Math.min(numUsersData, numUsersKeys, numUsersMisc);

      for (let i = 0; i < numUsers; i++) {
        const data = userFileManager.deserializeUserStruct(dataBuffer, i * size);
        const keys = userFileManager.deserializeUserKeysStruct(keysBuffer, i * keysSize);
        const misc = userFileManager.deserializeUserMiscStruct(miscBuffer, i * miscSize);

        // An empty slot is a deleted account, not a caller to import.
        if (!data.name || data.name.trim().length === 0) continue;

        users.push({
          ...data,
          ...keys,
          ...misc,
          // The names this service's own callers read, mapped from the
          // struct's E names rather than duplicated field reads.
          username: data.name,
          securityLevel: data.secStatus,
          secLevel: data.secStatus,
          phone: data.phoneNumber,
          slotNumber: data.slotNumber,
        });
      }

      console.log(`[AmigaParser] Parsed ${users.length} users from binary files`);
      return users;
    } catch (error: any) {
console.error(`[AmigaParser] Error parsing user binary files:`, error.message);
      return [];
    }
  }

  /**
   * Parse a single User.data record (239 bytes)
   * Based on UserFileManager.ts:252-354
   */
  private parseUserDataRecord(buffer: Buffer, offset: number): any {
    let pos = offset;

    // Strings (null-terminated, fixed width)
    const name = this.readString(buffer, pos, 31); pos += 31;
    const pass = this.readString(buffer, pos, 9); pos += 9;
    const location = this.readString(buffer, pos, 30); pos += 30;
    const phoneNumber = this.readString(buffer, pos, 13); pos += 13;

    // INTs (2 bytes each, big-endian)
    const slotNumber = buffer.readInt16BE(pos); pos += 2;
    const secStatus = buffer.readInt16BE(pos); pos += 2;
    const secBoard = buffer.readInt16BE(pos); pos += 2;
    const secLibrary = buffer.readInt16BE(pos); pos += 2;
    const secBulletin = buffer.readInt16BE(pos); pos += 2;
    const messagesPosted = buffer.readInt16BE(pos); pos += 2;

    // LONGs (4 bytes each, big-endian)
    const newSinceDate = buffer.readInt32BE(pos); pos += 4;
    const pwdHash = buffer.readInt32BE(pos); pos += 4;
    const confRead2 = buffer.readInt32BE(pos); pos += 4;
    const confRead3 = buffer.readInt32BE(pos); pos += 4;

    // More INTs
    const zoomType = buffer.readInt16BE(pos); pos += 2;
    const unknown = buffer.readInt16BE(pos); pos += 2;
    const unknown2 = buffer.readInt16BE(pos); pos += 2;
    const unknown3 = buffer.readInt16BE(pos); pos += 2;
    const xferProtocol = buffer.readInt16BE(pos); pos += 2;
    const filler2 = buffer.readInt16BE(pos); pos += 2;
    const lcFiles = buffer.readInt16BE(pos); pos += 2;
    const badFiles = buffer.readInt16BE(pos); pos += 2;

    // More LONGs
    const accountDate = buffer.readInt32BE(pos); pos += 4;

    // More INTs
    const screenType = buffer.readInt16BE(pos); pos += 2;
    const editorType = buffer.readInt16BE(pos); pos += 2;

    // Conference access string
    const conferenceAccess = this.readString(buffer, pos, 10); pos += 10;

    // More INTs
    const uploads = buffer.readInt16BE(pos); pos += 2;
    const downloads = buffer.readInt16BE(pos); pos += 2;
    const confRJoin = buffer.readInt16BE(pos); pos += 2;
    const timesCalled = buffer.readInt16BE(pos); pos += 2;

    // LONGs
    const timeLastOn = buffer.readInt32BE(pos); pos += 4;
    const timeUsed = buffer.readInt32BE(pos); pos += 4;
    const timeLimit = buffer.readInt32BE(pos); pos += 4;
    const timeTotal = buffer.readInt32BE(pos); pos += 4;
    const bytesDownload = buffer.readInt32BE(pos); pos += 4;
    const bytesUpload = buffer.readInt32BE(pos); pos += 4;
    const dailyBytesLimit = buffer.readInt32BE(pos); pos += 4;
    const dailyBytesDld = buffer.readInt32BE(pos); pos += 4;

    // CHAR
    const expert = buffer.readUInt8(pos); pos += 1;

    // Padding (3 bytes for LONG alignment)
    pos += 3;

    // More LONGs
    const chatRemain = buffer.readInt32BE(pos); pos += 4;
    const chatLimit = buffer.readInt32BE(pos); pos += 4;
    const creditDays = buffer.readInt32BE(pos); pos += 4;
    const creditAmount = buffer.readInt32BE(pos); pos += 4;
    const creditStartDate = buffer.readInt32BE(pos); pos += 4;
    const creditTotalToDate = buffer.readInt32BE(pos); pos += 4;
    const creditTotalDate = buffer.readInt32BE(pos); pos += 4;

    // CHARs
    const creditTracking = buffer.readUInt8(pos); pos += 1;
    const translatorID = buffer.readUInt8(pos); pos += 1;

    // INT
    const msgBaseRJoin = buffer.readInt16BE(pos); pos += 2;

    // LONGs
    const confYM9 = buffer.readInt32BE(pos); pos += 4;
    const todaysBytesLimit = buffer.readInt32BE(pos); pos += 4;

    // CHARs
    const protocol = buffer.readUInt8(pos); pos += 1;
    const uucpa = buffer.readUInt8(pos); pos += 1;
    const lineLength = buffer.readUInt8(pos); pos += 1;
    const newUser = buffer.readUInt8(pos); pos += 1;

    return {
      username: name,
      location,
      phoneNumber,
      slotNumber,
      securityLevel: secStatus,
      secBoard,
      secLibrary,
      secBulletin,
      messagesPosted,
      newSinceDate,
      zoomType,
      xferProtocol,
      accountDate,
      screenType,
      editorType,
      conferenceAccess,
      uploads,
      downloads,
      confRJoin,
      timesCalled,
      timeLastOn,
      timeUsed,
      timeLimit,
      timeTotal,
      bytesDownload,
      bytesUpload,
      dailyBytesLimit,
      dailyBytesDld,
      expert: expert !== 0,
      chatRemain,
      chatLimit,
      creditDays,
      creditAmount,
      creditStartDate,
      creditTotalToDate,
      creditTotalDate,
      creditTracking,
      translatorID,
      msgBaseRJoin,
      todaysBytesLimit,
      protocol,
      uucpa,
      lineLength,
      newUser: newUser !== 0,
    };
  }

  /**
   * Parse a single User.keys record (54 bytes)
   * Based on UserFileManager.ts:357-376
   */
  private parseUserKeysRecord(buffer: Buffer, offset: number): any {
    let pos = offset;

    const userName = this.readString(buffer, pos, 31); pos += 31;
    const number = buffer.readInt32BE(pos); pos += 4;
    const newUser = buffer.readUInt8(pos); pos += 1;
    const oldUpCPS = buffer.readInt16BE(pos); pos += 2;
    const oldDnCPS = buffer.readInt16BE(pos); pos += 2;
    const userFlags = buffer.readInt16BE(pos); pos += 2;
    const baud = buffer.readInt16BE(pos); pos += 2;
    const upCPS2 = buffer.readInt32BE(pos); pos += 4;
    const dnCPS2 = buffer.readInt32BE(pos); pos += 4;
    const timesOnToday = buffer.readInt16BE(pos); pos += 2;

    return {
      userNumber: number,
      userFlags,
      baud,
      upCPS: upCPS2,
      dnCPS: dnCPS2,
      timesOnToday,
    };
  }

  /**
   * Parse a single user.misc record (256 bytes)
   * Based on UserFileManager.ts:379-409
   */
  private parseUserMiscRecord(buffer: Buffer, offset: number): any {
    let pos = offset;

    const internetName = this.readString(buffer, pos, 10); pos += 10;
    const realName = this.readString(buffer, pos, 26); pos += 26;

    // Skip BCD fields (16 bytes)
    pos += 8; // downloadBytesBCD
    pos += 8; // uploadBytesBCD

    const eMail = this.readString(buffer, pos, 50); pos += 50;
    const lastDlCPS = buffer.readInt32BE(pos); pos += 4;

    // Password hash (32 bytes)
    const pwdHash = this.readString(buffer, pos, 32); pos += 32;

    // Salt (8 bytes)
    const salt = this.readString(buffer, pos, 8); pos += 8;

    // CHARs
    const pwdType = buffer.readUInt8(pos); pos += 1;
    const forcePwdReset = buffer.readUInt8(pos); pos += 1;
    const accountLocked = buffer.readUInt8(pos); pos += 1;
    const invalidAttempts = buffer.readUInt8(pos); pos += 1;

    // LONGs
    const pwdLastUpdated = buffer.readInt32BE(pos); pos += 4;
    const lastIP = buffer.readInt32BE(pos); pos += 4;
    const ipMask = buffer.readInt32BE(pos); pos += 4;

    // Skip unused (86 bytes)
    pos += 86;

    return {
      realname: realName, // Use lowercase to match database schema
      email: eMail,
      lastDlCPS,
      passwordHash: pwdHash,
      forcePwdReset: forcePwdReset !== 0,
      accountLocked: accountLocked !== 0,
      invalidAttempts,
      pwdLastUpdated,
      lastIP,
      ipMask,
    };
  }

  /**
   * Read null-terminated string from buffer
   */
  private readString(buffer: Buffer, offset: number, maxLen: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const byte = buffer.readUInt8(offset + i);
      if (byte === 0) break; // Null terminator
      bytes.push(byte);
    }
    // Use latin1 encoding (Amiga default)
    return Buffer.from(bytes).toString('latin1');
  }

  /**
   * Helper: Read text file with fallback encoding
   */
  private async readTextFile(filePath: string): Promise<string> {
    try {
      // Try UTF-8 first
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      try {
        // Fallback to Latin-1 (Amiga encoding)
        const buffer = await fs.readFile(filePath);
        return buffer.toString('latin1');
      } catch (error: any) {
console.error(`[AmigaParser] Error reading ${filePath}:`, error.message);
        return '';
      }
    }
  }
}
