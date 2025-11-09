/**
 * Game Prompt Wizard Handler
 *
 * Handles AI-powered prompt enhancement and game generation
 */

import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

interface EnhancementRequest {
  rawPrompt: string;
  context?: any;
  enhancementLevel: 'basic' | 'detailed' | 'comprehensive';
}

interface AnalysisRequest {
  prompt: string;
}

interface GenerationRequest {
  prompt: string;
  audioDescription?: string;
  metadata: any;
  answers: Record<string, any>;
  audioAnswers?: Record<string, any>;
}

interface AudioEnhancementRequest {
  rawAudioDescription: string;
  context?: any;
  enhancementLevel: 'basic' | 'detailed' | 'comprehensive';
}

interface AudioAnalysisRequest {
  audioDescription: string;
}

/**
 * Enhance a game prompt using AI-powered analysis
 */
export async function enhancePrompt(req: Request, res: Response) {
  try {
    const { rawPrompt, context, enhancementLevel } = req.body as EnhancementRequest;

    if (!rawPrompt || rawPrompt.length < 10) {
      return res.status(400).json({
        error: 'Prompt is too short. Please provide a more detailed description.'
      });
    }

    // Generate enhanced version
    const enhanced = await generateEnhancedPrompt(rawPrompt, enhancementLevel);
    const metadata = extractMetadata(rawPrompt);

    res.json({
      original: rawPrompt,
      enhanced: enhanced.text,
      suggestions: enhanced.suggestions,
      detectedMetadata: metadata,
      improvements: enhanced.improvements
    });

  } catch (error: any) {
    console.error('Enhancement error:', error);
    res.status(500).json({
      error: 'Enhancement failed',
      message: error.message
    });
  }
}

/**
 * Analyze prompt and extract metadata
 */
export async function analyzePrompt(req: Request, res: Response) {
  try {
    const { prompt } = req.body as AnalysisRequest;

    if (!prompt || prompt.length < 10) {
      return res.status(400).json({
        error: 'Prompt is too short'
      });
    }

    const metadata = extractMetadata(prompt);

    res.json(metadata);

  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
}

/**
 * Enhance an audio description using AI-powered analysis
 */
export async function enhanceAudioDescription(req: Request, res: Response) {
  try {
    const { rawAudioDescription, context, enhancementLevel } = req.body as AudioEnhancementRequest;

    if (!rawAudioDescription || rawAudioDescription.length < 10) {
      return res.status(400).json({
        error: 'Audio description is too short. Please provide more details.'
      });
    }

    // Generate enhanced version
    const enhanced = await generateEnhancedAudioDescription(rawAudioDescription, enhancementLevel);
    const metadata = extractAudioMetadata(rawAudioDescription);

    res.json({
      original: rawAudioDescription,
      enhanced: enhanced.text,
      suggestions: enhanced.suggestions,
      detectedMetadata: metadata,
      improvements: enhanced.improvements
    });

  } catch (error: any) {
    console.error('Audio enhancement error:', error);
    res.status(500).json({
      error: 'Audio enhancement failed',
      message: error.message
    });
  }
}

/**
 * Analyze audio description and extract metadata
 */
export async function analyzeAudioDescription(req: Request, res: Response) {
  try {
    const { audioDescription } = req.body as AudioAnalysisRequest;

    if (!audioDescription || audioDescription.length < 10) {
      return res.status(400).json({
        error: 'Audio description is too short'
      });
    }

    const metadata = extractAudioMetadata(audioDescription);

    res.json(metadata);

  } catch (error: any) {
    console.error('Audio analysis error:', error);
    res.status(500).json({
      error: 'Audio analysis failed',
      message: error.message
    });
  }
}

/**
 * Generate a game using the SDK
 */
export async function generateGame(req: Request, res: Response) {
  try {
    const { prompt, metadata, answers } = req.body as GenerationRequest;

    if (!prompt || prompt.length < 10) {
      return res.status(400).json({
        error: 'Invalid prompt'
      });
    }

    // Generate game name from prompt
    const gameName = generateGameName(prompt);

    // Path resolution: In dev mode (ts-node/tsx), __dirname is in src/handlers
    // In production (compiled), __dirname is in dist/handlers
    // Go up to project root: src/handlers -> src -> backend -> web -> project root
    const projectRoot = path.resolve(__dirname, '../../../..');
    const sdkPath = path.join(projectRoot, 'sdk');
    const doorsPath = path.join(projectRoot, 'doors');

    console.log('[wizard.handler] Project root:', projectRoot);
    console.log('[wizard.handler] SDK path:', sdkPath);
    console.log('[wizard.handler] Doors path:', doorsPath);

    // Create game using SDK CLI
    const result = await createGameWithSDK(sdkPath, doorsPath, gameName, prompt, metadata, answers);

    res.json({
      success: true,
      doorName: gameName,
      doorPath: result.path,
      message: 'Game created successfully!'
    });

  } catch (error: any) {
    console.error('Generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Game generation failed',
      message: error.message
    });
  }
}

/**
 * Generate enhanced prompt with AI-style improvements
 */
async function generateEnhancedPrompt(
  rawPrompt: string,
  level: 'basic' | 'detailed' | 'comprehensive'
): Promise<{ text: string; suggestions: string[]; improvements: any[] }> {

  let enhanced = rawPrompt;
  const suggestions: string[] = [];
  const improvements: any[] = [];

  // Add genre if not specified
  if (!rawPrompt.match(/game|rpg|action|puzzle|strategy/i)) {
    enhanced = `Game Concept: ${enhanced}`;
    improvements.push({
      category: 'Clarity',
      original: 'Implicit genre',
      improved: 'Explicit game classification',
      reason: 'Helps categorize and understand the game type'
    });
  }

  // Add player interaction details
  if (!rawPrompt.match(/player|control|interact/i)) {
    enhanced += '\n\nPlayers interact with the game through intuitive controls. The gameplay is designed to be engaging and accessible.';
    suggestions.push('Consider specifying player controls (keyboard, mouse, touch)');
    improvements.push({
      category: 'Gameplay',
      original: 'No player interaction mentioned',
      improved: 'Added player interaction context',
      reason: 'Essential for understanding how users engage with the game'
    });
  }

  // Add win/lose conditions
  if (!rawPrompt.match(/win|lose|goal|objective|complete/i)) {
    enhanced += '\n\nThe game features clear objectives and win/lose conditions to keep players motivated.';
    suggestions.push('Define specific win conditions and objectives');
    improvements.push({
      category: 'Game Design',
      original: 'No objectives specified',
      improved: 'Added win/lose condition framework',
      reason: 'Games need clear goals for player engagement'
    });
  }

  // Add visual style
  if (!rawPrompt.match(/visual|graphic|ascii|ansi|pixel|art/i)) {
    enhanced += '\n\nThe game uses retro-style ASCII/ANSI graphics for authentic BBS aesthetics, creating a nostalgic visual experience.';
    suggestions.push('Specify visual style and art direction');
    improvements.push({
      category: 'Visuals',
      original: 'No visual style mentioned',
      improved: 'Added retro ASCII/ANSI aesthetic',
      reason: 'Visual presentation affects player experience'
    });
  }

  // Add difficulty progression
  if (!rawPrompt.match(/difficult|easy|hard|progress|level/i) && level !== 'basic') {
    enhanced += '\n\nDifficulty scales progressively, providing an appropriate challenge for players of all skill levels.';
    suggestions.push('Consider adding difficulty progression or player skill levels');
  }

  // Add audio/feedback
  if (!rawPrompt.match(/sound|audio|music|effect/i) && level === 'comprehensive') {
    enhanced += '\n\nAudio feedback and sound effects enhance the gameplay experience with retro-style beeps and effects.';
    suggestions.push('Consider adding audio elements for better player feedback');
  }

  // Add replayability
  if (!rawPrompt.match(/replay|random|procedural/i) && level === 'comprehensive') {
    suggestions.push('Consider adding randomization or procedural elements for replayability');
  }

  return {
    text: enhanced,
    suggestions,
    improvements
  };
}

/**
 * Extract metadata from prompt text
 */
function extractMetadata(prompt: string): any {
  const lower = prompt.toLowerCase();
  const metadata: any = {};

  // Detect genre
  if (lower.match(/rpg|role.?playing|dungeon|quest/i)) metadata.genre = 'RPG';
  else if (lower.match(/puzzle|solve|logic|match/i)) metadata.genre = 'Puzzle';
  else if (lower.match(/action|shoot|fight|combat/i)) metadata.genre = 'Action';
  else if (lower.match(/strategy|tactical|turn.?based/i)) metadata.genre = 'Strategy';
  else if (lower.match(/adventure|explore|story/i)) metadata.genre = 'Adventure';
  else if (lower.match(/card|deck/i)) metadata.genre = 'Card Game';
  else if (lower.match(/racing|drive|vehicle/i)) metadata.genre = 'Racing';
  else if (lower.match(/platform|jump/i)) metadata.genre = 'Platformer';

  // Detect platforms
  metadata.targetPlatform = [];
  if (lower.match(/web|browser/i)) metadata.targetPlatform.push('web');
  if (lower.match(/terminal|bbs|text/i)) metadata.targetPlatform.push('terminal');
  if (lower.match(/mobile|touch/i)) metadata.targetPlatform.push('mobile');
  if (metadata.targetPlatform.length === 0) metadata.targetPlatform = ['web', 'terminal'];

  // Detect art style
  if (lower.match(/ascii/i)) metadata.artStyle = 'ascii-art';
  else if (lower.match(/ansi|color/i)) metadata.artStyle = 'ansi-color';
  else if (lower.match(/pixel/i)) metadata.artStyle = 'pixel-art';
  else if (lower.match(/text/i)) metadata.artStyle = 'text-only';
  else metadata.artStyle = 'ansi-color';

  // Detect difficulty
  if (lower.match(/easy|casual|simple/i)) metadata.difficulty = 'easy';
  else if (lower.match(/hard|challenging|difficult/i)) metadata.difficulty = 'hard';
  else metadata.difficulty = 'medium';

  // Detect game length
  if (lower.match(/quick|short|5.?min/i)) metadata.gameLength = 'quick';
  else if (lower.match(/long|epic|hour/i)) metadata.gameLength = 'long';
  else metadata.gameLength = 'medium';

  // Detect multiplayer
  metadata.multiplayer = lower.match(/multiplayer|co.?op|pvp|versus|2.?player/i) !== null;

  // Detect controls
  metadata.controls = [];
  if (lower.match(/keyboard|key|type|wasd|arrow/i)) metadata.controls.push('keyboard');
  if (lower.match(/mouse|click|pointer/i)) metadata.controls.push('mouse');
  if (lower.match(/touch|tap|swipe/i)) metadata.controls.push('touch');
  if (metadata.controls.length === 0) metadata.controls = ['keyboard'];

  // Detect themes
  metadata.themes = [];
  if (lower.match(/space|sci.?fi|alien/i)) metadata.themes.push('sci-fi');
  if (lower.match(/fantasy|magic|dragon|dungeon/i)) metadata.themes.push('fantasy');
  if (lower.match(/horror|scary|survival/i)) metadata.themes.push('horror');
  if (lower.match(/mystery|detective|crime/i)) metadata.themes.push('mystery');

  // Detect mechanics
  metadata.mechanics = [];
  if (lower.match(/turn.?based/i)) metadata.mechanics.push('turn-based');
  if (lower.match(/real.?time/i)) metadata.mechanics.push('real-time');
  if (lower.match(/procedural|random|generated/i)) metadata.mechanics.push('procedural-generation');
  if (lower.match(/inventory|item|equipment/i)) metadata.mechanics.push('inventory');
  if (lower.match(/level.?up|progression|xp|experience/i)) metadata.mechanics.push('progression');
  if (lower.match(/craft/i)) metadata.mechanics.push('crafting');
  if (lower.match(/upgrade/i)) metadata.mechanics.push('upgrades');

  return metadata;
}

/**
 * Generate game name from prompt
 */
function generateGameName(prompt: string): string {
  // Extract key words from prompt
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['game', 'play', 'player', 'create', 'build', 'design', 'make', 'with', 'that', 'where', 'which', 'this', 'they', 'have'].includes(w))
    .slice(0, 3);

  if (words.length > 0) {
    return words.join('-');
  }

  // Fallback to generic name
  return `game-${Date.now()}`;
}

/**
 * Generate enhanced audio description with AI-style improvements
 */
async function generateEnhancedAudioDescription(
  rawAudio: string,
  level: 'basic' | 'detailed' | 'comprehensive'
): Promise<{ text: string; suggestions: string[]; improvements: any[] }> {

  let enhanced = rawAudio;
  const suggestions: string[] = [];
  const improvements: any[] = [];

  // Add music style details if vague
  if (!rawAudio.match(/orchestral|electronic|jazz|chiptune|ambient|rock|classical/i)) {
    enhanced = 'Music Style: Define a specific genre (e.g., orchestral, electronic, chiptune, ambient).\n\n' + enhanced;
    improvements.push({
      category: 'Music Style',
      original: 'No specific genre mentioned',
      improved: 'Added genre specification prompt',
      reason: 'Helps audio designers understand the desired musical aesthetic'
    });
    suggestions.push('Specify exact music genres and styles for each game state');
  }

  // Add sound effects details
  if (!rawAudio.match(/sfx|sound effect|ui|combat|environment/i)) {
    enhanced += '\n\nSound Effects: Include UI sounds (menu clicks, selections), gameplay SFX (actions, impacts), and environmental ambience.';
    suggestions.push('Define how sound effects integrate with player actions');
  }

  // Add technical specifications if missing
  if (!rawAudio.match(/loopable|file size|format|bitrate|mp3|ogg/i)) {
    enhanced += '\n\nTechnical Specifications: All audio tracks should be loopable and optimized for web delivery (under 5MB per track, MP3/OGG format, 128-192kbps).';
    improvements.push({
      category: 'Technical Details',
      original: 'No technical specs',
      improved: 'Added file format and size requirements',
      reason: 'Ensures audio works within platform constraints'
    });
    suggestions.push('Include technical requirements (file formats, sizes, loop points)');
  }

  // Add accessibility features if missing
  if (!rawAudio.match(/volume|control|accessibility|subtitle|caption/i) && level !== 'basic') {
    enhanced += '\n\nAccessibility: Include adjustable volume controls with separate sliders for music, SFX, and voice. Add optional subtitles for any voice content and visual indicators for important audio cues.';
    improvements.push({
      category: 'Accessibility',
      original: 'No accessibility features',
      improved: 'Added volume controls and subtitle support',
      reason: 'Makes the game more inclusive for all players'
    });
    suggestions.push('Add accessibility features (volume controls, subtitles, audio cues)');
  }

  // Add gameplay integration if missing
  if (!rawAudio.match(/dynamic|adaptive|responsive|integration|state/i)) {
    enhanced += '\n\nGameplay Integration: Music should dynamically respond to player actions and game states. For example, intensity increases during combat or chase sequences, and calms during exploration or menu screens.';
    improvements.push({
      category: 'Gameplay Integration',
      original: 'Static audio description',
      improved: 'Added dynamic audio integration',
      reason: 'Audio that responds to gameplay creates more immersive experiences'
    });
  }

  // Add mood progression
  if (!rawAudio.match(/mood|emotion|atmosphere|progression/i) && level === 'comprehensive') {
    enhanced += '\n\nMood Progression: Define how the emotional tone evolves throughout the game (e.g., tense to triumphant, calm to intense).';
    suggestions.push('Describe mood progression and dynamic audio changes');
  }

  return {
    text: enhanced,
    suggestions,
    improvements
  };
}

/**
 * Extract audio metadata from description
 */
function extractAudioMetadata(audioText: string): any {
  const lower = audioText.toLowerCase();
  const metadata: any = {};

  // Detect music styles
  metadata.musicStyle = [];
  if (lower.match(/orchestral|orchestra|symphonic/i)) metadata.musicStyle.push('orchestral');
  if (lower.match(/electronic|edm|synth|techno|house/i)) metadata.musicStyle.push('electronic');
  if (lower.match(/jazz|swing|bebop/i)) metadata.musicStyle.push('jazz');
  if (lower.match(/chiptune|8.?bit|retro|chip|nes|gameboy/i)) metadata.musicStyle.push('chiptune');
  if (lower.match(/ambient|atmospheric|drone/i)) metadata.musicStyle.push('ambient');
  if (lower.match(/rock|metal|guitar/i)) metadata.musicStyle.push('rock');
  if (lower.match(/classical|piano|strings/i)) metadata.musicStyle.push('classical');

  // Detect sound effects
  metadata.soundEffects = [];
  if (lower.match(/ui|button|click|menu/i)) metadata.soundEffects.push('UI sounds');
  if (lower.match(/combat|attack|hit|impact|weapon/i)) metadata.soundEffects.push('Combat impacts');
  if (lower.match(/environmental|ambient|nature|wind|water/i)) metadata.soundEffects.push('Environmental noises');
  if (lower.match(/footstep|walk|run|movement/i)) metadata.soundEffects.push('Movement sounds');
  if (lower.match(/voice|dialogue|narrat|speak/i)) metadata.soundEffects.push('Voice acting');

  // Detect mood progression
  if (lower.match(/tense.*triumphant|calm.*intense/i)) {
    metadata.moodProgression = 'Dynamic with emotional shifts';
  } else if (lower.match(/build|crescendo|increase|intensify/i)) {
    metadata.moodProgression = 'Building intensity';
  } else if (lower.match(/calm|peaceful|relaxing|serene/i)) {
    metadata.moodProgression = 'Calm and consistent';
  } else {
    metadata.moodProgression = 'Varies based on gameplay';
  }

  // Detect integration features
  metadata.integration = [];
  if (lower.match(/dynamic|adaptive|respond/i)) metadata.integration.push('Dynamic music changes');
  if (lower.match(/layer|add|remove|stem/i)) metadata.integration.push('Layered tracks');
  if (lower.match(/contextual|situation|state/i)) metadata.integration.push('Contextual SFX variations');
  if (lower.match(/spatial|3d|position|binaural/i)) metadata.integration.push('Spatial audio');

  // Detect technical needs
  metadata.technicalNeeds = [];
  if (lower.match(/mobile|phone|tablet/i)) metadata.technicalNeeds.push('Optimize for mobile');
  if (lower.match(/loopable|loop|seamless/i)) metadata.technicalNeeds.push('Loopable tracks');
  if (lower.match(/small|tiny|under.*mb|file size/i)) metadata.technicalNeeds.push('Small file sizes');
  if (lower.match(/streaming|adaptive bitrate/i)) metadata.technicalNeeds.push('Adaptive streaming');
  if (lower.match(/procedural|generative/i)) metadata.technicalNeeds.push('Procedural generation');

  // Detect accessibility features
  metadata.accessibility = [];
  if (lower.match(/volume|control|adjust|slider/i)) metadata.accessibility.push('Volume controls');
  if (lower.match(/subtitle|caption|text/i)) metadata.accessibility.push('Subtitles/Captions');
  if (lower.match(/visual.*cue|indicator/i)) metadata.accessibility.push('Visual audio cues');
  if (lower.match(/mute|silent|toggle|off/i)) metadata.accessibility.push('Mute option');

  // Set default values for sliders
  metadata.volumeBalance = 70; // Default music/SFX balance (0-100)
  metadata.tempoAdjustment = 60; // Default tempo (0-100, 50 = normal)

  // Detect audio length preference
  if (lower.match(/short|quick|brief|30.*sec|90.*sec/i)) metadata.audioLength = 'Short (30-90 seconds)';
  else if (lower.match(/long|extended|epic|5.*min|10.*min/i)) metadata.audioLength = 'Long (5+ minutes)';
  else metadata.audioLength = 'Medium (2-4 minutes)';

  // Detect licensing preference
  if (lower.match(/royalty.?free|free|stock/i)) metadata.licensing = 'Royalty-free';
  else if (lower.match(/custom|commission|original/i)) metadata.licensing = 'Custom composition';
  else if (lower.match(/creative.*commons|cc/i)) metadata.licensing = 'Creative Commons';
  else metadata.licensing = 'TBD';

  // Detect voice acting
  metadata.voiceActing = lower.match(/voice|narrat|dialogue|speak|vocal/i) !== null;

  return metadata;
}

/**
 * Create game using SDK CLI
 */
async function createGameWithSDK(
  sdkPath: string,
  doorsPath: string,
  gameName: string,
  prompt: string,
  metadata: any,
  answers: Record<string, any>
): Promise<{ path: string }> {

  return new Promise((resolve, reject) => {
    // Check if SDK exists
    if (!fs.existsSync(sdkPath)) {
      return reject(new Error('SDK not found at ' + sdkPath));
    }

    // Ensure doors directory exists
    if (!fs.existsSync(doorsPath)) {
      fs.mkdirSync(doorsPath, { recursive: true });
    }

    const doorPath = path.join(doorsPath, gameName);

    // Create door using SDK CLI
    // Note: In production, this would use the actual SDK API
    // For now, create a placeholder structure
    try {
      if (!fs.existsSync(doorPath)) {
        fs.mkdirSync(doorPath, { recursive: true });
      }

      // Create package.json
      const packageJson = {
        name: gameName,
        version: '1.0.0',
        description: prompt.substring(0, 200),
        main: 'index.ts',
        metadata: metadata,
        wizardAnswers: answers
      };

      fs.writeFileSync(
        path.join(doorPath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Create basic index.ts template
      const indexTemplate = `/**
 * ${gameName}
 *
 * ${prompt.substring(0, 200)}
 *
 * Generated by AmiExpress Game Prompt Wizard
 */

import { DoorAPI } from '@amiexpress/bbs-door-sdk';

async function main() {
  const door = new DoorAPI();

  door.writeLine('Welcome to ${gameName}!');
  door.writeLine('');
  door.writeLine('${prompt.substring(0, 100).replace(/'/g, "\\'")}');
  door.writeLine('');
  door.writeLine('Press any key to continue...');

  await door.waitForKey();

  // TODO: Implement game logic here

  door.writeLine('Game completed! Thanks for playing!');
}

main().catch(console.error);
`;

      fs.writeFileSync(
        path.join(doorPath, 'index.ts'),
        indexTemplate
      );

      // Create README
      const readme = `# ${gameName}

${prompt}

## Metadata

${JSON.stringify(metadata, null, 2)}

## Wizard Answers

${JSON.stringify(answers, null, 2)}

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

Generated by AmiExpress Game Prompt Wizard
`;

      fs.writeFileSync(
        path.join(doorPath, 'README.md'),
        readme
      );

      resolve({ path: doorPath });

    } catch (error) {
      reject(error);
    }
  });
}
