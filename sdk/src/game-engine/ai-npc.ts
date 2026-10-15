import { PersonalityTraits, AIMemory } from './types';

/**
 * AI-driven NPC with personality and learning capabilities
 */
export class AINPC {
  private personality: PersonalityTraits;
  private memory: AIMemory;
  private goals: string[];
  private currentMood: string;
  private learningRate: number;

  constructor(personality?: Partial<PersonalityTraits>) {
    this.personality = {
      openness: 50,
      conscientiousness: 50,
      extraversion: 50,
      agreeableness: 50,
      neuroticism: 50,
      intelligence: 50,
      creativity: 50,
      ...personality
    };

    this.memory = {
      shortTerm: new Map(),
      longTerm: new Map(),
      emotionalState: new Map(),
      relationships: new Map()
    };

    this.goals = [];
    this.currentMood = 'neutral';
    this.learningRate = 0.1;
  }

  /**
   * Generate dynamic conversation based on personality and context
   */
  converse(playerInput: string, context: any = {}): string {
    const responses = this.generateResponses(playerInput, context);
    const chosenResponse = this.selectResponse(responses);

    // Learn from interaction
    this.updateMemory('lastInteraction', playerInput);
    this.updateEmotionalState(chosenResponse);

    return chosenResponse;
  }

  /**
   * Generate multiple response options based on personality
   */
  private generateResponses(input: string, context: any): string[] {
    const responses: string[] = [];
    const inputLower = input.toLowerCase();

    // Personality-driven response generation
    if (this.personality.agreeableness > 70) {
      responses.push("I'd be happy to help with that!");
      responses.push("That sounds wonderful!");
    } else if (this.personality.agreeableness < 30) {
      responses.push("Why should I care about that?");
      responses.push("That's none of my business.");
    }

    if (this.personality.intelligence > 70) {
      responses.push("Let me think about this logically...");
      responses.push("Based on my analysis...");
    }

    if (this.personality.creativity > 70) {
      responses.push("What if we tried something completely different?");
      responses.push("I have a creative solution!");
    }

    // Context-aware responses
    if (inputLower.includes('help')) {
      responses.push("I'm here to assist you.");
      responses.push("What do you need help with?");
    }

    if (inputLower.includes('quest') || inputLower.includes('mission')) {
      responses.push("Adventure awaits!");
      responses.push("I might have a task for you...");
    }

    // Add some random personality-driven variety
    if (this.personality.extraversion > 70) {
      responses.push("Let me tell you about my latest adventure!");
    }

    return responses.length > 0 ? responses : ["I don't know what to say about that."];
  }

  /**
   * Select response based on personality and current state
   */
  private selectResponse(responses: string[]): string {
    // Weight responses based on personality
    const weights = responses.map((response, index) => {
      let weight = 1;

      // Extraverted NPCs talk more
      if (this.personality.extraversion > 70 && response.includes('!')) {
        weight *= 1.5;
      }

      // Creative NPCs prefer unique responses
      if (this.personality.creativity > 70 && response.includes('creative')) {
        weight *= 1.5;
      }

      // Intelligent NPCs prefer analytical responses
      if (this.personality.intelligence > 70 && response.includes('think')) {
        weight *= 1.5;
      }

      return weight;
    });

    // Select weighted random response
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < responses.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return responses[i];
      }
    }

    return responses[0];
  }

  /**
   * Update NPC memory and learning
   */
  private updateMemory(key: string, value: any): void {
    this.memory.shortTerm.set(key, value);

    // Move important memories to long-term
    if (this.memory.shortTerm.size > 10) {
      const oldestKey = Array.from(this.memory.shortTerm.keys())[0];
      if (oldestKey && Math.random() < 0.3) { // 30% chance to remember
        this.memory.longTerm.set(oldestKey, this.memory.shortTerm.get(oldestKey));
      }
      if (oldestKey) {
        this.memory.shortTerm.delete(oldestKey);
      }
    }
  }

  /**
   * Update emotional state based on interaction
   */
  private updateEmotionalState(response: string): void {
    // Simple emotional analysis
    if (response.includes('!') || response.includes('wonderful')) {
      this.adjustEmotion('happiness', 10);
    }
    if (response.includes('help') || response.includes('assist')) {
      this.adjustEmotion('helpfulness', 5);
    }
    if (response.includes('?')) {
      this.adjustEmotion('curiosity', 5);
    }
  }

  /**
   * Adjust emotional state
   */
  private adjustEmotion(emotion: string, delta: number): void {
    const current = this.memory.emotionalState.get(emotion) || 0;
    this.memory.emotionalState.set(emotion, Math.max(-100, Math.min(100, current + delta)));
  }

  /**
   * Get current emotional state
   */
  getEmotionalState(): Map<string, number> {
    return new Map(this.memory.emotionalState);
  }

  /**
   * Update relationship with another entity
   */
  updateRelationship(entityId: string, delta: number): void {
    const current = this.memory.relationships.get(entityId) || 0;
    this.memory.relationships.set(entityId, Math.max(-100, Math.min(100, current + delta)));
  }

  /**
   * Get relationship score with entity
   */
  getRelationship(entityId: string): number {
    return this.memory.relationships.get(entityId) || 0;
  }

  /**
   * Get personality traits
   */
  getPersonality(): PersonalityTraits {
    return { ...this.personality };
  }

  /**
   * Set new goals for the NPC
   */
  setGoals(goals: string[]): void {
    this.goals = [...goals];
  }

  /**
   * Get current goals
   */
  getGoals(): string[] {
    return [...this.goals];
  }

  /**
   * Check if NPC has specific goal
   */
  hasGoal(goal: string): boolean {
    return this.goals.includes(goal);
  }

  /**
   * Set current mood
   */
  setMood(mood: string): void {
    this.currentMood = mood;
  }

  /**
   * Get current mood
   */
  getMood(): string {
    return this.currentMood;
  }
}
