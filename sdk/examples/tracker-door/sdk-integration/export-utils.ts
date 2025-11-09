/**
 * Export Utilities for SDK Integration
 * Tools for exporting TrackerDoor songs to various formats optimized for game use
 */

import { Song } from '../data/types';
import { exportToSDKFormat, SDKMusicData } from './tracker-audio-engine';
import { MODParser } from '../formats/mod-parser';
import { XMExporter, ITExporter, AHXExporter } from '../formats/format-exporters';
import * as fs from 'fs';
import * as path from 'path';

export interface ExportOptions {
  format: 'sdk' | 'mod' | 'xm' | 'it' | 'ahx' | 'json';
  outputPath: string;
  compress?: boolean;
  optimize?: boolean;
}

export interface ExportResult {
  success: boolean;
  filepath: string;
  format: string;
  size: number;
  warnings: string[];
  errors: string[];
}

/**
 * Export Manager for SDK Integration
 */
export class SDKExportManager {
  /**
   * Export song to specified format
   */
  static async export(song: Song, options: ExportOptions): Promise<ExportResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    let success = false;
    let filepath = options.outputPath;

    try {
      switch (options.format) {
        case 'sdk':
          filepath = await this.exportSDK(song, options.outputPath, options);
          success = true;
          break;

        case 'mod':
          filepath = await this.exportMOD(song, options.outputPath);
          success = true;
          break;

        case 'xm':
          filepath = await this.exportXM(song, options.outputPath);
          success = true;
          break;

        case 'it':
          filepath = await this.exportIT(song, options.outputPath);
          warnings.push('IT export is partially implemented');
          success = true;
          break;

        case 'ahx':
          const ahxResult = await this.exportAHX(song, options.outputPath);
          warnings.push(...ahxResult.warnings);
          success = ahxResult.success;
          break;

        case 'json':
          filepath = await this.exportJSON(song, options.outputPath, options);
          success = true;
          break;

        default:
          errors.push(`Unsupported export format: ${options.format}`);
      }

      const stats = fs.statSync(filepath);

      return {
        success,
        filepath,
        format: options.format,
        size: stats.size,
        warnings,
        errors
      };
    } catch (error) {
      errors.push(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        filepath: options.outputPath,
        format: options.format,
        size: 0,
        warnings,
        errors
      };
    }
  }

  /**
   * Export to SDK-optimized JSON format
   */
  private static async exportSDK(
    song: Song,
    outputPath: string,
    options: ExportOptions
  ): Promise<string> {
    const sdkData = exportToSDKFormat(song);

    // Optimize if requested
    if (options.optimize) {
      this.optimizeSDKData(sdkData);
    }

    // Write to file
    const json = options.compress
      ? JSON.stringify(sdkData)
      : JSON.stringify(sdkData, null, 2);

    fs.writeFileSync(outputPath, json, 'utf8');

    return outputPath;
  }

  /**
   * Export to MOD format
   */
  private static async exportMOD(song: Song, outputPath: string): Promise<string> {
    MODParser.export(song, outputPath);
    return outputPath;
  }

  /**
   * Export to XM format
   */
  private static async exportXM(song: Song, outputPath: string): Promise<string> {
    await XMExporter.export(song, outputPath);
    return outputPath;
  }

  /**
   * Export to IT format
   */
  private static async exportIT(song: Song, outputPath: string): Promise<string> {
    await ITExporter.export(song, outputPath);
    return outputPath;
  }

  /**
   * Export to AHX format
   */
  private static async exportAHX(
    song: Song,
    outputPath: string
  ): Promise<{ success: boolean; warnings: string[] }> {
    return await AHXExporter.export(song, outputPath);
  }

  /**
   * Export to standard JSON format
   */
  private static async exportJSON(
    song: Song,
    outputPath: string,
    options: ExportOptions
  ): Promise<string> {
    const data = {
      version: '1.0',
      format: 'TrackerDoor',
      song: this.serializeSong(song)
    };

    const json = options.compress
      ? JSON.stringify(data)
      : JSON.stringify(data, null, 2);

    fs.writeFileSync(outputPath, json, 'utf8');

    return outputPath;
  }

  /**
   * Optimize SDK data for smaller file size
   */
  private static optimizeSDKData(data: SDKMusicData): void {
    // Remove empty patterns
    data.patterns = data.patterns.filter(p => p.notes.length > 0);

    // Remove unused instruments
    const usedInstruments = new Set<number>();
    data.patterns.forEach(pattern => {
      pattern.notes.forEach(([key, note]) => {
        if (note.instrument) {
          usedInstruments.add(note.instrument);
        }
      });
    });

    data.instruments = data.instruments.filter(inst =>
      usedInstruments.has(inst.id)
    );

    // Compress sample data if possible
    data.instruments.forEach(inst => {
      if (inst.sample && inst.sample.data) {
        // Could apply audio compression here
        // For now, just ensure data is float32
      }
    });
  }

  /**
   * Serialize song for JSON export
   */
  private static serializeSong(song: Song): any {
    return {
      ...song,
      patterns: song.patterns.map(pattern => ({
        ...pattern,
        data: Array.from(pattern.data.entries()).map(([key, note]) => ({ key, note }))
      })),
      instruments: song.instruments.map(inst => ({
        ...inst,
        sample: inst.sample ? {
          ...inst.sample,
          data: Array.from(inst.sample.data)
        } : undefined
      }))
    };
  }

  /**
   * Batch export song to multiple formats
   */
  static async batchExport(
    song: Song,
    outputDir: string,
    formats: Array<'sdk' | 'mod' | 'xm' | 'it' | 'json'>
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = [];

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Export to each format
    for (const format of formats) {
      const ext = this.getExtension(format);
      const filename = `${song.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}${ext}`;
      const filepath = path.join(outputDir, filename);

      const result = await this.export(song, {
        format,
        outputPath: filepath,
        compress: false,
        optimize: true
      });

      results.push(result);
    }

    return results;
  }

  /**
   * Get file extension for format
   */
  private static getExtension(format: string): string {
    const extensions: Record<string, string> = {
      sdk: '.sdk.json',
      mod: '.mod',
      xm: '.xm',
      it: '.it',
      ahx: '.ahx',
      json: '.json'
    };

    return extensions[format] || '.dat';
  }

  /**
   * Generate SDK game integration code snippet
   */
  static generateIntegrationCode(musicFilePath: string): string {
    return `
// TrackerDoor Music Integration Example
import { createTrackerMusic } from '@amiexpress/tracker-door/sdk-integration';
import { AudioEngine } from '@amiexpress/sdk/engines/audio';

// Initialize audio
const audio = new AudioEngine();
const music = createTrackerMusic(audio);

// Load TrackerDoor music
door.onConnect(async () => {
  await audio.init();
  await music.loadSongFromFile('${musicFilePath}');
  music.play();
});

// Control music playback
music.setChannelMute(2, true);  // Mute channel 2
music.setLoopEnabled(true);     // Enable looping
music.jumpToPattern(5);         // Jump to pattern 5

// Get song info
const info = music.getSongInfo();
console.log(\`Playing: \${info.title} by \${info.artist}\`);

// Clean up on disconnect
door.onDisconnect(() => {
  music.dispose();
});
`.trim();
  }

  /**
   * Create a game-ready music pack
   */
  static async createMusicPack(
    songs: Song[],
    outputDir: string,
    options: {
      includeSourceJSON?: boolean;
      includeDocumentation?: boolean;
      format?: 'sdk' | 'mod' | 'xm';
    } = {}
  ): Promise<string> {
    const packName = 'music-pack';
    const packDir = path.join(outputDir, packName);

    // Create directories
    fs.mkdirSync(packDir, { recursive: true });
    const musicDir = path.join(packDir, 'music');
    fs.mkdirSync(musicDir, { recursive: true });

    const format = options.format || 'sdk';
    const ext = this.getExtension(format);

    // Export all songs
    const manifest: any = {
      version: '1.0',
      format,
      tracks: []
    };

    for (const song of songs) {
      const filename = `${song.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}${ext}`;
      const filepath = path.join(musicDir, filename);

      await this.export(song, {
        format,
        outputPath: filepath,
        compress: false,
        optimize: true
      });

      manifest.tracks.push({
        title: song.title,
        artist: song.artist,
        file: `music/${filename}`,
        bpm: song.bpm,
        duration: this.calculateDuration(song)
      });

      // Include source JSON if requested
      if (options.includeSourceJSON) {
        const jsonPath = path.join(musicDir, `${path.parse(filename).name}.json`);
        await this.exportJSON(song, jsonPath, { format: 'json', outputPath: jsonPath });
      }
    }

    // Write manifest
    fs.writeFileSync(
      path.join(packDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    // Include documentation if requested
    if (options.includeDocumentation) {
      const readme = this.generateMusicPackREADME(manifest);
      fs.writeFileSync(path.join(packDir, 'README.md'), readme, 'utf8');
    }

    return packDir;
  }

  /**
   * Calculate song duration in seconds
   */
  private static calculateDuration(song: Song): number {
    const totalRows = song.sequence.reduce((sum, patIdx) => {
      const pattern = song.patterns.find(p => p.id === patIdx);
      return sum + (pattern?.rows || 64);
    }, 0);

    const msPerRow = (60000 / (song.bpm || 125)) / (song.ticksPerRow || 6);
    return Math.floor((totalRows * msPerRow) / 1000);
  }

  /**
   * Generate README for music pack
   */
  private static generateMusicPackREADME(manifest: any): string {
    return `
# TrackerDoor Music Pack

This music pack contains ${manifest.tracks.length} tracks created with TrackerDoor.

## Format

Format: ${manifest.format.toUpperCase()}
Version: ${manifest.version}

## Tracks

${manifest.tracks.map((track: any, i: number) => `
${i + 1}. **${track.title}** by ${track.artist}
   - File: \`${track.file}\`
   - BPM: ${track.bpm}
   - Duration: ${track.duration}s
`).join('\n')}

## Integration

See the included example code for integration with AmiExpress Door SDK.

\`\`\`typescript
${this.generateIntegrationCode('music/track1.sdk.json')}
\`\`\`

## License

Music tracks are provided for use in AmiExpress BBS doors and games.
`.trim();
  }
}
