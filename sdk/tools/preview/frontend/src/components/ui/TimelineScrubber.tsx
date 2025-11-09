import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Download, Trash2, RefreshCw } from 'lucide-react';

export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: 'input' | 'output' | 'action' | 'error';
  data: any;
  duration?: number;
}

interface TimelineScrubberProps {
  events: TimelineEvent[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onSeek: (time: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onSpeedChange: (speed: number) => void;
  onExport: () => void;
  onClear: () => void;
  className?: string;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  events,
  currentTime,
  duration,
  isPlaying,
  playbackSpeed,
  onSeek,
  onPlay,
  onPause,
  onSpeedChange,
  onExport,
  onClear,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleSeek(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      handleSeek(e);
    }

    // Check if hovering over event marker
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const hoveredTime = (x / rect.width) * duration;

    const event = events.find(
      e => Math.abs(e.timestamp - hoveredTime) < duration * 0.01
    );
    setHoveredEvent(event || null);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    onSeek(newTime);
  };

  const skipBackward = () => {
    onSeek(Math.max(0, currentTime - 5000));
  };

  const skipForward = () => {
    onSeek(Math.min(duration, currentTime + 5000));
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'input': return '#3B82F6'; // blue
      case 'output': return '#10B981'; // green
      case 'action': return '#8B5CF6'; // purple
      case 'error': return '#EF4444'; // red
      default: return '#6B7280'; // gray
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const currentPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`bg-[#1E1E1E] border-t border-gray-700 ${className}`}>
      {/* Controls */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-700">
        <button
          onClick={skipBackward}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          title="Skip back 5s"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          onClick={isPlaying ? onPause : onPlay}
          className={`p-2 rounded transition-all ${
            isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <button
          onClick={skipForward}
          className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          title="Skip forward 5s"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-gray-700" />

        {/* Time display */}
        <div className="text-sm font-mono text-gray-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Speed control */}
        <select
          value={playbackSpeed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
        >
          <option value="0.25">0.25x</option>
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
          <option value="4">4x</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowEventDetails(!showEventDetails)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Toggle event details"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={onExport}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Export recording"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={onClear}
            className="p-1.5 hover:bg-red-700 rounded transition-colors text-red-400"
            title="Clear timeline"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-3">
        <div
          ref={timelineRef}
          className="relative h-12 bg-gray-800 rounded cursor-pointer"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Progress bar */}
          <div
            className="absolute inset-y-0 left-0 bg-blue-600/30"
            style={{ width: `${currentPercentage}%` }}
          />

          {/* Event markers */}
          {events.map((event) => {
            const position = duration > 0 ? (event.timestamp / duration) * 100 : 0;
            return (
              <div
                key={event.id}
                className="absolute top-0 bottom-0 w-1 hover:w-2 transition-all"
                style={{
                  left: `${position}%`,
                  backgroundColor: getEventColor(event.type),
                  opacity: hoveredEvent?.id === event.id ? 1 : 0.7,
                }}
                title={`${event.type} at ${formatTime(event.timestamp)}`}
              />
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
            style={{ left: `${currentPercentage}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-lg" />
          </div>

          {/* Hover tooltip */}
          {hoveredEvent && (
            <div className="absolute -top-12 left-0 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs whitespace-nowrap shadow-xl z-10">
              <span className="font-semibold">{hoveredEvent.type}</span>
              {' at '}
              <span className="font-mono">{formatTime(hoveredEvent.timestamp)}</span>
            </div>
          )}
        </div>

        {/* Event legend */}
        {showEventDetails && (
          <div className="flex gap-4 mt-3 text-xs">
            {[
              { type: 'input', label: 'Input', count: events.filter(e => e.type === 'input').length },
              { type: 'output', label: 'Output', count: events.filter(e => e.type === 'output').length },
              { type: 'action', label: 'Action', count: events.filter(e => e.type === 'action').length },
              { type: 'error', label: 'Error', count: events.filter(e => e.type === 'error').length },
            ].map(({ type, label, count }) => (
              <div key={type} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: getEventColor(type) }}
                />
                <span className="text-gray-400">
                  {label}: <span className="text-white font-semibold">{count}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelineScrubber;
