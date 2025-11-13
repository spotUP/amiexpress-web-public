/**
 * Import/Export Admin Interface
 *
 * Main component for Amiga BBS import/export functionality.
 * Provides a step-by-step workflow for importing BBS archives.
 *
 * Workflow:
 * 1. Upload archive file
 * 2. Validate and detect conflicts
 * 3. Resolve conflicts (choose strategies)
 * 4. Execute import
 * 5. View results
 */

import { useState, useEffect } from 'react';
import { FileUploader } from './FileUploader';
import { ValidationResults } from './ValidationResults';
import { ConflictResolver } from './ConflictResolver';
import { ImportProgress } from './ImportProgress';
import { ImportResults } from './ImportResults';
import './ImportExport.css';

type ImportStep = 'upload' | 'validate' | 'resolve' | 'execute' | 'complete';

interface ImportSession {
  id: string;
  status: string;
  progress: number;
  archivePath?: string;
}

export function ImportExport() {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<ImportSession | null>(null);
  const [validationData, setValidationData] = useState<any>(null);
  const [conflictStrategies, setConflictStrategies] = useState({
    userConflictStrategy: 'skip' as const,
    conferenceConflictStrategy: 'skip' as const,
    commandConflictStrategy: 'skip' as const,
  });
  const [importResult, setImportResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll session status when executing
  useEffect(() => {
    if (currentStep === 'execute' && sessionId) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/import/session/${sessionId}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            setSession(data.session);

            if (data.session.status === 'completed') {
              setCurrentStep('complete');
              setImportResult(data.session.result);
              clearInterval(interval);
            } else if (data.session.status === 'failed') {
              setError('Import failed. Check session details.');
              clearInterval(interval);
            }
          }
        } catch (err) {
          console.error('Failed to fetch session status:', err);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [currentStep, sessionId]);

  const handleFileUploaded = async (uploadedSessionId: string) => {
    setSessionId(uploadedSessionId);
    setCurrentStep('validate');
    setError(null);

    // Automatically start validation
    try {
      const response = await fetch(`/api/import/validate/${uploadedSessionId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setValidationData(data);

        // Check if there are conflicts
        const hasConflicts =
          (data.conflicts?.userConflicts?.length || 0) > 0 ||
          (data.conflicts?.conferenceConflicts?.length || 0) > 0 ||
          (data.conflicts?.commandConflicts?.length || 0) > 0;

        if (hasConflicts) {
          setCurrentStep('resolve');
        } else {
          // No conflicts, can proceed directly
          setCurrentStep('resolve');
        }
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Validation failed');
      }
    } catch (err: any) {
      setError(`Validation error: ${err.message}`);
    }
  };

  const handleExecuteImport = async () => {
    if (!sessionId) return;

    setCurrentStep('execute');
    setError(null);

    try {
      const response = await fetch(`/api/import/execute/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          ...conflictStrategies,
          createBackup: true,
          forcePasswordReset: false,
          importUsers: true,
          importConferences: true,
          importCommands: true,
          importConfig: true,
          importBulletins: true,
          importScreens: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setImportResult(data.result);
          setCurrentStep('complete');
        } else {
          setError('Import failed. See results for details.');
          setImportResult(data.result);
          setCurrentStep('complete');
        }
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Import execution failed');
      }
    } catch (err: any) {
      setError(`Import error: ${err.message}`);
    }
  };

  const handleReset = () => {
    setCurrentStep('upload');
    setSessionId(null);
    setSession(null);
    setValidationData(null);
    setConflictStrategies({
      userConflictStrategy: 'skip',
      conferenceConflictStrategy: 'skip',
      commandConflictStrategy: 'skip',
    });
    setImportResult(null);
    setError(null);
  };

  return (
    <div className="import-export">
      <div className="import-export-header">
        <h1>BBS Import/Export</h1>
        <p>Import Amiga AmiExpress BBS archives (LHA, LZX, ZIP)</p>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="import-workflow">
        {/* Step indicator */}
        <div className="step-indicator">
          <div className={`step ${currentStep === 'upload' ? 'active' : ''} ${['validate', 'resolve', 'execute', 'complete'].includes(currentStep) ? 'completed' : ''}`}>
            1. Upload
          </div>
          <div className={`step ${currentStep === 'validate' ? 'active' : ''} ${['resolve', 'execute', 'complete'].includes(currentStep) ? 'completed' : ''}`}>
            2. Validate
          </div>
          <div className={`step ${currentStep === 'resolve' ? 'active' : ''} ${['execute', 'complete'].includes(currentStep) ? 'completed' : ''}`}>
            3. Resolve
          </div>
          <div className={`step ${currentStep === 'execute' ? 'active' : ''} ${currentStep === 'complete' ? 'completed' : ''}`}>
            4. Execute
          </div>
          <div className={`step ${currentStep === 'complete' ? 'active' : ''}`}>
            5. Complete
          </div>
        </div>

        {/* Step content */}
        <div className="step-content">
          {currentStep === 'upload' && (
            <FileUploader onFileUploaded={handleFileUploaded} />
          )}

          {currentStep === 'validate' && (
            <div className="validating">
              <p>Validating archive...</p>
            </div>
          )}

          {currentStep === 'resolve' && validationData && (
            <>
              <ValidationResults
                validation={validationData.validation}
                conflicts={validationData.conflicts}
                summary={validationData.summary}
              />
              <ConflictResolver
                conflicts={validationData.conflicts}
                strategies={conflictStrategies}
                onStrategiesChange={setConflictStrategies}
                onExecute={handleExecuteImport}
              />
            </>
          )}

          {currentStep === 'execute' && session && (
            <ImportProgress
              session={session}
              progress={session.progress}
            />
          )}

          {currentStep === 'complete' && importResult && (
            <ImportResults
              result={importResult}
              onReset={handleReset}
            />
          )}
        </div>
      </div>

      {/* Export section placeholder */}
      <div className="export-section">
        <h2>Export BBS Data</h2>
        <p className="coming-soon">Coming soon: Export current BBS to Amiga-compatible archive</p>
      </div>
    </div>
  );
}

export default ImportExport;
