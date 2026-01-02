import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, CheckCircle, XCircle, Code, History, Trash2, RotateCcw, ChevronDown } from 'lucide-react';
import { SDK_API_URL } from '../utils/api-config';
import { AppSettings } from '../types';

interface AIPromptPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  selectedDoor: string | null;
  currentFile: { path: string; content: string } | null;
  buildErrors: any[];
  onApplyCode: (code: string, filePath: string) => void;
  onShowDiff: (original: string, suggested: string, filePath: string, explanation?: string) => void;
  onAIOutput?: (text: string) => void;
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

interface ConversationEntry {
  id: string;
  timestamp: number;
  doorId: string;
  prompt: string;
  response: AIResponse;
  filePath?: string;
}

export const AIPromptPanel: React.FC<AIPromptPanelProps> = ({
  settings,
  onSettingsChange,
  selectedDoor,
  currentFile,
  buildErrors,
  onApplyCode,
  onShowDiff,
  onAIOutput,
  className = '',
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(settings.aiModel || 'meta-llama/llama-4-maverick:free');
  const [loadingModels, setLoadingModels] = useState(false);
  const [progressDots, setProgressDots] = useState('');
  
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>(() => {
    const stored = localStorage.getItem('ai-conversation-history');
    return stored ? JSON.parse(stored) : [];
  });
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const progressInterval = useRef<any>(null);

  // Sync selected model back to settings
  useEffect(() => {
    if (selectedModel && selectedModel !== settings.aiModel) {
      onSettingsChange({ ...settings, aiModel: selectedModel });
    }
  }, [selectedModel]);

  // Get API key for the current provider
  const getApiKey = () => {
    const savedKeys = JSON.parse(localStorage.getItem('ai_api_keys') || '{}');
    if (settings.aiProvider === 'openrouter' && !savedKeys.openrouter) {
      return localStorage.getItem('openrouter-api-key') || '';
    }
    return savedKeys[settings.aiProvider] || '';
  };

  // Load models when provider or settings change
  useEffect(() => {
    const fetchModels = async () => {
      if (settings.aiProvider === 'openrouter') {
        setLoadingModels(true);
        try {
          const res = await fetch(`${SDK_API_URL}/api/ai-models/openrouter/free?reasoning=${settings.useReasoningModels}`);
          if (res.ok) {
            const data = await res.json();
            setModels(data);
            if (data.length > 0 && !data.includes(selectedModel)) {
              setSelectedModel(data[0]);
            }
          }
        } catch (error) {
          console.error('Failed to fetch models:', error);
        } finally {
          setLoadingModels(false);
        }
      } else {
        setModels([]);
      }
    };

    fetchModels();
  }, [settings.aiProvider, settings.aiFreeModelsOnly, settings.useReasoningModels]);

  // Update selected model when settings change (if not openrouter)
  useEffect(() => {
    if (settings.aiProvider !== 'openrouter') {
      setSelectedModel(settings.aiModel);
    }
  }, [settings.aiModel, settings.aiProvider]);

  // Save conversation history to localStorage
  useEffect(() => {
    localStorage.setItem('ai-conversation-history', JSON.stringify(conversationHistory));
  }, [conversationHistory]);

  // Auto-focus textarea when component mounts
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Handle dots animation
  useEffect(() => {
    if (loading) {
      progressInterval.current = setInterval(() => {
        setProgressDots(prev => prev.length >= 20 ? '.' : prev + '.');
      }, 200);
    } else {
      if (progressInterval.current) clearInterval(progressInterval.current);
      setProgressDots('');
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [loading]);

  const handleSubmit = async () => {
    if (!prompt.trim() || !selectedDoor) return;

    const apiKey = getApiKey();
    if (!apiKey && settings.aiProvider !== 'ollama') {
      alert(`Please set your API key for ${settings.aiProvider} in Settings.`);
      return;
    }

    setLoading(true);
    setResponse(null);

    // Send to AI tab
    if (onAIOutput) {
      onAIOutput(`\x1b[36m[USER]\x1b[0m ${prompt.trim()}`);
      onAIOutput(`\x1b[90m[SYSTEM] Calling ${settings.aiProvider} with model ${selectedModel}...\x1b[0m`);
    }

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
        provider: settings.aiProvider,
        model: selectedModel,
      };

      const res = await fetch(`${SDK_API_URL}/api/ai-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contextData),
      });

      if (!res.ok) {
        let errorMsg = 'Failed to get AI response';
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      const data: AIResponse = await res.json();
      setResponse(data);

      if (onAIOutput) {
        if (data.success) {
          onAIOutput(`\x1b[32m[AI EXPLANATION]\x1b[0m ${data.explanation}`);
          if (data.filesToModify && data.filesToModify.length > 0) {
            onAIOutput(`\x1b[32m[AI SUGGESTION]\x1b[0m Suggested changes for ${data.filesToModify[0].path}`);
          }
        } else {
          onAIOutput(`\x1b[31m[AI ERROR]\x1b[0m ${data.error}`);
        }
      }

      // Save to conversation history
      if (selectedDoor) {
        const entry: ConversationEntry = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          doorId: selectedDoor,
          prompt: prompt.trim(),
          response: data,
          filePath: currentFile?.path,
        };
        setConversationHistory((prev) => [entry, ...prev].slice(0, 50));
      }

      // Clear prompt on success
      if (data.success) {
        setPrompt('');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setResponse({
        success: false,
        error: errorMsg,
      });
      if (onAIOutput) {
        onAIOutput(`\x1b[31m[AI ERROR]\x1b[0m ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleApplySuggestion = () => {
    if (!response?.filesToModify || response.filesToModify.length === 0) return;
    const file = response.filesToModify[0];
    onApplyCode(file.suggestedContent, file.path);
    setResponse(null);
  };

  const handleShowDiff = () => {
    if (!response?.filesToModify || response.filesToModify.length === 0) return;
    const file = response.filesToModify[0];
    onShowDiff(file.originalContent, file.suggestedContent, file.path, response.explanation);
  };

  const handleRerunPrompt = (entry: ConversationEntry) => {
    setPrompt(entry.prompt);
    setShowHistory(false);
    textareaRef.current?.focus();
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all conversation history? This cannot be undone.')) {
      setConversationHistory([]);
    }
  };

  const filteredHistory = selectedDoor
    ? conversationHistory.filter((entry) => entry.doorId === selectedDoor)
    : conversationHistory;

  return (
    <div className={`flex h-full bg-[#1E1E1E] border-t border-gray-700 ${className}`}>
      <div className="flex-1 flex flex-col min-w-0">
      <div className="bg-[#252526] px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-gray-300">AI Assistant</span>
          {selectedDoor && (
            <span className="text-xs text-gray-500">({selectedDoor})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {settings.aiProvider === 'openrouter' && models.length > 0 && (
            <div className="relative group">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none bg-[#1E1E1E] border border-gray-700 rounded px-2 py-1 pr-6 text-xs text-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {models.map(m => (
                  <option key={m} value={m}>{m.split('/').pop()}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-gray-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}
          
          {loadingModels && (
            <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />
          )}

          <div className="h-4 w-px bg-gray-700 mx-1" />

          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${showHistory ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            title="Conversation History"
          >
            <History className="w-3 h-3" />
            <span className="hidden sm:inline">History</span>
            {filteredHistory.length > 0 && (
              <span className="ml-1 px-1 bg-gray-800 rounded text-xs">{filteredHistory.length}</span>
            )}
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-[#252526] px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
            <div className="flex-1 flex items-center gap-1">
              <span className="text-xs font-mono text-purple-400">Thinking</span>
              <span className="text-xs font-mono text-purple-400">{progressDots}</span>
            </div>
          </div>
        </div>
      )}

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

      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedDoor
              ? "Ask AI to improve your door...\n\nPress Ctrl+Enter to submit"
              : 'Select a door to start using AI assistance...'
          }
          disabled={!selectedDoor || loading}
          className="flex-1 w-full bg-[#252526] border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none font-mono"
        />

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 flex flex-col gap-1">
            {currentFile && (
              <span>
                Editing: <span className="text-blue-400">{currentFile.path}</span>
              </span>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Provider: <span className="text-purple-400 font-medium capitalize">{settings.aiProvider}</span></span>
              <span className="text-gray-400">Model: <span className="text-blue-400 font-medium">{(selectedModel || '').split('/').pop()}</span></span>
            </div>
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

      {!loading && !response && selectedDoor && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">Quick actions:</span>
          {buildErrors.length > 0 && (
            <button
              onClick={() => { setPrompt('Fix the build errors in this file'); }}
              className="text-xs px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded transition-colors"
            >
              Fix Build Errors
            </button>
          )}
          <button
            onClick={() => { setPrompt('Add comments and improve code documentation'); }}
            className="text-xs px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded transition-colors"
          >
            Add Comments
          </button>
          <button
            onClick={() => { setPrompt('Optimize this code for better performance'); }}
            className="text-xs px-2 py-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded transition-colors"
          >
            Optimize Code
          </button>
          <button
            onClick={() => { setPrompt('Add error handling and validation'); }}
            className="text-xs px-2 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded transition-colors"
          >
            Add Error Handling
          </button>
        </div>
      )}
      </div>

      {showHistory && (
        <div className="w-80 border-l border-gray-700 bg-[#252526] flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <span className="text-sm font-medium text-white">Conversation History</span>
            {conversationHistory.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
                title="Clear history"
              >
                <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-400" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filteredHistory.length === 0 ? (
              <div className="text-center text-gray-500 text-sm mt-8">
                No conversation history yet.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-[#1E1E1E] rounded p-3 border border-gray-700 hover:border-blue-600 transition-colors cursor-pointer group"
                    onClick={() => handleRerunPrompt(entry)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-500 mb-1">
                          {new Date(entry.timestamp).toLocaleString()}
                        </div>
                        {entry.filePath && (
                          <div className="text-xs text-blue-400 mb-1 truncate">
                            {entry.filePath}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRerunPrompt(entry); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-700 rounded"
                        title="Rerun this prompt"
                      >
                        <RotateCcw className="w-3 h-3 text-blue-400" />
                      </button>
                    </div>
                    <div className="text-sm text-gray-300 line-clamp-3">
                      {entry.prompt}
                    </div>
                    {entry.response.success && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle className="w-3 h-3" />
                        <span>Success</span>
                      </div>
                    )}
                    {!entry.response.success && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-red-400">
                        <XCircle className="w-3 h-3" />
                        <span>Error</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
