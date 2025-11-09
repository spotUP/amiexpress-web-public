import { useState } from 'react';

interface AudioComparisonProps {
  original: string;
  enhanced: string;
  onAccept: () => void;
  onReject: () => void;
  onEdit: (text: string) => void;
}

function AudioComparison({ original, enhanced, onAccept, onReject, onEdit }: AudioComparisonProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(enhanced);

  const originalWords = original.trim().split(/\s+/).length;
  const enhancedWords = enhanced.trim().split(/\s+/).length;
  const wordIncrease = enhancedWords - originalWords;
  const percentIncrease = Math.round((wordIncrease / originalWords) * 100);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onEdit(editedText);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedText(enhanced);
    setIsEditing(false);
  };

  return (
    <div className="prompt-comparison">
      <div className="comparison-header">
        <h2>AI-Enhanced Audio Description</h2>
        <p>Compare your original audio description with the AI-enhanced version</p>
      </div>

      <div className="comparison-grid">
        {/* Original Audio Description */}
        <div className="comparison-panel">
          <h3>Original Audio Description</h3>
          <div className="prompt-box original">
            <p>{original}</p>
          </div>
          <div className="prompt-stats">
            <span>{originalWords} words</span>
          </div>
        </div>

        {/* Arrow */}
        <div className="comparison-arrow">→</div>

        {/* Enhanced Audio Description */}
        <div className="comparison-panel">
          <h3>Enhanced Audio Description</h3>
          <div className="prompt-box enhanced">
            {isEditing ? (
              <textarea
                className="enhanced-edit"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={12}
              />
            ) : (
              <p>{enhanced}</p>
            )}
          </div>
          <div className="prompt-stats">
            <span>{enhancedWords} words</span>
            {wordIncrease > 0 && (
              <span className="improvement">+{wordIncrease} words (+{percentIncrease}%)</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="comparison-actions">
        {isEditing ? (
          <>
            <button className="btn btn-primary" onClick={handleSaveEdit}>
              Save Changes
            </button>
            <button className="btn btn-secondary" onClick={handleCancelEdit}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-primary btn-large" onClick={onAccept}>
              Accept Enhanced Version
            </button>
            <button className="btn btn-secondary" onClick={handleEdit}>
              Edit Enhanced Version
            </button>
            <button className="btn btn-ghost" onClick={onReject}>
              Keep Original
            </button>
          </>
        )}
      </div>

      {/* Tips */}
      <div className="comparison-tips">
        <h4>What Was Enhanced?</h4>
        <ul>
          <li>Added specific music genres and styles for better clarity</li>
          <li>Included details on pacing, transitions, and gameplay integration</li>
          <li>Ensured technical feasibility with file size and format requirements</li>
          <li>Added accessibility features like subtitles and volume controls</li>
          <li>Suggested dynamic audio that responds to in-game events</li>
        </ul>
      </div>
    </div>
  );
}

export default AudioComparison;
