import React, { useState, useRef } from 'react';
import {
  Circle,
  Square,
  Play,
  Pause,
  SkipBack,
  Download,
  Upload,
  FileText,
} from 'lucide-react';
import {
  SessionRecorder as Recorder,
  SessionRecording,
  PlaybackController,
  exportRecording,
  exportRecordingAsText,
  importRecording,
} from '../utils/sessionRecording';
import { formatDuration } from '../utils/format';

interface SessionRecorderProps {
  recorder: Recorder;
  doorName: string;
  onPlaybackEvent?: (event: any) => void;
  className?: string;
}

export const SessionRecorder: React.FC<SessionRecorderProps> = ({
  recorder,
  doorName,
  onPlaybackEvent,
  className = '',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<SessionRecording | null>(null);
  const [playbackController] = useState(() => new PlaybackController());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStartRecording = () => {
    recorder.startRecording(doorName);
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    const recording = recorder.stopRecording();
    setIsRecording(false);
    if (recording) {
      setCurrentRecording(recording);
    }
  };

  const handlePlay = () => {
    if (!currentRecording) return;

    if (isPlaying) {
      playbackController.pause();
      setIsPlaying(false);
    } else {
      playbackController.loadRecording(currentRecording);
      playbackController.setSpeed(playbackSpeed);
      playbackController.play(
        (event) => {
          onPlaybackEvent?.(event);
          setCurrentTime(event.timestamp);
        },
        () => {
          setIsPlaying(false);
          setCurrentTime(0);
        }
      );
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    playbackController.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    playbackController.setSpeed(speed);
  };

  const handleExportJSON = () => {
    if (currentRecording) {
      exportRecording(currentRecording);
    }
  };

  const handleExportText = () => {
    if (currentRecording) {
      exportRecordingAsText(currentRecording);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const recording = await importRecording(file);
    if (recording) {
      setCurrentRecording(recording);
    }
  };

  const duration = currentRecording
    ? currentRecording.endTime - currentRecording.startTime
    : 0;

  return (
    <div className={`bg-[#1E1E1E] border-t border-gray-700 ${className}`}>
      <div className="p-3 flex items-center gap-3">
        {/* Recording controls */}
        <div className="flex items-center gap-2">
          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              title="Start recording (Ctrl+R)"
            >
              <Circle className="w-4 h-4" />
              <span className="text-sm">Record</span>
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded transition-colors animate-pulse"
            >
              <Square className="w-4 h-4 fill-current" />
              <span className="text-sm">Stop</span>
            </button>
          )}
        </div>

        {/* Playback controls */}
        {currentRecording && (
          <>
            <div className="h-6 w-px bg-gray-700" />

            <div className="flex items-center gap-2">
              <button
                onClick={handlePlay}
                disabled={isRecording}
                className="p-1.5 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>

              <button
                onClick={handleStop}
                disabled={isRecording || !isPlaying}
                className="p-1.5 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                title="Stop"
              >
                <SkipBack className="w-4 h-4" />
              </button>
            </div>

            {/* Speed controls */}
            <div className="flex items-center gap-1">
              {[0.5, 1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatDuration(currentTime)}
              </span>
              <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatDuration(duration)}
              </span>
            </div>

            {/* Export controls */}
            <div className="h-6 w-px bg-gray-700" />

            <button
              onClick={handleExportJSON}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="Export as JSON"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={handleExportText}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="Export as text"
            >
              <FileText className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Import */}
        <div className="h-6 w-px bg-gray-700" />

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          title="Import recording"
        >
          <Upload className="w-4 h-4" />
        </button>

        {/* Status */}
        {isRecording && (
          <div className="ml-auto flex items-center gap-2 text-red-400">
            <Circle className="w-3 h-3 fill-current animate-pulse" />
            <span className="text-sm font-medium">Recording...</span>
          </div>
        )}

        {currentRecording && !isRecording && (
          <div className="ml-auto text-xs text-gray-400">
            {currentRecording.events.length} events · {formatDuration(duration)}
          </div>
        )}
      </div>
    </div>
  );
};
