/**
 * Timer class for tracking elapsed time
 */
export class Timer {
  private startTime: number;
  private pausedTime: number = 0;
  private isPaused: boolean = false;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsed(): number {
    if (this.isPaused) {
      return this.pausedTime;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Get elapsed time in seconds
   */
  getElapsedSeconds(): number {
    return Math.floor(this.getElapsed() / 1000);
  }

  /**
   * Pause the timer
   */
  pause(): void {
    if (!this.isPaused) {
      this.pausedTime = Date.now() - this.startTime;
      this.isPaused = true;
    }
  }

  /**
   * Resume the timer
   */
  resume(): void {
    if (this.isPaused) {
      this.startTime = Date.now() - this.pausedTime;
      this.isPaused = false;
    }
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.startTime = Date.now();
    this.pausedTime = 0;
    this.isPaused = false;
  }

  /**
   * Format time as MM:SS
   */
  formatTime(seconds?: number): string {
    const secs = seconds !== undefined ? seconds : this.getElapsedSeconds();
    const minutes = Math.floor(secs / 60);
    const remainingSeconds = secs % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

/**
 * Framerate management system for smooth animations
 */
export class FrameRateManager {
  private targetFPS: number;
  private frameInterval: number;
  private lastFrameTime: number;
  private deltaTime: number;
  private frameCount: number;
  private fpsCounter: number;
  private lastFPSTime: number;

  constructor(targetFPS: number = 30) {
    this.targetFPS = targetFPS;
    this.frameInterval = 1000 / targetFPS;
    this.lastFrameTime = Date.now();
    this.deltaTime = 0;
    this.frameCount = 0;
    this.fpsCounter = 0;
    this.lastFPSTime = Date.now();
  }

  /**
   * Wait for next frame to maintain target framerate
   */
  async nextFrame(): Promise<number> {
    const currentTime = Date.now();
    const elapsed = currentTime - this.lastFrameTime;

    if (elapsed < this.frameInterval) {
      await this.delay(this.frameInterval - elapsed);
    }

    const newTime = Date.now();
    this.deltaTime = (newTime - this.lastFrameTime) / 1000; // Convert to seconds
    this.lastFrameTime = newTime;

    // Update FPS counter
    this.frameCount++;
    if (newTime - this.lastFPSTime >= 1000) {
      this.fpsCounter = this.frameCount;
      this.frameCount = 0;
      this.lastFPSTime = newTime;
    }

    return this.deltaTime;
  }

  /**
   * Get current delta time (time since last frame in seconds)
   */
  getDeltaTime(): number {
    return this.deltaTime;
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.fpsCounter;
  }

  /**
   * Set new target FPS
   */
  setTargetFPS(fps: number): void {
    this.targetFPS = fps;
    this.frameInterval = 1000 / fps;
  }

  /**
   * Simple delay function
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Game loop system for real-time games
 */
export class GameLoop {
  private fpsManager: FrameRateManager;
  private isRunning: boolean;
  private updateCallback?: (deltaTime: number) => Promise<void> | void;
  private renderCallback?: () => Promise<void> | void;
  private inputCallback?: () => Promise<void> | void;

  constructor(targetFPS: number = 30) {
    this.fpsManager = new FrameRateManager(targetFPS);
    this.isRunning = false;
  }

  /**
   * Set the update callback (game logic)
   */
  setUpdateCallback(callback: (deltaTime: number) => Promise<void> | void): void {
    this.updateCallback = callback;
  }

  /**
   * Set the render callback (drawing)
   */
  setRenderCallback(callback: () => Promise<void> | void): void {
    this.renderCallback = callback;
  }

  /**
   * Set the input callback (input handling)
   */
  setInputCallback(callback: () => Promise<void> | void): void {
    this.inputCallback = callback;
  }

  /**
   * Start the game loop
   */
  async start(): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      const deltaTime = await this.fpsManager.nextFrame();

      // Handle input
      if (this.inputCallback) {
        await this.inputCallback();
      }

      // Update game logic
      if (this.updateCallback) {
        await this.updateCallback(deltaTime);
      }

      // Render
      if (this.renderCallback) {
        await this.renderCallback();
      }
    }
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Check if loop is running
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.fpsManager.getFPS();
  }

  /**
   * Set target FPS
   */
  setTargetFPS(fps: number): void {
    this.fpsManager.setTargetFPS(fps);
  }
}
