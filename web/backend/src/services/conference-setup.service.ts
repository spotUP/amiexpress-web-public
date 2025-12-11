/**
 * Conference Setup Service
 *
 * Handles automatic creation of conference directories, files, and .info files
 * when a sysop creates a new conference via the Admin UI.
 *
 * This is a MODERN enhancement over the original AmiExpress, which required
 * manual setup of all directories and files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { InfoFileParser } from './info-file-parser';

export interface ConferenceHealthCheck {
  conferenceId: number;
  conferenceName: string;
  exists: boolean;
  issues: string[];
  missingDirectories: string[];
  missingFiles: string[];
  canAutoFix: boolean;
}

export interface ConferenceSetupOptions {
  conferenceId: number;
  conferenceName: string;
  location: string;
  ndirs?: number;
  minAccessLevel?: number;
  maxAccessLevel?: number;
  forceNewscan?: boolean;
  excludeFTP?: boolean;
  privateConf?: boolean;
  readOnly?: boolean;
}

export class ConferenceSetupService {
  private bbsRoot: string;

  constructor(bbsRoot: string) {
    this.bbsRoot = bbsRoot;
  }

  /**
   * Perform health check on a single conference
   * 1:1 with express.e structure requirements
   */
  async checkConferenceHealth(conferenceId: number, conferenceName?: string): Promise<ConferenceHealthCheck> {
    const result: ConferenceHealthCheck = {
      conferenceId,
      conferenceName: conferenceName || `Conference ${conferenceId}`,
      exists: false,
      issues: [],
      missingDirectories: [],
      missingFiles: [],
      canAutoFix: true
    };

    try {
      // Check Conf{N}.info exists (express.e:5006 - reads from TOOLTYPE_CONF)
      const confInfoPath = path.join(this.bbsRoot, `Conf${conferenceId}.info`);
      if (!fs.existsSync(confInfoPath)) {
        result.issues.push(`Missing Conf${conferenceId}.info file`);
        result.missingFiles.push(confInfoPath);
      } else {
        result.exists = true;
      }

      // Check conference directory exists
      const confLocation = `Conf${conferenceId}`;
      const confDirPath = path.join(this.bbsRoot, confLocation);
      if (!fs.existsSync(confDirPath)) {
        result.issues.push(`Missing ${confLocation}/ directory`);
        result.missingDirectories.push(confDirPath);
      }

      // Standard directories required by express.e
      const requiredDirs = [
        'Messages',      // Message storage
        'Upload',        // File uploads
        'Files',         // Processed/approved files
        'Hold',          // Held uploads
        'Bulletins',     // Conference bulletins
        'SysopStats',    // Statistics
        'MsgBase'        // Message base metadata
      ];

      for (const dir of requiredDirs) {
        const dirPath = path.join(this.bbsRoot, confLocation, dir);
        if (!fs.existsSync(dirPath)) {
          result.issues.push(`Missing ${confLocation}/${dir}/ directory`);
          result.missingDirectories.push(dirPath);
        } else {
          // Check if it's actually a directory
          const stats = fs.statSync(dirPath);
          if (!stats.isDirectory()) {
            result.issues.push(`${confLocation}/${dir} exists but is not a directory`);
            result.canAutoFix = false;
          }
        }
      }

      // Check for DIR1 file (express.e:15264 - reads DLPATH/ULPATH for file areas)
      if (result.exists) {
        // Read NDIRS from Conf{N}.info
        try {
          const buffer = fs.readFileSync(confInfoPath);
          const parser = new InfoFileParser();
          const parsed = parser.parse(buffer);

          const toolTypes = new Map<string, string>();
          for (const [key, value] of parsed.toolTypes.entries()) {
            toolTypes.set(key.toUpperCase(), value);
          }

          const ndirsStr = toolTypes.get('NDIRS');
          const ndirs = ndirsStr ? parseInt(ndirsStr, 10) || 1 : 1;

          // Check for DIR files (DIR1-DIR{ndirs})
          for (let i = 1; i <= ndirs; i++) {
            const dirFilePath = path.join(this.bbsRoot, confLocation, `DIR${i}`);
            if (!fs.existsSync(dirFilePath)) {
              result.issues.push(`Missing ${confLocation}/DIR${i} file`);
              result.missingFiles.push(dirFilePath);
            }
          }
        } catch (error) {
          result.issues.push(`Failed to read Conf${conferenceId}.info: ${error}`);
          result.canAutoFix = false;
        }
      }

    } catch (error) {
      result.issues.push(`Health check failed: ${error}`);
      result.canAutoFix = false;
    }

    return result;
  }

  /**
   * Perform health check on all conferences
   */
  async checkAllConferences(): Promise<ConferenceHealthCheck[]> {
    const results: ConferenceHealthCheck[] = [];

    // Read NCONFS from ConfConfig.info (express.e:31791)
    const confConfigPath = path.join(this.bbsRoot, 'ConfConfig.info');
    if (!fs.existsSync(confConfigPath)) {
      throw new Error('ConfConfig.info not found - cannot determine conference count');
    }

    try {
      const buffer = fs.readFileSync(confConfigPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      const nconfsStr = toolTypes.get('NCONFS');
      const nconfs = nconfsStr ? parseInt(nconfsStr, 10) || 1 : 1;

      // Check each conference
      for (let i = 1; i <= nconfs; i++) {
        const nameKey = `NAME.${i}`;
        const name = toolTypes.get(nameKey) || `Conference ${i}`;
        const healthCheck = await this.checkConferenceHealth(i, name);
        results.push(healthCheck);
      }
    } catch (error) {
      throw new Error(`Failed to read ConfConfig.info: ${error}`);
    }

    return results;
  }

  /**
   * Create all required directories and files for a conference
   * This is what express.e does NOT do - we're adding convenience here!
   */
  async setupConference(options: ConferenceSetupOptions): Promise<void> {
    const { conferenceId, conferenceName, location, ndirs = 1 } = options;

    console.log(`[ConferenceSetup] Setting up Conf${conferenceId}: ${conferenceName}`);

    // 1. Create Conf{N}.info file
    await this.createConferenceInfoFile(options);

    // 2. Create conference base directory
    const confDirPath = path.join(this.bbsRoot, location);
    if (!fs.existsSync(confDirPath)) {
      fs.mkdirSync(confDirPath, { recursive: true });
      console.log(`[ConferenceSetup] Created ${location}/`);
    }

    // 3. Create standard directories (express.e structure)
    const requiredDirs = [
      'Messages',      // Message storage
      'Upload',        // File uploads
      'Files',         // Processed/approved files
      'Hold',          // Held uploads
      'Bulletins',     // Conference bulletins
      'SysopStats',    // Statistics
      'MsgBase'        // Message base metadata
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(confDirPath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`[ConferenceSetup] Created ${location}/${dir}/`);
      }
    }

    // 4. Create DIR files (DIR1-DIR{ndirs})
    for (let i = 1; i <= ndirs; i++) {
      const dirFilePath = path.join(confDirPath, `DIR${i}`);
      if (!fs.existsSync(dirFilePath)) {
        // Create empty DIR file with header
        const header = `\n[File Area ${i} - ${conferenceName}]\n\n`;
        fs.writeFileSync(dirFilePath, header, 'utf8');
        console.log(`[ConferenceSetup] Created ${location}/DIR${i}`);
      }
    }

    // 5. Create NumULs file (tracks number of uploads)
    const numULsPath = path.join(confDirPath, 'NumULs');
    if (!fs.existsSync(numULsPath)) {
      fs.writeFileSync(numULsPath, '0\n', 'utf8');
      console.log(`[ConferenceSetup] Created ${location}/NumULs`);
    }

    // 6. Create SysopStats/NumULs_{conferenceId} file
    const sysopStatsNumULsPath = path.join(this.bbsRoot, 'SysopStats', `NumULs_${conferenceId}`);
    if (!fs.existsSync(sysopStatsNumULsPath)) {
      fs.mkdirSync(path.dirname(sysopStatsNumULsPath), { recursive: true });
      fs.writeFileSync(sysopStatsNumULsPath, '0\n', 'utf8');
      console.log(`[ConferenceSetup] Created SysopStats/NumULs_${conferenceId}`);
    }

    console.log(`[ConferenceSetup] Conference ${conferenceId} setup complete`);
  }

  /**
   * Create Conf{N}.info file with tooltypes
   * express.e:5006 - reads NDIRS, DLPATH.n, ULPATH.n from TOOLTYPE_CONF
   */
  private async createConferenceInfoFile(options: ConferenceSetupOptions): Promise<void> {
    const {
      conferenceId,
      conferenceName,
      location,
      ndirs = 1,
      minAccessLevel = 0,
      maxAccessLevel = 255,
      forceNewscan = false,
      excludeFTP = false,
      privateConf = false,
      readOnly = false
    } = options;

    const confInfoPath = path.join(this.bbsRoot, `Conf${conferenceId}.info`);

    if (fs.existsSync(confInfoPath)) {
      console.log(`[ConferenceSetup] Conf${conferenceId}.info already exists, skipping`);
      return;
    }

    // Build tooltypes array
    const tooltypes: string[] = [
      `NAME=${conferenceName}`,
      `LOCATION=${location}`,
      `NDIRS=${ndirs}`,
      `MIN_ACCESS=${minAccessLevel}`,
      `MAX_ACCESS=${maxAccessLevel}`
    ];

    // Add file area paths (DLPATH.n, ULPATH.n)
    for (let i = 1; i <= ndirs; i++) {
      tooltypes.push(`DLPATH.${i}=${location}/Files`);
      tooltypes.push(`ULPATH.${i}=${location}/Upload`);
    }

    // Add optional flags
    if (forceNewscan) tooltypes.push('FORCE_NEWSCAN=1');
    if (excludeFTP) tooltypes.push('EXCLUDE_FTP=1');
    if (privateConf) tooltypes.push('PRIVATE=1');
    if (readOnly) tooltypes.push('READ_ONLY=1');

    // Create .info file using InfoFileParser (writes in Amiga format)
    const parser = new InfoFileParser();
    const toolTypeMap = new Map<string, string>();
    for (const tt of tooltypes) {
      const [key, value] = tt.split('=');
      if (key && value) {
        toolTypeMap.set(key, value);
      }
    }

    const infoData = parser.write(toolTypeMap);

    fs.writeFileSync(confInfoPath, infoData);
    console.log(`[ConferenceSetup] Created Conf${conferenceId}.info with ${tooltypes.length} tooltypes`);
  }

  /**
   * Auto-fix issues found in health check
   */
  async autoFixConference(conferenceId: number, healthCheck: ConferenceHealthCheck): Promise<void> {
    if (!healthCheck.canAutoFix) {
      throw new Error(`Cannot auto-fix Conf${conferenceId}: ${healthCheck.issues.join(', ')}`);
    }

    console.log(`[ConferenceSetup] Auto-fixing Conf${conferenceId}`);

    // Create missing directories
    for (const dirPath of healthCheck.missingDirectories) {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`[ConferenceSetup] Created missing directory: ${dirPath}`);
      }
    }

    // Create missing files
    for (const filePath of healthCheck.missingFiles) {
      const fileName = path.basename(filePath);

      if (fileName.match(/^DIR\d+$/)) {
        // Create empty DIR file with header
        const header = `\n[File Area - ${healthCheck.conferenceName}]\n\n`;
        fs.writeFileSync(filePath, header, 'utf8');
        console.log(`[ConferenceSetup] Created missing DIR file: ${filePath}`);
      } else if (fileName === 'NumULs' || fileName.startsWith('NumULs_')) {
        // Create NumULs counter file
        fs.writeFileSync(filePath, '0\n', 'utf8');
        console.log(`[ConferenceSetup] Created missing NumULs file: ${filePath}`);
      } else if (fileName.match(/^Conf\d+\.info$/)) {
        // Cannot auto-create .info files without more context - skip
        console.warn(`[ConferenceSetup] Cannot auto-create ${fileName} - needs manual creation`);
      }
    }

    console.log(`[ConferenceSetup] Auto-fix complete for Conf${conferenceId}`);
  }

  /**
   * Update ConfConfig.info to add new conference
   * express.e:31791 - reads NCONFS, NAME.n, LOCATION.n
   */
  async updateConfConfig(conferenceId: number, conferenceName: string, location: string): Promise<void> {
    const confConfigPath = path.join(this.bbsRoot, 'ConfConfig.info');

    if (!fs.existsSync(confConfigPath)) {
      throw new Error('ConfConfig.info not found');
    }

    // Read existing ConfConfig.info
    const buffer = fs.readFileSync(confConfigPath);
    const parser = new InfoFileParser();
    const parsed = parser.parse(buffer);

    const toolTypes = new Map<string, string>();
    for (const [key, value] of parsed.toolTypes.entries()) {
      toolTypes.set(key.toUpperCase(), value);
    }

    // Get current NCONFS
    const nconfsStr = toolTypes.get('NCONFS');
    const currentNconfs = nconfsStr ? parseInt(nconfsStr, 10) || 0 : 0;

    // Check if conference ID is valid
    if (conferenceId > currentNconfs + 1) {
      throw new Error(`Conference ID ${conferenceId} is too high - current NCONFS is ${currentNconfs}`);
    }

    // Update NCONFS if needed
    if (conferenceId > currentNconfs) {
      toolTypes.set('NCONFS', conferenceId.toString());
    }

    // Add/update NAME.n and LOCATION.n
    toolTypes.set(`NAME.${conferenceId}`, conferenceName);
    toolTypes.set(`LOCATION.${conferenceId}`, location);

    // Write updated ConfConfig.info
    const infoData = parser.write(toolTypes);

    fs.writeFileSync(confConfigPath, infoData);
    console.log(`[ConferenceSetup] Updated ConfConfig.info: NCONFS=${Math.max(currentNconfs, conferenceId)}, NAME.${conferenceId}=${conferenceName}`);
  }

  /**
   * Update Conf{N}.info file with conference settings
   * express.e:5006 - reads NDIRS, DLPATH.n, ULPATH.n from TOOLTYPE_CONF
   */
  async updateConferenceInfoFile(conferenceId: number, updates: Partial<{
    name: string;
    location: string;
    ndirs: number;
    minAccessLevel: number;
    maxAccessLevel: number;
    forceNewscan: boolean;
    excludeFTP: boolean;
    privateConf: boolean;
    readOnly: boolean;
    dlpaths: { [key: number]: string };
    ulpaths: { [key: number]: string };
  }>): Promise<void> {
    const confInfoPath = path.join(this.bbsRoot, `Conf${conferenceId}.info`);

    if (!fs.existsSync(confInfoPath)) {
      throw new Error(`Conf${conferenceId}.info not found`);
    }

    // Read existing Conf{N}.info
    const buffer = fs.readFileSync(confInfoPath);
    const parser = new InfoFileParser();
    const parsed = parser.parse(buffer);

    const toolTypes = new Map<string, string>();
    for (const [key, value] of parsed.toolTypes.entries()) {
      toolTypes.set(key.toUpperCase(), value);
    }

    // Update basic fields
    if (updates.name) toolTypes.set('NAME', updates.name);
    if (updates.location) toolTypes.set('LOCATION', updates.location);
    if (updates.ndirs !== undefined) toolTypes.set('NDIRS', updates.ndirs.toString());
    if (updates.minAccessLevel !== undefined) toolTypes.set('MIN_ACCESS', updates.minAccessLevel.toString());
    if (updates.maxAccessLevel !== undefined) toolTypes.set('MAX_ACCESS', updates.maxAccessLevel.toString());

    // Update flags
    if (updates.forceNewscan !== undefined) {
      if (updates.forceNewscan) {
        toolTypes.set('FORCE_NEWSCAN', '1');
      } else {
        toolTypes.delete('FORCE_NEWSCAN');
      }
    }
    if (updates.excludeFTP !== undefined) {
      if (updates.excludeFTP) {
        toolTypes.set('EXCLUDE_FTP', '1');
      } else {
        toolTypes.delete('EXCLUDE_FTP');
      }
    }
    if (updates.privateConf !== undefined) {
      if (updates.privateConf) {
        toolTypes.set('PRIVATE', '1');
      } else {
        toolTypes.delete('PRIVATE');
      }
    }
    if (updates.readOnly !== undefined) {
      if (updates.readOnly) {
        toolTypes.set('READ_ONLY', '1');
      } else {
        toolTypes.delete('READ_ONLY');
      }
    }

    // Update file area paths
    if (updates.dlpaths) {
      for (const [dirNum, path] of Object.entries(updates.dlpaths)) {
        toolTypes.set(`DLPATH.${dirNum}`, path);
      }
    }
    if (updates.ulpaths) {
      for (const [dirNum, path] of Object.entries(updates.ulpaths)) {
        toolTypes.set(`ULPATH.${dirNum}`, path);
      }
    }

    // Write updated Conf{N}.info
    const infoData = parser.write(toolTypes);
    fs.writeFileSync(confInfoPath, infoData);
    console.log(`[ConferenceSetup] Updated Conf${conferenceId}.info`);
  }
}
