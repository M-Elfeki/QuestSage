export interface SystemConfig {
  maxDialogueRounds: number;
  enabledProviders: {
    litellm: boolean;
    openai: boolean;
    anthropic: boolean;
    gemini: boolean;
    google: boolean;
    arxiv: boolean;
    reddit: boolean;
    perplexity: boolean;
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
    llmCallsPerMinute: number;
  };
}

export interface ModelSelection {
  clarifyIntent: string;
  generateSearchTerms: string;
  orchestrateResearch: string;
  extractFactsFromWebResults: string;
  extractFactsFromRedditResults: string;
  extractFactsFromArxivResults: string;
  analyzeResearchFindings: string;
  generateSurfaceResearchReport: string;
  generateDeepResearchQuery: string;
  generateDeepResearchReport: string;
  selectAgents: string;
  checkAlignment: string;
  evaluateDialogueRound: string;
  synthesizeResults: string;
  chatgptAgentModel: string;
  geminiAgentModel: string;
}

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ConfigService {
  private config: SystemConfig;
  private modelSelections: Map<string, ModelSelection> = new Map(); // sessionId -> ModelSelection

  constructor() {
    this.config = {
      maxDialogueRounds: parseInt(process.env.MAX_DIALOGUE_ROUNDS || '7'),
      enabledProviders: {
        litellm: true, // LiteLLM is always available (uses AWS Secrets Manager)
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY || !!process.env.CLAUDE_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY,
        google: !!process.env.GOOGLE_SEARCH_API_KEY,
        arxiv: true, // arXiv is always available (public API)
        reddit: true, // Reddit service is always available (uses praw with credentials)
        perplexity: !!process.env.PERPLEXITY_API_KEY,
      },
      searchConfig: {
        searchTermsLimit: parseInt(process.env.SEARCH_TERMS_LIMIT || '10'),
        webResultsPerTerm: parseInt(process.env.WEB_RESULTS_PER_TERM || '10'),
        arxivResultsPerTerm: parseInt(process.env.ARXIV_RESULTS_PER_TERM || '10'),
        redditSubredditsLimit: parseInt(process.env.REDDIT_SUBREDDITS_LIMIT || '10'),
        redditPostsPerSubreddit: parseInt(process.env.REDDIT_POSTS_PER_SUBREDDIT || '10'),
        redditCommentsPerPost: parseInt(process.env.REDDIT_COMMENTS_PER_POST || '10'),
      },
      rateLimiting: {
        llmCallsPerMinute: parseInt(process.env.LLM_CALLS_PER_MINUTE || '10'),
      }
    };
  }

  getConfig(): SystemConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<SystemConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getMaxRounds(): number {
    return this.config.maxDialogueRounds;
  }

  getAvailableAgentProviders(): string[] {
    const providers = [];
    if (this.config.enabledProviders.litellm) providers.push('litellm');
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

  /**
   * Normalize model names to valid LiteLLM formats
   * - OpenAI models: Remove 'openai/' prefix (e.g., 'openai/gpt-5' -> 'gpt-5')
   * - Anthropic models: Remove 'anthropic/' prefix and fix format (e.g., 'anthropic/claude-sonnet-4-5' -> 'claude-sonnet-4-20250514')
   * - Gemini models: Keep 'gemini/' prefix (e.g., 'gemini/gemini-2.5-pro' stays as-is)
   */
  private normalizeModelName(modelName: string): string {
    if (!modelName) return 'gpt-5-mini'; // Safe fallback
    
    // Remove provider prefixes and normalize
    if (modelName.startsWith('openai/')) {
      const model = modelName.replace('openai/', '');
      // Map common variations
      if (model === 'gpt-5') return 'gpt-5';
      if (model === 'gpt-5-mini') return 'gpt-5-mini';
      // Keep o3-deep-research as-is
      if (model === 'o3-deep-research') return 'o3-deep-research';
      return model; // Use as-is if no mapping needed
    }
    
    if (modelName.startsWith('anthropic/')) {
      const model = modelName.replace('anthropic/', '');
      // Map common variations
      if (model === 'claude-sonnet-4-5') return 'claude-sonnet-4-20250514';
      if (model === 'claude-opus-4-5') return 'claude-opus-4-20250514';
      return model; // Use as-is if no mapping needed
    }
    
    if (modelName.startsWith('perplexity/')) {
      // Keep perplexity models as-is - they work!
      return modelName;
    }
    
    // If it's already a valid format (no prefix or gemini/), use as-is
    return modelName;
  }

  // Model selection methods
  setModelSelection(sessionId: string, selection: Partial<ModelSelection>): ModelSelection {
    const existing = this.modelSelections.get(sessionId) || this.getDefaultModelSelection();
    // Normalize all model names before storing
    const normalizedSelection: Partial<ModelSelection> = {};
    for (const [key, value] of Object.entries(selection)) {
      if (value) {
        normalizedSelection[key as keyof ModelSelection] = this.normalizeModelName(value);
      }
    }
    const updated = { ...existing, ...normalizedSelection };
    this.modelSelections.set(sessionId, updated);
    return updated;
  }

  getModelSelection(sessionId: string | null): ModelSelection {
    if (!sessionId) {
      return this.getDefaultModelSelection();
    }
    const selection = this.modelSelections.get(sessionId) || this.getDefaultModelSelection();
    // Normalize all model names when retrieving
    const normalizedSelection: ModelSelection = {} as ModelSelection;
    for (const [key, value] of Object.entries(selection)) {
      normalizedSelection[key as keyof ModelSelection] = this.normalizeModelName(value);
    }
    return normalizedSelection;
  }

  getDefaultModelSelection(): ModelSelection {
    // Load defaults from config.json, mapping old model names to new ones
    let defaults: any = {};
    
    try {
      // Try multiple path resolutions
      const possiblePaths = [
        path.join(__dirname, '..', '..', 'config.json'),
        path.join(process.cwd(), 'config.json'),
        path.resolve(__dirname, '../../config.json'),
      ];
      
      let configPath: string | null = null;
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          configPath = possiblePath;
          console.log(`✅ Found config.json at: ${configPath}`);
          break;
        }
      }
      
      if (!configPath) {
        throw new Error(`Config file not found. Tried: ${possiblePaths.join(', ')}`);
      }
      
      const configData = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData);
      const taskModels = config.llmModels?.taskModels || {};
      
      // Map config.json model names to valid LiteLLM model names
      // Note: OpenAI and Anthropic models don't use provider prefixes in LiteLLM
      const modelMap: Record<string, string> = {
        'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
        'claude-opus-4-20250514': 'claude-opus-4-20250514',
        'claude-haiku-4-20250514': 'claude-haiku-4-20250514',
        'gpt-4o': 'gpt-4o',
        'gpt-4o-mini': 'gpt-4o-mini',
        'gpt-4.1': 'gpt-4.1',
        'gemini/gemini-2.5-flash': 'gemini/gemini-2.5-flash',
        'gemini/gemini-2.5-pro': 'gemini/gemini-2.5-pro',
        // Map user-provided model names to valid ones
        'anthropic/claude-sonnet-4-5': 'claude-sonnet-4-20250514',
        'anthropic/claude-haiku-4-5-20251001': 'claude-haiku-4-20250514',
        'anthropic/claude-opus-4-5': 'claude-opus-4-20250514',
        'openai/gpt-5': 'gpt-5',
        'openai/gpt-5-mini': 'gpt-5-mini',
        'openai/o3-deep-research': 'o3-deep-research',
        'perplexity/sonar-deep-research': 'perplexity/sonar-deep-research', // Keep as-is, it works!
      };
      
      const mapModel = (model: string | undefined, defaultModel: string): string => {
        if (!model) return defaultModel;
        // First check if it's already a valid model name
        if (modelMap[model]) {
          return modelMap[model];
        }
        // If it's already a valid format, use it as-is
        return model;
      };
      
      defaults = {
        clarifyIntent: mapModel(taskModels.clarifyIntent?.model, 'gpt-5-nano'),
        generateSearchTerms: mapModel(taskModels.generateSearchTerms?.model, 'gpt-5-nano'),
        orchestrateResearch: mapModel(taskModels.orchestrateResearch?.model, 'gpt-5-nano'),
        extractFactsFromWebResults: mapModel(taskModels.extractFactsFromWebResults?.model, 'gpt-5-nano'),
        extractFactsFromRedditResults: mapModel(taskModels.extractFactsFromRedditResults?.model, 'gpt-5-nano'),
        extractFactsFromArxivResults: mapModel(taskModels.extractFactsFromArxivResults?.model, 'gpt-5-nano'),
        analyzeResearchFindings: mapModel(taskModels.analyzeResearchFindings?.model, 'gpt-5-nano'),
        generateSurfaceResearchReport: mapModel(taskModels.generateSurfaceResearchReport?.model, 'gpt-5-nano'),
        generateDeepResearchQuery: mapModel(taskModels.generateDeepResearchQuery?.model, 'gpt-5-nano'),
        generateDeepResearchReport: mapModel(taskModels.generateDeepResearchReport?.model, 'gpt-5-nano'),
        selectAgents: mapModel(taskModels.selectAgents?.model, 'gpt-5-nano'),
        checkAlignment: mapModel(taskModels.checkAlignment?.model, 'gpt-5-nano'),
        evaluateDialogueRound: mapModel(taskModels.evaluateDialogueRound?.model, 'gpt-5-nano'),
        synthesizeResults: mapModel(taskModels.synthesizeResults?.model, 'gpt-5-nano'),
        chatgptAgentModel: 'gpt-5-nano', // Default model for ChatGPT debater
        geminiAgentModel: 'gpt-5-nano', // Default model for Gemini debater
      };
      
      console.log('✅ Successfully loaded defaults from config.json');
    } catch (error: any) {
      console.warn('⚠️ Could not load config.json for defaults, using hardcoded defaults:', error?.message || error);
      console.warn('   __dirname:', __dirname);
      console.warn('   process.cwd():', process.cwd());
      defaults = {
        clarifyIntent: 'gpt-5-nano',
        generateSearchTerms: 'gpt-5-nano',
        orchestrateResearch: 'gpt-5-nano',
        extractFactsFromWebResults: 'gpt-5-nano',
        extractFactsFromRedditResults: 'gpt-5-nano',
        extractFactsFromArxivResults: 'gpt-5-nano',
        analyzeResearchFindings: 'gpt-5-nano',
        generateSurfaceResearchReport: 'gpt-5-nano',
        generateDeepResearchQuery: 'gpt-5-nano',
        generateDeepResearchReport: 'gpt-5-nano',
        selectAgents: 'gpt-5-nano',
        checkAlignment: 'gpt-5-nano',
        evaluateDialogueRound: 'gpt-5-nano',
        synthesizeResults: 'gpt-5-nano',
        chatgptAgentModel: 'gpt-5-nano',
        geminiAgentModel: 'gpt-5-nano',
      };
    }
    
    // Ensure all required fields are present
    const requiredFields: Array<keyof ModelSelection> = [
      'clarifyIntent', 'generateSearchTerms', 'orchestrateResearch',
      'extractFactsFromWebResults', 'extractFactsFromRedditResults', 'extractFactsFromArxivResults',
      'analyzeResearchFindings', 'generateSurfaceResearchReport', 'generateDeepResearchQuery',
      'generateDeepResearchReport', 'selectAgents', 'checkAlignment', 'evaluateDialogueRound', 'synthesizeResults',
      'chatgptAgentModel', 'geminiAgentModel'
    ];
    
    for (const field of requiredFields) {
      if (!defaults[field]) {
        console.warn(`⚠️ Missing default for ${field}, using fallback`);
        defaults[field] = 'gpt-5-nano'; // Safe fallback
      }
    }
    
    // Normalize all model names to valid LiteLLM formats
    const normalizedDefaults: ModelSelection = {} as ModelSelection;
    for (const field of requiredFields) {
      normalizedDefaults[field] = this.normalizeModelName(defaults[field]);
    }
    
    return normalizedDefaults;
  }

  getAvailableModels(): string[] {
    // Return valid LiteLLM model names (no provider prefixes for OpenAI/Anthropic)
    return [
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-5-nano-2025-08-07',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'o3',
      'o3-mini',
      'o3-pro',
      'o3-deep-research',
      'o4',
      'o4-mini',
      'o4-pro',
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'gemini/gemini-2.5-pro',
      'gemini/gemini-2.5-flash',
      'gemini/gemini-2.5-pro-preview-05-06',
      'perplexity/sonar-deep-research',
    ];
  }
}

export const configService = new ConfigService();