import { QuestionStep, AudioMetadata } from '../types/wizard';

/**
 * Generate interactive review questions based on prompt analysis
 */
export function generateReviewQuestions(promptText: string, detectedMetadata: any): QuestionStep[] {
  const questions: QuestionStep[] = [];

  // Question 1: Core Mechanics (Always ask if not clearly defined)
  if (!promptText.match(/control|mechanic|gameplay|play/i) || !detectedMetadata.mechanics?.length) {
    questions.push({
      id: 'core-mechanics',
      category: 'Core Mechanics',
      question: 'What are the primary game mechanics and controls?',
      description: 'Define how players interact with your game',
      type: 'multi-choice',
      options: [
        { label: 'Keyboard Navigation', value: 'keyboard', description: 'Arrow keys and letter commands' },
        { label: 'Mouse Controls', value: 'mouse', description: 'Point and click interface' },
        { label: 'Touch Gestures', value: 'touch', description: 'Tap, swipe, pinch controls' },
        { label: 'Custom Controls', value: 'custom', description: 'Define your own control scheme' }
      ],
      importance: 'critical',
      skip: false
    });
  }

  // Question 2: Difficulty and Progression
  if (!promptText.match(/difficult|easy|hard|progression|level/i)) {
    questions.push({
      id: 'difficulty-progression',
      category: 'Difficulty & Balance',
      question: 'How should difficulty progress and what balancing features should be included?',
      description: 'Set the challenge curve for your game',
      type: 'single-choice',
      options: [
        { label: 'Fixed Difficulty', value: 'fixed', description: 'Consistent challenge throughout' },
        { label: 'Progressive Difficulty', value: 'progressive', description: 'Gets harder as you advance' },
        { label: 'Adaptive Difficulty', value: 'adaptive', description: 'Adjusts based on player performance' },
        { label: 'Player-Selected Difficulty', value: 'selectable', description: 'Easy, Medium, Hard modes' }
      ],
      importance: 'high',
      skip: false
    });
  }

  // Question 3: Progression System
  if (!promptText.match(/level.?up|upgrade|unlock|progression|experience/i)) {
    questions.push({
      id: 'progression-system',
      category: 'Progression',
      question: 'What kind of character/game progression system should be included?',
      description: 'Define how players advance and improve',
      type: 'multi-choice',
      options: [
        { label: 'Level-Up System', value: 'leveling', description: 'Gain XP to increase stats' },
        { label: 'Unlockables', value: 'unlockables', description: 'Earn new items, abilities, or content' },
        { label: 'Skill Trees', value: 'skill-trees', description: 'Choose specialized upgrades' },
        { label: 'Equipment Upgrades', value: 'equipment', description: 'Find and improve gear' },
        { label: 'No Progression', value: 'none', description: 'Pure skill-based gameplay' }
      ],
      importance: 'high',
      skip: false
    });
  }

  // Question 4: Visual Style
  if (!promptText.match(/graphic|visual|art.?style|ascii|ansi|pixel/i)) {
    questions.push({
      id: 'visual-style',
      category: 'Visuals',
      question: 'What visual style should the game use?',
      description: 'Choose the graphical aesthetic',
      type: 'single-choice',
      options: [
        { label: 'ASCII Art', value: 'ascii', description: 'Classic text-based graphics' },
        { label: 'ANSI Color', value: 'ansi', description: 'Colorful terminal graphics' },
        { label: 'Pixel Art', value: 'pixel', description: 'Retro pixelated visuals' },
        { label: 'Text-Only', value: 'text', description: 'Pure text descriptions' }
      ],
      importance: 'medium',
      skip: false
    });
  }

  // Question 5: Audio and Feedback
  if (!promptText.match(/sound|music|audio|effect/i)) {
    questions.push({
      id: 'audio-feedback',
      category: 'Audio & Feedback',
      question: 'What audio and feedback elements should be included?',
      description: 'Enhance the player experience with sound',
      type: 'multi-choice',
      options: [
        { label: 'Background Music', value: 'music', description: 'Ambient soundtracks' },
        { label: 'Sound Effects', value: 'sfx', description: 'Action and event sounds' },
        { label: 'Text-to-Speech', value: 'tts', description: 'Narration and dialogue' },
        { label: 'ANSI Beeps', value: 'beeps', description: 'Terminal bell sounds' },
        { label: 'Silent Mode', value: 'none', description: 'No audio' }
      ],
      importance: 'medium',
      skip: false
    });
  }

  // Question 6: Game Length and Sessions
  if (!promptText.match(/length|session|duration|time/i)) {
    questions.push({
      id: 'game-length',
      category: 'Session Length',
      question: 'How long should a typical game session last?',
      description: 'Optimize for player time commitment',
      type: 'single-choice',
      options: [
        { label: 'Quick Sessions', value: 'quick', description: '5-10 minutes per session' },
        { label: 'Medium Sessions', value: 'medium', description: '15-30 minutes per session' },
        { label: 'Long Sessions', value: 'long', description: '30-60 minutes per session' },
        { label: 'Epic Sessions', value: 'epic', description: '60+ minutes per session' }
      ],
      importance: 'medium',
      skip: false
    });
  }

  // Question 7: Multiplayer Features
  if (!promptText.match(/multiplayer|co.?op|pvp|online|versus/i)) {
    questions.push({
      id: 'multiplayer',
      category: 'Multiplayer',
      question: 'Should the game include multiplayer features?',
      description: 'Allow players to compete or cooperate',
      type: 'single-choice',
      options: [
        { label: 'Single-Player Only', value: 'single', description: 'Solo experience' },
        { label: 'Leaderboards', value: 'leaderboards', description: 'Compare high scores' },
        { label: 'Turn-Based Multiplayer', value: 'turn-based-mp', description: 'Players take turns' },
        { label: 'Real-Time Co-op', value: 'coop', description: 'Work together in real-time' },
        { label: 'Competitive PvP', value: 'pvp', description: 'Player versus player battles' }
      ],
      importance: 'medium',
      skip: false
    });
  }

  // Question 8: Save System
  if (!promptText.match(/save|checkpoint|persist|continue/i)) {
    questions.push({
      id: 'save-system',
      category: 'Save System',
      question: 'How should player progress be saved?',
      description: 'Allow players to continue their journey',
      type: 'single-choice',
      options: [
        { label: 'Auto-Save', value: 'auto', description: 'Automatic progress saving' },
        { label: 'Checkpoints', value: 'checkpoints', description: 'Save at specific points' },
        { label: 'Manual Save', value: 'manual', description: 'Player chooses when to save' },
        { label: 'No Saves', value: 'none', description: 'Permadeath/single session' }
      ],
      importance: 'high',
      skip: false
    });
  }

  // Question 9: Narrative and Story
  if (!promptText.match(/story|narrative|plot|character|dialogue/i)) {
    questions.push({
      id: 'narrative',
      category: 'Narrative',
      question: 'How important is story and narrative?',
      description: 'Define the role of storytelling',
      type: 'single-choice',
      options: [
        { label: 'Story-Driven', value: 'story-driven', description: 'Deep narrative with dialogue trees' },
        { label: 'Light Story', value: 'light-story', description: 'Basic premise and context' },
        { label: 'Environmental Story', value: 'environmental', description: 'Story told through world design' },
        { label: 'No Story', value: 'none', description: 'Pure gameplay focus' }
      ],
      importance: 'medium',
      skip: false
    });
  }

  // Question 10: Accessibility Features
  questions.push({
    id: 'accessibility',
    category: 'Accessibility',
    question: 'What accessibility features should be included?',
    description: 'Make your game more inclusive',
    type: 'multi-choice',
    options: [
      { label: 'Colorblind Mode', value: 'colorblind', description: 'Alternative color palettes' },
      { label: 'Adjustable Speed', value: 'speed', description: 'Slow down game pace' },
      { label: 'Text Size Options', value: 'text-size', description: 'Larger/smaller text' },
      { label: 'Skip Tutorials', value: 'skip-tutorial', description: 'Optional tutorial sections' },
      { label: 'Simplified Controls', value: 'simple-controls', description: 'Reduced input complexity' }
    ],
    importance: 'low',
    skip: true
  });

  // Question 11: Replayability
  if (!promptText.match(/replay|procedural|random|different/i)) {
    questions.push({
      id: 'replayability',
      category: 'Replayability',
      question: 'What features should encourage replaying the game?',
      description: 'Keep players coming back',
      type: 'multi-choice',
      options: [
        { label: 'Procedural Generation', value: 'procedural', description: 'Random levels each playthrough' },
        { label: 'Multiple Endings', value: 'endings', description: 'Different story outcomes' },
        { label: 'New Game+', value: 'new-game-plus', description: 'Replay with bonuses' },
        { label: 'Challenge Modes', value: 'challenges', description: 'Special difficulty modes' },
        { label: 'Achievements', value: 'achievements', description: 'Goals to complete' }
      ],
      importance: 'medium',
      skip: true
    });
  }

  // Question 12: Economy and Resources
  if (promptText.match(/rpg|economy|shop|gold|money|resource/i)) {
    questions.push({
      id: 'economy',
      category: 'Economy',
      question: 'Should the game include an economy or resource management system?',
      description: 'Add trading, shopping, or resource gathering',
      type: 'multi-choice',
      options: [
        { label: 'Currency System', value: 'currency', description: 'Earn and spend money' },
        { label: 'Resource Gathering', value: 'resources', description: 'Collect materials' },
        { label: 'Trading System', value: 'trading', description: 'Buy and sell items' },
        { label: 'Crafting', value: 'crafting', description: 'Create items from materials' },
        { label: 'No Economy', value: 'none', description: 'Simple item pickup' }
      ],
      importance: 'medium',
      skip: true
    });
  }

  return questions;
}

/**
 * Default questions when no prompt analysis is available
 */
export const defaultQuestions: QuestionStep[] = [
  {
    id: 'game-genre',
    category: 'Core Concept',
    question: 'What genre best describes your game?',
    description: 'Choose the primary game type',
    type: 'single-choice',
    options: [
      { label: 'RPG', value: 'rpg' },
      { label: 'Action', value: 'action' },
      { label: 'Puzzle', value: 'puzzle' },
      { label: 'Strategy', value: 'strategy' },
      { label: 'Adventure', value: 'adventure' },
      { label: 'Card Game', value: 'card-game' },
      { label: 'Simulation', value: 'simulation' }
    ],
    importance: 'critical',
    skip: false
  },
  {
    id: 'target-platform',
    category: 'Platform',
    question: 'Where should your game run?',
    description: 'Select target platforms',
    type: 'multi-choice',
    options: [
      { label: 'Web Browser', value: 'web', description: 'Run in any modern browser' },
      { label: 'Terminal/BBS', value: 'terminal', description: 'Classic BBS door experience' },
      { label: 'Mobile', value: 'mobile', description: 'Touch-optimized for phones/tablets' }
    ],
    importance: 'critical',
    skip: false
  }
];

/**
 * Generate audio-specific review questions based on audio description analysis
 */
export function generateAudioReviewQuestions(audioText: string, detectedMetadata: AudioMetadata): QuestionStep[] {
  const questions: QuestionStep[] = [];

  // Question 1: Music Style and Mood (Always ask if not clearly defined)
  if (!audioText.match(/orchestral|electronic|jazz|chiptune|ambient/i) || !detectedMetadata.musicStyle?.length) {
    questions.push({
      id: 'music-style',
      category: 'Music Style',
      question: 'What music style and mood should your game have?',
      description: 'Define the primary musical genre and emotional atmosphere',
      type: 'multi-choice',
      options: [
        { label: 'Orchestral', value: 'orchestral', description: 'Classical orchestra with strings, brass, woodwinds' },
        { label: 'Electronic', value: 'electronic', description: 'Synths, EDM, techno, house music' },
        { label: 'Chiptune/8-Bit', value: 'chiptune', description: 'Retro game sounds from NES/Gameboy era' },
        { label: 'Ambient', value: 'ambient', description: 'Atmospheric drones and textures' },
        { label: 'Jazz/Fusion', value: 'jazz', description: 'Piano, saxophone, swing rhythms' },
        { label: 'Rock/Metal', value: 'rock', description: 'Guitars, drums, energetic' }
      ],
      importance: 'critical',
      skip: false
    });
  }

  // Question 2: Sound Effects Categories
  if (!audioText.match(/sfx|sound effect|ui|combat|environment/i)) {
    questions.push({
      id: 'sound-effects',
      category: 'Sound Effects',
      question: 'What types of sound effects should be included?',
      description: 'Select all SFX categories relevant to your game',
      type: 'multi-choice',
      options: [
        { label: 'UI/Menu Sounds', value: 'ui-sounds', description: 'Clicks, beeps, navigation sounds' },
        { label: 'Combat Impacts', value: 'combat-impacts', description: 'Hits, explosions, weapon sounds' },
        { label: 'Environmental Noises', value: 'environmental', description: 'Wind, water, ambient nature sounds' },
        { label: 'Movement Sounds', value: 'movement', description: 'Footsteps, jumps, vehicle sounds' },
        { label: 'Voice Acting', value: 'voice-acting', description: 'Dialogue, narration, character voices' }
      ],
      importance: 'high',
      skip: false
    });
  }

  // Question 3: Mood Progression
  if (!audioText.match(/mood|progression|emotion|shift|evolve/i)) {
    questions.push({
      id: 'mood-progression',
      category: 'Mood Evolution',
      question: 'How should the audio mood evolve during gameplay?',
      description: 'Define how music and sound create emotional journeys',
      type: 'single-choice',
      options: [
        { label: 'Calm to Intense', value: 'calm-to-intense', description: 'Build tension gradually' },
        { label: 'Intense to Triumphant', value: 'intense-to-triumphant', description: 'Epic battle to victory' },
        { label: 'Dynamic Shifts', value: 'dynamic-shifts', description: 'Adapt to player actions and game states' },
        { label: 'Consistent Atmosphere', value: 'consistent', description: 'Maintain steady mood throughout' }
      ],
      importance: 'high',
      skip: false
    });
  }

  // Question 4: Gameplay Integration
  if (!audioText.match(/dynamic|adaptive|responsive|integration|layer/i)) {
    questions.push({
      id: 'audio-integration',
      category: 'Gameplay Integration',
      question: 'How should audio respond to gameplay events?',
      description: 'Define dynamic audio behavior',
      type: 'multi-choice',
      options: [
        { label: 'Dynamic Music Changes', value: 'dynamic-music', description: 'Music adapts to game state (combat, exploration, etc.)' },
        { label: 'Layered Tracks', value: 'layered-tracks', description: 'Add/remove layers based on intensity' },
        { label: 'Contextual SFX Variations', value: 'contextual-sfx', description: 'SFX vary by player actions' },
        { label: 'Spatial Audio', value: 'spatial-audio', description: '3D positioning for immersive sound' }
      ],
      importance: 'high',
      skip: false
    });
  }

  // Question 5: Technical Requirements
  questions.push({
    id: 'technical-requirements',
    category: 'Technical Specifications',
    question: 'What technical constraints and optimizations are needed?',
    description: 'Consider platform limitations and performance',
    type: 'multi-choice',
    options: [
      { label: 'Optimize for Mobile', value: 'optimize-mobile', description: 'Small file sizes, low latency' },
      { label: 'Loopable Tracks', value: 'loopable', description: 'Seamless music loops without gaps' },
      { label: 'Small File Sizes', value: 'small-files', description: 'Under 5MB per track for web' },
      { label: 'Adaptive Streaming', value: 'adaptive-streaming', description: 'Variable quality based on connection' },
      { label: 'Procedural Generation', value: 'procedural', description: 'Generate audio in real-time' }
    ],
    importance: 'medium',
    skip: true
  });

  // Question 6: Accessibility Features
  questions.push({
    id: 'audio-accessibility',
    category: 'Accessibility',
    question: 'What accessibility features should the audio system include?',
    description: 'Make your game audio inclusive for all players',
    type: 'multi-choice',
    options: [
      { label: 'Volume Controls', value: 'volume-controls', description: 'Separate sliders for music, SFX, voice' },
      { label: 'Subtitles/Captions', value: 'subtitles', description: 'Text for all audio content' },
      { label: 'Visual Audio Cues', value: 'visual-cues', description: 'Visual indicators for audio events' },
      { label: 'Mute Option', value: 'mute', description: 'Complete audio disable option' },
      { label: 'Audio-Only Mode', value: 'audio-only', description: 'Playable without visual elements' }
    ],
    importance: 'medium',
    skip: true
  });

  // Question 7: Audio Length and Format
  if (!audioText.match(/length|duration|loop|short|long/i)) {
    questions.push({
      id: 'audio-length',
      category: 'Track Length',
      question: 'What should be the typical length of music tracks?',
      description: 'Balance between variety and file size',
      type: 'single-choice',
      options: [
        { label: 'Short Loops (30-90 seconds)', value: 'short', description: 'Minimal file size, quick loops' },
        { label: 'Medium Tracks (2-4 minutes)', value: 'medium', description: 'Balanced approach with variety' },
        { label: 'Long Tracks (5+ minutes)', value: 'long', description: 'Extended listening without repetition' },
        { label: 'Generative/Endless', value: 'generative', description: 'Procedurally generated music' }
      ],
      importance: 'medium',
      skip: true
    });
  }

  // Question 8: Licensing and Budget
  if (!audioText.match(/license|licensing|royalty|custom|budget/i)) {
    questions.push({
      id: 'licensing',
      category: 'Licensing',
      question: 'What is your approach to music licensing?',
      description: 'Consider budget and legal requirements',
      type: 'single-choice',
      options: [
        { label: 'Royalty-Free', value: 'royalty-free', description: 'Use stock music libraries' },
        { label: 'Custom Composition', value: 'custom', description: 'Commission original music' },
        { label: 'Creative Commons', value: 'cc', description: 'Use CC-licensed music' },
        { label: 'Mixed Approach', value: 'mixed', description: 'Combination of sources' }
      ],
      importance: 'low',
      skip: true
    });
  }

  // Question 9: Voice Acting
  if (audioText.match(/voice|dialogue|narration|speaking/i)) {
    questions.push({
      id: 'voice-acting',
      category: 'Voice Acting',
      question: 'How should voice acting be implemented?',
      description: 'Define dialogue and narration approach',
      type: 'single-choice',
      options: [
        { label: 'Full Voice Acting', value: 'full-va', description: 'All dialogue fully voiced' },
        { label: 'Partial Voice Acting', value: 'partial-va', description: 'Key moments and characters only' },
        { label: 'Vocal Sounds Only', value: 'vocal-sounds', description: 'Grunts, exclamations, no words' },
        { label: 'Text-Only', value: 'text-only', description: 'No voice, just text dialogue' }
      ],
      importance: 'medium',
      skip: true
    });
  }

  // Question 10: Audio Customization
  questions.push({
    id: 'audio-customization',
    category: 'Player Customization',
    question: 'Should players be able to customize audio settings?',
    description: 'Allow players to personalize their audio experience',
    type: 'multi-choice',
    options: [
      { label: 'Volume Balance Sliders', value: 'volume-sliders', description: 'Adjust music/SFX/voice independently' },
      { label: 'Tempo Adjustment', value: 'tempo', description: 'Speed up or slow down music' },
      { label: 'Audio Presets', value: 'presets', description: 'Pre-configured sound profiles' },
      { label: 'Custom Soundtracks', value: 'custom-soundtracks', description: 'Players can use own music' },
      { label: 'EQ Controls', value: 'eq', description: 'Equalizer for audio fine-tuning' }
    ],
    importance: 'low',
    skip: true
  });

  return questions;
}

/**
 * Default audio questions when no description is available
 */
export const defaultAudioQuestions: QuestionStep[] = [
  {
    id: 'audio-presence',
    category: 'Audio Basics',
    question: 'Should your game include audio?',
    description: 'Decide if you want music and sound effects',
    type: 'single-choice',
    options: [
      { label: 'Yes, with Music and SFX', value: 'full-audio' },
      { label: 'Music Only', value: 'music-only' },
      { label: 'SFX Only', value: 'sfx-only' },
      { label: 'Silent Game', value: 'silent' }
    ],
    importance: 'critical',
    skip: false
  },
  {
    id: 'audio-style-default',
    category: 'Audio Style',
    question: 'What general audio style fits your game?',
    description: 'Choose the overall audio aesthetic',
    type: 'single-choice',
    options: [
      { label: 'Retro/Chiptune', value: 'retro' },
      { label: 'Modern/Electronic', value: 'modern' },
      { label: 'Orchestral/Epic', value: 'orchestral' },
      { label: 'Ambient/Minimal', value: 'ambient' }
    ],
    importance: 'critical',
    skip: false
  }
];
