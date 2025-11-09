import { QuestionStep } from '../types/wizard';

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
