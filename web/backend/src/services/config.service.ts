/**
 * Configuration Service (Orchestrator)
 * Delegates to specialized configuration service modules
 *
 * Features:
 * - Zod validation for all inputs
 * - Automatic audit logging
 * - Error handling
 * - Transaction support
 */

import type { Database } from '../database';
import type {
  SystemConfig,
  NodeConfig,
  ConferenceConfig,
  Door,
  SystemLanguages,
  Language,
  Protocol,
  SecurityLevelAccess,
  DriveConfig,
  ComputerType,
  ScreenType,
  FileChecker,
  FileCheckerError
} from '../database/types';

import {
  AuditConfigService,
  SystemConfigService,
  NodeConfigService,
  ConferenceConfigService,
  DoorConfigService,
  LanguageConfigService,
  ProtocolConfigService,
  SecurityConfigService,
  DriveConfigService,
  ComputerConfigService,
  ScreenConfigService,
  FileCheckerConfigService
} from './config-services';

// Re-export Zod schemas for downstream consumers
export {
  SystemConfigSchema,
  NodeConfigSchema,
  ConferenceConfigSchema,
  DoorSchema,
  SystemLanguagesSchema,
  LanguageSchema,
  ProtocolSchema,
  SecurityLevelAccessSchema,
  DriveConfigSchema,
  ComputerTypeSchema,
  ScreenTypeSchema,
  FileCheckerSchema,
  FileCheckerErrorSchema
} from './config.schemas';

export type { RequestContext } from './config.schemas';

// ===== Configuration Service (Orchestrator) =====

export class ConfigService {
  private auditService: AuditConfigService;
  private systemService: SystemConfigService;
  private nodeService: NodeConfigService;
  private conferenceService: ConferenceConfigService;
  private doorService: DoorConfigService;
  private languageService: LanguageConfigService;
  private protocolService: ProtocolConfigService;
  private securityService: SecurityConfigService;
  private driveService: DriveConfigService;
  private computerService: ComputerConfigService;
  private screenService: ScreenConfigService;
  private fileCheckerService: FileCheckerConfigService;

  constructor(private database: Database) {
    // Initialize all specialized services
    this.auditService = new AuditConfigService(database);
    this.systemService = new SystemConfigService(database);
    this.nodeService = new NodeConfigService(database);
    this.conferenceService = new ConferenceConfigService(database);
    this.doorService = new DoorConfigService(database);
    this.languageService = new LanguageConfigService(database);
    this.protocolService = new ProtocolConfigService(database);
    this.securityService = new SecurityConfigService(database);
    this.driveService = new DriveConfigService(database);
    this.computerService = new ComputerConfigService(database);
    this.screenService = new ScreenConfigService(database);
    this.fileCheckerService = new FileCheckerConfigService(database);
  }

  // ===== System Configuration =====
  async getSystemConfig(): Promise<SystemConfig> {
    return this.systemService.getSystemConfig();
  }

  async updateSystemConfig(...args: Parameters<SystemConfigService['updateSystemConfig']>) {
    return this.systemService.updateSystemConfig(...args);
  }

  // ===== Node Configuration =====
  async getNodeConfigs(): Promise<NodeConfig[]> {
    return this.nodeService.getNodeConfigs();
  }

  async getNodeConfig(nodeNumber: number): Promise<NodeConfig | null> {
    return this.nodeService.getNodeConfig(nodeNumber);
  }

  async createNodeConfig(...args: Parameters<NodeConfigService['createNodeConfig']>) {
    return this.nodeService.createNodeConfig(...args);
  }

  async updateNodeConfig(...args: Parameters<NodeConfigService['updateNodeConfig']>) {
    return this.nodeService.updateNodeConfig(...args);
  }

  async deleteNodeConfig(...args: Parameters<NodeConfigService['deleteNodeConfig']>) {
    return this.nodeService.deleteNodeConfig(...args);
  }

  // ===== Conference Configuration =====
  async getConferenceConfig(conferenceId: number): Promise<ConferenceConfig | null> {
    return this.conferenceService.getConferenceConfig(conferenceId);
  }

  async getConferenceConfigs(): Promise<ConferenceConfig[]> {
    return this.conferenceService.getConferenceConfigs();
  }

  async createConferenceConfig(...args: Parameters<ConferenceConfigService['createConferenceConfig']>) {
    return this.conferenceService.createConferenceConfig(...args);
  }

  async updateConferenceConfig(...args: Parameters<ConferenceConfigService['updateConferenceConfig']>) {
    return this.conferenceService.updateConferenceConfig(...args);
  }

  async deleteConferenceConfig(...args: Parameters<ConferenceConfigService['deleteConferenceConfig']>) {
    return this.conferenceService.deleteConferenceConfig(...args);
  }

  // ===== Doors =====
  async getDoors(): Promise<Door[]> {
    return this.doorService.getDoors();
  }

  async getDoor(id: number): Promise<Door | null> {
    return this.doorService.getDoor(id);
  }

  async getDoorByCommand(command: string): Promise<Door | null> {
    return this.doorService.getDoorByCommand(command);
  }

  async createDoor(...args: Parameters<DoorConfigService['createDoor']>) {
    return this.doorService.createDoor(...args);
  }

  async updateDoor(...args: Parameters<DoorConfigService['updateDoor']>) {
    return this.doorService.updateDoor(...args);
  }

  async deleteDoor(...args: Parameters<DoorConfigService['deleteDoor']>) {
    return this.doorService.deleteDoor(...args);
  }

  // ===== System Languages =====
  async getSystemLanguages(): Promise<SystemLanguages> {
    return this.languageService.getSystemLanguages();
  }

  async updateSystemLanguages(...args: Parameters<LanguageConfigService['updateSystemLanguages']>) {
    return this.languageService.updateSystemLanguages(...args);
  }

  // ===== Languages =====
  async getLanguages(): Promise<Language[]> {
    return this.languageService.getLanguages();
  }

  async getLanguage(id: number): Promise<Language | null> {
    return this.languageService.getLanguage(id);
  }

  async getLanguageByCode(code: string): Promise<Language | null> {
    return this.languageService.getLanguageByCode(code);
  }

  async createLanguage(...args: Parameters<LanguageConfigService['createLanguage']>) {
    return this.languageService.createLanguage(...args);
  }

  async updateLanguage(...args: Parameters<LanguageConfigService['updateLanguage']>) {
    return this.languageService.updateLanguage(...args);
  }

  async deleteLanguage(...args: Parameters<LanguageConfigService['deleteLanguage']>) {
    return this.languageService.deleteLanguage(...args);
  }

  // ===== Protocols =====
  async getProtocols(): Promise<Protocol[]> {
    return this.protocolService.getProtocols();
  }

  async getProtocol(id: number): Promise<Protocol | null> {
    return this.protocolService.getProtocol(id);
  }

  async getProtocolByCode(code: string): Promise<Protocol | null> {
    return this.protocolService.getProtocolByCode(code);
  }

  async createProtocol(...args: Parameters<ProtocolConfigService['createProtocol']>) {
    return this.protocolService.createProtocol(...args);
  }

  async updateProtocol(...args: Parameters<ProtocolConfigService['updateProtocol']>) {
    return this.protocolService.updateProtocol(...args);
  }

  async deleteProtocol(...args: Parameters<ProtocolConfigService['deleteProtocol']>) {
    return this.protocolService.deleteProtocol(...args);
  }

  // ===== Security Level Access =====
  async getSecurityAccessForLevel(securityLevel: number): Promise<SecurityLevelAccess[]> {
    return this.securityService.getSecurityAccessForLevel(securityLevel);
  }

  async getSecurityAccessByFlag(
    securityLevel: number,
    acsFlag: string
  ): Promise<SecurityLevelAccess | null> {
    return this.securityService.getSecurityAccessByFlag(securityLevel, acsFlag);
  }

  async createSecurityAccess(...args: Parameters<SecurityConfigService['createSecurityAccess']>) {
    return this.securityService.createSecurityAccess(...args);
  }

  async updateSecurityAccess(...args: Parameters<SecurityConfigService['updateSecurityAccess']>) {
    return this.securityService.updateSecurityAccess(...args);
  }

  async deleteSecurityAccess(...args: Parameters<SecurityConfigService['deleteSecurityAccess']>) {
    return this.securityService.deleteSecurityAccess(...args);
  }

  // ===== Drive Configuration =====
  async getAllDrives(): Promise<DriveConfig[]> {
    return this.driveService.getAllDrives();
  }

  async getDrive(id: number): Promise<DriveConfig | null> {
    return this.driveService.getDrive(id);
  }

  async getDriveByNumber(driveNumber: number): Promise<DriveConfig | null> {
    return this.driveService.getDriveByNumber(driveNumber);
  }

  async createDrive(...args: Parameters<DriveConfigService['createDrive']>) {
    return this.driveService.createDrive(...args);
  }

  async updateDrive(...args: Parameters<DriveConfigService['updateDrive']>) {
    return this.driveService.updateDrive(...args);
  }

  async deleteDrive(...args: Parameters<DriveConfigService['deleteDrive']>) {
    return this.driveService.deleteDrive(...args);
  }

  // ===== Computer Types =====
  async getAllComputerTypes(): Promise<ComputerType[]> {
    return this.computerService.getAllComputerTypes();
  }

  async getComputerType(id: number): Promise<ComputerType | null> {
    return this.computerService.getComputerType(id);
  }

  async createComputerType(...args: Parameters<ComputerConfigService['createComputerType']>) {
    return this.computerService.createComputerType(...args);
  }

  async updateComputerType(...args: Parameters<ComputerConfigService['updateComputerType']>) {
    return this.computerService.updateComputerType(...args);
  }

  async deleteComputerType(...args: Parameters<ComputerConfigService['deleteComputerType']>) {
    return this.computerService.deleteComputerType(...args);
  }

  // ===== Screen Types =====
  async getAllScreenTypes(): Promise<ScreenType[]> {
    return this.screenService.getAllScreenTypes();
  }

  async getScreenType(id: number): Promise<ScreenType | null> {
    return this.screenService.getScreenType(id);
  }

  async createScreenType(...args: Parameters<ScreenConfigService['createScreenType']>) {
    return this.screenService.createScreenType(...args);
  }

  async updateScreenType(...args: Parameters<ScreenConfigService['updateScreenType']>) {
    return this.screenService.updateScreenType(...args);
  }

  async deleteScreenType(...args: Parameters<ScreenConfigService['deleteScreenType']>) {
    return this.screenService.deleteScreenType(...args);
  }

  // ===== File Checkers =====
  async getAllFileCheckers(): Promise<FileChecker[]> {
    return this.fileCheckerService.getAllFileCheckers();
  }

  async getFileChecker(id: number): Promise<FileChecker | null> {
    return this.fileCheckerService.getFileChecker(id);
  }

  async createFileChecker(...args: Parameters<FileCheckerConfigService['createFileChecker']>) {
    return this.fileCheckerService.createFileChecker(...args);
  }

  async updateFileChecker(...args: Parameters<FileCheckerConfigService['updateFileChecker']>) {
    return this.fileCheckerService.updateFileChecker(...args);
  }

  async deleteFileChecker(...args: Parameters<FileCheckerConfigService['deleteFileChecker']>) {
    return this.fileCheckerService.deleteFileChecker(...args);
  }

  async getFileCheckerErrors(checkerId: number): Promise<FileCheckerError[]> {
    return this.fileCheckerService.getFileCheckerErrors(checkerId);
  }

  async createFileCheckerError(...args: Parameters<FileCheckerConfigService['createFileCheckerError']>) {
    return this.fileCheckerService.createFileCheckerError(...args);
  }

  async deleteFileCheckerError(...args: Parameters<FileCheckerConfigService['deleteFileCheckerError']>) {
    return this.fileCheckerService.deleteFileCheckerError(...args);
  }

  // ===== Audit Log =====
  async getAuditLog(
    tableName?: string,
    recordId?: number,
    limit: number = 100
  ) {
    return this.auditService.getAuditLog(tableName, recordId, limit);
  }
}
