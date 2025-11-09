import React, { useState, useEffect, useRef } from 'react';
import {
  Wand2, Loader2, CheckCircle, XCircle, ChevronRight, Sparkles,
  Eye, Code, Zap, RefreshCw, Save, Play, AlertCircle, Lightbulb,
  TrendingUp, Clock, DollarSign, Settings as SettingsIcon
} from 'lucide-react';

interface EnhancedGameWizardProps {
  onClose: () => void;
  onGameCreated: (doorId: string) => void;
  className?: string;
}

interface AIProvider {
  id: string;
  name: string;
  models: string[];
  speed: 'fast' | 'medium' | 'slow';
  quality: 'good' | 'excellent' | 'best';
  costLevel: 'free' | 'low' | 'medium' | 'high';
}

interface GameTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  features: string[];
  preview: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
}

const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
    speed: 'medium',
    quality: 'best',
    costLevel: 'medium',
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    speed: 'fast',
    quality: 'excellent',
    costLevel: 'high',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    speed: 'fast',
    quality: 'excellent',
    costLevel: 'low',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    models: ['codellama', 'deepseek-coder', 'mistral'],
    speed: 'slow',
    quality: 'good',
    costLevel: 'free',
  },
];

const GAME_TEMPLATES: GameTemplate[] = [
  {
    id: 'space-shooter',
    name: 'Space Shooter',
    description: 'Classic arcade-style space combat with enemies and power-ups',
    type: 'arcade',
    features: ['Real-time combat', 'Power-ups', 'High scores', 'Wave system'],
    preview: '  *   \n >◊< \n  ^  ',
    difficulty: 'beginner',
    estimatedTime: '2-3 min',
  },
  {
    id: 'text-rpg',
    name: 'Text Adventure RPG',
    description: 'Explore dungeons, fight monsters, collect items and level up',
    type: 'rpg',
    features: ['Turn-based combat', 'Inventory system', 'Character progression', 'Quest system'],
    preview: ' /‾\\\n|@ |\n \\-/ ',
    difficulty: 'intermediate',
    estimatedTime: '3-4 min',
  },
  {
    id: 'puzzle-game',
    name: 'Logic Puzzle',
    description: 'Brain-teasing puzzles with increasing difficulty',
    type: 'puzzle',
    features: ['Progressive difficulty', 'Hint system', 'Timer', 'Leaderboards'],
    preview: '┌─┬─┐\n│?│?│\n└─┴─┘',
    difficulty: 'beginner',
    estimatedTime: '2 min',
  },
  {
    id: 'trivia-quiz',
    name: 'Trivia Quiz',
    description: 'Multiple-choice questions across various categories',
    type: 'trivia',
    features: ['Multiple categories', 'Scoring system', 'Time limits', 'Difficulty levels'],
    preview: ' A) □\n B) ■\n C) □',
    difficulty: 'beginner',
    estimatedTime: '1-2 min',
  },
  {
    id: 'strategy-game',
    name: 'Turn-Based Strategy',
    description: 'Command units, manage resources, conquer territory',
    type: 'strategy',
    features: ['Resource management', 'Unit control', 'AI opponents', 'Multiple maps'],
    preview: '⚔ vs ⚔',
    difficulty: 'advanced',
    estimatedTime: '4-5 min',
  },
  {
    id: 'custom',
    name: 'Custom Game',
    description: 'Start from scratch with your own unique idea',
    type: 'custom',
    features: [],
    preview: '✨ ??? ✨',
    difficulty: 'intermediate',
    estimatedTime: '3-5 min',
  },
];

export const EnhancedGameWizard: React.FC<EnhancedGameWizardProps> = ({
  onClose,
  onGameCreated,
  className = '',
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form data
  const [selectedTemplate, setSelectedTemplate] = useState<GameTemplate | null>(null);
  const [gameName, setGameName] = useState('');
  const [gameDescription, setGameDescription] = useState('');
  const [bbsCommand, setBbsCommand] = useState('');
  const [gameType, setGameType] = useState('adventure');
  const [features, setFeatures] = useState<string[]>([]);
  const [customFeature, setCustomFeature] = useState('');

  // AI Settings
  const [provider, setProvider] = useState('claude');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [apiKey, setApiKey] = useState('');
  const [useServerKey, setUseServerKey] = useState(true);
  const [qualityMode, setQualityMode] = useState<'fast' | 'balanced' | 'best'>('balanced');

  // Generation state
  const [generatedCode, setGeneratedCode] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('');
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);

  // Iteration
  const [generationAttempts, setGenerationAttempts] = useState<any[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState(0);

  const codePreviewRef = useRef<HTMLDivElement>(null);

  const steps = ['Template', 'Details', 'AI Setup', 'Generate', 'Preview'];

  useEffect(() => {
    // Load saved API keys
    const savedKeys = localStorage.getItem('ai_api_keys');
    if (savedKeys) {
      const keys = JSON.parse(savedKeys);
      if (keys[provider]) {
        setApiKey(keys[provider]);
        setUseServerKey(false);
      }
    }
  }, [provider]);

  useEffect(() => {
    // Update model when provider changes
    const selectedProvider = AI_PROVIDERS.find(p => p.id === provider);
    if (selectedProvider) {
      setModel(selectedProvider.models[0]);
    }
  }, [provider]);

  useEffect(() => {
    // Estimate cost based on game description
    const estimatedTokens = gameDescription.length * 4 + 4000; // Rough estimate
    setTokenCount(estimatedTokens);

    const costPerToken = provider === 'openai' ? 0.00003 :
                        provider === 'claude' ? 0.000015 :
                        provider === 'gemini' ? 0.0000005 : 0;
    setEstimatedCost(estimatedTokens * costPerToken);
  }, [gameDescription, provider]);

  const handleTemplateSelect = (template: GameTemplate) => {
    setSelectedTemplate(template);
    setGameName(template.name);
    setGameType(template.type);
    setFeatures(template.features);
    setGameDescription(template.description);
  };

  const handleNext = () => {
    if (currentStep === steps.length - 2) {
      handleGenerate();
    } else if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setProgress(0);
    setCurrentPhase('Preparing request...');

    try {
      // Save API key if provided
      if (!useServerKey && apiKey) {
        const savedKeys = JSON.parse(localStorage.getItem('ai_api_keys') || '{}');
        savedKeys[provider] = apiKey;
        localStorage.setItem('ai_api_keys', JSON.stringify(savedKeys));
      }

      setCurrentPhase('Calling AI...');
      setProgress(20);

      const response = await fetch('/api/games/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: gameName,
          description: gameDescription,
          bbsCommand,
          type: gameType,
          features,
          provider,
          model,
          apiKey: useServerKey ? undefined : apiKey,
          qualityMode,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate game';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // If response isn't JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let code = '';

      setCurrentPhase('Generating code...');
      setProgress(40);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'progress') {
                  setProgress(data.progress);
                  setCurrentPhase(data.phase);
                } else if (data.type === 'code_chunk') {
                  code += data.chunk;
                  setStreamingText(code);
                } else if (data.type === 'complete') {
                  setGeneratedCode(code);
                  setCurrentStep(steps.length - 1);
                  setShowPreview(true);
                } else if (data.type === 'error') {
                  throw new Error(data.error);
                }
              } catch (e) {
                // Ignore JSON parse errors for partial chunks
              }
            }
          }
        }
      }

      setProgress(100);
      setGenerating(false);

      // Play success sound
      playSuccessSound();

    } catch (err: any) {
      setError(err.message || 'An error occurred while generating the game');
      setGenerating(false);
      setProgress(0);
      setCurrentPhase('');
      setStreamingText('');
    }
  };

  const handleSaveGame = async () => {
    try {
      const response = await fetch('/api/games/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: gameName,
          description: gameDescription,
          type: gameType,
          features,
          code: generatedCode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save game');
      }

      const result = await response.json();
      setSuccess(true);

      // Show confetti
      showConfetti();

      setTimeout(() => {
        onGameCreated(result.doorId);
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to save game');
    }
  };

  const handleRegenerate = () => {
    setCurrentStep(steps.length - 2);
    handleGenerate();
  };

  const playSuccessSound = () => {
    // Simple beep using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const showConfetti = () => {
    // Simple confetti animation (you could use a library like canvas-confetti)
    console.log('🎉 Game created successfully!');
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return selectedTemplate !== null;
      case 1:
        return gameName.trim().length > 0 && gameDescription.trim().length > 10 && bbsCommand.trim().length > 0;
      case 2:
        return useServerKey || apiKey.trim().length > 0;
      default:
        return true;
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 ${className}`}>
      <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl border border-purple-500/30 shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900/50 via-blue-900/50 to-purple-900/50 px-6 py-4 border-b border-purple-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wand2 className="w-7 h-7 text-purple-400 animate-pulse" />
              <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                AI Game Wizard
              </h2>
              <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4 bg-[#0f172a]/50">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                      index === currentStep
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white ring-4 ring-purple-400/50'
                        : index < currentStep
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {index < currentStep ? '✓' : index + 1}
                  </div>
                  <span className={`text-xs mt-2 ${index === currentStep ? 'text-purple-300 font-semibold' : 'text-gray-500'}`}>
                    {step}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`h-1 w-20 mx-2 rounded ${index < currentStep ? 'bg-green-600' : 'bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-700 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 font-semibold">Error</p>
                <p className="text-red-200 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative">
                <CheckCircle className="w-24 h-24 text-green-400 animate-bounce" />
                <Sparkles className="w-8 h-8 text-yellow-300 absolute -top-2 -right-2 animate-spin" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-2 mt-4">Game Created!</h3>
              <p className="text-gray-400">Opening your new game...</p>
            </div>
          )}

          {!success && (
            <>
              {/* Step 0: Template Selection */}
              {currentStep === 0 && (
                <div>
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-white mb-2">Choose a Template</h3>
                    <p className="text-gray-400">Start with a template or create from scratch</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {GAME_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateSelect(template)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          selectedTemplate?.id === template.id
                            ? 'border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20'
                            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
                        }`}
                      >
                        <div className="text-4xl mb-3 text-center font-mono">{template.preview}</div>
                        <h4 className="text-white font-semibold mb-1">{template.name}</h4>
                        <p className="text-gray-400 text-sm mb-3">{template.description}</p>

                        <div className="flex items-center gap-2 text-xs">
                          <span className={`px-2 py-0.5 rounded ${
                            template.difficulty === 'beginner' ? 'bg-green-900/50 text-green-300' :
                            template.difficulty === 'intermediate' ? 'bg-yellow-900/50 text-yellow-300' :
                            'bg-red-900/50 text-red-300'
                          }`}>
                            {template.difficulty}
                          </span>
                          <span className="flex items-center gap-1 text-gray-400">
                            <Clock className="w-3 h-3" />
                            {template.estimatedTime}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Continue with remaining steps... */}
              {/* Step 1: Details */}
              {currentStep === 1 && selectedTemplate && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-white mb-2">Customize Your Game</h3>
                    <p className="text-gray-400">Fine-tune the details</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-purple-300 mb-2">
                      Game Name *
                    </label>
                    <input
                      type="text"
                      value={gameName}
                      onChange={(e) => setGameName(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-900/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-purple-300 mb-2">
                      Description *
                    </label>
                    <textarea
                      value={gameDescription}
                      onChange={(e) => setGameDescription(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-3 bg-gray-900/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                    <div className="flex justify-between text-xs mt-1">
                      <span className={`${gameDescription.length < 10 ? 'text-red-400' : 'text-green-400'}`}>
                        {gameDescription.length} characters (min 10)
                      </span>
                      <span className="text-gray-500">{tokenCount.toLocaleString()} estimated tokens</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-purple-300 mb-2">
                      BBS Command *
                      <span className="text-gray-400 text-xs font-normal ml-2">(What users type to run this door)</span>
                    </label>
                    <input
                      type="text"
                      value={bbsCommand}
                      onChange={(e) => setBbsCommand(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                      placeholder="e.g., GAME, PUZZLE, RPG"
                      maxLength={20}
                      className="w-full px-4 py-3 bg-gray-900/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Letters, numbers, and underscores only. This will be used in .info file and BBS menu system.
                    </p>
                  </div>
                </div>
              )}

              {/* AI Setup and other steps would go here... */}
              {currentStep === 2 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-white mb-2">AI Configuration</h3>
                    <p className="text-gray-400">Choose your AI provider and settings</p>
                  </div>

                  {/* AI Provider Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-purple-300 mb-3">
                      AI Provider
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {AI_PROVIDERS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setProvider(p.id)}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            provider === p.id
                              ? 'border-purple-500 bg-purple-900/30'
                              : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                          }`}
                        >
                          <div className="font-semibold text-white mb-1">{p.name}</div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              {p.speed}
                            </span>
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              {p.quality}
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {p.costLevel}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* API Key */}
                  <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useServerKey}
                          onChange={(e) => setUseServerKey(e.target.checked)}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-gray-300">Use server's API key (if configured)</span>
                      </label>

                      {!useServerKey && (
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Enter your API key..."
                          className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white"
                        />
                      )}
                    </div>
                  </div>

                  {/* Estimated Cost */}
                  <div className="p-4 bg-gray-800/50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Estimated Cost:</span>
                      <span className="text-white font-semibold">
                        ${estimatedCost.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Generation Step */}
              {currentStep === 3 && (
                <>
                  {generating ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="w-20 h-20 text-purple-400 mb-4 animate-spin" />
                      <h3 className="text-2xl font-bold text-white mb-2">{currentPhase}</h3>
                      <div className="w-full max-w-md">
                        <div className="bg-gray-800 rounded-full h-4 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-600 to-blue-600 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-center text-gray-400 mt-2">{progress}%</p>
                      </div>

                      {streamingText && (
                        <div className="mt-6 w-full max-w-2xl max-h-64 overflow-y-auto bg-gray-900 rounded-lg p-4 text-sm text-green-400 font-mono">
                          {streamingText}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 max-w-2xl mx-auto">
                      <h3 className="text-2xl font-bold text-white mb-4">Ready to Generate</h3>
                      <p className="text-gray-400 text-center mb-6">
                        Click "Generate Game" below to create your game using AI.
                      </p>

                      <div className="w-full space-y-4 bg-gray-800/50 rounded-lg p-6">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Game Name:</span>
                          <span className="text-white font-semibold">{gameName}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Type:</span>
                          <span className="text-white">{gameType}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">AI Provider:</span>
                          <span className="text-white">{AI_PROVIDERS.find(p => p.id === provider)?.name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Model:</span>
                          <span className="text-white text-xs">{model}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Estimated Cost:</span>
                          <span className="text-green-400 font-semibold">${estimatedCost.toFixed(4)}</span>
                        </div>
                      </div>

                      {error && (
                        <div className="mt-6 flex gap-3">
                          <button
                            onClick={() => setCurrentStep(2)}
                            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                          >
                            Back to Settings
                          </button>
                          <button
                            onClick={() => {
                              setError(null);
                              handleGenerate();
                            }}
                            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Try Again
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Preview Step */}
              {currentStep === 4 && generatedCode && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-bold text-white">Preview Generated Code</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handleRegenerate}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Regenerate
                      </button>
                      <button
                        onClick={handleSaveGame}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                      >
                        <Save className="w-4 h-4" />
                        Save Game
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <pre className="text-sm text-gray-300 font-mono">{generatedCode}</pre>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && currentStep < steps.length - 1 && (
          <div className="px-6 py-4 bg-[#0f172a]/50 border-t border-purple-500/30 flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={currentStep === 0 || generating}
              className="px-6 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>

            <button
              onClick={handleNext}
              disabled={!canProceed() || generating}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center gap-2 shadow-lg shadow-purple-500/50"
            >
              {currentStep === steps.length - 2 ? (
                <>
                  <Wand2 className="w-5 h-5" />
                  Generate Game
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
