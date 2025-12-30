/**
 * Block Animation Controller
 *
 * Handles frame timing, playback control, and animation state
 * for block sprites.
 */

import {
  BlockSprite,
  BlockFrame,
  BlockAnimation,
  AnimationState,
} from './types';

/**
 * Default frame duration in milliseconds
 */
export const DEFAULT_FRAME_DURATION = 100;

/**
 * Update sprite animation state
 *
 * @param sprite - Sprite to update
 * @param deltaTime - Time elapsed in milliseconds
 * @returns True if frame changed
 */
export function updateAnimation(sprite: BlockSprite, deltaTime: number): boolean {
  if (!sprite.playing || !sprite.visible) {
    return false;
  }

  const frames = getCurrentFrames(sprite);
  if (frames.length === 0) {
    return false;
  }

  // Apply speed multiplier
  const adjustedDelta = deltaTime * sprite.speed;
  sprite.frameTime += adjustedDelta;

  // Get current frame duration
  const currentFrame = frames[sprite.currentFrame];
  const duration = currentFrame?.duration ?? DEFAULT_FRAME_DURATION;

  // Check if we should advance frame
  if (sprite.frameTime >= duration) {
    sprite.frameTime -= duration;
    const oldFrame = sprite.currentFrame;

    // Advance to next frame
    sprite.currentFrame++;

    // Handle end of animation
    if (sprite.currentFrame >= frames.length) {
      if (sprite.loop) {
        sprite.currentFrame = 0;
      } else {
        sprite.currentFrame = frames.length - 1;
        sprite.playing = false;
        sprite.onComplete?.();
      }
    }

    return sprite.currentFrame !== oldFrame;
  }

  return false;
}

/**
 * Get the current animation's frames
 */
export function getCurrentFrames(sprite: BlockSprite): BlockFrame[] {
  if (sprite.currentAnimation && sprite.animations[sprite.currentAnimation]) {
    return sprite.animations[sprite.currentAnimation].frames;
  }
  return sprite.frames;
}

/**
 * Get the current frame being displayed
 */
export function getCurrentFrame(sprite: BlockSprite): BlockFrame | null {
  const frames = getCurrentFrames(sprite);
  if (frames.length === 0) return null;

  const frameIndex = Math.min(sprite.currentFrame, frames.length - 1);
  return frames[frameIndex] || null;
}

/**
 * Play a named animation on a sprite
 *
 * @param sprite - Sprite to animate
 * @param animationName - Name of animation to play (null to use default frames)
 * @param restart - If true, restart even if already playing this animation
 */
export function playAnimation(
  sprite: BlockSprite,
  animationName: string | null,
  restart: boolean = false
): void {
  // Check if we're already playing this animation
  if (!restart && sprite.currentAnimation === animationName && sprite.playing) {
    return;
  }

  sprite.currentAnimation = animationName;
  sprite.currentFrame = 0;
  sprite.frameTime = 0;
  sprite.playing = true;

  // Apply animation-specific settings if available
  if (animationName && sprite.animations[animationName]) {
    const anim = sprite.animations[animationName];
    if (anim.loop !== undefined) {
      sprite.loop = anim.loop;
    }
    if (anim.speed !== undefined) {
      sprite.speed = anim.speed;
    }
  }
}

/**
 * Stop animation playback
 */
export function stopAnimation(sprite: BlockSprite): void {
  sprite.playing = false;
}

/**
 * Pause animation playback (keeps current frame)
 */
export function pauseAnimation(sprite: BlockSprite): void {
  sprite.playing = false;
}

/**
 * Resume animation playback
 */
export function resumeAnimation(sprite: BlockSprite): void {
  sprite.playing = true;
}

/**
 * Set the current frame directly
 *
 * @param sprite - Sprite to modify
 * @param frame - Frame index to set
 */
export function setFrame(sprite: BlockSprite, frame: number): void {
  const frames = getCurrentFrames(sprite);
  sprite.currentFrame = Math.max(0, Math.min(frame, frames.length - 1));
  sprite.frameTime = 0;
}

/**
 * Get animation state snapshot
 */
export function getAnimationState(sprite: BlockSprite): AnimationState {
  const frames = getCurrentFrames(sprite);
  return {
    animation: sprite.currentAnimation,
    frame: sprite.currentFrame,
    time: sprite.frameTime,
    playing: sprite.playing,
    completed: !sprite.loop && sprite.currentFrame >= frames.length - 1 && !sprite.playing,
  };
}

/**
 * Restore animation state from snapshot
 */
export function setAnimationState(sprite: BlockSprite, state: AnimationState): void {
  sprite.currentAnimation = state.animation;
  sprite.currentFrame = state.frame;
  sprite.frameTime = state.time;
  sprite.playing = state.playing;
}

/**
 * Get total animation duration in milliseconds
 */
export function getAnimationDuration(sprite: BlockSprite): number {
  const frames = getCurrentFrames(sprite);
  return frames.reduce((total, frame) => {
    return total + (frame.duration ?? DEFAULT_FRAME_DURATION);
  }, 0);
}

/**
 * Get current playback progress (0.0 - 1.0)
 */
export function getAnimationProgress(sprite: BlockSprite): number {
  const frames = getCurrentFrames(sprite);
  if (frames.length === 0) return 0;

  const totalDuration = getAnimationDuration(sprite);
  if (totalDuration === 0) return 0;

  let elapsed = sprite.frameTime;
  for (let i = 0; i < sprite.currentFrame; i++) {
    elapsed += frames[i]?.duration ?? DEFAULT_FRAME_DURATION;
  }

  return Math.min(1, elapsed / totalDuration);
}

/**
 * Create a simple animation from frame indices
 */
export function createAnimation(
  name: string,
  frames: BlockFrame[],
  options: {
    loop?: boolean;
    speed?: number;
    duration?: number;
  } = {}
): BlockAnimation {
  // Apply default duration to frames if specified
  if (options.duration !== undefined) {
    frames = frames.map(f => ({
      ...f,
      duration: options.duration,
    }));
  }

  return {
    name,
    frames,
    loop: options.loop ?? true,
    speed: options.speed ?? 1,
  };
}

/**
 * Create a ping-pong animation (plays forward then backward)
 */
export function createPingPongAnimation(
  name: string,
  frames: BlockFrame[],
  options: {
    loop?: boolean;
    speed?: number;
    duration?: number;
  } = {}
): BlockAnimation {
  // Create reverse frames (excluding first and last to avoid duplicate)
  const reverseFrames = frames.length > 2
    ? frames.slice(1, -1).reverse()
    : [];

  return createAnimation(name, [...frames, ...reverseFrames], options);
}
