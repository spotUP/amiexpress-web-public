import React, { useState } from 'react';
import { Wand2, Loader2, CheckCircle, XCircle, ChevronRight, Sparkles } from 'lucide-react';

interface GameWizardProps {
  onClose: () => void;
  onGameCreated: (doorId: string) => void;
  className?: string;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
}

const steps: WizardStep[] = [
  {
    id: 'concept',
    title: 'Game Concept',
    description: 'Describe your game idea',
  },
  {
    id: 'features',
    title: 'Features & Mechanics',
    description: 'What should the game include?',
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Configure your game',
  },
  {
    id: 'generate',
    title: 'Generate',
    description: 'AI will create your game',
  },
];

export const GameWizard: React.FC<GameWizardProps> = ({
  onClose,
  onGameCreated,
  className = '',
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form data
  const [gameName, setGameName] = useState('');
  const [gameDescription, setGameDescription] = useState('');
  const [gameType, setGameType] = useState('adventure');
  const [features, setFeatures] = useState<string[]>([]);
  const [customFeature, setCustomFeature] = useState('');
  const [apiKey, setApiKey] = useState(localStorage.getItem('claude_api_key') || '');
  const [useLocalKey, setUseLocalKey] = useState(!!apiKey);

  const availableFeatures = [
    'Turn-based combat',
    'Inventory system',
    'NPC dialogue',
    'Quest system',
    'Leaderboards',
    'Save/Load game',
    'Multiplayer',
    'Achievements',
    'Sound effects',
    'Animated graphics',
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleGenerate();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const toggleFeature = (feature: string) => {
    setFeatures((prev) =>
      prev.includes(feature)
        ? prev.filter((f) => f !== feature)
        : [...prev, feature]
    );
  };

  const addCustomFeature = () => {
    if (customFeature && !features.includes(customFeature)) {
      setFeatures((prev) => [...prev, customFeature]);
      setCustomFeature('');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      // Save API key to localStorage if provided
      if (useLocalKey && apiKey) {
        localStorage.setItem('claude_api_key', apiKey);
      }

      const response = await fetch('/api/games/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: gameName,
          description: gameDescription,
          type: gameType,
          features,
          apiKey: useLocalKey ? apiKey : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate game');
      }

      const result = await response.json();
      setSuccess(true);

      // Wait a moment to show success, then notify parent
      setTimeout(() => {
        onGameCreated(result.doorId);
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'An error occurred while generating the game');
      setGenerating(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return gameName.trim().length > 0 && gameDescription.trim().length > 10;
      case 1:
        return features.length > 0;
      case 2:
        return !useLocalKey || apiKey.trim().length > 0;
      default:
        return true;
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 ${className}`}>
      <div className="bg-[#1E1E1E] rounded-lg border border-gray-700 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 to-blue-900 px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wand2 className="w-6 h-6 text-purple-300" />
              <h2 className="text-2xl font-bold text-white">AI Game Wizard</h2>
              <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Progress steps */}
        <div className="px-6 py-4 bg-[#252526] border-b border-gray-700">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                      index <= currentStep
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <span className="text-xs text-gray-400 mt-2 text-center max-w-[80px]">
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight className="w-5 h-5 text-gray-600 mx-2" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[50vh]">
          {error && (
            <div className="mb-4 p-4 bg-red-900 bg-opacity-30 border border-red-700 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-20 h-20 text-green-400 mb-4" />
              <h3 className="text-2xl font-bold text-white mb-2">Game Created!</h3>
              <p className="text-gray-400">Your game is ready to preview...</p>
            </div>
          )}

          {!success && (
            <>
              {/* Step 0: Game Concept */}
              {currentStep === 0 && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      Game Name *
                    </label>
                    <input
                      type="text"
                      value={gameName}
                      onChange={(e) => setGameName(e.target.value)}
                      placeholder="e.g., Space Adventure"
                      className="w-full px-4 py-2 bg-[#252526] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      Description *
                    </label>
                    <textarea
                      value={gameDescription}
                      onChange={(e) => setGameDescription(e.target.value)}
                      placeholder="Describe your game idea in detail... What's the story? What does the player do?"
                      rows={6}
                      className="w-full px-4 py-2 bg-[#252526] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {gameDescription.length} characters (minimum 10)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      Game Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {['adventure', 'rpg', 'puzzle', 'arcade', 'strategy', 'trivia'].map((type) => (
                        <button
                          key={type}
                          onClick={() => setGameType(type)}
                          className={`px-4 py-3 rounded-lg font-medium transition-all ${
                            gameType === type
                              ? 'bg-purple-600 text-white'
                              : 'bg-[#252526] text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1: Features */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-3">
                      Select Features *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {availableFeatures.map((feature) => (
                        <button
                          key={feature}
                          onClick={() => toggleFeature(feature)}
                          className={`px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${
                            features.includes(feature)
                              ? 'bg-purple-600 text-white'
                              : 'bg-[#252526] text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {feature}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                      Add Custom Feature
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customFeature}
                        onChange={(e) => setCustomFeature(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addCustomFeature()}
                        placeholder="e.g., Weather system"
                        className="flex-1 px-4 py-2 bg-[#252526] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        onClick={addCustomFeature}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {features.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-400 mb-2">
                        Selected features ({features.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {features.map((feature) => (
                          <span
                            key={feature}
                            className="px-3 py-1 bg-purple-900 bg-opacity-40 text-purple-300 rounded-full text-xs"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Settings */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="p-4 bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg">
                    <h4 className="font-semibold text-blue-300 mb-2">Claude AI Configuration</h4>
                    <p className="text-sm text-gray-400 mb-4">
                      This wizard uses Claude AI to generate your game. You can either provide your own API key
                      or use the server's configured key (if available).
                    </p>

                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useLocalKey}
                          onChange={(e) => setUseLocalKey(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-600 bg-[#252526] text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-gray-300">Use my own API key</span>
                      </label>

                      {useLocalKey && (
                        <div>
                          <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="sk-ant-..."
                            className="w-full px-4 py-2 bg-[#252526] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Your API key will be stored locally in your browser
                          </p>
                          <a
                            href="https://console.anthropic.com/settings/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-400 hover:text-purple-300 mt-1 inline-block"
                          >
                            Get an API key from Anthropic →
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-gray-800 bg-opacity-50 border border-gray-700 rounded-lg">
                    <h4 className="font-semibold text-gray-300 mb-2">Summary</h4>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-gray-400">Name:</dt>
                        <dd className="text-white font-medium">{gameName}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-400">Type:</dt>
                        <dd className="text-white capitalize">{gameType}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-400">Features:</dt>
                        <dd className="text-white">{features.length}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}

              {/* Step 3: Generate */}
              {currentStep === 3 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-20 h-20 text-purple-400 mb-4 animate-spin" />
                  <h3 className="text-2xl font-bold text-white mb-2">Generating Your Game...</h3>
                  <p className="text-gray-400 text-center max-w-md">
                    Claude AI is crafting your game based on your specifications.
                    This may take a minute or two.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-6 py-4 bg-[#252526] border-t border-gray-700 flex items-center justify-between">
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
              className="px-8 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center gap-2"
            >
              {currentStep === steps.length - 1 ? (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate Game
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
