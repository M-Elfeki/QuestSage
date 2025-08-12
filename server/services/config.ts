export interface SystemConfig {
  mode: 'mock' | 'real';
  maxDialogueRounds: number;
  enabledProviders: {
    openai: boolean;
    gemini: boolean;
    anthropic: boolean;
    perplexity: boolean;
    google: boolean;
    arxiv: boolean;
    reddit: boolean;
  };
}

export class ConfigService {
  private config: SystemConfig;

  constructor() {
    this.config = {
      mode: this.determineMode(),
      maxDialogueRounds: parseInt(process.env.MAX_DIALOGUE_ROUNDS || '7'),
      enabledProviders: {
        openai: !!process.env.OPENAI_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        perplexity: !!process.env.PERPLEXITY_API_KEY,
        google: !!process.env.GOOGLE_SEARCH_API_KEY,
        arxiv: true, // arXiv is always available (public API)
        reddit: !!process.env.REDDIT_API_KEY,
      }
    };
  }

  private determineMode(): 'mock' | 'real' {
    // Check if we have at least one LLM provider and one search provider
    const hasLLM = !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
    const hasSearch = !!(process.env.GOOGLE_SEARCH_API_KEY || process.env.PERPLEXITY_API_KEY);
    
    return hasLLM && hasSearch ? 'real' : 'mock';
  }

  getConfig(): SystemConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<SystemConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  isRealMode(): boolean {
    return this.config.mode === 'real';
  }

  getMaxRounds(): number {
    return this.config.maxDialogueRounds;
  }

  getAvailableAgentProviders(): string[] {
    const providers = [];
    if (this.config.enabledProviders.openai) providers.push('openai');
    if (this.config.enabledProviders.gemini) providers.push('gemini');
    if (this.config.enabledProviders.anthropic) providers.push('anthropic');
    return providers;
  }
}

export const configService = new ConfigService();