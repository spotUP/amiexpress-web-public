import React, { useState } from 'react';
import { Camera, Download, X } from 'lucide-react';
import { captureScreenshot, captureScreenshotPreview } from '../utils/screenshot';

interface ScreenshotCaptureProps {
  targetElement: HTMLElement | null;
  doorName?: string;
  onCapture?: (dataUrl: string) => void;
  className?: string;
}

export const ScreenshotCapture: React.FC<ScreenshotCaptureProps> = ({
  targetElement,
  doorName = 'door',
  onCapture,
  className = '',
}) => {
  const [capturing, setCapturing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleCapture = async () => {
    if (!targetElement) return;

    setCapturing(true);

    try {
      // Capture preview
      const preview = await captureScreenshotPreview(targetElement);
      if (preview) {
        setPreviewUrl(preview);
        onCapture?.(preview);
      }
    } catch (error) {
      console.error('Screenshot capture failed:', error);
    } finally {
      setCapturing(false);
    }
  };

  const handleDownload = async () => {
    if (!targetElement) return;

    await captureScreenshot({
      element: targetElement,
      doorName,
    });

    setPreviewUrl(null);
  };

  const handleClose = () => {
    setPreviewUrl(null);
  };

  return (
    <>
      <button
        onClick={handleCapture}
        disabled={!targetElement || capturing}
        className={`flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors ${className}`}
        title="Capture screenshot (Ctrl+S)"
      >
        <Camera className="w-4 h-4" />
        <span className="hidden sm:inline">Screenshot</span>
      </button>

      {/* Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#1E1E1E] rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">Screenshot Preview</h3>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview */}
            <div className="p-4 overflow-auto max-h-[calc(90vh-120px)]">
              <img
                src={previewUrl}
                alt="Screenshot preview"
                className="w-full h-auto rounded border border-gray-700"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-gray-700">
              <span className="text-sm text-gray-400">
                {doorName} - {new Date().toLocaleString()}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
