import { EnhancementRequest, EnhancementResponse, PromptMetadata } from '../types/wizard';

/**
 * AI Service for prompt enhancement and analysis
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:3001' : 'https://amiexpress-backend.onrender.com');

/**
 * Enhance a game prompt using AI
 */
export async function enhancePrompt(request: EnhancementRequest): Promise<EnhancementResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wizard/enhance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Enhancement failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('AI Enhancement error:', error);

    // Fallback: Return a basic enhancement
    return generateFallbackEnhancement(request.rawPrompt);
  }
}

/**
 * Analyze prompt and extract metadata
 */
export async function analyzePrompt(promptText: string): Promise<PromptMetadata> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wizard/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: promptText })
    });

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Prompt analysis error:', error);
    return extractBasicMetadata(promptText);
  }
}

/**
 * Fallback enhancement when API is unavailable
 */
function generateFallbackEnhancement(rawPrompt: string): EnhancementResponse {
  const metadata = extractBasicMetadata(rawPrompt);

  // Build enhanced prompt with structure
  let enhanced = rawPrompt;

  // Add genre if detected
  if (metadata.genre) {
    enhanced = `[${metadata.genre} Game]\n\n` + enhanced;
  }

  // Add structure if missing
  if (!rawPrompt.includes('player')) {
    enhanced += '\n\nPlayers will engage with intuitive controls and clear objectives.';
  }

  if (!rawPrompt.includes('win') && !rawPrompt.includes('goal')) {
    enhanced += '\n\nThe goal is to achieve the highest score or complete all challenges.';
  }

  if (!rawPrompt.includes('visual') && !rawPrompt.includes('graphics')) {
    enhanced += '\n\nThe game uses retro-style ASCII/ANSI graphics for authentic BBS aesthetics.';
  }

  return {
    original: rawPrompt,
    enhanced: enhanced,
    suggestions: [
      'Consider adding specific win/lose conditions',
      'Define the core game loop (what players do repeatedly)',
      'Specify the visual style and user interface',
      'Describe the difficulty curve and progression'
    ],
    detectedMetadata: metadata,
    improvements: [
      {
        category: 'Structure',
        original: 'Vague description',
        improved: 'Added clear game structure',
        reason: 'Helps AI understand the game flow'
      }
    ]
  };
}

/**
 * Extract basic metadata from prompt text
 */
function extractBasicMetadata(promptText: string): PromptMetadata {
  const lower = promptText.toLowerCase();
  const metadata: PromptMetadata = {};

  // Detect genre
  if (lower.match(/rpg|role.?playing|dungeon|quest/i)) metadata.genre = 'RPG';
  else if (lower.match(/puzzle|solve|logic|match/i)) metadata.genre = 'Puzzle';
  else if (lower.match(/action|shoot|fight|combat/i)) metadata.genre = 'Action';
  else if (lower.match(/strategy|tactical|turn.?based/i)) metadata.genre = 'Strategy';
  else if (lower.match(/adventure|explore|story/i)) metadata.genre = 'Adventure';
  else if (lower.match(/card|deck/i)) metadata.genre = 'Card Game';
  else if (lower.match(/racing|drive|vehicle/i)) metadata.genre = 'Racing';

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

  // Detect multiplayer
  metadata.multiplayer = lower.match(/multiplayer|co.?op|pvp|versus/i) !== null;

  // Detect controls
  metadata.controls = [];
  if (lower.match(/keyboard|key|type/i)) metadata.controls.push('keyboard');
  if (lower.match(/mouse|click|pointer/i)) metadata.controls.push('mouse');
  if (lower.match(/touch|tap|swipe/i)) metadata.controls.push('touch');
  if (metadata.controls.length === 0) metadata.controls = ['keyboard'];

  // Detect mechanics
  metadata.mechanics = [];
  if (lower.match(/turn.?based/i)) metadata.mechanics.push('turn-based');
  if (lower.match(/real.?time/i)) metadata.mechanics.push('real-time');
  if (lower.match(/procedural|random|generated/i)) metadata.mechanics.push('procedural-generation');
  if (lower.match(/inventory|item|equipment/i)) metadata.mechanics.push('inventory');
  if (lower.match(/level.?up|progression|xp/i)) metadata.mechanics.push('progression');

  return metadata;
}

/**
 * Validate prompt quality
 */
export function validatePrompt(promptText: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (promptText.length < 50) {
    issues.push('Prompt is too short - add more details about your game');
  }

  if (promptText.length > 5000) {
    issues.push('Prompt is too long - try to be more concise');
  }

  if (!promptText.match(/game|play/i)) {
    issues.push('Prompt should describe a game or gameplay');
  }

  const wordCount = promptText.split(/\s+/).length;
  if (wordCount < 10) {
    issues.push('Prompt needs more detail - aim for at least a few sentences');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
