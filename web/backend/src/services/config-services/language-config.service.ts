/**
 * Language Configuration Service
 * Handles system languages and individual language configuration
 */

import type { Database } from '../../database';
import type { ConfigRepository } from '../../database/config-repository';
import type { SystemLanguages, Language } from '../../database/types';
import { SystemLanguagesSchema, LanguageSchema, type RequestContext } from '../config.schemas';
import { InfoFileParser } from '../info-file-parser';
import { config as appConfig } from '../../config';
import * as fs from 'fs';
import * as path from 'path';

export class LanguageConfigService {
  private configRepo: ConfigRepository;

  constructor(private database: Database) {
    this.configRepo = database.getConfigRepository();
  }

  async getSystemLanguages(): Promise<SystemLanguages> {
    let config = this.configRepo.getSystemLanguages();
    if (!config) {
      config = this.configRepo.createSystemLanguages({});
    }
    return config;
  }

  async updateSystemLanguages(
    updates: Partial<SystemLanguages>,
    context: RequestContext
  ): Promise<SystemLanguages> {
    const validated = SystemLanguagesSchema.parse(updates);
    const oldConfig = await this.getSystemLanguages();
    const newConfig = this.configRepo.updateSystemLanguages(validated);

    this.configRepo.logConfigChange('system_languages', 1, 'UPDATE',
      context.userId, context.username, oldConfig, newConfig,
      context.ipAddress, context.userAgent);

    return newConfig;
  }

  async getLanguages(): Promise<Language[]> {
    const bbsRoot = appConfig.get('dataDir');
    const languagesDir = path.join(bbsRoot, 'Languages');

    if (!fs.existsSync(languagesDir)) {
      console.warn('[LanguageConfigService] Languages/ directory not found');
      return this.configRepo.getLanguages();
    }

    try {
      const languages: Language[] = [];
      const files = fs.readdirSync(languagesDir);
      const infoFiles = files.filter(f => f.endsWith('.info'));

      let languageNum = 1;
      for (const infoFile of infoFiles) {
        const infoPath = path.join(languagesDir, infoFile);
        const buffer = fs.readFileSync(infoPath);
        const stats = fs.statSync(infoPath);
        const parser = new InfoFileParser();
        const parsed = parser.parse(buffer);

        const toolTypes = new Map<string, string>();
        for (const [key, value] of parsed.toolTypes.entries()) {
          toolTypes.set(key.toUpperCase(), value);
        }

        const languageName = infoFile.replace(/\.info$/i, '');

        languages.push({
          id: languageNum++,
          language_number: languageNum - 1,
          title: languageName,
          language_code: languageName.substring(0, 2).toLowerCase(),
          file_path: infoPath,
          enabled: true,
          created_at: stats.birthtime,
          updated_at: stats.mtime
        });
      }

      console.log(`[LanguageConfigService] Loaded ${languages.length} languages`);
      return languages;
    } catch (error) {
      console.error('[LanguageConfigService] Error reading Languages/ directory:', error);
      return this.configRepo.getLanguages();
    }
  }

  async getLanguage(id: number): Promise<Language | null> {
    return this.configRepo.getLanguage(id);
  }

  async getLanguageByCode(code: string): Promise<Language | null> {
    return this.configRepo.getLanguageByCode(code);
  }

  async createLanguage(
    language: Omit<Language, 'id' | 'created_at' | 'updated_at'>,
    context: RequestContext
  ): Promise<Language> {
    const validated = LanguageSchema.parse(language) as Omit<Language, 'id' | 'created_at' | 'updated_at'>;

    const allLanguages = await this.getLanguages();
    const existing = allLanguages.find(l =>
      l.language_code.toUpperCase() === validated.language_code.toUpperCase()
    );
    if (existing) {
      throw new Error(`Language code '${validated.language_code}' already exists`);
    }

    const newLanguage = this.configRepo.createLanguage(validated);
    if (!newLanguage) throw new Error('Failed to create language');

    this.writeLanguageInfoFile(validated);
    this.configRepo.logConfigChange('languages', newLanguage.id, 'CREATE',
      context.userId, context.username, undefined, newLanguage,
      context.ipAddress, context.userAgent);

    return newLanguage;
  }

  async updateLanguage(
    id: number,
    updates: Partial<Language>,
    context: RequestContext
  ): Promise<Language> {
    const validated = LanguageSchema.partial().parse(updates);
    const oldLanguage = await this.getLanguage(id);
    if (!oldLanguage) throw new Error(`Language ${id} not found`);

    if (validated.language_code && validated.language_code !== oldLanguage.language_code) {
      const allLanguages = await this.getLanguages();
      const existing = allLanguages.find(l =>
        l.language_code.toUpperCase() === validated.language_code!.toUpperCase() && l.id !== id
      );
      if (existing) {
        throw new Error(`Language code '${validated.language_code}' already exists`);
      }
    }

    if (validated.title && validated.title !== oldLanguage.title) {
      this.deleteLanguageInfoFile(oldLanguage.title);
    }

    const dbLanguage = this.configRepo.updateLanguage(id, validated);
    const newLanguage: Language = dbLanguage || {
      ...oldLanguage,
      ...validated,
      updated_at: new Date()
    };

    const mergedLanguage = { ...oldLanguage, ...validated };
    this.writeLanguageInfoFile(mergedLanguage);

    this.configRepo.logConfigChange('languages', newLanguage.id, 'UPDATE',
      context.userId, context.username, oldLanguage, newLanguage,
      context.ipAddress, context.userAgent);

    return newLanguage;
  }

  async deleteLanguage(id: number, context: RequestContext): Promise<boolean> {
    const oldLanguage = await this.getLanguage(id);
    if (!oldLanguage) return false;

    const deleted = this.configRepo.deleteLanguage(id);
    this.deleteLanguageInfoFile(oldLanguage.title);

    if (deleted) {
      this.configRepo.logConfigChange('languages', oldLanguage.id, 'DELETE',
        context.userId, context.username, oldLanguage, undefined,
        context.ipAddress, context.userAgent);
    }

    return deleted;
  }

  private writeLanguageInfoFile(language: Partial<Language>): void {
    if (!language.title) return;

    const bbsRoot = appConfig.get('dataDir');
    const languagesDir = path.join(bbsRoot, 'Languages');
    const infoPath = path.join(languagesDir, `${language.title}.info`);

    try {
      if (!fs.existsSync(languagesDir)) {
        fs.mkdirSync(languagesDir, { recursive: true });
      }

      const toolTypes = new Map<string, string>();
      if (language.language_code) toolTypes.set('CODE', language.language_code);
      if (language.file_path) toolTypes.set('PATH', language.file_path);
      if (language.enabled !== undefined) toolTypes.set('ENABLED', language.enabled ? '1' : '0');

      const parser = new InfoFileParser();
      const infoData = parser.write(toolTypes);
      fs.writeFileSync(infoPath, infoData);

      console.log(`[LanguageConfigService] Wrote ${infoPath}`);
    } catch (error) {
      console.error(`[LanguageConfigService] Failed to write ${infoPath}:`, error);
    }
  }

  private deleteLanguageInfoFile(title: string): void {
    const bbsRoot = appConfig.get('dataDir');
    const infoPath = path.join(bbsRoot, 'Languages', `${title}.info`);

    if (fs.existsSync(infoPath)) {
      try {
        fs.unlinkSync(infoPath);
        console.log(`[LanguageConfigService] Deleted ${infoPath}`);
      } catch (error) {
        console.error(`[LanguageConfigService] Failed to delete ${infoPath}:`, error);
      }
    }
  }
}
