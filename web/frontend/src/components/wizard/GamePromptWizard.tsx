import { useState } from 'react';
import { GamePrompt, WizardState } from '../../types/wizard';
import { gameTemplates, getTemplateById } from '../../data/gameTemplates';
import { audioTemplates, getAudioTemplateById } from '../../data/audioTemplates';
import { generateReviewQuestions, defaultQuestions, generateAudioReviewQuestions, defaultAudioQuestions } from '../../data/wizardQuestions';
import { enhancePrompt, analyzePrompt, validatePrompt, enhanceAudioDescription, analyzeAudioDescription, validateAudioDescription, generateGame } from '../../services/aiService';
import TemplateLibrary from './TemplateLibrary';
import AudioTemplateLibrary from './AudioTemplateLibrary';
import PromptInput from './PromptInput';
import AudioInput from './AudioInput';
import PromptComparison from './PromptComparison';
import AudioComparison from './AudioComparison';
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
    audioQuestions: [],
    currentAudioQuestionIndex: 0,
    answers: {},
    audioAnswers: {},
    isEnhancing: false,
    isEnhancingAudio: false,
    isGenerating: false
  });

  const [showTemplates, setShowTemplates] = useState(false);
  const [showAudioTemplates, setShowAudioTemplates] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showAudioComparison, setShowAudioComparison] = useState(false);

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
      // All questions answered - move to audio step
      setState(prev => ({ ...prev, step: 'audio' }));
    }
  }

  /**
   * Skip to game generation
   */
  function handleSkipToGenerate() {
    setState(prev => ({ ...prev, step: 'generate' }));
  }

  /**
   * Move to audio step
   */
  function handleMoveToAudio() {
    setState(prev => ({ ...prev, step: 'audio' }));
  }

  /**
   * Handle audio template selection
   */
  function handleAudioTemplateSelect(templateId: string) {
    const template = getAudioTemplateById(templateId);
    if (template) {
      setState(prev => ({
        ...prev,
        currentPrompt: {
          ...prev.currentPrompt,
          audioDescription: template.exampleDescription,
          metadata: {
            ...prev.currentPrompt.metadata,
            audioMetadata: template.metadata
          }
        }
      }));
      setShowAudioTemplates(false);
    }
  }

  /**
   * Handle audio description change
   */
  function handleAudioChange(text: string) {
    setState(prev => ({
      ...prev,
      currentPrompt: {
        ...prev.currentPrompt,
        audioDescription: text
      }
    }));
  }

  /**
   * Handle AI audio enhancement
   */
  async function handleEnhanceAudio() {
    const validation = validateAudioDescription(state.currentPrompt.audioDescription || '');
    if (!validation.valid) {
      setState(prev => ({ ...prev, error: validation.issues.join('. ') }));
      return;
    }

    setState(prev => ({ ...prev, isEnhancingAudio: true, error: undefined }));

    try {
      const result = await enhanceAudioDescription({
        rawAudioDescription: state.currentPrompt.audioDescription || '',
        context: state.currentPrompt.metadata,
        enhancementLevel: 'detailed'
      });

      setState(prev => ({
        ...prev,
        currentPrompt: {
          ...prev.currentPrompt,
          enhancedAudioDescription: result.enhanced,
          metadata: {
            ...prev.currentPrompt.metadata,
            audioMetadata: { ...prev.currentPrompt.metadata.audioMetadata, ...result.detectedMetadata }
          }
        },
        isEnhancingAudio: false
      }));

      setShowAudioComparison(true);
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isEnhancingAudio: false,
        error: error.message || 'Audio enhancement failed'
      }));
    }
  }

  /**
   * Accept enhanced audio
   */
  function handleAcceptAudioEnhancement() {
    if (state.currentPrompt.enhancedAudioDescription) {
      setState(prev => ({
        ...prev,
        currentPrompt: {
          ...prev.currentPrompt,
          audioDescription: prev.currentPrompt.enhancedAudioDescription!
        }
      }));
    }
    setShowAudioComparison(false);
  }

  /**
   * Reject audio enhancement
   */
  function handleRejectAudioEnhancement() {
    setState(prev => ({
      ...prev,
      currentPrompt: {
        ...prev.currentPrompt,
        enhancedAudioDescription: undefined
      }
    }));
    setShowAudioComparison(false);
  }

  /**
   * Start audio review
   */
  async function handleStartAudioReview() {
    setState(prev => ({ ...prev, isEnhancingAudio: true }));

    try {
      const metadata = await analyzeAudioDescription(state.currentPrompt.audioDescription || '');
      const questions = generateAudioReviewQuestions(state.currentPrompt.audioDescription || '', metadata);

      setState(prev => ({
        ...prev,
        step: 'audio-review',
        audioQuestions: questions.length > 0 ? questions : defaultAudioQuestions,
        currentAudioQuestionIndex: 0,
        isEnhancingAudio: false,
        currentPrompt: {
          ...prev.currentPrompt,
          metadata: {
            ...prev.currentPrompt.metadata,
            audioMetadata: { ...prev.currentPrompt.metadata.audioMetadata, ...metadata }
          }
        }
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isEnhancingAudio: false,
        error: error.message || 'Audio analysis failed'
      }));
    }
  }

  /**
   * Handle audio question answer
   */
  function handleAudioAnswer(questionId: string, answer: any) {
    setState(prev => ({
      ...prev,
      audioAnswers: {
        ...prev.audioAnswers,
        [questionId]: answer
      }
    }));
  }

  /**
   * Move to next audio question
   */
  function handleNextAudioQuestion() {
    if (state.currentAudioQuestionIndex < state.audioQuestions.length - 1) {
      setState(prev => ({
        ...prev,
        currentAudioQuestionIndex: prev.currentAudioQuestionIndex + 1
      }));
    } else {
      // All audio questions answered - move to generate
      setState(prev => ({ ...prev, step: 'generate' }));
    }
  }

  /**
   * Generate game
   */
  async function handleGenerateGame() {
    setState(prev => ({ ...prev, isGenerating: true, error: undefined }));

    try {
      const result = await generateGame({
        prompt: state.currentPrompt.rawText,
        audioDescription: state.currentPrompt.audioDescription,
        metadata: state.currentPrompt.metadata,
        answers: state.answers,
        audioAnswers: state.audioAnswers
      });

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
      audioQuestions: [],
      currentAudioQuestionIndex: 0,
      answers: {},
      audioAnswers: {},
      isEnhancing: false,
      isEnhancingAudio: false,
      isGenerating: false
    });
    setShowTemplates(false);
    setShowAudioTemplates(false);
    setShowComparison(false);
    setShowAudioComparison(false);
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
        totalSteps={state.step === 'audio-review' ? state.audioQuestions.length : state.questions.length}
        currentStep={state.step === 'audio-review' ? state.currentAudioQuestionIndex : state.currentQuestionIndex}
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
              onSkip={handleMoveToAudio}
            />
          </div>
        )}

        {/* Step 3: Audio Description */}
        {state.step === 'audio' && (
          <div className="wizard-step wizard-audio-step">
            <div className="wizard-actions-top">
              <button
                className="btn btn-secondary"
                onClick={() => setShowAudioTemplates(!showAudioTemplates)}
              >
                {showAudioTemplates ? 'Hide Audio Templates' : 'Browse Audio Templates'}
              </button>
            </div>

            {showAudioTemplates && (
              <AudioTemplateLibrary
                templates={audioTemplates}
                onSelect={handleAudioTemplateSelect}
              />
            )}

            <AudioInput
              value={state.currentPrompt.audioDescription || ''}
              onChange={handleAudioChange}
              disabled={state.isEnhancingAudio}
            />

            <div className="wizard-actions">
              <button
                className="btn btn-primary btn-large"
                onClick={handleEnhanceAudio}
                disabled={state.isEnhancingAudio || (state.currentPrompt.audioDescription?.length || 0) < 50}
              >
                {state.isEnhancingAudio ? 'Enhancing Audio...' : 'Enhance Audio with AI'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleStartAudioReview}
                disabled={(state.currentPrompt.audioDescription?.length || 0) < 50}
              >
                Skip to Audio Review
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleSkipToGenerate}
              >
                Skip Audio (Generate Now)
              </button>
            </div>
          </div>
        )}

        {/* Audio Comparison View */}
        {showAudioComparison && state.currentPrompt.enhancedAudioDescription && (
          <AudioComparison
            original={state.currentPrompt.audioDescription || ''}
            enhanced={state.currentPrompt.enhancedAudioDescription}
            onAccept={handleAcceptAudioEnhancement}
            onReject={handleRejectAudioEnhancement}
            onEdit={(text) => handleAudioChange(text)}
          />
        )}

        {/* Step 4: Audio Review */}
        {state.step === 'audio-review' && (
          <div className="wizard-step wizard-audio-review-step">
            <QuestionFlow
              questions={state.audioQuestions}
              currentIndex={state.currentAudioQuestionIndex}
              answers={state.audioAnswers}
              onAnswer={handleAudioAnswer}
              onNext={handleNextAudioQuestion}
              onSkip={handleSkipToGenerate}
            />
          </div>
        )}

        {/* Step 5: Generate */}
        {state.step === 'generate' && (
          <div className="wizard-step wizard-generate-step">
            <div className="generate-summary">
              <h2>Ready to Generate Your Game!</h2>
              <div className="summary-section">
                <h3>Game Prompt:</h3>
                <div className="prompt-display">{state.currentPrompt.rawText}</div>
              </div>

              {state.currentPrompt.audioDescription && (
                <div className="summary-section">
                  <h3>Audio Description:</h3>
                  <div className="prompt-display">{state.currentPrompt.audioDescription}</div>
                </div>
              )}

              {Object.keys(state.answers).length > 0 && (
                <div className="summary-section">
                  <h3>Game Prompt Choices:</h3>
                  <ul className="answers-list">
                    {Object.entries(state.answers).map(([key, value]) => (
                      <li key={key}>
                        <strong>{key}:</strong> {Array.isArray(value) ? value.join(', ') : value}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Object.keys(state.audioAnswers).length > 0 && (
                <div className="summary-section">
                  <h3>Audio Choices:</h3>
                  <ul className="answers-list">
                    {Object.entries(state.audioAnswers).map(([key, value]) => (
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
