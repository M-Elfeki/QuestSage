export interface SystemConfig {
  mode: 'dev' | 'prod';
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
  searchConfig: {
    searchTermsLimit: number;
    webResultsPerTerm: number;
    arxivResultsPerTerm: number;
    redditSubredditsLimit: number;
    redditPostsPerSubreddit: number;
    redditCommentsPerPost: number;
  };
  rateLimiting: {
    geminiCallsPerMinute: number;
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
      },
      searchConfig: {
        searchTermsLimit: parseInt(process.env.SEARCH_TERMS_LIMIT || '10'),
        webResultsPerTerm: parseInt(process.env.WEB_RESULTS_PER_TERM || '10'),
        arxivResultsPerTerm: parseInt(process.env.ARXIV_RESULTS_PER_TERM || '10'),
        redditSubredditsLimit: parseInt(process.env.REDDIT_SUBREDDITS_LIMIT || '10'),
        redditPostsPerSubreddit: parseInt(process.env.REDDIT_POSTS_PER_SUBREDDIT || '50'),
        redditCommentsPerPost: parseInt(process.env.REDDIT_COMMENTS_PER_POST || '100'),
      },
      rateLimiting: {
        geminiCallsPerMinute: parseInt(process.env.GEMINI_RATE_LIMIT || '7'),
      }
    };
  }

  private determineMode(): 'dev' | 'prod' {
    // Check environment variable - only use prod if explicitly set
    const envMode = process.env.NODE_ENV || process.env.MODE;
    if (envMode === 'production' || envMode === 'prod') {
      return 'prod';
    }
    
    // Default to dev mode unless explicitly set to prod
    return 'dev';
  }

  getConfig(): SystemConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<SystemConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  isRealMode(): boolean {
    return this.config.mode === 'prod';
  }

  setMode(mode: 'dev' | 'prod') {
    this.config.mode = mode;
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

  getSearchConfig() {
    return { ...this.config.searchConfig };
  }

  getRateLimitConfig() {
    return { ...this.config.rateLimiting };
  }
}

export const configService = new ConfigService();