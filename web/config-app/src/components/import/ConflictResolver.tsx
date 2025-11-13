/**
 * Conflict Resolver Component
 *
 * Allows user to select conflict resolution strategies before import.
 */

interface ConflictResolverProps {
  conflicts: any;
  strategies: {
    userConflictStrategy: 'skip' | 'replace' | 'rename' | 'merge';
    conferenceConflictStrategy: 'skip' | 'replace' | 'rename' | 'merge';
    commandConflictStrategy: 'skip' | 'replace' | 'rename' | 'merge';
  };
  onStrategiesChange: (strategies: any) => void;
  onExecute: () => void;
}

export function ConflictResolver({
  conflicts,
  strategies,
  onStrategiesChange,
  onExecute,
}: ConflictResolverProps) {
  const hasUserConflicts = (conflicts?.userConflicts?.length || 0) > 0;
  const hasConferenceConflicts = (conflicts?.conferenceConflicts?.length || 0) > 0;
  const hasCommandConflicts = (conflicts?.commandConflicts?.length || 0) > 0;

  const handleStrategyChange = (
    type: 'userConflictStrategy' | 'conferenceConflictStrategy' | 'commandConflictStrategy',
    value: string
  ) => {
    onStrategiesChange({
      ...strategies,
      [type]: value,
    });
  };

  return (
    <div className="conflict-resolver">
      <h2>Conflict Resolution</h2>
      <p>Select how to handle conflicts for each category:</p>

      <div className="strategies">
        {/* User conflicts */}
        <div className={`strategy-section ${hasUserConflicts ? 'has-conflicts' : ''}`}>
          <h3>
            User Conflicts
            {hasUserConflicts && (
              <span className="conflict-count">({conflicts.userConflicts.length})</span>
            )}
          </h3>

          <div className="strategy-options">
            <label className="strategy-option">
              <input
                type="radio"
                name="userStrategy"
                value="skip"
                checked={strategies.userConflictStrategy === 'skip'}
                onChange={(e) => handleStrategyChange('userConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Skip</strong>
                <p>Don't import users that already exist</p>
              </div>
            </label>

            <label className="strategy-option">
              <input
                type="radio"
                name="userStrategy"
                value="replace"
                checked={strategies.userConflictStrategy === 'replace'}
                onChange={(e) => handleStrategyChange('userConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Replace</strong>
                <p>Replace existing users with imported data</p>
              </div>
            </label>

            <label className="strategy-option">
              <input
                type="radio"
                name="userStrategy"
                value="rename"
                checked={strategies.userConflictStrategy === 'rename'}
                onChange={(e) => handleStrategyChange('userConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Rename</strong>
                <p>Import with modified username (user → user2)</p>
              </div>
            </label>

            <label className="strategy-option">
              <input
                type="radio"
                name="userStrategy"
                value="merge"
                checked={strategies.userConflictStrategy === 'merge'}
                onChange={(e) => handleStrategyChange('userConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Merge</strong>
                <p>Merge statistics (higher values win)</p>
              </div>
            </label>
          </div>
        </div>

        {/* Conference conflicts */}
        <div className={`strategy-section ${hasConferenceConflicts ? 'has-conflicts' : ''}`}>
          <h3>
            Conference Conflicts
            {hasConferenceConflicts && (
              <span className="conflict-count">({conflicts.conferenceConflicts.length})</span>
            )}
          </h3>

          <div className="strategy-options">
            <label className="strategy-option">
              <input
                type="radio"
                name="conferenceStrategy"
                value="skip"
                checked={strategies.conferenceConflictStrategy === 'skip'}
                onChange={(e) => handleStrategyChange('conferenceConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Skip</strong>
                <p>Don't import conferences that already exist</p>
              </div>
            </label>

            <label className="strategy-option">
              <input
                type="radio"
                name="conferenceStrategy"
                value="replace"
                checked={strategies.conferenceConflictStrategy === 'replace'}
                onChange={(e) => handleStrategyChange('conferenceConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Replace</strong>
                <p>Replace existing conferences with imported data</p>
              </div>
            </label>

            <label className="strategy-option">
              <input
                type="radio"
                name="conferenceStrategy"
                value="rename"
                checked={strategies.conferenceConflictStrategy === 'rename'}
                onChange={(e) => handleStrategyChange('conferenceConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Rename</strong>
                <p>Import with modified name (adds "(Imported)")</p>
              </div>
            </label>

            <label className="strategy-option">
              <input
                type="radio"
                name="conferenceStrategy"
                value="merge"
                checked={strategies.conferenceConflictStrategy === 'merge'}
                onChange={(e) => handleStrategyChange('conferenceConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Merge</strong>
                <p>Merge file areas and message bases</p>
              </div>
            </label>
          </div>
        </div>

        {/* Command conflicts */}
        <div className={`strategy-section ${hasCommandConflicts ? 'has-conflicts' : ''}`}>
          <h3>
            Command Conflicts
            {hasCommandConflicts && (
              <span className="conflict-count">({conflicts.commandConflicts.length})</span>
            )}
          </h3>

          <div className="strategy-options">
            <label className="strategy-option">
              <input
                type="radio"
                name="commandStrategy"
                value="skip"
                checked={strategies.commandConflictStrategy === 'skip'}
                onChange={(e) => handleStrategyChange('commandConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Skip</strong>
                <p>Don't import conflicting commands</p>
              </div>
            </label>

            <label className="strategy-option">
              <input
                type="radio"
                name="commandStrategy"
                value="replace"
                checked={strategies.commandConflictStrategy === 'replace'}
                onChange={(e) => handleStrategyChange('commandConflictStrategy', e.target.value)}
              />
              <div className="option-content">
                <strong>Replace</strong>
                <p>Replace existing commands</p>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="execute-section">
        <button onClick={onExecute} className="btn-execute">
          Execute Import
        </button>
        <p className="execute-hint">
          A database backup will be created before import
        </p>
      </div>
    </div>
  );
}
