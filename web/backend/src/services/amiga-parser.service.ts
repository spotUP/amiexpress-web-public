/**
 * Amiga BBS Parser Service
 *
 * Parses all Amiga AmiExpress BBS files for import.
 * Handles User.data, Conf.DB, .info files, caller logs, and more.
 *
 * Reference: reference-boardBBS (~/Downloads/BBS_COPY)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { InfoFileParser } from './info-file-parser';
import { UserFileManager } from './UserFileManager';
import type {
  AmigaBBSArchive,
  AmigaUserData,
  AmigaConference,
  ConferenceDatabase,
  AmigaFileArea,
  AmigaMessageBase,
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
      importDate: new Date(),
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
      fileAreas: await this.parseFileAreas(confPath),
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
console.log(`[AmigaParser] Conf.DB size: ${buffer.length} bytes`);

    // TODO: Parse binary structure
    // For now, return placeholder with conference number
    return {
      conferenceNumber: confNumber,
      conferenceName: metadata?.name || `Conference ${confNumber}`,
      accessLevel: 10,
      flags: 0,
      type: 'BOTH',
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
  async parseFileAreas(confPath: string): Promise<AmigaFileArea[]> {
    const fileAreas: AmigaFileArea[] = [];
    const entries = await fs.readdir(confPath);

    const dirInfoFiles = entries.filter(f => /^Dir\d+\.info$/i.test(f));

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
  async parseMessageBases(confPath: string, confNumber: number): Promise<AmigaMessageBase[]> {
    const messageBases: AmigaMessageBase[] = [];

    // Check for MsgBase directory (primary location)
    const msgBasePath = path.join(confPath, 'MsgBase');
    const messagesPath = path.join(confPath, 'Messages');

    if (await this.fileExists(msgBasePath)) {
      try {
        // Read MsgBase directory contents
        const entries = await fs.readdir(msgBasePath);

        // Check for HeaderFile (contains message data in binary format)
        const hasHeaderFile = entries.includes('HeaderFile');
        const hasMailStats = entries.includes('MailStats');

        if (hasHeaderFile) {
console.log(`[AmigaParser] Found MsgBase/HeaderFile in Conf${confNumber}`);

          // Read HeaderFile to get basic info
          const headerPath = path.join(msgBasePath, 'HeaderFile');
          const headerBuffer = await fs.readFile(headerPath);

          // Amiga message format is complex binary structure
          // Full parsing requires reverse engineering - for now, detect and warn
console.warn(`[AmigaParser] MsgBase/HeaderFile parsing not fully implemented`);
console.warn(`[AmigaParser] HeaderFile size: ${headerBuffer.length} bytes`);
console.warn(`[AmigaParser] Messages from Amiga BBS will need manual import`);

          // Create placeholder message base entry
          messageBases.push({
            name: `Conference ${confNumber} Messages`,
            path: msgBasePath,
            messages: [], // Binary parsing not implemented - requires reverse engineering
          });
        }

        if (hasMailStats) {
          // MailStats contains message statistics (small binary file)
          const statsPath = path.join(msgBasePath, 'MailStats');
          const statsBuffer = await fs.readFile(statsPath);
console.log(`[AmigaParser] MailStats size: ${statsBuffer.length} bytes`);
        }
      } catch (error: any) {
console.error(`[AmigaParser] Error parsing MsgBase for Conf${confNumber}:`, error.message);
      }
    } else if (await this.fileExists(messagesPath)) {
      // Alternative: Messages directory (older format or different configuration)
console.log(`[AmigaParser] Found Messages directory in Conf${confNumber}`);

      try {
        const entries = await fs.readdir(messagesPath);
        const messageFiles = entries.filter(f => !f.startsWith('.'));

        if (messageFiles.length > 0) {
console.log(`[AmigaParser] Found ${messageFiles.length} files in Messages directory`);

          messageBases.push({
            name: `Conference ${confNumber} Messages`,
            path: messagesPath,
            messages: [], // Individual message file parsing not implemented
          });
        }
      } catch (error: any) {
console.error(`[AmigaParser] Error parsing Messages for Conf${confNumber}:`, error.message);
      }
    } else {
console.log(`[AmigaParser] No message base found for Conf${confNumber}`);
    }

    return messageBases;
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
    const callersLog = await this.parseCallersLog(nodePath);
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
   * Parse CallersLog file
   * Format from express.e:16023-16056 (displayUserToCallersLog)
   * Example: "01-Jan-2026 (12:34:56) NEW [123] JohnDoe (CONNECT 28800) New York"
   * Logoff:  "01-Jan-2026 (12:34:56) JohnDoe Off Normally"
   */
  private async parseCallersLog(nodePath: string): Promise<AmigaCallersLogEntry[]> {
    const logPath = path.join(nodePath, 'CallersLog');
    const entries: AmigaCallersLogEntry[] = [];

    if (!(await this.fileExists(logPath))) {
      return entries;
    }

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);

      let currentEntry: Partial<AmigaCallersLogEntry> | null = null;

      for (const line of lines) {
        // Skip divider lines and tab-indented detail lines
        if (line.startsWith('---') || line.startsWith('\t')) {
          continue;
        }

        // Parse login line: "Date (Time) [Slot] Username (ConnectString) Location"
        // or logoff line: "Date (Time) Username Off [reason]"
        const loginMatch = line.match(/^(\d{2}-\w{3}-\d{4})\s+\((\d{2}:\d{2}:\d{2})\)\s+(?:NEW\s+)?\[(\d+)\]\s+(\S+)\s+\(([^)]+)\)\s+(.*)$/);
        const logoffMatch = line.match(/^(\d{2}-\w{3}-\d{4})\s+\((\d{2}:\d{2}:\d{2})\)\s+(\S+)\s+Off\s+(.*)$/);

        if (loginMatch) {
          // Save previous entry if exists
          if (currentEntry && currentEntry.username) {
            entries.push(this.finalizeCallersLogEntry(currentEntry));
          }

          // Start new entry
          const [, date, time, slot, username, connectStr, location] = loginMatch;
          const loginTime = this.parseAmigaDateTime(date, time);

          currentEntry = {
            username,
            loginTime,
            node: parseInt(slot, 10),
            location: location.trim() || undefined,
            baud: this.extractBaudRate(connectStr),
            uploaded: 0,
            downloaded: 0,
            messagesRead: 0,
            messagesPosted: 0,
            duration: 0,
          };
        } else if (logoffMatch && currentEntry) {
          // Complete current entry with logoff time
          const [, date, time] = logoffMatch;
          const logoffTime = this.parseAmigaDateTime(date, time);
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
      loginTime: entry.loginTime || new Date(),
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
  private parseAmigaDateTime(dateStr: string, timeStr: string): Date {
    try {
      // Parse "01-Jan-2026" format
      const months: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
      };

      const [day, monthStr, year] = dateStr.split('-');
      const [hour, minute, second] = timeStr.split(':');

      const month = months[monthStr] ?? 0;

      return new Date(
        parseInt(year, 10),
        month,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        parseInt(second, 10)
      );
    } catch (error) {
      return new Date();
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
      const name = file.replace('.info', '');
      const infoPath = path.join(cmdPath, file);
      const buffer = await fs.readFile(infoPath);
      const settings = this.infoParser.parseCommandInfo(buffer, name);

      commands.push({
        name,
        type,
        path: settings.get('PATH'),
        description: settings.get('DESCRIPTION'),
        accessLevel: parseInt(settings.get('ACCESS_LEVEL') || '10', 10),
        flags: parseInt(settings.get('FLAGS') || '0', 10),
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
  async parseScreens(bbsPath: string): Promise<AmigaScreen[]> {
    const screens: AmigaScreen[] = [];
    const screensPath = path.join(bbsPath, 'Screens');

    if (!(await this.fileExists(screensPath))) {
      return screens;
    }

    const entries = await fs.readdir(screensPath);
    const screenFiles = entries.filter(f => f.endsWith('.txt') || f.endsWith('.TXT') || f.endsWith('.ans') || f.endsWith('.ANS'));

    for (const file of screenFiles) {
      const content = await this.readTextFile(path.join(screensPath, file));
      const type = file.toLowerCase().endsWith('.ans') ? 'ANSI' : 'ASCII';
      screens.push({
        name: file,
        content,
        type,
      });
    }

    return screens;
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

      // Struct sizes from UserFileManager.ts
      const USER_STRUCT_SIZE = 239;
      const USERKEYS_STRUCT_SIZE = 54;
      const USERMISC_STRUCT_SIZE = 256;

      // Calculate number of users (should match across all three files)
      const numUsersData = Math.floor(dataBuffer.length / USER_STRUCT_SIZE);
      const numUsersKeys = Math.floor(keysBuffer.length / USERKEYS_STRUCT_SIZE);
      const numUsersMisc = Math.floor(miscBuffer.length / USERMISC_STRUCT_SIZE);

console.log(`[AmigaParser] User counts: data=${numUsersData}, keys=${numUsersKeys}, misc=${numUsersMisc}`);

      // Use minimum count (in case files are mismatched)
      const numUsers = Math.min(numUsersData, numUsersKeys, numUsersMisc);

      // Parse each user record
      for (let i = 0; i < numUsers; i++) {
        const dataOffset = i * USER_STRUCT_SIZE;
        const keysOffset = i * USERKEYS_STRUCT_SIZE;
        const miscOffset = i * USERMISC_STRUCT_SIZE;

        // Parse User.data record (239 bytes)
        const userData = this.parseUserDataRecord(dataBuffer, dataOffset);

        // Parse User.keys record (54 bytes)
        const keysData = this.parseUserKeysRecord(keysBuffer, keysOffset);

        // Parse user.misc record (256 bytes)
        const miscData = this.parseUserMiscRecord(miscBuffer, miscOffset);

        // Merge all three records
        const user = {
          ...userData,
          ...keysData,
          ...miscData,
        };

        users.push(user);
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

    // INTs (2 bytes each, little-endian)
    const slotNumber = buffer.readInt16LE(pos); pos += 2;
    const secStatus = buffer.readInt16LE(pos); pos += 2;
    const secBoard = buffer.readInt16LE(pos); pos += 2;
    const secLibrary = buffer.readInt16LE(pos); pos += 2;
    const secBulletin = buffer.readInt16LE(pos); pos += 2;
    const messagesPosted = buffer.readInt16LE(pos); pos += 2;

    // LONGs (4 bytes each, little-endian)
    const newSinceDate = buffer.readInt32LE(pos); pos += 4;
    const pwdHash = buffer.readInt32LE(pos); pos += 4;
    const confRead2 = buffer.readInt32LE(pos); pos += 4;
    const confRead3 = buffer.readInt32LE(pos); pos += 4;

    // More INTs
    const zoomType = buffer.readInt16LE(pos); pos += 2;
    const unknown = buffer.readInt16LE(pos); pos += 2;
    const unknown2 = buffer.readInt16LE(pos); pos += 2;
    const unknown3 = buffer.readInt16LE(pos); pos += 2;
    const xferProtocol = buffer.readInt16LE(pos); pos += 2;
    const filler2 = buffer.readInt16LE(pos); pos += 2;
    const lcFiles = buffer.readInt16LE(pos); pos += 2;
    const badFiles = buffer.readInt16LE(pos); pos += 2;

    // More LONGs
    const accountDate = buffer.readInt32LE(pos); pos += 4;

    // More INTs
    const screenType = buffer.readInt16LE(pos); pos += 2;
    const editorType = buffer.readInt16LE(pos); pos += 2;

    // Conference access string
    const conferenceAccess = this.readString(buffer, pos, 10); pos += 10;

    // More INTs
    const uploads = buffer.readInt16LE(pos); pos += 2;
    const downloads = buffer.readInt16LE(pos); pos += 2;
    const confRJoin = buffer.readInt16LE(pos); pos += 2;
    const timesCalled = buffer.readInt16LE(pos); pos += 2;

    // LONGs
    const timeLastOn = buffer.readInt32LE(pos); pos += 4;
    const timeUsed = buffer.readInt32LE(pos); pos += 4;
    const timeLimit = buffer.readInt32LE(pos); pos += 4;
    const timeTotal = buffer.readInt32LE(pos); pos += 4;
    const bytesDownload = buffer.readInt32LE(pos); pos += 4;
    const bytesUpload = buffer.readInt32LE(pos); pos += 4;
    const dailyBytesLimit = buffer.readInt32LE(pos); pos += 4;
    const dailyBytesDld = buffer.readInt32LE(pos); pos += 4;

    // CHAR
    const expert = buffer.readUInt8(pos); pos += 1;

    // Padding (3 bytes for LONG alignment)
    pos += 3;

    // More LONGs
    const chatRemain = buffer.readInt32LE(pos); pos += 4;
    const chatLimit = buffer.readInt32LE(pos); pos += 4;
    const creditDays = buffer.readInt32LE(pos); pos += 4;
    const creditAmount = buffer.readInt32LE(pos); pos += 4;
    const creditStartDate = buffer.readInt32LE(pos); pos += 4;
    const creditTotalToDate = buffer.readInt32LE(pos); pos += 4;
    const creditTotalDate = buffer.readInt32LE(pos); pos += 4;

    // CHARs
    const creditTracking = buffer.readUInt8(pos); pos += 1;
    const translatorID = buffer.readUInt8(pos); pos += 1;

    // INT
    const msgBaseRJoin = buffer.readInt16LE(pos); pos += 2;

    // LONGs
    const confYM9 = buffer.readInt32LE(pos); pos += 4;
    const todaysBytesLimit = buffer.readInt32LE(pos); pos += 4;

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
    const number = buffer.readInt32LE(pos); pos += 4;
    const newUser = buffer.readUInt8(pos); pos += 1;
    const oldUpCPS = buffer.readInt16LE(pos); pos += 2;
    const oldDnCPS = buffer.readInt16LE(pos); pos += 2;
    const userFlags = buffer.readInt16LE(pos); pos += 2;
    const baud = buffer.readInt16LE(pos); pos += 2;
    const upCPS2 = buffer.readInt32LE(pos); pos += 4;
    const dnCPS2 = buffer.readInt32LE(pos); pos += 4;
    const timesOnToday = buffer.readInt16LE(pos); pos += 2;

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
    const lastDlCPS = buffer.readInt32LE(pos); pos += 4;

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
    const pwdLastUpdated = buffer.readInt32LE(pos); pos += 4;
    const lastIP = buffer.readInt32LE(pos); pos += 4;
    const ipMask = buffer.readInt32LE(pos); pos += 4;

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
