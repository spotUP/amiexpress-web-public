import React, { useRef, useEffect, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface MinimapProps {
  content: string;
  currentLine?: number;
  onLineClick?: (line: number) => void;
  width?: number;
  className?: string;
}

export const CodeMinimap: React.FC<MinimapProps> = ({
  content,
  currentLine = 0,
  onLineClick,
  width = 120,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const lines = content.split('\n');
  const totalLines = lines.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const height = canvas.height;
    const lineHeight = Math.max(1, height / totalLines);

    // Clear canvas
    ctx.fillStyle = '#1E1E1E';
    ctx.fillRect(0, 0, width, height);

    // Draw lines
    lines.forEach((line, index) => {
      const y = index * lineHeight;
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        // Empty line - darker gray
        ctx.fillStyle = '#2A2A2A';
      } else if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
        // Comment - green
        ctx.fillStyle = '#6A9955';
      } else if (trimmedLine.startsWith('import') || trimmedLine.startsWith('export')) {
        // Import/export - purple
        ctx.fillStyle = '#C586C0';
      } else if (trimmedLine.includes('function') || trimmedLine.includes('class')) {
        // Function/class - yellow
        ctx.fillStyle = '#DCDCAA';
      } else if (trimmedLine.includes('const') || trimmedLine.includes('let') || trimmedLine.includes('var')) {
        // Variables - light blue
        ctx.fillStyle = '#9CDCFE';
      } else {
        // Regular code - blue
        ctx.fillStyle = '#569CD6';
      }

      // Draw line representation
      const opacity = Math.min(1, trimmedLine.length / 80);
      ctx.globalAlpha = opacity;
      ctx.fillRect(0, y, width * (trimmedLine.length / 120), Math.max(1, lineHeight));
      ctx.globalAlpha = 1;
    });

    // Highlight current line
    if (currentLine >= 0 && currentLine < totalLines) {
      const y = currentLine * lineHeight;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.fillRect(0, y, width, Math.max(2, lineHeight * 3));

      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, y, width, Math.max(2, lineHeight * 3));
    }

    // Highlight hovered line
    if (hoveredLine !== null && hoveredLine >= 0 && hoveredLine < totalLines) {
      const y = hoveredLine * lineHeight;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, y, width, Math.max(1, lineHeight));
    }
  }, [content, currentLine, hoveredLine, lines, totalLines, width]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const lineHeight = canvas.height / totalLines;
    const line = Math.floor(y / lineHeight);
    setHoveredLine(line);
  };

  const handleMouseLeave = () => {
    setHoveredLine(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onLineClick) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const lineHeight = canvas.height / totalLines;
    const line = Math.floor(y / lineHeight);
    onLineClick(Math.min(line, totalLines - 1));
  };

  const scrollToLine = (direction: 'up' | 'down') => {
    if (!onLineClick) return;

    const newLine = direction === 'up'
      ? Math.max(0, currentLine - 10)
      : Math.min(totalLines - 1, currentLine + 10);

    onLineClick(newLine);
  };

  return (
    <div className={`flex flex-col bg-[#1E1E1E] border-l border-gray-700 ${className}`}>
      {/* Scroll buttons */}
      <button
        onClick={() => scrollToLine('up')}
        className="p-1 hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
        title="Scroll up"
      >
        <ChevronUp className="w-4 h-4" />
      </button>

      {/* Minimap canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={600}
        className="cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {/* Scroll buttons */}
      <button
        onClick={() => scrollToLine('down')}
        className="p-1 hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
        title="Scroll down"
      >
        <ChevronDown className="w-4 h-4" />
      </button>

      {/* Line info */}
      <div className="p-2 text-xs text-gray-500 border-t border-gray-700 text-center">
        {hoveredLine !== null ? `Line ${hoveredLine + 1}` : `${totalLines} lines`}
      </div>
    </div>
  );
};

export default CodeMinimap;
