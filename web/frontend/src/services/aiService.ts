import {
  EnhancementRequest,
  EnhancementResponse,
  PromptMetadata,
  AudioEnhancementRequest,
  AudioEnhancementResponse,
  AudioMetadata
} from '../types/wizard';

/**
 * AI Service for prompt enhancement and analysis
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');

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

/**
 * Enhance an audio description using AI
 */
export async function enhanceAudioDescription(request: AudioEnhancementRequest): Promise<AudioEnhancementResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wizard/enhance-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Audio enhancement failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Audio Enhancement error:', error);

    // Fallback: Return a basic enhancement
    return generateFallbackAudioEnhancement(request.rawAudioDescription);
  }
}

/**
 * Analyze audio description and extract metadata
 */
export async function analyzeAudioDescription(audioText: string): Promise<AudioMetadata> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wizard/analyze-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ audioDescription: audioText })
    });

    if (!response.ok) {
      throw new Error(`Audio analysis failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Audio analysis error:', error);
    return extractBasicAudioMetadata(audioText);
  }
}

/**
 * Fallback audio enhancement when API is unavailable
 */
function generateFallbackAudioEnhancement(rawAudio: string): AudioEnhancementResponse {
  const metadata = extractBasicAudioMetadata(rawAudio);

  // Build enhanced audio description with structure
  let enhanced = rawAudio;

  // Add music style details if vague
  if (!rawAudio.match(/orchestral|electronic|jazz|chiptune|ambient/i)) {
    enhanced = 'Music Style: Consider defining a specific genre (e.g., orchestral, electronic, chiptune).\n\n' + enhanced;
  }

  // Add technical specifications if missing
  if (!rawAudio.match(/loopable|file size|format|bitrate/i)) {
    enhanced += '\n\nTechnical Specifications: All audio tracks should be loopable and optimized for web delivery (under 5MB per track, MP3/OGG format).';
  }

  // Add accessibility features if missing
  if (!rawAudio.match(/volume|control|accessibility|subtitle/i)) {
    enhanced += '\n\nAccessibility: Include adjustable volume controls, separate sliders for music and SFX, and optional subtitles for any voice content.';
  }

  // Add gameplay integration if missing
  if (!rawAudio.match(/dynamic|adaptive|responsive|integration/i)) {
    enhanced += '\n\nGameplay Integration: Music should dynamically respond to player actions and game states (e.g., intensity increases during combat, calms during exploration).';
  }

  return {
    original: rawAudio,
    enhanced: enhanced,
    suggestions: [
      'Specify exact music genres and styles for each game state',
      'Define how sound effects integrate with player actions',
      'Include technical requirements (file formats, sizes, loop points)',
      'Add accessibility features (volume controls, subtitles, audio cues)',
      'Describe mood progression and dynamic audio changes'
    ],
    detectedMetadata: metadata,
    improvements: [
      {
        category: 'Genre Specification',
        original: 'Generic music description',
        improved: 'Specific genre and style details',
        reason: 'Helps audio designers understand the desired aesthetic'
      },
      {
        category: 'Technical Details',
        original: 'No technical specs',
        improved: 'Added file format and size requirements',
        reason: 'Ensures audio works within platform constraints'
      },
      {
        category: 'Accessibility',
        original: 'No accessibility features',
        improved: 'Added volume controls and subtitle support',
        reason: 'Makes the game more inclusive'
      }
    ]
  };
}

/**
 * Extract basic audio metadata from description
 */
function extractBasicAudioMetadata(audioText: string): AudioMetadata {
  const lower = audioText.toLowerCase();
  const metadata: AudioMetadata = {};

  // Detect music styles
  metadata.musicStyle = [];
  if (lower.match(/orchestral|orchestra|symphonic/i)) metadata.musicStyle.push('orchestral');
  if (lower.match(/electronic|edm|synth|techno/i)) metadata.musicStyle.push('electronic');
  if (lower.match(/jazz|swing|bebop/i)) metadata.musicStyle.push('jazz');
  if (lower.match(/chiptune|8.?bit|retro|chip/i)) metadata.musicStyle.push('chiptune');
  if (lower.match(/ambient|atmospheric|drone/i)) metadata.musicStyle.push('ambient');
  if (lower.match(/rock|metal|guitar/i)) metadata.musicStyle.push('rock');
  if (lower.match(/classical|piano|strings/i)) metadata.musicStyle.push('classical');

  // Detect sound effects
  metadata.soundEffects = [];
  if (lower.match(/ui|button|click|menu/i)) metadata.soundEffects.push('UI sounds');
  if (lower.match(/combat|attack|hit|impact/i)) metadata.soundEffects.push('Combat impacts');
  if (lower.match(/environmental|ambient|nature|wind/i)) metadata.soundEffects.push('Environmental noises');
  if (lower.match(/footstep|walk|run/i)) metadata.soundEffects.push('Movement sounds');
  if (lower.match(/voice|dialogue|narrat/i)) metadata.soundEffects.push('Voice acting');

  // Detect mood progression
  if (lower.match(/tense.*triumphant|calm.*intense/i)) {
    metadata.moodProgression = 'Dynamic with emotional shifts';
  } else if (lower.match(/build|crescendo|increase/i)) {
    metadata.moodProgression = 'Building intensity';
  } else if (lower.match(/calm|peaceful|relaxing/i)) {
    metadata.moodProgression = 'Calm and consistent';
  } else {
    metadata.moodProgression = 'Varies based on gameplay';
  }

  // Detect integration features
  metadata.integration = [];
  if (lower.match(/dynamic|adaptive|respond/i)) metadata.integration.push('Dynamic music changes');
  if (lower.match(/layer|add|remove/i)) metadata.integration.push('Layered tracks');
  if (lower.match(/contextual|situation|state/i)) metadata.integration.push('Contextual SFX variations');
  if (lower.match(/spatial|3d|position|binaural/i)) metadata.integration.push('Spatial audio');

  // Detect technical needs
  metadata.technicalNeeds = [];
  if (lower.match(/mobile|phone|tablet/i)) metadata.technicalNeeds.push('Optimize for mobile');
  if (lower.match(/loopable|loop|seamless/i)) metadata.technicalNeeds.push('Loopable tracks');
  if (lower.match(/small|tiny|under.*mb|file size/i)) metadata.technicalNeeds.push('Small file sizes');
  if (lower.match(/streaming|adaptive bitrate/i)) metadata.technicalNeeds.push('Adaptive streaming');

  // Detect accessibility features
  metadata.accessibility = [];
  if (lower.match(/volume|control|adjust/i)) metadata.accessibility.push('Volume controls');
  if (lower.match(/subtitle|caption|text/i)) metadata.accessibility.push('Subtitles');
  if (lower.match(/colorblind|visual.*impair/i)) metadata.accessibility.push('Audio cues');
  if (lower.match(/mute|silent|toggle/i)) metadata.accessibility.push('Mute option');

  // Set default values for sliders
  metadata.volumeBalance = 70; // Default music/SFX balance
  metadata.tempoAdjustment = 60; // Default tempo

  // Detect audio length preference
  if (lower.match(/short|quick|brief/i)) metadata.audioLength = 'Short (30-90 seconds)';
  else if (lower.match(/long|extended|epic/i)) metadata.audioLength = 'Long (5+ minutes)';
  else metadata.audioLength = 'Medium (2-4 minutes)';

  // Detect licensing preference
  if (lower.match(/royalty.?free|free|stock/i)) metadata.licensing = 'Royalty-free';
  else if (lower.match(/custom|commission|original/i)) metadata.licensing = 'Custom composition';
  else metadata.licensing = 'TBD';

  // Detect voice acting
  metadata.voiceActing = lower.match(/voice|narrat|dialogue|speak/i) !== null;

  return metadata;
}

/**
 * Validate audio description quality
 */
export function validateAudioDescription(audioText: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (audioText.length < 50) {
    issues.push('Audio description is too short - add more details about music and sound effects');
  }

  if (audioText.length > 3000) {
    issues.push('Audio description is too long - try to be more concise');
  }

  if (!audioText.match(/music|sound|audio|sfx/i)) {
    issues.push('Description should include music and/or sound effects');
  }

  const wordCount = audioText.split(/\s+/).length;
  if (wordCount < 10) {
    issues.push('Audio description needs more detail - describe the atmosphere and sounds');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Generate a game from the wizard
 */
export async function generateGame(data: {
  prompt: string;
  audioDescription?: string;
  metadata: any;
  answers: Record<string, any>;
  audioAnswers?: Record<string, any>;
}): Promise<{
  success: boolean;
  doorName?: string;
  doorPath?: string;
  message?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wizard/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Game generation failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Game generation error:', error);
    throw error;
  }
}
