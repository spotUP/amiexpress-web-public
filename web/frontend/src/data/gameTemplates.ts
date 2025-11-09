import { GameTemplate } from '../types/wizard';

/**
 * Pre-built game templates for common genres
 */
export const gameTemplates: GameTemplate[] = [
  {
    id: 'roguelike-dungeon',
    name: 'Roguelike Dungeon Crawler',
    category: 'RPG',
    description: 'Classic dungeon crawler with procedural generation and permadeath',
    examplePrompt: 'Create a roguelike dungeon crawler where players explore procedurally generated dungeons filled with monsters, traps, and treasure. The game features turn-based combat, a variety of character classes (warrior, mage, rogue), and permanent death. Players can find and equip weapons, armor, and magical items. Each dungeon level gets progressively harder with stronger enemies and better loot. The game uses ASCII/ANSI graphics in classic retro style.',
    tags: ['rpg', 'roguelike', 'dungeon', 'procedural', 'turn-based'],
    metadata: {
      genre: 'RPG',
      targetPlatform: ['web', 'terminal'],
      artStyle: 'ascii-art',
      difficulty: 'medium-hard',
      gameLength: '30-60-minutes',
      multiplayer: false,
      controls: ['keyboard'],
      themes: ['fantasy', 'dungeon-crawling'],
      mechanics: ['turn-based-combat', 'procedural-generation', 'permadeath', 'inventory-management']
    }
  },
  {
    id: 'space-shooter',
    name: 'Space Shooter',
    category: 'Action',
    description: 'Fast-paced space shooter with upgradeable ships and boss battles',
    examplePrompt: 'Design a space shooter where players pilot customizable spacecraft through asteroid fields and enemy formations. The game features smooth scrolling action, multiple weapon types (lasers, missiles, plasma cannons), and power-ups. Players face waves of alien invaders with varied attack patterns, culminating in epic boss battles. Include a ship upgrade system for weapons, shields, and engines. The game uses colorful ANSI graphics with smooth animations.',
    tags: ['action', 'shooter', 'space', 'arcade'],
    metadata: {
      genre: 'Action',
      targetPlatform: ['web', 'terminal'],
      artStyle: 'ansi-color',
      difficulty: 'easy-medium',
      gameLength: '15-30-minutes',
      multiplayer: false,
      controls: ['keyboard', 'arrow-keys'],
      themes: ['sci-fi', 'space'],
      mechanics: ['real-time-action', 'upgrades', 'boss-battles', 'power-ups']
    }
  },
  {
    id: 'puzzle-adventure',
    name: 'Puzzle Adventure',
    category: 'Puzzle',
    description: 'Story-driven puzzle game with exploration and item collection',
    examplePrompt: 'Create a puzzle adventure game where players solve environmental puzzles to progress through a mysterious world. The game combines exploration, item collection, and logic puzzles. Players must find and combine items, decipher clues, and unlock new areas. Features a compelling narrative told through environmental storytelling and character interactions. Includes multiple puzzle types: logic gates, pattern matching, inventory puzzles, and environmental manipulation. Uses detailed ASCII art for scenes and characters.',
    tags: ['puzzle', 'adventure', 'story', 'exploration'],
    metadata: {
      genre: 'Puzzle',
      targetPlatform: ['web', 'terminal'],
      artStyle: 'ascii-art',
      difficulty: 'medium',
      gameLength: '60-90-minutes',
      multiplayer: false,
      controls: ['keyboard', 'mouse'],
      themes: ['mystery', 'adventure'],
      mechanics: ['puzzle-solving', 'inventory', 'exploration', 'story-progression']
    }
  },
  {
    id: 'racing-simulator',
    name: 'Racing Simulator',
    category: 'Racing',
    description: 'Competitive racing game with multiple tracks and vehicle customization',
    examplePrompt: 'Build a racing simulator where players compete on various tracks with customizable vehicles. The game features realistic(ish) physics for retro-style racing, including drifting, acceleration, and collision mechanics. Players can upgrade their vehicles with better engines, tires, and handling. Includes multiple race modes: time trial, head-to-head, and tournament. Tracks vary in difficulty with obstacles, shortcuts, and environmental hazards. Uses dynamic ANSI graphics to show the track, position indicators, and speed.',
    tags: ['racing', 'competitive', 'vehicles', 'arcade'],
    metadata: {
      genre: 'Racing',
      targetPlatform: ['web', 'terminal'],
      artStyle: 'ansi-color',
      difficulty: 'easy',
      gameLength: '10-20-minutes',
      multiplayer: true,
      controls: ['keyboard', 'arrow-keys'],
      themes: ['racing', 'competition'],
      mechanics: ['racing', 'vehicle-customization', 'time-trials', 'leaderboards']
    }
  },
  {
    id: 'card-battler',
    name: 'Card Battler',
    category: 'Card Game',
    description: 'Strategic card game with deck building and tactical combat',
    examplePrompt: 'Design a card battler where players build decks and engage in strategic turn-based battles. The game features card collection, deck building, and tactical combat against AI opponents. Cards include creatures, spells, and equipment with various effects and synergies. Players start with a basic deck and earn new cards through victories. Combat involves resource management (mana), card draw mechanics, and strategic play order. Includes multiple factions with unique playstyles and a campaign mode with escalating difficulty.',
    tags: ['card-game', 'strategy', 'deck-building', 'turn-based'],
    metadata: {
      genre: 'Card Game',
      targetPlatform: ['web', 'terminal'],
      artStyle: 'ascii-art',
      difficulty: 'medium',
      gameLength: '20-40-minutes',
      multiplayer: true,
      controls: ['keyboard', 'mouse'],
      themes: ['fantasy', 'strategy'],
      mechanics: ['deck-building', 'turn-based', 'resource-management', 'card-collection']
    }
  },
  {
    id: 'text-rpg',
    name: 'Text-Based RPG',
    category: 'RPG',
    description: 'Narrative-focused RPG with branching storylines and character progression',
    examplePrompt: 'Create a text-based RPG with deep narrative choices and character development. Players embark on an epic quest with branching storylines based on their decisions. The game features a robust character creation system with multiple classes, skills, and attributes. Combat is menu-driven with strategic options. Players interact with NPCs, complete quests, and make moral choices that affect the story outcome. Includes inventory management, equipment, and a progression system with leveling and skill trees.',
    tags: ['rpg', 'text-adventure', 'story', 'character-progression'],
    metadata: {
      genre: 'RPG',
      targetPlatform: ['terminal', 'web'],
      artStyle: 'text-only',
      difficulty: 'easy-medium',
      gameLength: '90-120-minutes',
      multiplayer: false,
      controls: ['keyboard'],
      themes: ['fantasy', 'adventure', 'story'],
      mechanics: ['dialogue-trees', 'character-progression', 'branching-story', 'inventory']
    }
  },
  {
    id: 'strategy-tactics',
    name: 'Tactical Strategy',
    category: 'Strategy',
    description: 'Turn-based tactical combat with unit management and strategic positioning',
    examplePrompt: 'Build a tactical strategy game where players command units on a grid-based battlefield. The game features turn-based combat with unit positioning, terrain effects, and strategic resource management. Players control squads of units with different classes (infantry, ranged, cavalry, special units), each with unique abilities. Terrain affects movement and combat (high ground advantage, cover, obstacles). Includes a campaign with escalating challenges and skirmish mode. Victory requires careful planning, unit composition, and tactical execution.',
    tags: ['strategy', 'tactics', 'turn-based', 'grid-based'],
    metadata: {
      genre: 'Strategy',
      targetPlatform: ['web', 'terminal'],
      artStyle: 'ascii-art',
      difficulty: 'hard',
      gameLength: '45-90-minutes',
      multiplayer: true,
      controls: ['keyboard', 'mouse'],
      themes: ['military', 'strategy'],
      mechanics: ['turn-based', 'unit-management', 'tactical-positioning', 'terrain-effects']
    }
  },
  {
    id: 'platformer',
    name: 'Platform Adventure',
    category: 'Platformer',
    description: 'Side-scrolling platformer with precise jumping and collectibles',
    examplePrompt: 'Create a platformer where players navigate through side-scrolling levels filled with obstacles, enemies, and collectibles. The game features precise jumping mechanics, moving platforms, and environmental hazards. Players can run, jump, and perform special moves (double jump, wall climb). Levels include hidden areas with bonus collectibles. Enemy AI includes patrolling guards, flying creatures, and stationary turrets. Checkpoints allow progress saving. Uses dynamic ANSI graphics with character animations and scrolling environments.',
    tags: ['platformer', 'action', 'jumping', 'collectibles'],
    metadata: {
      genre: 'Platformer',
      targetPlatform: ['web'],
      artStyle: 'ansi-color',
      difficulty: 'medium',
      gameLength: '30-60-minutes',
      multiplayer: false,
      controls: ['keyboard', 'arrow-keys'],
      themes: ['adventure', 'exploration'],
      mechanics: ['jumping', 'collectibles', 'checkpoints', 'enemy-ai']
    }
  },
  {
    id: 'mystery-detective',
    name: 'Detective Mystery',
    category: 'Adventure',
    description: 'Investigation game with clue gathering and deduction mechanics',
    examplePrompt: 'Design a detective mystery game where players solve crimes through investigation and deduction. Players examine crime scenes, interview suspects, collect clues, and piece together evidence. The game features a notebook system for tracking clues and suspects. Players must analyze evidence, find contradictions in testimonies, and make logical deductions. Multiple cases with varying difficulty and interconnected storylines. Wrong accusations have consequences. Uses detailed ASCII art for crime scenes and character portraits.',
    tags: ['mystery', 'detective', 'investigation', 'puzzle'],
    metadata: {
      genre: 'Adventure',
      targetPlatform: ['terminal', 'web'],
      artStyle: 'ascii-art',
      difficulty: 'medium-hard',
      gameLength: '60-90-minutes',
      multiplayer: false,
      controls: ['keyboard', 'mouse'],
      themes: ['mystery', 'crime', 'investigation'],
      mechanics: ['clue-gathering', 'deduction', 'dialogue', 'notebook-system']
    }
  },
  {
    id: 'survival-horror',
    name: 'Survival Horror',
    category: 'Horror',
    description: 'Atmospheric horror game with resource management and exploration',
    examplePrompt: 'Create a survival horror game where players navigate through dark, oppressive environments while managing limited resources. The game emphasizes atmosphere, tension, and strategic resource use over combat. Players must explore abandoned locations, solve environmental puzzles, and avoid or carefully engage threats. Limited inventory space forces tough decisions. Health items, ammunition, and light sources are scarce. Permadeath or checkpoint system adds stakes. Uses atmospheric ASCII/ANSI art with darkness mechanics and sound cues.',
    tags: ['horror', 'survival', 'atmosphere', 'resource-management'],
    metadata: {
      genre: 'Horror',
      targetPlatform: ['terminal', 'web'],
      artStyle: 'ascii-art',
      difficulty: 'hard',
      gameLength: '45-75-minutes',
      multiplayer: false,
      controls: ['keyboard'],
      themes: ['horror', 'survival', 'atmosphere'],
      mechanics: ['resource-management', 'exploration', 'stealth', 'environmental-puzzles']
    }
  }
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): GameTemplate | undefined {
  return gameTemplates.find(t => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): GameTemplate[] {
  return gameTemplates.filter(t => t.category === category);
}

/**
 * Get all unique categories
 */
export function getCategories(): string[] {
  return Array.from(new Set(gameTemplates.map(t => t.category)));
}

/**
 * Search templates by tags or keywords
 */
export function searchTemplates(query: string): GameTemplate[] {
  const lowerQuery = query.toLowerCase();
  return gameTemplates.filter(t =>
    t.name.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.tags.some(tag => tag.includes(lowerQuery))
  );
}
