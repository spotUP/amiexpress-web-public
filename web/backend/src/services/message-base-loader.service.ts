/**
 * Message Base Loader Service
 *
 * Loads message bases from disk following express.e pattern (lines 2048-2112).
 * Message bases are configured via MsgBases.info files in each conference directory.
 *
 * CRITICAL: This is DISK-BASED, not database-based (CLAUDE.md rule #10).
 * Database is ONLY for users, messages, call logs, stats - NOT configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { InfoFileParser } from './info-file-parser';

export interface MessageBase {
  id: number;              // Sequential ID for TypeScript code
  conferenceId: number;    // Conference this message base belongs to
  name: string;            // Message base name (from NAME.n tooltype)
  location: string;        // Full path to message base directory
  useRealName?: boolean;   // REALNAME.n tooltype
  useInternetName?: boolean; // INTERNETNAME.n tooltype
  extSend?: boolean;       // EXTSEND.n tooltype
}

export class MessageBaseLoaderService {
  private bbsRoot: string;
  private nextId: number = 1;

  constructor(bbsRoot: string) {
    this.bbsRoot = bbsRoot;
  }

  /**
   * Get message base count for a conference
   * express.e:2048-2052 - getConfMsgBaseCount(confNum)
   *
   * Reads NMSGBASES from {ConfLocation}/MsgBases.info
   * Returns 1 if file doesn't exist (default behavior)
   */
  getConfMsgBaseCount(confLocation: string): number {
    const msgBasesInfoPath = path.join(this.bbsRoot, confLocation, 'MsgBases.info');

    if (!fs.existsSync(msgBasesInfoPath)) {
      // express.e:2051 - IF num=-1 THEN num:=1
      return 1;
    }

    try {
      const buffer = fs.readFileSync(msgBasesInfoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      const nMsgBasesStr = toolTypes.get('NMSGBASES');
      const count = nMsgBasesStr ? parseInt(nMsgBasesStr, 10) : -1;

      // express.e:2051 - IF num=-1 THEN num:=1
      return count > 0 ? count : 1;
    } catch (error) {
      console.warn(`[MessageBaseLoader] Failed to read ${msgBasesInfoPath}:`, error);
      return 1;
    }
  }

  /**
   * Get message base name
   * express.e:2054-2059 - getMsgBaseName(confNum,msgBaseNum,outMsgBaseNameString)
   *
   * Reads NAME.n from {ConfLocation}/MsgBases.info
   * Returns empty string if not found
   */
  getMsgBaseName(confLocation: string, msgBaseNum: number): string {
    const msgBasesInfoPath = path.join(this.bbsRoot, confLocation, 'MsgBases.info');

    if (!fs.existsSync(msgBasesInfoPath)) {
      return '';
    }

    try {
      const buffer = fs.readFileSync(msgBasesInfoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      const nameKey = `NAME.${msgBaseNum}`;
      return toolTypes.get(nameKey) || '';
    } catch (error) {
      console.warn(`[MessageBaseLoader] Failed to read ${msgBasesInfoPath}:`, error);
      return '';
    }
  }

  /**
   * Get message base location
   * express.e:2061-2082 - getMsgBaseLocation(confNum,msgBaseNum,outMsgBaseLocationString)
   *
   * Reads LOCATION.n from {ConfLocation}/MsgBases.info
   * Defaults to {ConfLocation}/MsgBase/ if not found
   */
  getMsgBaseLocation(confLocation: string, msgBaseNum: number, msgBaseCount: number): string {
    const msgBasesInfoPath = path.join(this.bbsRoot, confLocation, 'MsgBases.info');

    // express.e:2065-2069 - Default to {ConfLocation}/MsgBase/ if file doesn't exist or msgBaseNum out of range
    if (!fs.existsSync(msgBasesInfoPath) || msgBaseNum < 1 || msgBaseNum > msgBaseCount) {
      const defaultLocation = path.join(this.bbsRoot, confLocation, 'MsgBase/');
      return defaultLocation;
    }

    try {
      const buffer = fs.readFileSync(msgBasesInfoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      const locationKey = `LOCATION.${msgBaseNum}`;
      const location = toolTypes.get(locationKey);

      if (!location) {
        // express.e:2065-2069 - Default to {ConfLocation}/MsgBase/
        return path.join(this.bbsRoot, confLocation, 'MsgBase/');
      }

      // express.e:2073-2079 - If location contains ':', treat as absolute path
      if (location.includes(':')) {
        // Absolute path (e.g., "Work:SharedMessages/")
        // Convert Amiga path to Unix path
        const unixPath = location.replace(/:/g, '/');
        return path.join(this.bbsRoot, unixPath);
      } else {
        // Relative path (e.g., "MsgBase/" or "MB2/")
        // express.e:2076-2078 - StringF(outMsgBaseLocationString,'\s\s',getConfLocation(confNum),location)
        return path.join(this.bbsRoot, confLocation, location);
      }
    } catch (error) {
      console.warn(`[MessageBaseLoader] Failed to read ${msgBasesInfoPath}:`, error);
      return path.join(this.bbsRoot, confLocation, 'MsgBase/');
    }
  }

  /**
   * Check for message base flags
   * express.e references:
   * - REALNAME.n - Use real names in this message base
   * - INTERNETNAME.n - Use internet names in this message base
   * - EXTSEND.n - Enable external send for this message base
   */
  getMsgBaseFlags(confLocation: string, msgBaseNum: number): {
    useRealName: boolean;
    useInternetName: boolean;
    extSend: boolean;
  } {
    const msgBasesInfoPath = path.join(this.bbsRoot, confLocation, 'MsgBases.info');

    const flags = {
      useRealName: false,
      useInternetName: false,
      extSend: false
    };

    if (!fs.existsSync(msgBasesInfoPath)) {
      return flags;
    }

    try {
      const buffer = fs.readFileSync(msgBasesInfoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      const realNameKey = `REALNAME.${msgBaseNum}`;
      const internetNameKey = `INTERNETNAME.${msgBaseNum}`;
      const extSendKey = `EXTSEND.${msgBaseNum}`;

      flags.useRealName = toolTypes.has(realNameKey);
      flags.useInternetName = toolTypes.has(internetNameKey);
      flags.extSend = toolTypes.has(extSendKey);
    } catch (error) {
      console.warn(`[MessageBaseLoader] Failed to read ${msgBasesInfoPath}:`, error);
    }

    return flags;
  }

  /**
   * Load all message bases for a conference from disk
   * Following express.e pattern
   *
   * @param confId Conference ID (1-based)
   * @param confLocation Conference location from ConfConfig.info (e.g., "BBS:Conf1/")
   */
  loadMessageBasesForConference(confId: number, confLocation: string): MessageBase[] {
    const messageBases: MessageBase[] = [];

    // Convert Amiga path to Unix path (BBS:Conf1/ -> Conf1/)
    const unixConfLocation = confLocation.replace(/^BBS:/, '').replace(/\/$/, '');

    // express.e:2048-2052 - Get message base count
    const msgBaseCount = this.getConfMsgBaseCount(unixConfLocation);

    // Load each message base
    for (let msgBaseNum = 1; msgBaseNum <= msgBaseCount; msgBaseNum++) {
      const name = this.getMsgBaseName(unixConfLocation, msgBaseNum);
      const location = this.getMsgBaseLocation(unixConfLocation, msgBaseNum, msgBaseCount);
      const flags = this.getMsgBaseFlags(unixConfLocation, msgBaseNum);

      messageBases.push({
        id: this.nextId++,
        conferenceId: confId,
        name: name || `Message Base ${msgBaseNum}`,
        location,
        useRealName: flags.useRealName,
        useInternetName: flags.useInternetName,
        extSend: flags.extSend
      });
    }

    return messageBases;
  }

  /**
   * Load all message bases from disk for all conferences
   *
   * @param conferences Array of conferences with id and location
   */
  loadAllMessageBases(conferences: Array<{ id: number; location: string }>): MessageBase[] {
    const allMessageBases: MessageBase[] = [];

    for (const conf of conferences) {
      const bases = this.loadMessageBasesForConference(conf.id, conf.location);
      allMessageBases.push(...bases);
    }

    console.log(`[MessageBaseLoader] Loaded ${allMessageBases.length} message bases from disk`);
    return allMessageBases;
  }
}
