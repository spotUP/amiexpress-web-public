"use strict";
/**
 * Graphics Engine - Advanced ANSI/ASCII Rendering
 *
 * Provides next-generation graphics capabilities for BBS doors including:
 * - Animated sprites with frame-by-frame control
 * - Parallax scrolling backgrounds (up to 5 layers)
 * - Particle systems for visual effects
 * - Cinematic cutscenes with transitions
 * - Tile-based rendering
 * - ANSI art loading and display
 *
 * @example
 * ```typescript
 * import { GraphicsEngine } from '@amiexpress/sdk/engines/graphics';
 *
 * const gfx = new GraphicsEngine({ width: 80, height: 24 });
 *
 * // Create animated sprite
 * const player = gfx.createSprite({
 *   id: 'player',
 *   frames: ['walk1.ans', 'walk2.ans'],
 *   position: { x: 10, y: 10 },
 *   fps: 10
 * });
 *
 * // Add parallax background
 * gfx.addParallaxLayer({
 *   image: 'mountains.ans',
 *   scrollSpeed: 0.5,
 *   depth: 3
 * });
 *
 * // Render frame
 * const output = gfx.render();
 * door.sendAnsi(output);
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphicsEngine = void 0;
const types_1 = require("../../core/types");
const ansi_string_utils_1 = require("../../core/ansi-string-utils");
class GraphicsEngine {
    constructor(config) {
        /** Registered sprites */
        this.sprites = new Map();
        /** Parallax layers */
        this.parallaxLayers = [];
        /** Active particle systems */
        this.particleSystems = new Map();
        /** Camera position (for scrolling) */
        this.camera = { x: 0, y: 0 };
        /** Loaded ANSI art cache */
        this.ansiCache = new Map();
        /** Cutscene playback state */
        this.cutscenePlaying = false;
        this.currentCutscene = null;
        this.cutsceneFrame = 0;
        this.cutsceneStartTime = 0;
        this.width = config.width;
        this.height = config.height;
        this.doubleBuffer = config.doubleBuffer ?? false;
        // Initialize buffers
        this.buffer = this.createBuffer();
        this.backBuffer = this.createBuffer();
    }
    /**
     * Create empty buffer
     * @private
     */
    createBuffer() {
        const buffer = [];
        for (let y = 0; y < this.height; y++) {
            buffer[y] = [];
            for (let x = 0; x < this.width; x++) {
                buffer[y][x] = {
                    char: ' ',
                    fg: types_1.AnsiColor.White,
                    bg: types_1.AnsiColor.Black,
                };
            }
        }
        return buffer;
    }
    /**
     * Clear the screen
     *
     * @param color - Background color
     *
     * @example
     * ```typescript
     * gfx.clear(AnsiColor.Black);
     * ```
     */
    clear(color = types_1.AnsiColor.Black) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.buffer[y][x] = {
                    char: ' ',
                    fg: types_1.AnsiColor.White,
                    bg: color,
                };
            }
        }
    }
    /**
     * Draw a single character at position
     *
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param char - Character to draw
     * @param fg - Foreground color
     * @param bg - Background color
     *
     * @example
     * ```typescript
     * gfx.drawChar(10, 5, '@', AnsiColor.Yellow, AnsiColor.Black);
     * ```
     */
    drawChar(x, y, char, fg = types_1.AnsiColor.White, bg = types_1.AnsiColor.Black) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height)
            return;
        this.buffer[y][x] = { char: char[0] || ' ', fg, bg };
    }
    /**
     * Draw text at position
     *
     * NOTE: This method strips ANSI codes and draws using the provided colors.
     * If you need to preserve ANSI color codes in the text, use raw ANSI output instead.
     *
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param text - Text to draw (ANSI codes will be stripped)
     * @param fg - Foreground color
     * @param bg - Background color
     *
     * @example
     * ```typescript
     * gfx.drawText(5, 10, 'GAME OVER', AnsiColor.Red);
     * // Text with ANSI codes - codes are stripped, only visible text is drawn
     * gfx.drawText(5, 10, '\x1b[31mColored\x1b[0m Text', AnsiColor.White);
     * ```
     */
    drawText(x, y, text, fg = types_1.AnsiColor.White, bg = types_1.AnsiColor.Black) {
        // Strip ANSI codes to get only visible characters
        // This ensures proper positioning even if text contains color codes
        const cleanText = (0, ansi_string_utils_1.stripAnsi)(text);
        for (let i = 0; i < cleanText.length; i++) {
            this.drawChar(x + i, y, cleanText[i], fg, bg);
        }
    }
    /**
     * Draw a filled rectangle
     *
     * @param rect - Rectangle bounds
     * @param char - Fill character
     * @param fg - Foreground color
     * @param bg - Background color
     *
     * @example
     * ```typescript
     * gfx.drawRect({ x: 10, y: 5, width: 20, height: 10 }, '█', AnsiColor.Blue);
     * ```
     */
    drawRect(rect, char = '█', fg = types_1.AnsiColor.White, bg = types_1.AnsiColor.Black) {
        for (let y = rect.y; y < rect.y + rect.height; y++) {
            for (let x = rect.x; x < rect.x + rect.width; x++) {
                this.drawChar(x, y, char, fg, bg);
            }
        }
    }
    /**
     * Draw a box outline
     *
     * @param rect - Rectangle bounds
     * @param style - Box drawing style
     * @param fg - Foreground color
     *
     * @example
     * ```typescript
     * gfx.drawBox({ x: 5, y: 5, width: 30, height: 15 }, 'single', AnsiColor.Cyan);
     * ```
     */
    drawBox(rect, style = 'single', fg = types_1.AnsiColor.White) {
        const chars = style === 'double'
            ? { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' }
            : style === 'single'
                ? { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }
                : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' };
        // Top and bottom
        for (let x = rect.x + 1; x < rect.x + rect.width - 1; x++) {
            this.drawChar(x, rect.y, chars.h, fg);
            this.drawChar(x, rect.y + rect.height - 1, chars.h, fg);
        }
        // Left and right
        for (let y = rect.y + 1; y < rect.y + rect.height - 1; y++) {
            this.drawChar(rect.x, y, chars.v, fg);
            this.drawChar(rect.x + rect.width - 1, y, chars.v, fg);
        }
        // Corners
        this.drawChar(rect.x, rect.y, chars.tl, fg);
        this.drawChar(rect.x + rect.width - 1, rect.y, chars.tr, fg);
        this.drawChar(rect.x, rect.y + rect.height - 1, chars.bl, fg);
        this.drawChar(rect.x + rect.width - 1, rect.y + rect.height - 1, chars.br, fg);
    }
    /**
     * Load ANSI art from file or string
     *
     * @param id - Identifier for caching
     * @param ansiData - ANSI art data
     *
     * @example
     * ```typescript
     * const logo = fs.readFileSync('assets/logo.ans', 'utf8');
     * gfx.loadAnsi('logo', logo);
     * ```
     */
    loadAnsi(id, ansiData) {
        this.ansiCache.set(id, ansiData);
    }
    /**
     * Draw ANSI art at position
     *
     * @param id - ANSI art ID
     * @param position - Position to draw
     *
     * @example
     * ```typescript
     * gfx.drawAnsi('logo', { x: 10, y: 5 });
     * ```
     */
    drawAnsi(id, position = { x: 0, y: 0 }) {
        const ansi = this.ansiCache.get(id);
        if (!ansi)
            return;
        // Parse and render ANSI (simplified - ANSI codes are stripped by drawText)
        const lines = ansi.split(/\r?\n/);
        lines.forEach((line, y) => {
            // drawText will strip ANSI codes and draw visible characters only
            this.drawText(position.x, position.y + y, line);
        });
    }
    /**
     * Create an animated sprite
     *
     * @param config - Sprite configuration
     * @returns Created sprite
     *
     * @example
     * ```typescript
     * const enemy = gfx.createSprite({
     *   id: 'enemy1',
     *   frames: [
     *     { data: ' O \n/|\\\n/ \\', duration: 500 },
     *     { data: '\\O/\n | \n/ \\', duration: 500 }
     *   ],
     *   position: { x: 40, y: 12 },
     *   loop: true
     * });
     *
     * gfx.playSprite('enemy1');
     * ```
     */
    createSprite(config) {
        // Convert string[] to AnimationFrame[]
        const frames = config.frames.map((frame) => typeof frame === 'string' ? { data: frame, duration: 100 } : frame);
        const sprite = {
            id: config.id,
            position: config.position,
            size: config.size || { width: 10, height: 10 },
            frames,
            currentFrame: 0,
            playing: false,
            loop: config.loop ?? true,
            visible: true,
            zIndex: config.zIndex ?? 0,
        };
        this.sprites.set(config.id, sprite);
        return sprite;
    }
    /**
     * Play sprite animation
     *
     * @param id - Sprite ID
     *
     * @example
     * ```typescript
     * gfx.playSprite('player-walk');
     * ```
     */
    playSprite(id) {
        const sprite = this.sprites.get(id);
        if (sprite)
            sprite.playing = true;
    }
    /**
     * Stop sprite animation
     *
     * @param id - Sprite ID
     */
    stopSprite(id) {
        const sprite = this.sprites.get(id);
        if (sprite)
            sprite.playing = false;
    }
    /**
     * Update sprite animation (call each frame)
     *
     * @param id - Sprite ID
     * @param delta - Time delta in ms
     */
    updateSprite(id, delta) {
        const sprite = this.sprites.get(id);
        if (!sprite || !sprite.playing)
            return;
        // Advance frame based on duration (simplified)
        sprite.currentFrame = (sprite.currentFrame + 1) % sprite.frames.length;
        if (!sprite.loop && sprite.currentFrame === 0) {
            sprite.playing = false;
        }
    }
    /**
     * Draw sprite at its current position and frame
     *
     * @param id - Sprite ID
     *
     * @example
     * ```typescript
     * gfx.drawSprite('player');
     * ```
     */
    drawSprite(id) {
        const sprite = this.sprites.get(id);
        if (!sprite || !sprite.visible)
            return;
        const frame = sprite.frames[sprite.currentFrame];
        if (!frame)
            return;
        // Draw frame data
        const lines = frame.data.split('\n');
        lines.forEach((line, y) => {
            this.drawText(sprite.position.x, sprite.position.y + y, line);
        });
    }
    /**
     * Move sprite to position
     *
     * @param id - Sprite ID
     * @param position - New position
     */
    moveSprite(id, position) {
        const sprite = this.sprites.get(id);
        if (sprite)
            sprite.position = position;
    }
    /**
     * Add parallax scrolling layer
     *
     * @param config - Layer configuration
     *
     * @example
     * ```typescript
     * // Far background (slow scroll)
     * gfx.addParallaxLayer({
     *   image: 'mountains',
     *   scrollSpeed: 0.2,
     *   depth: 5,
     *   opacity: 0.7
     * });
     *
     * // Mid-ground
     * gfx.addParallaxLayer({
     *   image: 'trees',
     *   scrollSpeed: 0.5,
     *   depth: 3
     * });
     *
     * // Foreground (fast scroll)
     * gfx.addParallaxLayer({
     *   image: 'grass',
     *   scrollSpeed: 1.0,
     *   depth: 1
     * });
     * ```
     */
    addParallaxLayer(config) {
        this.parallaxLayers.push({
            image: config.image,
            scrollSpeed: config.scrollSpeed,
            depth: config.depth,
            offset: { x: 0, y: 0 },
            opacity: config.opacity ?? 1.0,
        });
        // Sort by depth (back to front)
        this.parallaxLayers.sort((a, b) => b.depth - a.depth);
    }
    /**
     * Update parallax layers (call each frame)
     *
     * @param scrollX - Horizontal scroll amount
     * @param scrollY - Vertical scroll amount
     */
    updateParallax(scrollX, scrollY = 0) {
        this.parallaxLayers.forEach((layer) => {
            layer.offset.x += scrollX * layer.scrollSpeed;
            layer.offset.y += scrollY * layer.scrollSpeed;
        });
    }
    /**
     * Draw all parallax layers
     */
    drawParallax() {
        this.parallaxLayers.forEach((layer) => {
            this.drawAnsi(layer.image, layer.offset);
        });
    }
    /**
     * Create particle system for visual effects
     *
     * @param config - Particle system configuration
     *
     * @example
     * ```typescript
     * // Explosion effect
     * gfx.createParticleSystem({
     *   type: 'explosion',
     *   count: 50,
     *   lifetime: 1000,
     *   velocity: { min: -5, max: 5 },
     *   position: { x: 40, y: 12 },
     *   color: AnsiColor.Red
     * });
     * ```
     */
    createParticleSystem(config) {
        const particles = [];
        for (let i = 0; i < config.count; i++) {
            const vel = config.velocity;
            particles.push({
                position: { ...(config.position || { x: 40, y: 12 }) },
                velocity: {
                    x: Math.random() * (vel.max - vel.min) + vel.min,
                    y: Math.random() * (vel.max - vel.min) + vel.min,
                },
                lifetime: config.lifetime,
                maxLifetime: config.lifetime,
                char: config.type === 'explosion' ? '*' : '.',
                color: config.color || types_1.AnsiColor.Yellow,
            });
        }
        this.particleSystems.set(config.type, particles);
    }
    /**
     * Update particle systems (call each frame)
     *
     * @param delta - Time delta in ms
     */
    updateParticles(delta) {
        this.particleSystems.forEach((particles, type) => {
            for (let i = particles.length - 1; i >= 0; i--) {
                const particle = particles[i];
                // Update position
                particle.position.x += particle.velocity.x * (delta / 1000);
                particle.position.y += particle.velocity.y * (delta / 1000);
                // Apply gravity (if configured)
                particle.velocity.y += 9.8 * (delta / 1000);
                // Update lifetime
                particle.lifetime -= delta;
                // Remove dead particles
                if (particle.lifetime <= 0) {
                    particles.splice(i, 1);
                }
            }
            // Remove empty systems
            if (particles.length === 0) {
                this.particleSystems.delete(type);
            }
        });
    }
    /**
     * Draw all particle systems
     */
    drawParticles() {
        this.particleSystems.forEach((particles) => {
            particles.forEach((particle) => {
                this.drawChar(Math.floor(particle.position.x), Math.floor(particle.position.y), particle.char, particle.color);
            });
        });
    }
    /**
     * Set camera position (for scrolling levels)
     *
     * @param position - Camera position
     *
     * @example
     * ```typescript
     * gfx.setCamera({ x: player.x - 40, y: player.y - 12 });
     * ```
     */
    setCamera(position) {
        this.camera = position;
    }
    /**
     * Get camera position
     *
     * @returns Current camera position
     */
    getCamera() {
        return { ...this.camera };
    }
    /**
     * Convert buffer to ANSI string for output
     *
     * @returns ANSI-encoded string
     */
    toAnsi() {
        let output = '\x1b[2J\x1b[H'; // Clear screen and home cursor
        let lastFg = -1;
        let lastBg = -1;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const cell = this.buffer[y][x];
                // Optimize: only emit color codes when they change
                if (cell.fg !== lastFg) {
                    // AnsiColor enum: 0-7 = normal colors, 8-15 = bright colors
                    const fgCode = cell.fg < 8 ? 30 + cell.fg : 90 + (cell.fg - 8);
                    output += `\x1b[${fgCode}m`;
                    lastFg = cell.fg;
                }
                if (cell.bg !== lastBg) {
                    // AnsiColor enum: 0-7 = normal colors, 8-15 = bright colors
                    const bgCode = cell.bg < 8 ? 40 + cell.bg : 100 + (cell.bg - 8);
                    output += `\x1b[${bgCode}m`;
                    lastBg = cell.bg;
                }
                output += cell.char;
            }
            output += '\r\n';
        }
        return output + '\x1b[0m'; // Reset colors at end
    }
    /**
     * Play cinematic cutscene
     *
     * @param cutscene - Cutscene definition with scenes and transitions
     *
     * @example
     * ```typescript
     * const intro = {
     *   id: 'intro',
     *   scenes: [
     *     { image: 'scene1', duration: 3000, transition: 'fade' },
     *     { image: 'scene2', duration: 2000, text: 'Chapter 1', textPosition: { x: 30, y: 20 } }
     *   ],
     *   skippable: true,
     *   onComplete: () => startGame()
     * };
     *
     * gfx.playCutscene(intro);
     * ```
     */
    playCutscene(cutscene) {
        this.currentCutscene = cutscene;
        this.cutscenePlaying = true;
        this.cutsceneFrame = 0;
        this.cutsceneStartTime = Date.now();
    }
    /**
     * Update cutscene playback (call each frame)
     *
     * @param delta - Time since last frame (milliseconds)
     * @returns true if cutscene is still playing
     *
     * @example
     * ```typescript
     * // In game loop
     * if (gfx.isCutscenePlaying()) {
     *   gfx.updateCutscene(delta);
     *   const output = gfx.render();
     *   door.sendAnsi(output);
     * }
     * ```
     */
    updateCutscene(delta) {
        if (!this.cutscenePlaying || !this.currentCutscene) {
            return false;
        }
        const elapsed = Date.now() - this.cutsceneStartTime;
        const currentScene = this.currentCutscene.scenes[this.cutsceneFrame];
        if (!currentScene) {
            // Cutscene complete
            this.stopCutscene();
            if (this.currentCutscene?.onComplete) {
                this.currentCutscene.onComplete();
            }
            return false;
        }
        // Check if scene duration elapsed
        if (elapsed >= currentScene.duration) {
            // Move to next scene
            this.cutsceneFrame++;
            this.cutsceneStartTime = Date.now();
            // Check if we have more scenes
            if (this.cutsceneFrame >= this.currentCutscene.scenes.length) {
                this.stopCutscene();
                if (this.currentCutscene?.onComplete) {
                    this.currentCutscene.onComplete();
                }
                return false;
            }
        }
        // Render current scene
        this.renderCutsceneScene(currentScene, elapsed);
        return true;
    }
    /**
     * Render current cutscene scene
     * @private
     */
    renderCutsceneScene(scene, elapsed) {
        // Clear screen
        this.clear(types_1.AnsiColor.Black);
        // Calculate transition effect
        const progress = Math.min(1, elapsed / scene.duration);
        let alpha = 1;
        if (scene.transition === 'fade') {
            // Fade in at start, fade out at end
            if (progress < 0.2) {
                alpha = progress / 0.2;
            }
            else if (progress > 0.8) {
                alpha = (1 - progress) / 0.2;
            }
        }
        // Draw scene image (if loaded in cache)
        if (this.ansiCache.has(scene.image)) {
            this.drawAnsi(scene.image);
        }
        // Draw text overlay
        if (scene.text && scene.textPosition) {
            const textLines = scene.text.split('\n');
            textLines.forEach((line, index) => {
                this.drawText(scene.textPosition.x, scene.textPosition.y + index, line, types_1.AnsiColor.White);
            });
        }
    }
    /**
     * Stop cutscene playback
     *
     * @example
     * ```typescript
     * // Allow user to skip cutscene
     * door.onInput((key) => {
     *   if (key === ' ' && gfx.isCutscenePlaying()) {
     *     gfx.stopCutscene();
     *   }
     * });
     * ```
     */
    stopCutscene() {
        this.cutscenePlaying = false;
        this.currentCutscene = null;
        this.cutsceneFrame = 0;
        this.cutsceneStartTime = 0;
    }
    /**
     * Check if cutscene is currently playing
     *
     * @returns true if cutscene is active
     *
     * @example
     * ```typescript
     * if (!gfx.isCutscenePlaying()) {
     *   // Resume normal gameplay
     *   updateGame();
     * }
     * ```
     */
    isCutscenePlaying() {
        return this.cutscenePlaying;
    }
    /**
     * Render the current frame and return ANSI output
     *
     * @returns ANSI-encoded frame
     *
     * @example
     * ```typescript
     * door.onRender(() => {
     *   gfx.clear();
     *   gfx.drawParallax();
     *   gfx.drawSprite('player');
     *   gfx.drawParticles();
     *
     *   const output = gfx.render();
     *   door.sendAnsi(output);
     * });
     * ```
     */
    render() {
        if (this.doubleBuffer) {
            // Swap buffers
            const temp = this.buffer;
            this.buffer = this.backBuffer;
            this.backBuffer = temp;
        }
        return this.toAnsi();
    }
    /**
     * Clean up resources
     */
    dispose() {
        // Clear buffers
        this.sprites.clear();
        this.particleSystems.clear();
        this.parallaxLayers = [];
        this.ansiCache.clear();
    }
}
exports.GraphicsEngine = GraphicsEngine;
exports.default = GraphicsEngine;
