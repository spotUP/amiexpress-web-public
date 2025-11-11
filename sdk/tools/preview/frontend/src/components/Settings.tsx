import React, { useState, useEffect } from 'react';
import { X, Monitor, Type, Keyboard, Key, Eye, EyeOff, Check, Zap } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClose: () => void;
  className?: string;
}

export const Settings: React.FC<SettingsProps> = ({
  settings,
  onSettingsChange,
  onClose,
  className = '',
}) => {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savedNotification, setSavedNotification] = useState(false);
  const [quickConnect, setQuickConnect] = useState(false);
  const [bbsUsername, setBbsUsername] = useState('');
  const [bbsPassword, setBbsPassword] = useState('');
  const [showBbsPassword, setShowBbsPassword] = useState(false);

  useEffect(() => {
    // Load saved API keys
    const saved = localStorage.getItem('ai_api_keys');
    if (saved) {
      setApiKeys(JSON.parse(saved));
    }

    // Load Quick Connect setting and credentials
    const autoLoginEnabled = localStorage.getItem('bbs_auto_login_enabled') === 'true';
    setQuickConnect(autoLoginEnabled);

    const savedUsername = localStorage.getItem('bbs_saved_username');
    const savedPassword = localStorage.getItem('bbs_saved_password');
    if (savedUsername) {
      setBbsUsername(atob(savedUsername));
    }
    if (savedPassword) {
      setBbsPassword(atob(savedPassword));
    }
  }, []);

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const handleAPIKeyChange = (provider: string, value: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const saveAPIKeys = () => {
    localStorage.setItem('ai_api_keys', JSON.stringify(apiKeys));
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 2000);
  };

  const toggleQuickConnect = () => {
    const newValue = !quickConnect;
    setQuickConnect(newValue);
    localStorage.setItem('bbs_auto_login_enabled', String(newValue));

    // If enabling, save current credentials
    if (newValue && bbsUsername && bbsPassword) {
      localStorage.setItem('bbs_saved_username', btoa(bbsUsername));
      localStorage.setItem('bbs_saved_password', btoa(bbsPassword));
    }

    // If disabling, clear saved credentials
    if (!newValue) {
      localStorage.removeItem('bbs_saved_username');
      localStorage.removeItem('bbs_saved_password');
    }
  };

  const handleSaveCredentials = () => {
    if (bbsUsername && bbsPassword) {
      localStorage.setItem('bbs_saved_username', btoa(bbsUsername));
      localStorage.setItem('bbs_saved_password', btoa(bbsPassword));
      setSavedNotification(true);
      setTimeout(() => setSavedNotification(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        className={`bg-[#1E1E1E] rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] space-y-6">
          {/* BBS Connection */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">BBS Connection</h3>
            </div>

            <div className="space-y-4 ml-7">
              {/* Credentials Section */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    BBS Username
                  </label>
                  <input
                    type="text"
                    value={bbsUsername}
                    onChange={(e) => setBbsUsername(e.target.value)}
                    placeholder="Enter your BBS username"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    BBS Password
                  </label>
                  <div className="relative">
                    <input
                      type={showBbsPassword ? 'text' : 'password'}
                      value={bbsPassword}
                      onChange={(e) => setBbsPassword(e.target.value)}
                      placeholder="Enter your BBS password"
                      className="w-full px-4 py-2 pr-10 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBbsPassword(!showBbsPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                    >
                      {showBbsPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveCredentials}
                  disabled={!bbsUsername || !bbsPassword}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors text-sm"
                >
                  {savedNotification ? (
                    <>
                      <Check className="w-4 h-4" />
                      Saved!
                    </>
                  ) : (
                    'Save Credentials'
                  )}
                </button>
              </div>

              {/* Quick Connect Toggle */}
              <div className="pt-3 border-t border-gray-700">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                      Quick Connect (Auto-Login)
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Automatically log into the BBS tab with saved credentials
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleQuickConnect}
                    disabled={!bbsUsername || !bbsPassword}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed ${
                      quickConnect ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        quickConnect ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>

              {quickConnect && (
                <div className="bg-yellow-900/20 border border-yellow-600/30 rounded p-3 text-xs text-yellow-400">
                  <strong>⚠ Security Note:</strong> Your credentials are stored locally in your browser. Only enable this on trusted devices.
                </div>
              )}
            </div>
          </section>

          {/* Appearance */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Monitor className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Appearance</h3>
            </div>

            <div className="space-y-4 ml-7">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Application Theme
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateSetting('theme', 'dark')}
                    className={`flex-1 px-3 py-2 rounded border transition-colors ${
                      settings.theme === 'dark'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => updateSetting('theme', 'light')}
                    className={`flex-1 px-3 py-2 rounded border transition-colors ${
                      settings.theme === 'light'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    Light
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Editor Theme
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateSetting('editorTheme', 'vs-dark')}
                    className={`flex-1 px-3 py-2 rounded border transition-colors ${
                      settings.editorTheme === 'vs-dark'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => updateSetting('editorTheme', 'vs-light')}
                    className={`flex-1 px-3 py-2 rounded border transition-colors ${
                      settings.editorTheme === 'vs-light'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    Light
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Typography */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Type className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Typography</h3>
            </div>

            <div className="space-y-4 ml-7">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Terminal Font Size: {settings.terminalFontSize}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="24"
                  step="1"
                  value={settings.terminalFontSize}
                  onChange={(e) =>
                    updateSetting('terminalFontSize', parseInt(e.target.value))
                  }
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Editor Font Size: {settings.editorFontSize}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="24"
                  step="1"
                  value={settings.editorFontSize}
                  onChange={(e) =>
                    updateSetting('editorFontSize', parseInt(e.target.value))
                  }
                  className="w-full"
                />
              </div>
            </div>
          </section>

          {/* Editor Options */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Keyboard className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Editor Options</h3>
            </div>

            <div className="space-y-3 ml-7">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoScroll}
                  onChange={(e) => updateSetting('autoScroll', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-300">
                  Auto-scroll terminal output
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showLineNumbers}
                  onChange={(e) =>
                    updateSetting('showLineNumbers', e.target.checked)
                  }
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-300">
                  Show line numbers in editor
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableKeyboardShortcuts}
                  onChange={(e) =>
                    updateSetting('enableKeyboardShortcuts', e.target.checked)
                  }
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-300">
                  Enable keyboard shortcuts
                </span>
              </label>
            </div>
          </section>

          {/* Playback Speed */}
          <section>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white">Playback</h3>
            </div>

            <div className="space-y-4 ml-7">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Default Playback Speed: {settings.playbackSpeed}x
                </label>
                <div className="flex gap-2">
                  {[0.5, 1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => updateSetting('playbackSpeed', speed)}
                      className={`px-3 py-2 rounded border transition-colors ${
                        settings.playbackSpeed === speed
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* AI API Keys */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">AI API Keys</h3>
            </div>

            <div className="ml-7 space-y-4">
              <p className="text-sm text-gray-400 mb-4">
                Configure API keys for AI-powered game generation. Keys are stored locally in your browser.
              </p>

              {[
                { id: 'claude', name: 'Claude (Anthropic)', placeholder: 'sk-ant-...' },
                { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
                { id: 'gemini', name: 'Google Gemini', placeholder: 'AIza...' },
                { id: 'ollama', name: 'Ollama URL', placeholder: 'http://localhost:11434' },
              ].map(({ id, name, placeholder }) => (
                <div key={id}>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {name}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKeys[id] ? 'text' : 'password'}
                        value={apiKeys[id] || ''}
                        onChange={(e) => handleAPIKeyChange(id, e.target.value)}
                        placeholder={placeholder}
                        className="w-full px-4 py-2 pr-10 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        onClick={() => toggleShowKey(id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                      >
                        {showKeys[id] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={saveAPIKeys}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                {savedNotification ? (
                  <>
                    <Check className="w-4 h-4" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    Save API Keys
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Keyboard Shortcuts Reference */}
          {settings.enableKeyboardShortcuts && (
            <section>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Keyboard Shortcuts
                </h3>
              </div>

              <div className="ml-7 bg-gray-800 rounded p-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-400">Ctrl+S</div>
                  <div className="text-gray-300">Take screenshot</div>

                  <div className="text-gray-400">Ctrl+R</div>
                  <div className="text-gray-300">Record session</div>

                  <div className="text-gray-400">Ctrl+Shift+S</div>
                  <div className="text-gray-300">Save file</div>

                  <div className="text-gray-400">Ctrl+B</div>
                  <div className="text-gray-300">Build door</div>

                  <div className="text-gray-400">Ctrl+Shift+T</div>
                  <div className="text-gray-300">Toggle theme</div>

                  <div className="text-gray-400">Ctrl+`</div>
                  <div className="text-gray-300">Toggle console</div>

                  <div className="text-gray-400">Ctrl+F</div>
                  <div className="text-gray-300">Search files</div>

                  <div className="text-gray-400">Ctrl+,</div>
                  <div className="text-gray-300">Open settings</div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
