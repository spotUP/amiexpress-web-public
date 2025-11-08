import React from 'react';
import { X, Monitor, Type, Keyboard } from 'lucide-react';
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
  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
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
