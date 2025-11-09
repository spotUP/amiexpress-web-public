import { useState } from 'react';
import { GamePrompt, WizardState } from '../../types/wizard';
import { gameTemplates, getTemplateById } from '../../data/gameTemplates';
import { generateReviewQuestions, defaultQuestions } from '../../data/wizardQuestions';
import { enhancePrompt, analyzePrompt, validatePrompt } from '../../services/aiService';
import TemplateLibrary from './TemplateLibrary';
import PromptInput from './PromptInput';
import PromptComparison from './PromptComparison';
import QuestionFlow from './QuestionFlow';
import ProgressBar from './ProgressBar';
import './GamePromptWizard.css';

function GamePromptWizard() {
  const [state, setState] = useState<WizardState>({
    step: 'input',
    currentPrompt: createEmptyPrompt(),
    promptHistory: [],
    currentQuestionIndex: 0,
    questions: [],
    answers: {},
    isEnhancing: false,
    isGenerating: false
  });

  const [showTemplates, setShowTemplates] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  /**
   * Create a new empty prompt
   */
  function createEmptyPrompt(): GamePrompt {
    return {
      id: generateId(),
      rawText: '',
      version: 1,
      timestamp: Date.now(),
      metadata: {}
    };
  }

  /**
   * Generate unique ID
   */
  function generateId(): string {
    return `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle template selection
   */
  function handleTemplateSelect(templateId: string) {
    const template = getTemplateById(templateId);
    if (template) {
      const newPrompt: GamePrompt = {
        ...createEmptyPrompt(),
        rawText: template.examplePrompt,
        metadata: template.metadata
      };

      setState(prev => ({
        ...prev,
        currentPrompt: newPrompt,
        promptHistory: [...prev.promptHistory, newPrompt]
      }));

      setShowTemplates(false);
    }
  }

  /**
   * Handle prompt text change
   */
  function handlePromptChange(text: string) {
    setState(prev => ({
      ...prev,
      currentPrompt: {
        ...prev.currentPrompt,
        rawText: text
      }
    }));
  }

  /**
   * Handle AI enhancement
   */
  async function handleEnhance() {
    const validation = validatePrompt(state.currentPrompt.rawText);
    if (!validation.valid) {
      setState(prev => ({ ...prev, error: validation.issues.join('. ') }));
      return;
    }

    setState(prev => ({ ...prev, isEnhancing: true, error: undefined }));

    try {
      const result = await enhancePrompt({
        rawPrompt: state.currentPrompt.rawText,
        context: state.currentPrompt.metadata,
        enhancementLevel: 'detailed'
      });

      const enhancedPrompt: GamePrompt = {
        ...state.currentPrompt,
        id: generateId(),
        enhancedText: result.enhanced,
        version: state.currentPrompt.version + 1,
        timestamp: Date.now(),
        metadata: { ...state.currentPrompt.metadata, ...result.detectedMetadata }
      };

      setState(prev => ({
        ...prev,
        currentPrompt: enhancedPrompt,
        promptHistory: [...prev.promptHistory, enhancedPrompt],
        isEnhancing: false
      }));

      setShowComparison(true);
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isEnhancing: false,
        error: error.message || 'Enhancement failed'
      }));
    }
  }

  /**
   * Accept enhanced prompt
   */
  function handleAcceptEnhancement() {
    if (state.currentPrompt.enhancedText) {
      setState(prev => ({
        ...prev,
        currentPrompt: {
          ...prev.currentPrompt,
          rawText: prev.currentPrompt.enhancedText!
        }
      }));
    }
    setShowComparison(false);
  }

  /**
   * Reject enhancement
   */
  function handleRejectEnhancement() {
    setState(prev => ({
      ...prev,
      currentPrompt: {
        ...prev.currentPrompt,
        enhancedText: undefined
      }
    }));
    setShowComparison(false);
  }

  /**
   * Start interactive review
   */
  async function handleStartReview() {
    setState(prev => ({ ...prev, isEnhancing: true }));

    try {
      const metadata = await analyzePrompt(state.currentPrompt.rawText);
      const questions = generateReviewQuestions(state.currentPrompt.rawText, metadata);

      setState(prev => ({
        ...prev,
        step: 'review',
        questions: questions.length > 0 ? questions : defaultQuestions,
        currentQuestionIndex: 0,
        isEnhancing: false,
        currentPrompt: {
          ...prev.currentPrompt,
          metadata: { ...prev.currentPrompt.metadata, ...metadata }
        }
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isEnhancing: false,
        error: error.message || 'Analysis failed'
      }));
    }
  }

  /**
   * Handle question answer
   */
  function handleAnswer(questionId: string, answer: any) {
    setState(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [questionId]: answer
      }
    }));
  }

  /**
   * Move to next question
   */
  function handleNextQuestion() {
    if (state.currentQuestionIndex < state.questions.length - 1) {
      setState(prev => ({
        ...prev,
        currentQuestionIndex: prev.currentQuestionIndex + 1
      }));
    } else {
      // All questions answered - move to generate
      setState(prev => ({ ...prev, step: 'generate' }));
    }
  }

  /**
   * Skip to game generation
   */
  function handleSkipToGenerate() {
    setState(prev => ({ ...prev, step: 'generate' }));
  }

  /**
   * Generate game
   */
  async function handleGenerateGame() {
    setState(prev => ({ ...prev, isGenerating: true, error: undefined }));

    try {
      const response = await fetch('/api/wizard/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: state.currentPrompt.rawText,
          metadata: state.currentPrompt.metadata,
          answers: state.answers
        })
      });

      if (!response.ok) {
        throw new Error('Game generation failed');
      }

      const result = await response.json();

      // Show success
      setState(prev => ({
        ...prev,
        isGenerating: false
      }));

      alert(`Game "${result.doorName}" created successfully!\nLocation: ${result.doorPath}`);

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: error.message || 'Generation failed'
      }));
    }
  }

  /**
   * Undo to previous version
   */
  function handleUndo() {
    if (state.promptHistory.length > 1) {
      const previousPrompt = state.promptHistory[state.promptHistory.length - 2];
      setState(prev => ({
        ...prev,
        currentPrompt: previousPrompt,
        promptHistory: prev.promptHistory.slice(0, -1)
      }));
    }
  }

  /**
   * Reset wizard
   */
  function handleReset() {
    setState({
      step: 'input',
      currentPrompt: createEmptyPrompt(),
      promptHistory: [],
      currentQuestionIndex: 0,
      questions: [],
      answers: {},
      isEnhancing: false,
      isGenerating: false
    });
    setShowTemplates(false);
    setShowComparison(false);
  }

  return (
    <div className="wizard-container">
      <header className="wizard-header">
        <h1>AI Game Prompt Enhancement Wizard</h1>
        <p className="wizard-subtitle">
          Transform your game idea into a polished, AI-ready prompt
        </p>
      </header>

      <ProgressBar
        step={state.step}
        totalSteps={state.questions.length}
        currentStep={state.currentQuestionIndex}
      />

      {state.error && (
        <div className="wizard-error">
          <strong>Error:</strong> {state.error}
        </div>
      )}

      <div className="wizard-content">
        {/* Step 1: Initial Input */}
        {state.step === 'input' && (
          <div className="wizard-step wizard-input-step">
            <div className="wizard-actions-top">
              <button
                className="btn btn-secondary"
                onClick={() => setShowTemplates(!showTemplates)}
              >
                {showTemplates ? 'Hide Templates' : 'Browse Templates'}
              </button>
              {state.promptHistory.length > 1 && (
                <button className="btn btn-secondary" onClick={handleUndo}>
                  Undo
                </button>
              )}
            </div>

            {showTemplates && (
              <TemplateLibrary
                templates={gameTemplates}
                onSelect={handleTemplateSelect}
              />
            )}

            <PromptInput
              value={state.currentPrompt.rawText}
              onChange={handlePromptChange}
              disabled={state.isEnhancing}
            />

            <div className="wizard-actions">
              <button
                className="btn btn-primary btn-large"
                onClick={handleEnhance}
                disabled={state.isEnhancing || state.currentPrompt.rawText.length < 20}
              >
                {state.isEnhancing ? 'Enhancing...' : 'Enhance Prompt with AI'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleStartReview}
                disabled={state.currentPrompt.rawText.length < 20}
              >
                Skip to Review
              </button>
              <button className="btn btn-ghost" onClick={handleReset}>
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* Comparison View */}
        {showComparison && state.currentPrompt.enhancedText && (
          <PromptComparison
            original={state.currentPrompt.rawText}
            enhanced={state.currentPrompt.enhancedText}
            onAccept={handleAcceptEnhancement}
            onReject={handleRejectEnhancement}
            onEdit={(text) => handlePromptChange(text)}
          />
        )}

        {/* Step 2: Interactive Review */}
        {state.step === 'review' && (
          <div className="wizard-step wizard-review-step">
            <QuestionFlow
              questions={state.questions}
              currentIndex={state.currentQuestionIndex}
              answers={state.answers}
              onAnswer={handleAnswer}
              onNext={handleNextQuestion}
              onSkip={handleSkipToGenerate}
            />
          </div>
        )}

        {/* Step 3: Generate */}
        {state.step === 'generate' && (
          <div className="wizard-step wizard-generate-step">
            <div className="generate-summary">
              <h2>Ready to Generate Your Game!</h2>
              <div className="summary-section">
                <h3>Prompt:</h3>
                <div className="prompt-display">{state.currentPrompt.rawText}</div>
              </div>

              {Object.keys(state.answers).length > 0 && (
                <div className="summary-section">
                  <h3>Your Choices:</h3>
                  <ul className="answers-list">
                    {Object.entries(state.answers).map(([key, value]) => (
                      <li key={key}>
                        <strong>{key}:</strong> {Array.isArray(value) ? value.join(', ') : value}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="wizard-actions">
                <button
                  className="btn btn-primary btn-large"
                  onClick={handleGenerateGame}
                  disabled={state.isGenerating}
                >
                  {state.isGenerating ? 'Generating Game...' : 'Generate Game'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setState(prev => ({ ...prev, step: 'input' }))}
                >
                  Back to Edit
                </button>
                <button className="btn btn-ghost" onClick={handleReset}>
                  Start New Game
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="wizard-footer">
        <p>Version History: {state.promptHistory.length} versions</p>
        <p>
          <a href="/">Return to BBS Terminal</a>
        </p>
      </footer>
    </div>
  );
}

export default GamePromptWizard;
