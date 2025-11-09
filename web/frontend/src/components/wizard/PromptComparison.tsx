interface PromptComparisonProps {
  original: string;
  enhanced: string;
  onAccept: () => void;
  onReject: () => void;
  onEdit: (text: string) => void;
}

function PromptComparison({ original, enhanced, onAccept, onReject, onEdit }: PromptComparisonProps) {
  return (
    <div className="prompt-comparison">
      <div className="comparison-header">
        <h2>AI Enhancement Results</h2>
        <p>Review the enhanced version and choose which to use</p>
      </div>

      <div className="comparison-grid">
        <div className="comparison-panel">
          <h3>Original Prompt</h3>
          <div className="prompt-box original">
            <p>{original}</p>
          </div>
          <div className="prompt-stats">
            <span>Length: {original.length} chars</span>
            <span>Words: {original.split(/\s+/).length}</span>
          </div>
        </div>

        <div className="comparison-arrow">→</div>

        <div className="comparison-panel">
          <h3>Enhanced Prompt</h3>
          <div className="prompt-box enhanced">
            <textarea
              className="enhanced-edit"
              value={enhanced}
              onChange={(e) => onEdit(e.target.value)}
              rows={15}
            />
          </div>
          <div className="prompt-stats">
            <span>Length: {enhanced.length} chars</span>
            <span>Words: {enhanced.split(/\s+/).length}</span>
            <span className="improvement">
              +{Math.round(((enhanced.length - original.length) / original.length) * 100)}% detail
            </span>
          </div>
        </div>
      </div>

      <div className="comparison-actions">
        <button className="btn btn-primary btn-large" onClick={onAccept}>
          Use Enhanced Version
        </button>
        <button className="btn btn-secondary" onClick={onReject}>
          Keep Original
        </button>
      </div>

      <div className="comparison-tips">
        <h4>What Changed?</h4>
        <ul>
          <li>Added structural details for better AI comprehension</li>
          <li>Clarified vague elements and mechanics</li>
          <li>Incorporated best practices for game design prompts</li>
          <li>You can edit the enhanced version before accepting</li>
        </ul>
      </div>
    </div>
  );
}

export default PromptComparison;
