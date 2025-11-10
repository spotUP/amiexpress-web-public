import React, { useState, useRef, useEffect } from 'react';
import { Wand2, Send, Loader2, Sparkles, CheckCircle, XCircle, Code, AlertCircle } from 'lucide-react';

interface AIPromptPanelProps {
  selectedDoor: string | null;
  currentFile: { path: string; content: string } | null;
  buildErrors: any[];
  onApplyCode: (code: string, filePath: string) => void;
  onShowDiff: (original: string, suggested: string, filePath: string) => void;
  className?: string;
}

interface AIResponse {
  success: boolean;
  suggestion?: string;
  explanation?: string;
  filesToModify?: Array<{
    path: string;
    originalContent: string;
    suggestedContent: string;
  }>;
  error?: string;
}

export const AIPromptPanel: React.FC<AIPromptPanelProps> = ({
  selectedDoor,
  currentFile,
  buildErrors,
  onApplyCode,
  onShowDiff,
  className = '',
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('openrouter-api-key') || '';
  });
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Save API key to localStorage
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('openrouter-api-key', apiKey);
    }
  }, [apiKey]);

  // Auto-focus textarea when component mounts
  useEffect(() => {
    if (textareaRef.current && !showApiKeyInput) {
      textareaRef.current.focus();
    }
  }, [showApiKeyInput]);

  const handleSubmit = async () => {
    if (!prompt.trim() || !selectedDoor) return;

    if (!apiKey) {
      setShowApiKeyInput(true);
      return;
    }

    setLoading(true);
    setResponse(null);

    try {
      const contextData = {
        doorId: selectedDoor,
        currentFile: currentFile ? {
          path: currentFile.path,
          content: currentFile.content,
        } : null,
        buildErrors: buildErrors,
        prompt: prompt.trim(),
        apiKey: apiKey,
      };

      const res = await fetch('/api/ai-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contextData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to get AI response');
      }

      const data: AIResponse = await res.json();
      setResponse(data);

      // Clear prompt on success
      if (data.success) {
        setPrompt('');
      }
    } catch (error) {
      setResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleApplySuggestion = () => {
    if (!response?.filesToModify || response.filesToModify.length === 0) return;

    // For now, apply to the first file
    const file = response.filesToModify[0];
    onApplyCode(file.suggestedContent, file.path);
    setResponse(null);
  };

  const handleShowDiff = () => {
    if (!response?.filesToModify || response.filesToModify.length === 0) return;

    const file = response.filesToModify[0];
    onShowDiff(file.originalContent, file.suggestedContent, file.path);
  };

  return (
    <div className={`flex flex-col h-full bg-[#1E1E1E] border-t border-gray-700 ${className}`}>
      {/* Header */}
      <div className="bg-[#252526] px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-gray-300">AI Door Assistant</span>
          {selectedDoor && (
            <span className="text-xs text-gray-500">({selectedDoor})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {apiKey ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500">API Key Set</span>
              <button
                onClick={() => setShowApiKeyInput(true)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowApiKeyInput(true)}
              className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300"
            >
              <AlertCircle className="w-4 h-4" />
              Set API Key
            </button>
          )}
        </div>
      </div>

      {/* API Key Input */}
      {showApiKeyInput && (
        <div className="bg-[#252526] px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter OpenRouter API Key (sk-or-...)"
              className="flex-1 bg-[#1E1E1E] border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setShowApiKeyInput(false)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            >
              Save
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Get your free API key at{' '}
            <a
              href="https://openrouter.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              openrouter.ai
            </a>
          </div>
        </div>
      )}

      {/* Response Display */}
      {response && (
        <div className="bg-[#252526] px-4 py-3 border-b border-gray-700 max-h-48 overflow-y-auto">
          {response.success ? (
            <div className="space-y-3">
              {response.explanation && (
                <div className="text-sm text-gray-300">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                    <div>{response.explanation}</div>
                  </div>
                </div>
              )}

              {response.filesToModify && response.filesToModify.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleShowDiff}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                  >
                    <Code className="w-4 h-4" />
                    Show Diff
                  </button>
                  <button
                    onClick={handleApplySuggestion}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Apply Changes
                  </button>
                  <button
                    onClick={() => setResponse(null)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{response.error}</div>
            </div>
          )}
        </div>
      )}

      {/* Prompt Input */}
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedDoor
              ? "Ask AI to improve your door (e.g., 'Add color cycling animation', 'Fix the game loop', 'Optimize performance')...\n\nPress Ctrl+Enter to submit"
              : 'Select a door to start using AI assistance...'
          }
          disabled={!selectedDoor || loading}
          className="flex-1 w-full bg-[#252526] border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none font-mono"
        />

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {currentFile && (
              <span>
                Editing: <span className="text-blue-400">{currentFile.path}</span>
              </span>
            )}
            {buildErrors.length > 0 && (
              <span className="ml-3 text-yellow-400">
                {buildErrors.length} build error{buildErrors.length !== 1 ? 's' : ''} detected
              </span>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!selectedDoor || !prompt.trim() || loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white rounded transition-all duration-200 hover:scale-105 active:scale-95 disabled:hover:scale-100"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send (Ctrl+Enter)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Suggestions */}
      {!loading && !response && selectedDoor && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">Quick actions:</span>
          {buildErrors.length > 0 && (
            <button
              onClick={() => setPrompt('Fix the build errors in this file')}
              className="text-xs px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded transition-colors"
            >
              Fix Build Errors
            </button>
          )}
          <button
            onClick={() => setPrompt('Add comments and improve code documentation')}
            className="text-xs px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded transition-colors"
          >
            Add Comments
          </button>
          <button
            onClick={() => setPrompt('Optimize this code for better performance')}
            className="text-xs px-2 py-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded transition-colors"
          >
            Optimize Code
          </button>
          <button
            onClick={() => setPrompt('Add error handling and validation')}
            className="text-xs px-2 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded transition-colors"
          >
            Add Error Handling
          </button>
        </div>
      )}
    </div>
  );
};
