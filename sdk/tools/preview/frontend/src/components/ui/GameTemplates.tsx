import React from 'react';
import { Gamepad2, Sword, Puzzle, Brain, Trophy, Zap, Heart, Dice6 } from 'lucide-react';

export interface GameTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  features: string[];
  icon: React.ReactNode;
  preview: string;
  tags: string[];
  prompt: string; // Detailed prompt for AI generation
}

export const gameTemplates: GameTemplate[] = [
  {
    id: 'dungeon-crawler',
    name: 'Dungeon Crawler',
    description: 'Navigate procedural dungeons, fight monsters, collect loot',
    category: 'RPG',
    difficulty: 'intermediate',
    estimatedTime: '4-5 min',
    features: ['Procedural generation', 'Turn-based combat', 'Loot system', 'Character stats'],
    icon: <Sword className="w-6 h-6" />,
    preview: '⚔️ 🗡️ 🛡️',
    tags: ['RPG', 'Roguelike', 'Procedural'],
    prompt: `Create a dungeon crawler game where the player explores procedurally generated dungeons.
Features:
- Grid-based movement (WASD/arrow keys)
- Turn-based combat with monsters
- Health, attack, and defense stats
- Loot drops (weapons, armor, potions)
- Multiple dungeon levels with increasing difficulty
- FOV (field of view) system
- Inventory management
- Character progression (leveling up)
Include ASCII art for dungeon tiles, monsters, and items. Make it retro and fun!`
  },
  {
    id: 'blackjack',
    name: 'Blackjack Casino',
    description: 'Classic card game with betting and strategy',
    category: 'Card Game',
    difficulty: 'beginner',
    estimatedTime: '2-3 min',
    features: ['Card dealing', 'Betting system', 'Hit/Stand/Double', 'Score tracking'],
    icon: <Trophy className="w-6 h-6" />,
    preview: '🃏 💰 🎰',
    tags: ['Casino', 'Cards', 'Strategy'],
    prompt: `Create a Blackjack card game with full casino rules.
Features:
- Standard 52-card deck
- Dealer AI that follows casino rules
- Player actions: Hit, Stand, Double Down, Split
- Betting system with chips
- Track wins/losses and bankroll
- Multiple rounds
- Display cards with ASCII art
- Show hand values
- Blackjack detection (21 on first two cards)
Make it feel like a real casino experience!`
  },
  {
    id: 'word-puzzle',
    name: 'Word Scramble Master',
    description: 'Unscramble words against the clock',
    category: 'Puzzle',
    difficulty: 'beginner',
    estimatedTime: '2 min',
    features: ['Word scrambling', 'Timer', 'Hints', 'Score system'],
    icon: <Brain className="w-6 h-6" />,
    preview: '📝 ⏱️ 🧩',
    tags: ['Puzzle', 'Words', 'Timed'],
    prompt: `Create a word scramble puzzle game.
Features:
- Dictionary of 100+ words (various difficulties)
- Scramble letters randomly
- Timer countdown (60 seconds per word)
- Hint system (show one letter)
- Score based on speed and difficulty
- Multiple difficulty levels
- Track best scores
- Categories (animals, food, tech, etc.)
- Skip option
- Visual feedback for correct/wrong answers
Make it engaging and educational!`
  },
  {
    id: 'snake-game',
    name: 'Classic Snake',
    description: 'The timeless snake game with power-ups',
    category: 'Arcade',
    difficulty: 'beginner',
    estimatedTime: '2 min',
    features: ['Grid movement', 'Food collection', 'Power-ups', 'High scores'],
    icon: <Gamepad2 className="w-6 h-6" />,
    preview: '🐍 🍎 ⚡',
    tags: ['Arcade', 'Classic', 'Retro'],
    prompt: `Create a classic Snake game with modern twists.
Features:
- Grid-based movement (arrow keys)
- Snake grows when eating food
- Multiple food types (normal, speed boost, slow down)
- Power-ups (invincibility, double points)
- Walls cause game over
- Self-collision detection
- Increasing speed as snake grows
- High score tracking
- Visual feedback (colors for different foods)
- Pause functionality
Use ASCII art for snake, food, and walls!`
  },
  {
    id: 'trivia-expert',
    name: 'Trivia Master',
    description: 'Test knowledge across multiple categories',
    category: 'Trivia',
    difficulty: 'beginner',
    estimatedTime: '3 min',
    features: ['Multiple categories', 'Difficulty levels', 'Timer', 'Leaderboard'],
    icon: <Brain className="w-6 h-6" />,
    preview: '❓ 🏆 📊',
    tags: ['Trivia', 'Education', 'Multiplayer-ready'],
    prompt: `Create a trivia quiz game with multiple categories.
Features:
- 5+ categories (Science, History, Sports, Movies, Geography)
- 100+ questions with varying difficulty
- Multiple choice answers (4 options)
- Timer per question (15 seconds)
- Score tracking with bonuses for speed
- Lifelines: 50/50, skip question
- Visual feedback for correct/wrong answers
- Progress bar showing question number
- Final score with rank (Beginner, Expert, Master)
- Category selection at start
Make questions interesting and fun!`
  },
  {
    id: 'space-invaders',
    name: 'Space Invaders Clone',
    description: 'Defend Earth from alien invaders',
    category: 'Arcade',
    difficulty: 'intermediate',
    estimatedTime: '3-4 min',
    features: ['Real-time gameplay', 'Enemy waves', 'Power-ups', 'Boss fights'],
    icon: <Zap className="w-6 h-6" />,
    preview: '👾 🚀 💥',
    tags: ['Arcade', 'Shooter', 'Classic'],
    prompt: `Create a Space Invaders style shooter game.
Features:
- Player ship at bottom (move left/right, shoot)
- Waves of enemies descending
- Enemies shoot back
- Cover/shields that degrade
- Power-ups (rapid fire, shield, extra life)
- Score multipliers for combos
- Boss at end of each wave
- Lives system
- Increasing difficulty
- Visual effects for explosions
Use ASCII art for ships, aliens, and bullets!`
  },
  {
    id: 'text-adventure',
    name: 'Mystery Mansion',
    description: 'Interactive fiction with branching story',
    category: 'Adventure',
    difficulty: 'intermediate',
    estimatedTime: '4 min',
    features: ['Branching narrative', 'Inventory', 'Puzzles', 'Multiple endings'],
    icon: <Heart className="w-6 h-6" />,
    preview: '🏚️ 🔍 📜',
    tags: ['Adventure', 'Story', 'Puzzle'],
    prompt: `Create an interactive text adventure set in a mysterious mansion.
Features:
- Rich narrative with multiple rooms
- Object examination system
- Inventory management
- Puzzles requiring item combinations
- NPC interactions
- Multiple story branches
- 3+ different endings
- Save/load progress
- Map system
- Atmospheric descriptions
- Clue system
Make the story engaging and mysterious!`
  },
  {
    id: 'dice-poker',
    name: 'Dice Poker',
    description: 'Yahtzee-style dice game with strategy',
    category: 'Dice Game',
    difficulty: 'beginner',
    estimatedTime: '2 min',
    features: ['Dice rolling', 'Scoring combos', 'Strategic choices', 'High scores'],
    icon: <Dice6 className="w-6 h-6" />,
    preview: '🎲 🎲 🎲',
    tags: ['Dice', 'Strategy', 'Casual'],
    prompt: `Create a Yahtzee/Poker dice game.
Features:
- Roll 5 dice
- 3 rolls per turn
- Hold/release dice between rolls
- Score categories (pairs, three of a kind, full house, straight, five of a kind)
- 13 rounds per game
- Strategic decision making
- Visual dice display with ASCII art
- Score card showing available categories
- Bonus for high scores
- AI opponent option
Make it fun and strategic!`
  },
  {
    id: 'tower-defense',
    name: 'Tower Defense',
    description: 'Strategic tower placement to stop enemies',
    category: 'Strategy',
    difficulty: 'advanced',
    estimatedTime: '5-6 min',
    features: ['Tower placement', 'Enemy waves', 'Upgrades', 'Resource management'],
    icon: <Trophy className="w-6 h-6" />,
    preview: '🏰 👾 💰',
    tags: ['Strategy', 'Real-time', 'Defense'],
    prompt: `Create a tower defense game with strategic depth.
Features:
- Grid-based map with path
- Multiple tower types (archer, mage, cannon)
- Enemy waves with different types
- Tower upgrades (range, damage, speed)
- Resource management (gold earned from kills)
- Lives system
- Fast forward option
- Tower selling
- Special abilities
- Boss waves
- Multiple difficulty levels
Use ASCII art for towers and enemies!`
  },
  {
    id: 'memory-match',
    name: 'Memory Master',
    description: 'Match pairs of cards to win',
    category: 'Puzzle',
    difficulty: 'beginner',
    estimatedTime: '2 min',
    features: ['Card matching', 'Timer', 'Difficulty levels', 'Score system'],
    icon: <Puzzle className="w-6 h-6" />,
    preview: '🃏 🧠 ⏱️',
    tags: ['Puzzle', 'Memory', 'Casual'],
    prompt: `Create a memory matching card game.
Features:
- Grid of face-down cards (4x4, 6x6, 8x8)
- Click to reveal cards
- Match pairs of identical cards
- Timer counting up
- Move counter
- Visual card designs with ASCII art
- Difficulty levels (more cards = harder)
- Best time tracking
- Smooth card flip animation
- Win celebration
- Categories (emojis, numbers, letters)
Make it visually appealing and challenging!`
  },
];

export default gameTemplates;
