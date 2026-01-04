/**
 * Node Configuration Service
 * Handles multi-node BBS node configuration (Node{N}.info files)
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { NodeConfig } from '../../database/types';
import { NodeConfigSchema, type RequestContext } from '../config.schemas';
import { InfoFileParser } from '../info-file-parser';
import { config as appConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export class NodeConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getNodeConfigs(): Promise<NodeConfig[]> {
    const bbsRoot = appConfig.get('dataDir');
    const nodeConfigs: NodeConfig[] = [];

    try {
      // Support up to 255 nodes
      for (let nodeNum = 0; nodeNum <= 255; nodeNum++) {
        const nodeInfoPath = path.join(bbsRoot, `Node${nodeNum}.info`);

        if (!fs.existsSync(nodeInfoPath)) {
          continue;
        }

        const buffer = fs.readFileSync(nodeInfoPath);
        const stats = fs.statSync(nodeInfoPath);
        const parser = new InfoFileParser();
        const parsed = parser.parse(buffer);

        const toolTypes = new Map<string, string>();
        for (const [key, value] of parsed.toolTypes.entries()) {
          toolTypes.set(key.toUpperCase(), value);
        }

        nodeConfigs.push({
          id: nodeNum + 1,
          node_number: nodeNum,
          node_start: toolTypes.get('NODESTART') || 'BBS:Express',
          priority: parseInt(toolTypes.get('PRIORITY') || '0', 10),
          capitol_files: toolTypes.has('CAPITOL_FILES'),
          def_screens: toolTypes.has('DEF_SCREENS'),
          no_mci_msg: false,
          sysop_chat_color: parseInt(toolTypes.get('SYSOP_CHAT_COLOR') || '33', 10),
          user_chat_color: parseInt(toolTypes.get('USER_CHAT_COLOR') || '32', 10),
          break_chat: false,
          sentby_files: toolTypes.has('SENTBY_FILES'),
          keep_upload_credit: false,
          free_resuming: false,
          callers_log: toolTypes.has('CALLERS_LOG'),
          start_log: toolTypes.has('START_LOG'),
          door_log: false,
          ud_log: toolTypes.has('UD_LOG'),
          log_host: false,
          telnet: !toolTypes.has('NO_TELNET'),
          ftp: toolTypes.has('FTP'),
          disable_quick_logons: toolTypes.has('DISABLE_QUICK_LOGONS'),
          view_password: toolTypes.has('VIEW_PASSWORD'),
          no_rad_boogie: false,
          nrams: [],
          created_at: stats.birthtime,
          updated_at: stats.mtime
        });
      }

console.log(`[NodeConfigService] Loaded ${nodeConfigs.length} node configs from disk`);
      return nodeConfigs;
    } catch (error) {
console.error('[NodeConfigService] Error reading Node{N}.info files:', error);
      return this.configRepo.getNodeConfigs();
    }
  }

  async getNodeConfig(nodeNumber: number): Promise<NodeConfig | null> {
    // nodeNumber here is usually the 1-based ID or node index. 
    // The UI uses nodeNumber as the literal 1-based number (Node 1, Node 2, etc.)
    if (nodeNumber < 1 || nodeNumber > 255) {
      throw new Error('Node number must be between 1 and 255');
    }

    const bbsRoot = appConfig.get('dataDir');
    const nodeNum = nodeNumber - 1; // 0-based internal
    const nodeInfoPath = path.join(bbsRoot, `Node${nodeNum}.info`);

    if (!fs.existsSync(nodeInfoPath)) {
      return this.configRepo.getNodeConfig(nodeNum);
    }

    try {
      const buffer = fs.readFileSync(nodeInfoPath);
      const stats = fs.statSync(nodeInfoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        toolTypes.set(key.toUpperCase(), value);
      }

      return {
        id: nodeNumber,
        node_number: nodeNum,
        node_start: toolTypes.get('NODESTART') || 'BBS:Express',
        priority: parseInt(toolTypes.get('PRIORITY') || '0', 10),
        capitol_files: toolTypes.has('CAPITOL_FILES'),
        def_screens: toolTypes.has('DEF_SCREENS'),
        no_mci_msg: false,
        sysop_chat_color: parseInt(toolTypes.get('SYSOP_CHAT_COLOR') || '33', 10),
        user_chat_color: parseInt(toolTypes.get('USER_CHAT_COLOR') || '32', 10),
        break_chat: false,
        sentby_files: toolTypes.has('SENTBY_FILES'),
        keep_upload_credit: false,
        free_resuming: false,
        callers_log: toolTypes.has('CALLERS_LOG'),
        start_log: toolTypes.has('START_LOG'),
        door_log: false,
        ud_log: toolTypes.has('UD_LOG'),
        log_host: false,
        telnet: !toolTypes.has('NO_TELNET'),
        ftp: toolTypes.has('FTP'),
        disable_quick_logons: toolTypes.has('DISABLE_QUICK_LOGONS'),
        view_password: toolTypes.has('VIEW_PASSWORD'),
        no_rad_boogie: false,
        nrams: [],
        created_at: stats.birthtime,
        updated_at: stats.mtime
      };
    } catch (error) {
console.error(`[NodeConfigService] Error reading Node${nodeNum}.info:`, error);
      return this.configRepo.getNodeConfig(nodeNum);
    }
  }

  async createNodeConfig(
    config: Omit<NodeConfig, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<NodeConfig> {
    const validated = NodeConfigSchema.parse(config) as Omit<NodeConfig, 'id' | 'created_at' | 'updated_at'>;
    
    // Ensure node number is valid
    if (validated.node_number < 0 || validated.node_number > 255) {
      throw new Error('Node number must be between 0 and 255');
    }

    const newConfig = this.configRepo.createNodeConfig(validated);

    // 1. Write the .info file
    this.writeNodeInfoFile(validated.node_number, validated);

    // 2. Create the Node{N} directory and populate from template
    this.initializeNodeDirectory(validated.node_number);

    this.configRepo.logConfigChange('node_config', newConfig.id, 'CREATE',
      context.userId, context.username, undefined, newConfig,
      context.ipAddress, context.userAgent);

    return newConfig;
  }

  /**
   * Ensure Node{N} directory exists and is populated from Node1 template
   */
  private initializeNodeDirectory(nodeNum: number): void {
    const bbsRoot = appConfig.get('dataDir');
    const nodeDir = path.join(bbsRoot, `Node${nodeNum}`);
    const templateDir = path.join(bbsRoot, 'Node1');

    if (!fs.existsSync(nodeDir)) {
      try {
console.log(`[NodeConfigService] Creating directory ${nodeDir}`);
        fs.mkdirSync(nodeDir, { recursive: true });

        if (fs.existsSync(templateDir) && nodeNum !== 1) {
console.log(`[NodeConfigService] Populating ${nodeDir} from template ${templateDir}`);
          // Using cp -a for reliability (preserves permissions and subdirs)
          execSync(`cp -a "${templateDir}/." "${nodeDir}/"`);
          
          // Clean up inherited logs and user data
          const logsToClear = ['UDLog', 'DoorLog', 'ErrorLog', 'StartUpLog', 'CallersLog', 'Answers', 'Answers.old'];
          for (const logFile of logsToClear) {
            const logPath = path.join(nodeDir, logFile);
            if (fs.existsSync(logPath)) {
              fs.writeFileSync(logPath, '');
            }
          }

          // Clean up temp dirs
          const tempDirs = ['Work', 'Playpen', 'NRAMS'];
          for (const sub of tempDirs) {
            const subDir = path.join(nodeDir, sub);
            if (fs.existsSync(subDir)) {
              const files = fs.readdirSync(subDir);
              for (const file of files) {
                if (file !== '.gitkeep') {
                  fs.unlinkSync(path.join(subDir, file));
                }
              }
            }
          }
        }
      } catch (error) {
console.error(`[NodeConfigService] Failed to initialize node directory ${nodeDir}:`, error);
      }
    }
  }

  async updateNodeConfig(
    nodeNumber: number,
    updates: Partial<NodeConfig>,
    context: RequestContext
  ): Promise<NodeConfig> {
    // nodeNumber here is the 1-based UI number or the 0-based node index depending on caller
    // The UI currently passes i + 1
    const nodeIndex = updates.node_number !== undefined ? updates.node_number : nodeNumber - 1;

    if (nodeIndex < 0 || nodeIndex > 255) {
      throw new Error('Node number must be between 0 and 255');
    }

    const validated = NodeConfigSchema.partial().parse(updates);
    const oldConfig = await this.getNodeConfig(nodeIndex + 1);
    if (!oldConfig) throw new Error(`Node config for node ${nodeIndex} not found`);

    const mergedConfig = { ...oldConfig, ...validated };
    const newConfig = this.configRepo.updateNodeConfig(nodeIndex, validated);

    this.writeNodeInfoFile(nodeIndex, mergedConfig);
    
    // Ensure directory exists even on update (in case it was manually deleted)
    this.initializeNodeDirectory(nodeIndex);

    this.configRepo.logConfigChange('node_config', newConfig.id, 'UPDATE',
      context.userId, context.username, oldConfig, newConfig,
      context.ipAddress, context.userAgent);

    return newConfig;
  }

  async deleteNodeConfig(nodeNumber: number, context: RequestContext): Promise<boolean> {
    // nodeNumber is 1-based from UI
    const nodeIndex = nodeNumber - 1;
    
    if (nodeIndex < 0 || nodeIndex > 255) {
      throw new Error('Node number must be between 1 and 255');
    }

    const oldConfig = await this.getNodeConfig(nodeNumber);
    if (!oldConfig) return false;

    const deleted = this.configRepo.deleteNodeConfig(nodeIndex);

    const bbsRoot = appConfig.get('dataDir');
    const nodeInfoPath = path.join(bbsRoot, `Node${nodeIndex}.info`);
    if (fs.existsSync(nodeInfoPath)) {
      try {
        fs.unlinkSync(nodeInfoPath);
console.log(`[NodeConfigService] Deleted ${nodeInfoPath}`);
      } catch (error) {
console.error(`[NodeConfigService] Failed to delete ${nodeInfoPath}:`, error);
      }
    }

    if (deleted) {
      this.configRepo.logConfigChange('node_config', oldConfig.id, 'DELETE',
        context.userId, context.username, oldConfig, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }

  private writeNodeInfoFile(nodeNum: number, config: Partial<NodeConfig>): void {
    const bbsRoot = appConfig.get('dataDir');
    const nodeInfoPath = path.join(bbsRoot, `Node${nodeNum}.info`);

    try {
      const toolTypes = new Map<string, string>();

      if (config.node_start) toolTypes.set('NODESTART', config.node_start);
      if (config.priority !== undefined) toolTypes.set('PRIORITY', config.priority.toString());
      if (config.sysop_chat_color !== undefined) toolTypes.set('SYSOP_CHAT_COLOR', config.sysop_chat_color.toString());
      if (config.user_chat_color !== undefined) toolTypes.set('USER_CHAT_COLOR', config.user_chat_color.toString());

      if (config.capitol_files) toolTypes.set('CAPITOL_FILES', '1');
      if (config.def_screens) toolTypes.set('DEF_SCREENS', '1');
      if (config.sentby_files) toolTypes.set('SENTBY_FILES', '1');
      if (config.callers_log) toolTypes.set('CALLERS_LOG', '1');
      if (config.start_log) toolTypes.set('START_LOG', '1');
      if (config.ud_log) toolTypes.set('UD_LOG', '1');
      if (!config.telnet) toolTypes.set('NO_TELNET', '1');
      if (config.ftp) toolTypes.set('FTP', '1');
      if (config.disable_quick_logons) toolTypes.set('DISABLE_QUICK_LOGONS', '1');
      if (config.view_password) toolTypes.set('VIEW_PASSWORD', '1');

      const parser = new InfoFileParser();
      const infoData = parser.write(toolTypes);
      fs.writeFileSync(nodeInfoPath, infoData);

console.log(`[NodeConfigService] Wrote ${nodeInfoPath} with ${toolTypes.size} tooltypes`);
    } catch (error) {
console.error(`[NodeConfigService] Failed to write ${nodeInfoPath}:`, error);
    }
  }
}
