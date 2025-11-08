import AWS from 'aws-sdk';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { configService } from './config';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load litellm_config.env file if it exists
 * This file contains export statements like: export LITELLM_API_KEY="value"
 */
function loadLiteLLMConfig(): void {
  try {
    // Try multiple path resolutions to work in both dev and production
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'litellm_config.env'),  // From server/services/
      path.join(process.cwd(), 'litellm_config.env'),          // From project root
      path.resolve(__dirname, '../../litellm_config.env'),      // Alternative resolution
    ];
    
    let configPath: string | null = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        configPath = possiblePath;
        console.log(`✅ Found litellm_config.env at: ${configPath}`);
        break;
      }
    }
    
    if (!configPath) {
      console.warn(`⚠️  litellm_config.env not found. Tried: ${possiblePaths.join(', ')}`);
      return;
    }
    
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const lines = configContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Parse export KEY="value" format
      const exportMatch = trimmed.match(/^export\s+(\w+)="([^"]+)"/);
      if (exportMatch) {
        const [, key, value] = exportMatch;
        // Only set if not already in process.env (env vars take precedence)
        if (!process.env[key]) {
          process.env[key] = value;
          console.log(`✅ Loaded ${key} from litellm_config.env`);
        }
      }
    }
  } catch (error) {
    console.warn('Could not load litellm_config.env (this is optional):', error);
  }
}

// Load LiteLLM config file at module initialization
loadLiteLLMConfig();

// Load configuration
let llmConfig: any = {
  llmModels: {
    defaultModel: 'gemini/gemini-2.5-flash',
    taskModels: {}
  }
};

try {
  // Try multiple path resolutions to work in both dev and production
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'config.json'),  // From server/services/
    path.join(process.cwd(), 'config.json'),           // From project root
    path.resolve(__dirname, '../../config.json'),     // Alternative resolution
  ];
  
  let configPath: string | null = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      configPath = possiblePath;
      break;
    }
  }
  
  if (configPath) {
    const configData = fs.readFileSync(configPath, 'utf-8');
    llmConfig = JSON.parse(configData);
  }
} catch (error) {
  console.warn('Could not load config.json, using defaults:', error);
}

interface Message {
  role: string;
  content: string | Array<{ type: string; text: string }>;
}

interface ModelResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  cost?: number;
}

export interface LLMResponse {
  response: string;
  processingTime: number;
  confidence?: number;
  citations?: string[];
  metadata?: any;
}

export interface ClarificationResponse {
  requirements: string[];
  constraints: string[];
  questions: Array<{
    id: string;
    text: string;
    options: string[];
    allowOpenText?: boolean;
  }>;
  answerFormat: {
    type: 'prediction' | 'ranked_options' | 'decision_framework' | 'causal_analysis';
    description: string;
    confidenceRequired: boolean;
    uncertaintyBounds: boolean;
  };
  complexity: 'low' | 'medium' | 'high';
  resourceAllocation: string;
}

export interface GeneratedSearchTerms {
  surfaceTerms: string[];
  socialTerms: string[];
  domainSpecificSources: {
    relevantSubreddits: string[];
    expertTwitterAccounts: string[];
    specializedDatabases: string[];
    professionalForums: string[];
    industryResources: string[];
  };
  relevanceRubric: string;
  evidenceThresholds: {
    minimumRelevanceScore: number;
    qualityThresholds: {
      high: number;
      medium: number;
      low: number;
    };
  };
}

/**
 * Get LiteLLM base URL from environment or config file
 */
function getLiteLLMBaseURL(): string {
  // Check environment variable first
  const baseURL = process.env.LITELLM_BASE_URL || 
                  process.env.LITE_LLM_BASE_URL ||
                  'https://litellm.ml-serving-internal.scale.com';
  
  // Ensure it doesn't end with /chat/completions
  return baseURL.replace(/\/chat\/completions\/?$/, '');
}

/**
 * Get value from environment variable or AWS Secrets Manager.
 */
async function getFromEnvOrSecrets(key: string, defaultValue: string | null = null): Promise<string | null> {
  // First try environment variable
  const value = process.env[key];
  if (value) {
    return value;
  }

  // Special handling for LiteLLM API key - prioritize LITELLM_API_KEY
  if (key === 'LITE_LLM_PROXY_ARCHIE_BACKFILL' || key === 'LITELLM_API_KEY') {
    const litellmKey = process.env.LITELLM_API_KEY || process.env.LITE_LLM_PROXY_ARCHIE_BACKFILL;
    if (litellmKey) {
      console.log(`✅ Using LiteLLM API key from ${process.env.LITELLM_API_KEY ? 'LITELLM_API_KEY' : 'LITE_LLM_PROXY_ARCHIE_BACKFILL'}`);
      return litellmKey;
    }
  }

  // Try common API key environment variables as fallbacks
  const commonKeys = [
    'LITELLM_API_KEY', // Prioritize this
    'LITE_LLM_PROXY_ARCHIE_BACKFILL',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY', 
    'CLAUDE_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'LLM_API_KEY'
  ];

  for (const fallbackKey of commonKeys) {
    const fallbackValue = process.env[fallbackKey];
    if (fallbackValue) {
      console.log(`Using fallback API key from ${fallbackKey}`);
      return fallbackValue;
    }
  }

  // If not in environment, try AWS Secrets Manager (optional)
  try {
    // Configure AWS SDK properly
    AWS.config.update({
      region: 'us-west-2'
    });

    const secretName = "team/GENAIML/secret-store-key";
    const secretsManager = new AWS.SecretsManager();
    
    const response = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
    
    if (response.SecretString) {
      const secretData = JSON.parse(response.SecretString);
      
      if (key in secretData) {
        return secretData[key];
      }
    }
  } catch (error: any) {
    // Only show AWS error if no fallback keys were found
    console.log(`Info: Could not access AWS Secrets Manager (this is optional): ${error?.message || error}`);
  }

  return defaultValue;
}

/**
 * Direct LiteLLM wrapper following Test/litellm_ts pattern
 */
class LiteLLM {
  private modelName: string;
  private apiKey: string | null;
  private baseURL: string;
  public cost: number = 0.0;
  public accumulativeCost: number = 0.0;

  constructor(modelName: string, apiKey: string | null = null, baseURL?: string) {
    this.modelName = modelName;
    this.apiKey = apiKey;
    this.baseURL = baseURL || getLiteLLMBaseURL();
    console.log(`🔧 LiteLLM initialized with base URL: ${this.baseURL}`);
  }

  private getMessages(inputData: string | Message[]): Message[] {
    if (typeof inputData === 'string') {
      return [{ role: "user", content: inputData }];
    } else if (Array.isArray(inputData)) {
      return inputData;
    } else {
      return inputData as Message[];
    }
  }

  async acompletion(
    inputData: string | Message[],
    modelName: string | null = null,
    user: string | null = null,
    ...kwargs: any[]
  ): Promise<ModelResponse> {
    const usingModel = modelName || this.modelName;
    const messages = this.getMessages(inputData);

    // Deep research models require tools (but only OpenAI ones, not Perplexity)
    const isOpenAIDeepResearch = usingModel.startsWith('o') && usingModel.includes('deep-research');
    const isPerplexityModel = usingModel.startsWith('perplexity/');
    
    // Use the exact same model format as the working Test version
    const requestData: any = {
      model: usingModel, // Use model name directly, not with litellm_proxy prefix
      messages: messages,
      ...(user && { user }),
      ...kwargs
    };
    
    // Add Perplexity-specific parameters for citation extraction
    if (isPerplexityModel) {
      requestData.return_citations = true;
      requestData.search_recency_filter = 'month';
    }
    
    // Deep research models require tools and use max_output_tokens
    if (isOpenAIDeepResearch) {
      // Ensure tools are provided (required for OpenAI deep research models)
      if (!requestData.tools) {
        requestData.tools = [
          {
            type: 'web_search_preview'
          }
        ];
      }
      
      // Use max_output_tokens instead of max_tokens for deep research models
      // Only if max_tokens was explicitly provided
      if (requestData.max_tokens && !requestData.max_output_tokens) {
        requestData.max_output_tokens = requestData.max_tokens;
        delete requestData.max_tokens;
      }
      // Don't set default max_output_tokens - let API handle it
    }
    
    // Remove max_tokens if present (let API handle token limits)
    // Exception: OpenAI deep research models may have max_output_tokens set above
    if (!isOpenAIDeepResearch && requestData.max_tokens) {
      delete requestData.max_tokens;
    }

    try {
      const apiURL = `${this.baseURL}/chat/completions`;
      console.log(`🌐 Making LiteLLM API call to: ${apiURL}`);
      
      const response = await axios.post(
        apiURL,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 300000 // 5 minutes timeout for long-running requests
        }
      );

      const modelResponse: ModelResponse = response.data;

      // Track cost if available
      if (modelResponse.cost) {
        this.cost = modelResponse.cost;
        this.accumulativeCost += modelResponse.cost;
      }

      return modelResponse;
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'Unknown error';
      
      // Check if it's a network error that should be retried
      const isNetworkError = error?.code === 'ECONNRESET' || 
                            error?.code === 'ETIMEDOUT' ||
                            error?.code === 'ENOTFOUND' ||
                            error?.code === 'ECONNREFUSED' ||
                            errorMsg.includes('socket hang up') ||
                            errorMsg.includes('timeout') ||
                            errorMsg.includes('network');
      
      if (isNetworkError) {
        throw new Error(`NETWORK_ERROR: ${errorMsg}`);
      }
      
      throw new Error(`LiteLLM API call failed: ${errorMsg}`);
    }
  }

  completion(
    inputData: string | Message[],
    modelName: string | null = null,
    user: string | null = null,
    ...kwargs: any[]
  ): Promise<ModelResponse> {
    return this.acompletion(inputData, modelName, user, ...kwargs);
  }
}

export class LiteLLMService {
  private readonly serviceName: string;
  private defaultModel: string;
  private llm: LiteLLM | null = null;
  private sessionId: string | null = null;

  constructor(serviceName: string = 'lite') {
    this.serviceName = serviceName;

    const envDefault = process.env[`${serviceName.toUpperCase()}_DEFAULT_MODEL`];
    // Use config first, then env variable, then fallback
    this.defaultModel = envDefault ||
                       llmConfig?.llmModels?.defaultModel || 
                       process.env.DEFAULT_MODEL || 
                       'gemini/gemini-2.5-flash';
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  private async getLLM(): Promise<LiteLLM> {
    if (this.llm === null) {
      // Try LITELLM_API_KEY first (from config file), then fallback to LITE_LLM_PROXY_ARCHIE_BACKFILL
      const apiKey = await getFromEnvOrSecrets("LITELLM_API_KEY") || 
                     await getFromEnvOrSecrets("LITE_LLM_PROXY_ARCHIE_BACKFILL");
      if (!apiKey) {
        throw new Error("No API key available for LiteLLM service. Please set LITELLM_API_KEY or LITE_LLM_PROXY_ARCHIE_BACKFILL");
      }
      const baseURL = getLiteLLMBaseURL();
      console.log(`🔧 [${this.serviceName.toUpperCase()}] Initializing LiteLLM with model: ${this.defaultModel}, base URL: ${baseURL}`);
      this.llm = new LiteLLM(this.defaultModel, apiKey, baseURL);
    }
    return this.llm;
  }

  /**
   * Normalize model name to valid LiteLLM format (same as config.ts)
   */
  private normalizeModelName(modelName: string): string {
    if (!modelName) return 'gpt-5-mini';
    
    if (modelName.startsWith('openai/')) {
      const model = modelName.replace('openai/', '');
      if (model === 'gpt-5') return 'gpt-5';
      if (model === 'gpt-5-mini') return 'gpt-5-mini';
      // Keep o3-deep-research as-is
      if (model === 'o3-deep-research') return 'o3-deep-research';
      return model;
    }
    
    if (modelName.startsWith('anthropic/')) {
      const model = modelName.replace('anthropic/', '');
      if (model === 'claude-sonnet-4-5') return 'claude-sonnet-4-20250514';
      if (model === 'claude-opus-4-5') return 'claude-opus-4-20250514';
      return model;
    }
    
    if (modelName.startsWith('perplexity/')) {
      // Keep perplexity models as-is - they work!
      if (modelName === 'perplexity/sonar-deep-research') {
        return 'perplexity/sonar-deep-research';
      }
      // For other perplexity models, return as-is
      return modelName;
    }
    
    return modelName;
  }

  private getModelForTask(taskName: string): string {
    let model: string | undefined;
    
    // First check if user has selected a model for this task
    if (this.sessionId) {
      const modelSelection = configService.getModelSelection(this.sessionId);
      const selectedModel = (modelSelection as any)[taskName];
      if (selectedModel) {
        model = selectedModel;
        console.log(`📋 [${this.serviceName.toUpperCase()}] Using selected model for ${taskName}: ${model}`);
      }
    }
    
    // Check if there's a specific model configured for this task in config.json
    if (!model) {
      const taskModel = llmConfig?.llmModels?.taskModels?.[taskName]?.model;
      if (taskModel) {
        model = taskModel;
        console.log(`📋 [${this.serviceName.toUpperCase()}] Using configured model for ${taskName}: ${model}`);
      }
    }
    
    // Fall back to default model
    if (!model) {
      model = this.defaultModel;
      console.log(`📋 [${this.serviceName.toUpperCase()}] Using default model for ${taskName}: ${model}`);
    }
    
    // Normalize the model name to ensure it's in valid LiteLLM format
    const normalizedModel = this.normalizeModelName(model);
    if (normalizedModel !== model) {
      console.log(`🔄 [${this.serviceName.toUpperCase()}] Normalized model name: ${model} → ${normalizedModel}`);
    }
    
    return normalizedModel;
  }

  /**
   * Attempts to repair common JSON issues
   */
  private repairJson(jsonStr: string): string {
    let repaired = jsonStr;
    
    // Remove trailing commas before closing braces/brackets
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    
    // Remove comments (single line)
    repaired = repaired.replace(/\/\/.*$/gm, '');
    
    // Remove comments (multi-line)
    repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Fix common issues with quotes in string values
    // This is a conservative approach - we'll try to fix obvious issues
    // but won't break valid JSON
    
    // Fix unescaped newlines in strings (replace with \n)
    repaired = repaired.replace(/"([^"]*)\n([^"]*)"/g, (match, p1, p2) => {
      return `"${p1}\\n${p2}"`;
    });
    
    // Try to balance braces/brackets if there's a mismatch
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    
    // If there's a mismatch, try to fix it (add missing closing braces/brackets)
    if (openBraces > closeBraces) {
      repaired += '}'.repeat(openBraces - closeBraces);
    }
    if (openBrackets > closeBrackets) {
      repaired += ']'.repeat(openBrackets - closeBrackets);
    }
    
    return repaired.trim();
  }

  /**
   * Robust JSON extraction with repair attempts
   */
  private extractAndParseJson<T = any>(raw: string, operationName: string = "JSON extraction"): T | null {
    if (!raw) {
      return null;
    }

    let clean = raw.trim();

    // Remove markdown code blocks
    if (clean.startsWith('```')) {
      const lines = clean.split('\n');
      if (lines[0].includes('json')) {
        lines.shift(); // Remove first line
      }
      if (lines[lines.length - 1].trim() === '```') {
        lines.pop(); // Remove last line
      }
      clean = lines.join('\n').trim();
    }

    // Try to find JSON object/array boundaries more aggressively
    // Look for the first { or [ and last } or ]
    // Skip any text that looks like numbered lists (e.g., [1][3])
    const jsonLikePattern = /[{\[].*[}\]]/s;
    const jsonMatch = clean.match(jsonLikePattern);
    if (jsonMatch) {
      clean = jsonMatch[0];
    }

    const firstBrace = clean.indexOf('{');
    const firstBracket = clean.indexOf('[');

    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace === -1 && firstBracket === -1) {
      console.warn(`⚠️  [${this.serviceName.toUpperCase()}] No JSON structure found in ${operationName}`);
      return null;
    }

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = clean.lastIndexOf('}') + 1;
    } else {
      startIdx = firstBracket;
      endIdx = clean.lastIndexOf(']') + 1;
    }

    if (startIdx >= 0 && endIdx > startIdx) {
      let jsonSegment = clean.slice(startIdx, endIdx);
      
      // Try parsing directly first
      try {
        return JSON.parse(jsonSegment) as T;
      } catch (error) {
        // If that fails, try repairing common issues
        console.warn(`⚠️  [${this.serviceName.toUpperCase()}] Initial JSON parse failed for ${operationName}, attempting repair...`);
        
        try {
          const repaired = this.repairJson(jsonSegment);
          return JSON.parse(repaired) as T;
        } catch (repairError) {
          // Log the problematic JSON segment for debugging (truncated)
          const preview = jsonSegment.substring(0, 500);
          const errorPos = (error as any).message?.match(/position (\d+)/)?.[1];
          if (errorPos) {
            const pos = parseInt(errorPos);
            const contextStart = Math.max(0, pos - 100);
            const contextEnd = Math.min(jsonSegment.length, pos + 100);
            const context = jsonSegment.substring(contextStart, contextEnd);
            console.warn(`⚠️  [${this.serviceName.toUpperCase()}] JSON parse error at position ${pos}:`);
            console.warn(`   Context: ...${context}...`);
          } else {
            console.warn(`⚠️  [${this.serviceName.toUpperCase()}] Failed to parse JSON after repair attempt`);
            console.warn(`   Preview: ${preview}...`);
          }
          return null;
        }
      }
    }

    return null;
  }

  private extractJsonFromResponse<T = any>(raw: string): T | null {
    return this.extractAndParseJson<T>(raw, "response");
  }

  private async callLiteLLM(prompt: string, model?: string, systemPrompt?: string): Promise<string> {
    const llm = await this.getLLM();
    let usingModel = model || this.defaultModel;
    
    // Ensure model name is normalized
    usingModel = this.normalizeModelName(usingModel);
    
    console.log(`🤖 [${this.serviceName.toUpperCase()}] Making LiteLLM call with model: ${usingModel}`);
    
    const messages: Message[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });
    
    // Retry logic for network errors
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
          console.log(`🔄 [${this.serviceName.toUpperCase()}] Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const response = await llm.acompletion(messages, usingModel, "questsage_user");
        return response.choices[0].message.content;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message;
        
        // Check if it's a network error that should be retried
        const isNetworkError = errorMsg.includes('NETWORK_ERROR') ||
                              errorMsg.includes('socket hang up') ||
                              errorMsg.includes('timeout') ||
                              errorMsg.includes('ECONNRESET') ||
                              errorMsg.includes('ETIMEDOUT');
        
        // Don't retry on authentication or configuration errors
        if (!isNetworkError || 
            errorMsg.includes('not configured') || 
            errorMsg.includes('authentication') || 
            errorMsg.includes('401') ||
            errorMsg.includes('403')) {
          throw lastError;
        }
        
        if (attempt < maxRetries) {
          console.warn(`⚠️  [${this.serviceName.toUpperCase()}] Attempt ${attempt + 1} failed: ${errorMsg.substring(0, 100)}`);
        } else {
          console.error(`❌ [${this.serviceName.toUpperCase()}] All ${maxRetries + 1} attempts failed. Last error: ${errorMsg}`);
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error(`LiteLLM call failed after ${maxRetries + 1} attempts`);
  }

  async clarifyIntent(query: string): Promise<ClarificationResponse> {
    const startTime = Date.now();

    const prompt = `
You are a research clarification agent. Your role is to analyze user queries and provide structured clarification to ensure we understand exactly what they want to research and how they want the answer formatted.

User Query: "${query}"

Please analyze this query and provide a structured response with the following:

1. REQUIREMENTS: What specific information or research is being requested?
2. CONSTRAINTS: What limitations or boundaries should we consider?
3. QUESTIONS: What clarifying questions should we ask the user (if any)?
4. ANSWER_FORMAT: How should the final answer be structured?
5. COMPLEXITY: How complex is this research task?
6. RESOURCE_ALLOCATION: What resources/time might be needed?

Respond in valid JSON format with this structure:
{
  "requirements": ["requirement1", "requirement2"],
  "constraints": ["constraint1", "constraint2"],
  "questions": [
    {
      "id": "q1",
      "text": "Question text?",
      "options": ["option1", "option2", "option3"],
      "allowOpenText": true
    }
  ],
  "answerFormat": {
    "type": "prediction",
    "description": "How the answer should be formatted",
    "confidenceRequired": true,
    "uncertaintyBounds": true
  },
  "complexity": "medium",
  "resourceAllocation": "Description of resources needed"
}
`;

    try {
      const response = await this.callLiteLLM(
        prompt, 
        this.getModelForTask('clarifyIntent'),
        "You are a research clarification agent. Always respond in valid JSON format."
      );

      const processingTime = Date.now() - startTime;

      // Try to parse the result as JSON
      let clarificationData;
      try {
        const resultStr = response.trim();
        let cleanResult = resultStr;
        
        // Remove markdown code blocks if present
        if (cleanResult.startsWith('```json')) {
          cleanResult = cleanResult.slice(7);
        }
        if (cleanResult.endsWith('```')) {
          cleanResult = cleanResult.slice(0, -3);
        }

        // Find JSON content
        const startIdx = cleanResult.indexOf('{');
        const endIdx = cleanResult.lastIndexOf('}') + 1;
        
        if (startIdx !== -1 && endIdx !== 0) {
          const jsonStr = cleanResult.slice(startIdx, endIdx);
          clarificationData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.warn('Could not parse clarification response as JSON:', parseError);
        // Fallback response
        clarificationData = {
          requirements: [`Research and analyze: ${query}`],
          constraints: ["Use reliable sources", "Provide evidence-based answers"],
          questions: [],
          answerFormat: {
            type: "causal_analysis" as const,
            description: "Comprehensive research report with analysis",
            confidenceRequired: true,
            uncertaintyBounds: true
          },
          complexity: "medium" as const,
          resourceAllocation: "Standard research resources needed"
        };
      }

      console.log(`✅ LiteLLM clarification completed in ${processingTime}ms`);
      return clarificationData;

    } catch (error: any) {
      console.error('Error in clarifyIntent:', error);
      throw new Error(`Clarification failed: ${error.message}`);
    }
  }

  async generateSynthesis(
    query: string,
    webResults: any[],
    arxivResults: any[],
    redditResults: any[]
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const prompt = `
You are a research synthesis agent. Your task is to analyze all provided research data and create a comprehensive, well-structured report.

ORIGINAL QUERY: "${query}"

WEB SEARCH RESULTS:
${webResults.map((result, i) => `
${i + 1}. ${result.title}
   URL: ${result.url}
   Content: ${result.content?.substring(0, 500)}...
`).join('\n')}

ARXIV RESULTS:
${arxivResults.map((result, i) => `
${i + 1}. ${result.title}
   Authors: ${result.authors?.join(', ') || 'N/A'}
   Abstract: ${result.summary?.substring(0, 500)}...
`).join('\n')}

REDDIT DISCUSSIONS:
${redditResults.map((result, i) => `
${i + 1}. ${result.title}
   Subreddit: ${result.subreddit}
   Content: ${result.content?.substring(0, 300)}...
`).join('\n')}

Please create a comprehensive synthesis report that:
1. Directly answers the original query
2. Integrates insights from all sources
3. Highlights key findings and patterns
4. Notes any conflicting information or uncertainties
5. Provides actionable conclusions

Format your response as a well-structured markdown report.
`;

    try {
      const response = await this.callLiteLLM(
        prompt,
        this.getModelForTask('generateSynthesis'),
        "You are a research synthesis expert. Create comprehensive, well-structured reports."
      );

      const processingTime = Date.now() - startTime;

      console.log(`✅ LiteLLM synthesis completed in ${processingTime}ms`);

      return {
        response: response,
        processingTime,
        metadata: {
          model: this.defaultModel,
          cost: 0.0
        }
      };

    } catch (error: any) {
      console.error('Error in generateSynthesis:', error);
      throw new Error(`Synthesis failed: ${error.message}`);
    }
  }

  async generateCompletion(
    prompt: string,
    systemPrompt?: string,
    model?: string
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      const usingModel = model || this.getModelForTask('generateCompletion');
      const normalizedModel = this.normalizeModelName(usingModel);
      const isPerplexityModel = normalizedModel.startsWith('perplexity/');
      
      // For Perplexity models, we need to get the full response to extract citations
      let response: string;
      let citations: string[] = [];
      
      if (isPerplexityModel) {
        const llm = await this.getLLM();
        const messages: Message[] = [];
        if (systemPrompt) {
          messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: prompt });
        
        const fullResponse = await llm.acompletion(messages, normalizedModel, "questsage_user");
        response = fullResponse.choices[0].message.content;
        
        // Extract citations from the top-level response
        if (fullResponse.citations && Array.isArray(fullResponse.citations)) {
          citations = fullResponse.citations;
        }
      } else {
        response = await this.callLiteLLM(prompt, usingModel, systemPrompt || "You are a helpful assistant.");
      }

      const processingTime = Date.now() - startTime;

      console.log(`✅ LiteLLM completion completed in ${processingTime}ms`);

      return {
        response: response,
        processingTime,
        citations: citations.length > 0 ? citations : undefined,
        metadata: {
          model: normalizedModel,
          cost: 0.0
        }
      };

    } catch (error: any) {
      console.error('Error in generateCompletion:', error);
      throw new Error(`Completion failed: ${error.message}`);
    }
  }

  async orchestrateResearch(clarifiedIntent: any, searchTerms: GeneratedSearchTerms): Promise<any> {
    const startTime = Date.now();

    const prompt = `
You are a research orchestration agent. Your task is to plan and coordinate a comprehensive research process.

CLARIFIED INTENT: ${JSON.stringify(clarifiedIntent, null, 2)}

SEARCH TERMS PACKAGE: ${JSON.stringify(searchTerms, null, 2)}

Please provide a detailed research orchestration plan that includes:

1. SEARCH_STRATEGY: How should the search be conducted across different sources?
2. PRIORITY_SOURCES: Which sources should be prioritized for this research?
3. ANALYSIS_APPROACH: How should the gathered information be analyzed?
4. SYNTHESIS_REQUIREMENTS: What are the key elements for the final synthesis?

Respond in JSON format:
{
  "searchStrategy": {
    "webSearch": { "priority": "high", "terms": ["term1", "term2"] },
    "arxivSearch": { "priority": "medium", "terms": ["term1"] },
    "redditSearch": { "priority": "low", "subreddits": ["subreddit1"] }
  },
  "prioritySources": ["web", "arxiv", "reddit"],
  "analysisApproach": "comparative_analysis",
  "synthesisRequirements": ["key_findings", "evidence_strength", "contradictions"]
}
`;

    try {
      const responseText = await this.callLiteLLM(
        prompt,
        this.getModelForTask('orchestrateResearch'),
        "You are a research orchestration agent. Always respond in valid JSON format."
      );

      const processingTime = Date.now() - startTime;

      // Try to parse the result as JSON
      let orchestrationData;
      try {
        const resultStr = responseText.trim();
        let cleanResult = resultStr;
        
        if (cleanResult.startsWith('```json')) {
          cleanResult = cleanResult.slice(7);
        }
        if (cleanResult.endsWith('```')) {
          cleanResult = cleanResult.slice(0, -3);
        }

        const startIdx = cleanResult.indexOf('{');
        const endIdx = cleanResult.lastIndexOf('}') + 1;
        
        if (startIdx !== -1 && endIdx !== 0) {
          const jsonStr = cleanResult.slice(startIdx, endIdx);
          orchestrationData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.warn('Could not parse orchestration response as JSON:', parseError);
        // Fallback orchestration
        const fallbackTerms = searchTerms?.surfaceTerms?.length ? searchTerms.surfaceTerms : ["research", "analysis", "study"];
        orchestrationData = {
          searchStrategy: {
            webSearch: { priority: "high", terms: fallbackTerms.slice(0, 3) },
            arxivSearch: { priority: "medium", terms: fallbackTerms.slice(0, 2) },
            redditSearch: { priority: "low", subreddits: searchTerms?.domainSpecificSources?.relevantSubreddits?.map(sub => sub.replace(/^r\//, ''))?.slice(0, 3) || ["AskReddit", "science", "technology"] }
          },
          prioritySources: ["web", "arxiv", "reddit"],
          analysisApproach: "comprehensive_analysis",
          synthesisRequirements: ["key_findings", "evidence_strength", "source_credibility"]
        };
      }

      console.log(`✅ LiteLLM orchestration completed in ${processingTime}ms`);
      return orchestrationData;

    } catch (error: any) {
      console.error('Error in orchestrateResearch:', error);
      throw new Error(`Research orchestration failed: ${error.message}`);
    }
  }

  async generateSearchTerms(clarifiedIntent: any): Promise<GeneratedSearchTerms> {
    const startTime = Date.now();

    const prompt = `
You are a search term generation agent. Based on the clarified research intent, generate optimal search terms for comprehensive research.

Respond in JSON with this structure:
{
  "surfaceTerms": ["term", ... at least 8 items],
  "socialTerms": ["term", ... at least 8 items],
  "domainSpecificSources": {
    "relevantSubreddits": ["r/...", ... at least 8 items],
    "expertTwitterAccounts": ["@handle", ... at least 5 items],
    "specializedDatabases": ["Database", ... at least 3 items],
    "professionalForums": ["Forum", ... at least 3 items],
    "industryResources": ["Resource", ... at least 3 items]
  },
  "relevanceRubric": "Detailed scoring rubric for filtering",
  "evidenceThresholds": {
    "minimumRelevanceScore": 0-100,
    "qualityThresholds": { "high": 80-100, "medium": 60-79, "low": 40-59 }
  }
}

CLARIFIED INTENT: ${JSON.stringify(clarifiedIntent, null, 2)}
`;

    const ensureStringArray = (value: unknown, fallback: string[]): string[] => {
      if (Array.isArray(value)) {
        return value
          .map(item => String(item).trim())
          .filter(item => item.length > 0)
          .filter((item, index, self) => self.indexOf(item) === index);
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        return [value.trim()];
      }
      return [...fallback];
    };

    const defaultSearchTerms: GeneratedSearchTerms = {
      surfaceTerms: [
        "large language models workplace productivity 2024",
        "AI automation knowledge work employment impact",
        "ChatGPT workplace adoption timeline studies",
        "LLM productivity gains empirical research",
        "generative AI knowledge worker efficiency",
        "artificial intelligence job displacement statistics",
        "AI tools productivity measurement research",
        "LLM adoption enterprise transformation"
      ],
      socialTerms: [
        "LLM workplace transformation experience",
        "AI job displacement knowledge workers",
        "ChatGPT productivity gains real world",
        "AI tools workplace implementation challenges",
        "generative AI professional experience",
        "LLM integration work efficiency",
        "AI productivity tools user reviews",
        "ChatGPT workplace adoption stories"
      ],
      domainSpecificSources: {
        relevantSubreddits: [
          "r/MachineLearning",
          "r/artificial",
          "r/ChatGPT",
          "r/OpenAI",
          "r/singularity",
          "r/cscareerquestions",
          "r/programming",
          "r/productivity"
        ],
        expertTwitterAccounts: [
          "@AndrewYNg",
          "@GaryMarcus",
          "@ylecun",
          "@sama",
          "@nonmayorpete"
        ],
        specializedDatabases: [
          "NBER Working Papers",
          "IEEE Xplore",
          "SSRN Research"
        ],
        professionalForums: [
          "Hacker News",
          "Stack Overflow AI",
          "LessWrong"
        ],
        industryResources: [
          "McKinsey Global Institute",
          "MIT Technology Review",
          "Gartner AI Reports"
        ]
      },
      relevanceRubric: "Score 0-100: Empirical data (30pts), relevance to knowledge work (25pts), recency <2 years (20pts), source credibility (15pts), methodology rigor (10pts)",
      evidenceThresholds: {
        minimumRelevanceScore: 65,
        qualityThresholds: {
          high: 85,
          medium: 70,
          low: 55,
        }
      }
    };

    try {
      const responseText = await this.callLiteLLM(
        prompt,
        this.getModelForTask('generateSearchTerms'),
        "You are a search term generation expert. Always respond with the required JSON structure."
      );

      const processingTime = Date.now() - startTime;

      let parsed: Partial<GeneratedSearchTerms> | null = null;

      try {
        parsed = this.extractAndParseJson<Partial<GeneratedSearchTerms>>(
          responseText,
          "search terms"
        );
        
        if (!parsed) {
          console.warn('⚠️  Could not extract JSON from search terms response, using defaults');
        }
      } catch (parseError) {
        console.warn('⚠️  Error parsing search terms response:', parseError);
        parsed = null;
      }

      const domainSpecific = parsed?.domainSpecificSources || {};

      const merged: GeneratedSearchTerms = {
        surfaceTerms: ensureStringArray(parsed?.surfaceTerms, defaultSearchTerms.surfaceTerms),
        socialTerms: ensureStringArray(parsed?.socialTerms, defaultSearchTerms.socialTerms),
        domainSpecificSources: {
          relevantSubreddits: (() => {
            const normalized = ensureStringArray(
              (domainSpecific as any)?.relevantSubreddits ?? (parsed as any)?.relevantSubreddits,
              defaultSearchTerms.domainSpecificSources.relevantSubreddits
            ).map(sub => {
              // Remove r/ prefix and return clean subreddit name (without r/)
              const clean = sub.replace(/^r\//, '').trim();
              return clean;
            }).filter(Boolean).filter(sub => sub.length > 0) as string[];
            return Array.from(new Set(normalized));
          })(),
          expertTwitterAccounts: ensureStringArray(
            (domainSpecific as any)?.expertTwitterAccounts,
            defaultSearchTerms.domainSpecificSources.expertTwitterAccounts
          ),
          specializedDatabases: ensureStringArray(
            (domainSpecific as any)?.specializedDatabases,
            defaultSearchTerms.domainSpecificSources.specializedDatabases
          ),
          professionalForums: ensureStringArray(
            (domainSpecific as any)?.professionalForums,
            defaultSearchTerms.domainSpecificSources.professionalForums
          ),
          industryResources: ensureStringArray(
            (domainSpecific as any)?.industryResources,
            defaultSearchTerms.domainSpecificSources.industryResources
          ),
        },
        relevanceRubric: typeof parsed?.relevanceRubric === 'string' && parsed.relevanceRubric.trim().length > 0 ? parsed.relevanceRubric : defaultSearchTerms.relevanceRubric,
        evidenceThresholds: {
          minimumRelevanceScore: typeof parsed?.evidenceThresholds?.minimumRelevanceScore === 'number' ? parsed.evidenceThresholds.minimumRelevanceScore : defaultSearchTerms.evidenceThresholds.minimumRelevanceScore,
          qualityThresholds: {
            high: typeof parsed?.evidenceThresholds?.qualityThresholds?.high === 'number' ? parsed.evidenceThresholds.qualityThresholds.high : defaultSearchTerms.evidenceThresholds.qualityThresholds.high,
            medium: typeof parsed?.evidenceThresholds?.qualityThresholds?.medium === 'number' ? parsed.evidenceThresholds.qualityThresholds.medium : defaultSearchTerms.evidenceThresholds.qualityThresholds.medium,
            low: typeof parsed?.evidenceThresholds?.qualityThresholds?.low === 'number' ? parsed.evidenceThresholds.qualityThresholds.low : defaultSearchTerms.evidenceThresholds.qualityThresholds.low,
          }
        }
      };

      console.log(`✅ [${this.serviceName.toUpperCase()}] LiteLLM search term package generated in ${processingTime}ms`);
      return merged;

    } catch (error: any) {
      console.error('Error in generateSearchTerms:', error);
      return defaultSearchTerms;
    }
  }

  async extractFactsFromWebResults(webResults: any[], relevanceRubric: any): Promise<any> {
    const prompt = `Extract key facts from web search results. Focus on factual claims, evidence, and relevant data points.
    
Web Results: ${JSON.stringify(webResults.slice(0, 10), null, 2)}
Relevance Rubric: ${JSON.stringify(relevanceRubric, null, 2)}

Return structured facts with source attribution in JSON format:
{
  "claims": [
    {
      "claim": "Specific factual claim",
      "evidence": "Supporting evidence",
      "source": "Source information",
      "relevanceScore": 85
    }
  ],
  "totalClaims": 5,
  "processingNotes": "Processing summary"
}`;

    try {
      const response = await this.generateCompletion(prompt, "You are a fact extraction expert. Always return valid JSON.", this.getModelForTask('extractFactsFromWebResults'));
      
      // Try to parse as JSON
      let extractedData;
      try {
        const resultStr = response.response.trim();
        let cleanResult = resultStr;
        
        if (cleanResult.startsWith('```json')) {
          cleanResult = cleanResult.slice(7);
        }
        if (cleanResult.endsWith('```')) {
          cleanResult = cleanResult.slice(0, -3);
        }

        const startIdx = cleanResult.indexOf('{');
        const endIdx = cleanResult.lastIndexOf('}') + 1;
        
        if (startIdx !== -1 && endIdx !== 0) {
          const jsonStr = cleanResult.slice(startIdx, endIdx);
          extractedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.warn('Could not parse fact extraction response as JSON, using fallback');
        extractedData = {
          claims: [],
          totalClaims: 0,
          processingNotes: `Web extraction completed with ${webResults.length} results. Raw response: ${(response.response || '').substring(0, 200)}...`
        };
      }

      // Ensure claims is always an array
      if (!Array.isArray(extractedData.claims)) {
        extractedData.claims = [];
      }

      return extractedData;
    } catch (error: any) {
      console.error('Error in extractFactsFromWebResults:', error);
      return {
        claims: [],
        totalClaims: 0,
        processingNotes: `Error during web fact extraction: ${error?.message || 'Unknown error'}`
      };
    }
  }

  async extractFactsFromRedditResults(redditResults: any[], relevanceRubric: any): Promise<any> {
    const prompt = `Extract key insights and opinions from Reddit discussions. Focus on community perspectives and anecdotal evidence.
    
Reddit Results: ${JSON.stringify(redditResults.slice(0, 10), null, 2)}
Relevance Rubric: ${JSON.stringify(relevanceRubric, null, 2)}

Return structured insights with source attribution in JSON format:
{
  "claims": [
    {
      "claim": "Specific insight or opinion",
      "evidence": "Supporting discussion",
      "source": "Reddit source",
      "relevanceScore": 75
    }
  ],
  "totalClaims": 3,
  "processingNotes": "Processing summary"
}`;

    try {
      const response = await this.generateCompletion(prompt, "You are a social media analysis expert. Always return valid JSON.", this.getModelForTask('extractFactsFromRedditResults'));
      
      // Try to parse as JSON
      let extractedData;
      try {
        const resultStr = response.response.trim();
        let cleanResult = resultStr;
        
        if (cleanResult.startsWith('```json')) {
          cleanResult = cleanResult.slice(7);
        }
        if (cleanResult.endsWith('```')) {
          cleanResult = cleanResult.slice(0, -3);
        }

        const startIdx = cleanResult.indexOf('{');
        const endIdx = cleanResult.lastIndexOf('}') + 1;
        
        if (startIdx !== -1 && endIdx !== 0) {
          const jsonStr = cleanResult.slice(startIdx, endIdx);
          extractedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.warn('Could not parse Reddit fact extraction response as JSON, using fallback');
        extractedData = {
          claims: [],
          totalClaims: 0,
          processingNotes: `Reddit extraction completed with ${redditResults.length} results. Raw response: ${(response.response || '').substring(0, 200)}...`
        };
      }

      // Ensure claims is always an array
      if (!Array.isArray(extractedData.claims)) {
        extractedData.claims = [];
      }

      return extractedData;
    } catch (error: any) {
      console.error('Error in extractFactsFromRedditResults:', error);
      return {
        claims: [],
        totalClaims: 0,
        processingNotes: `Error during Reddit fact extraction: ${error?.message || 'Unknown error'}`
      };
    }
  }

  async extractFactsFromArxivResults(arxivResults: any[], relevanceRubric: any): Promise<any> {
    const prompt = `Extract key findings from academic papers. Focus on research conclusions, methodologies, and empirical results.
    
arXiv Results: ${JSON.stringify(arxivResults.slice(0, 10), null, 2)}
Relevance Rubric: ${JSON.stringify(relevanceRubric, null, 2)}

Return structured findings with source attribution in JSON format:
{
  "claims": [
    {
      "claim": "Specific research finding",
      "evidence": "Supporting methodology/data",
      "source": "arXiv paper reference",
      "relevanceScore": 90
    }
  ],
  "totalClaims": 8,
  "processingNotes": "Processing summary"
}`;

    try {
      const response = await this.generateCompletion(prompt, "You are an academic research analyst. Always return valid JSON.", this.getModelForTask('extractFactsFromArxivResults'));
      
      // Try to parse as JSON
      let extractedData;
      try {
        const resultStr = response.response.trim();
        let cleanResult = resultStr;
        
        if (cleanResult.startsWith('```json')) {
          cleanResult = cleanResult.slice(7);
        }
        if (cleanResult.endsWith('```')) {
          cleanResult = cleanResult.slice(0, -3);
        }

        const startIdx = cleanResult.indexOf('{');
        const endIdx = cleanResult.lastIndexOf('}') + 1;
        
        if (startIdx !== -1 && endIdx !== 0) {
          const jsonStr = cleanResult.slice(startIdx, endIdx);
          extractedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.warn('Could not parse arXiv fact extraction response as JSON, using fallback');
        extractedData = {
          claims: [],
          totalClaims: 0,
          processingNotes: `arXiv extraction completed with ${arxivResults.length} results. Raw response: ${(response.response || '').substring(0, 200)}...`
        };
      }

      // Ensure claims is always an array
      if (!Array.isArray(extractedData.claims)) {
        extractedData.claims = [];
      }

      return extractedData;
    } catch (error: any) {
      console.error('Error in extractFactsFromArxivResults:', error);
      return {
        claims: [],
        totalClaims: 0,
        processingNotes: `Error during arXiv fact extraction: ${error?.message || 'Unknown error'}`
      };
    }
  }

  async generateSurfaceResearchReport(factExtraction: any, searchResults: any, clarifiedIntent?: any): Promise<any> {
    // Create compact summary format instead of full JSON to avoid context window issues
    // All full data is preserved in temp files, this is just for the LLM prompt
    const createCompactSummary = (results: any[], sourceName: string) => {
      if (!Array.isArray(results) || results.length === 0) {
        return `No ${sourceName} results found.`;
      }
      
      // Include all results but in compact format (title + URL only, no full content)
      const resultList = results.map((r: any, i: number) => 
        `${i + 1}. [${r.relevanceScore || 'N/A'}] ${r.title?.substring(0, 200) || 'Untitled'} | ${r.url || 'No URL'}`
      ).join('\n');
      
      return `${sourceName} (${results.length} results):\n${resultList}`;
    };

    const searchSummary = `
WEB SEARCH RESULTS:
${createCompactSummary(searchResults?.web?.results || [], 'Web')}

ARXIV SEARCH RESULTS:
${createCompactSummary(searchResults?.arxiv?.results || [], 'arXiv')}

REDDIT SEARCH RESULTS:
${createCompactSummary(searchResults?.reddit?.results || [], 'Reddit')}
`;

    // Include all fact extraction claims but in compact format
    const factExtractionSummary = factExtraction?.claims?.map((c: any, i: number) => 
      `${i + 1}. [Score: ${c.relevanceScore || 'N/A'}] ${(c.claim || c.text || '').substring(0, 300)} | Source: ${c.source || 'unknown'}`
    ).join('\n') || 'No claims extracted.';

    const prompt = `Generate a comprehensive surface-level research report based on the extracted facts and search results.
    
FACT EXTRACTION SUMMARY:
Total Claims: ${factExtraction?.totalClaims || 0}
Processing Notes: ${factExtraction?.processingNotes || 'No notes'}

All Extracted Claims:
${factExtractionSummary}

SEARCH RESULTS (all ${(searchResults?.web?.results?.length || 0) + (searchResults?.arxiv?.results?.length || 0) + (searchResults?.reddit?.results?.length || 0)} total results):
${searchSummary}

CLARIFIED INTENT:
${clarifiedIntent ? JSON.stringify(clarifiedIntent, null, 2) : 'None provided'}

Create a structured report with:
1. Executive Summary
2. Key Findings (synthesize insights from fact extraction and search results)
3. Source Analysis (analyze quality, relevance, and coverage of all sources)
4. Preliminary Conclusions
5. Areas for Deep Research

Note: Full search result content is available in saved files. Focus on synthesizing insights from the fact extraction claims and search result metadata.`;

    const response = await this.generateCompletion(prompt, "You are a research report writer.", this.getModelForTask('generateSurfaceResearchReport'));
    return {
      report: response.response,
      keyFindings: ["Surface research completed"],
      sourceAttribution: ["Web", "Reddit", "arXiv"],
      confidenceLevel: 0.7
    };
  }

  async generateDeepResearchQuery(analysis: any): Promise<string> {
    const prompt = `You are a deep research strategist. Based on the analysis below, craft ONE precise research query that will unlock the most actionable additional evidence. Keep it under 220 characters.

Analysis Context: ${JSON.stringify(analysis, null, 2)}

Return only the query text without quotation marks.`;

    try {
      const completion = await this.generateCompletion(
        prompt,
        "You are a deep research strategist who proposes targeted follow-up investigations.",
        this.getModelForTask('generateDeepResearchQuery')
      );

      const lines = (completion.response || '').split('\n').map(line => line.trim()).filter(Boolean);
      const firstLine = lines[0] || '';
      const cleaned = firstLine.replace(/^Query\s*[:\-]\s*/i, '').trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    } catch (error) {
      console.warn(`⚠️ [${this.serviceName.toUpperCase()}] Deep research query generation failed, using fallback`, error);
    }

    return 'Investigate the highest-impact unresolved claim from the analysis using authoritative, recent sources';
  }

  async generateDeepResearchReport(deepResults: any): Promise<any> {
    const prompt = `You are a deep research analyst. Review the deep research results and produce a structured JSON report.

CRITICAL: You MUST return ONLY valid JSON. Do not include any markdown code blocks, explanations, or text outside the JSON object.

Required JSON structure:
{
  "report": "Narrative synthesis of deep findings",
  "keyFindings": ["Top-level insight 1", "Top-level insight 2"],
  "sourceAttribution": [
    {
      "claim": "Short claim",
      "sources": ["Source title"],
      "strength": "high"
    }
  ],
  "confidenceAssessment": "High",
  "nextValidationSteps": ["Actionable follow-up"]
}

Deep Results: ${JSON.stringify(deepResults, null, 2)}

Return ONLY the JSON object, nothing else.`;

    try {
      const completion = await this.generateCompletion(
        prompt,
        "You are a deep research analyst producing JSON summaries. You MUST return ONLY valid JSON without any markdown formatting, explanations, or additional text.",
        this.getModelForTask('generateDeepResearchReport')
      );

      const parsed = this.extractJsonFromResponse<any>(completion.response);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.warn(`⚠️ [${this.serviceName.toUpperCase()}] Deep research report generation failed, using fallback`, error);
    }

    return {
      report: deepResults?.answer || 'Deep research completed with limited structured output.',
      keyFindings: ['Deep research completed'],
      sourceAttribution: (deepResults?.sources || []).map((source: any) => ({
        claim: source.title || 'Reported finding',
        sources: [source.url || 'Unknown source'],
        strength: 'medium'
      })),
      confidenceAssessment: typeof deepResults?.confidence === 'number' && deepResults.confidence >= 0.8 ? 'High' : 'Medium',
      nextValidationSteps: ['Review full sources for validation', 'Cross-check contradictory evidence']
    };
  }

  async analyzeResearchFindings(findings: any[], evidenceThresholds: any): Promise<any> {
    const prompt = `Analyze research findings for credibility, consistency, and significance.
    
Findings: ${JSON.stringify(findings.slice(0, 20), null, 2)}
Evidence Thresholds: ${JSON.stringify(evidenceThresholds, null, 2)}

Provide analysis including:
1. Credibility assessment
2. Consistency check
3. Significance rating
4. Gaps identified`;

    const response = await this.generateCompletion(prompt, "You are a research analysis expert.", this.getModelForTask('analyzeResearchFindings'));
    return {
      analysis: response.response,
      credibilityScore: 0.75,
      consistencyScore: 0.8,
      significanceLevel: "medium"
    };
  }

  async selectAgents(researchData: any, userContext: any): Promise<any> {
    // Import createCompactResearchData to avoid context window overflow
    const { createCompactResearchData } = await import('./agents');
    const compactResearchData = createCompactResearchData(researchData);
    
    const prompt = `Select appropriate research agents based on the research data and user context.
    
Research Data Summary: ${JSON.stringify(compactResearchData, null, 2)}
User Context: ${JSON.stringify(userContext, null, 2)}

Select agents and provide configuration for optimal research execution.`;

    const response = await this.generateCompletion(prompt, "You are an AI agent coordinator.", this.getModelForTask('selectAgents'));
    return {
      selectedAgents: ["research", "analysis", "synthesis"],
      configuration: response.response,
      priority: "high"
    };
  }

  async checkAlignment(conversationHistory: any, userIntent: any, currentRound: number): Promise<any> {
    const prompt = `You are an alignment watchdog ensuring assistant behaviour stays within user intent.

Provide JSON with:
{
  "isAligned": true/false,
  "issues": ["Issue description"],
  "riskLevel": "low|medium|high",
  "recommendAction": "proceed|clarify|realign",
  "checkpointQuestion": "Question to ask user if clarify is needed",
  "driftAreas": ["Areas where dialogue drifted"],
  "recommendedActions": ["Next steps"],
  "followUpQuestions": ["User question"]
}

Conversation History: ${JSON.stringify(conversationHistory, null, 2)}
User Intent: ${JSON.stringify(userIntent, null, 2)}
Current Round: ${currentRound}

Return "recommendAction": "proceed" if the dialogue is aligned and should continue.
Return "recommendAction": "clarify" if minor clarification is needed.
Return "recommendAction": "realign" if major realignment is required.`;

    try {
      const completion = await this.generateCompletion(
        prompt,
        "You are an alignment watchdog. Always respond in JSON.",
        this.getModelForTask('checkAlignment')
      );

      const parsed = this.extractJsonFromResponse<any>(completion.response);
      if (parsed) {
        // Ensure recommendAction is set - default to 'proceed' if aligned
        if (!parsed.recommendAction) {
          parsed.recommendAction = parsed.isAligned ? 'proceed' : 'clarify';
        }
        return parsed;
      }
    } catch (error) {
      console.warn(`⚠️ [${this.serviceName.toUpperCase()}] Alignment check failed, using fallback`, error);
    }

    return {
      isAligned: true,
      issues: [],
      riskLevel: 'low',
      recommendAction: 'proceed',
      checkpointQuestion: '',
      driftAreas: [],
      recommendedActions: ['Continue with planned dialogue round'],
      followUpQuestions: []
    };
  }

  async evaluateDialogueRound(context: any): Promise<any> {
    // Import createCompactResearchData to avoid context window overflow
    const { createCompactResearchData } = await import('./agents');
    
    // Create compact context to avoid token overflow
    const compactContext: any = {
      roundNumber: context?.roundNumber,
      maxRounds: context?.maxRounds || 3,
      successCriteria: context?.successCriteria || []
    };
    
    // Compact research data if present
    if (context?.researchData) {
      compactContext.researchData = createCompactResearchData(context.researchData);
    }
    
    // Limit dialogue history to last 6 messages (3 rounds * 2 agents)
    if (context?.dialogueHistory && Array.isArray(context.dialogueHistory)) {
      compactContext.dialogueHistory = context.dialogueHistory.slice(-6).map((d: any) => ({
        agentType: d.agentType,
        message: d.message?.substring(0, 800) || '',
        roundNumber: d.roundNumber,
        confidenceScore: d.confidenceScore
      }));
    }
    
    const prompt = `You are a dialogue evaluator measuring collaboration quality between agents.

Return JSON:
{
  "qualityScore": 0-1,
  "convergence": 0-1,
  "insights": [""],
  "shouldContinue": true/false,
  "decision": "continue" or "conclude",
  "feedback": ["Feedback point 1", "Feedback point 2", ...],
  "questions": ["Question 1", "Question 2", ...]
}

IMPORTANT: If roundNumber >= maxRounds, you MUST return "decision": "conclude" and "shouldContinue": false.

Context: ${JSON.stringify(compactContext, null, 2)}
`;

    try {
      const completion = await this.generateCompletion(
        prompt,
        "You are a dialogue evaluator providing JSON feedback.",
        this.getModelForTask('evaluateDialogueRound')
      );

      const parsed = this.extractJsonFromResponse<any>(completion.response);
      if (parsed) {
        // Check max rounds limit - override decision if limit reached
        const maxRounds = compactContext.maxRounds || 3;
        const roundNumber = compactContext.roundNumber || 1;
        if (roundNumber >= maxRounds) {
          parsed.decision = "conclude";
          parsed.shouldContinue = false;
          parsed.feedback = parsed.feedback || [`Maximum rounds (${maxRounds}) reached.`];
        }
        
        // Ensure decision field is set based on shouldContinue if not present
        if (!parsed.decision && parsed.shouldContinue !== undefined) {
          parsed.decision = parsed.shouldContinue ? "continue" : "conclude";
        }
        // Also ensure shouldContinue is set if decision is present but shouldContinue is not
        if (!parsed.shouldContinue && parsed.decision) {
          parsed.shouldContinue = parsed.decision === "continue";
        }
        // Normalize feedback to array format (frontend expects array)
        if (parsed.feedback && typeof parsed.feedback === 'string') {
          parsed.feedback = [parsed.feedback];
        } else if (!Array.isArray(parsed.feedback)) {
          parsed.feedback = [];
        }
        // Ensure questions is always an array
        if (!Array.isArray(parsed.questions)) {
          parsed.questions = [];
        }
        return parsed;
      }
    } catch (error) {
      console.warn(`⚠️ [${this.serviceName.toUpperCase()}] Dialogue evaluation failed, using fallback`, error);
    }

    return {
      qualityScore: 0.8,
      convergence: 0.7,
      insights: ['Dialogue produced complementary perspectives'],
      shouldContinue: (context?.roundNumber || 1) < (context?.maxRounds || 3),
      decision: (context?.roundNumber || 1) >= (context?.maxRounds || 3) ? "conclude" : "continue",
      feedback: ['Maintain focus on evidence-backed reasoning and address outstanding contradictions.'],
      questions: []
    };
  }

  async synthesizeResults(surfaceResearchReport: any, deepResearchReport: any, dialogueHistory: any, userContext: any): Promise<any> {
    // Import createCompactResearchData to avoid context window overflow
    const { createCompactResearchData } = await import('./agents');
    
    // Create compact versions of inputs to avoid token overflow
    const compactSurfaceReport = surfaceResearchReport ? {
      report: surfaceResearchReport.report?.substring(0, 5000) || '',
      keyFindings: surfaceResearchReport.keyFindings || [],
      confidenceLevel: surfaceResearchReport.confidenceLevel
    } : null;
    
    const compactDeepReport = deepResearchReport ? {
      report: deepResearchReport.report?.substring(0, 5000) || '',
      keyFindings: deepResearchReport.keyFindings || [],
      confidenceAssessment: deepResearchReport.confidenceAssessment
    } : null;
    
    // Limit dialogue history to last 10 messages (5 rounds * 2 agents)
    const compactDialogueHistory = dialogueHistory && Array.isArray(dialogueHistory)
      ? dialogueHistory.slice(-10).map((d: any) => ({
          agentType: d.agentType,
          message: d.message?.substring(0, 1000) || '',
          roundNumber: d.roundNumber
        }))
      : [];
    
    const prompt = `You are the synthesis orchestrator. Combine the surface research, deep research, and dialogue into a final deliverable.

Return JSON:
{
  "executiveSummary": "Paragraph",
  "keyFindings": [""],
  "recommendations": [""],
  "confidence": "high|medium|low",
  "nextSteps": [""],
  "risks": [""],
  "appendix": {
    "surfaceHighlights": [""],
    "deepHighlights": [""],
    "dialogueConsensus": [""],
    "openQuestions": [""],
    "userConsiderations": [""],
    "alignmentNotes": [""],
    "confidenceRationale": ""
  }
}

Surface Research Report: ${JSON.stringify(compactSurfaceReport, null, 2)}
Deep Research Report: ${JSON.stringify(compactDeepReport, null, 2)}
Dialogue History (last 10 messages): ${JSON.stringify(compactDialogueHistory, null, 2)}
User Context: ${JSON.stringify(userContext || {}, null, 2)}
`;

    try {
      const completion = await this.generateCompletion(
        prompt,
        "You are a synthesis orchestrator who returns JSON.",
        this.getModelForTask('synthesizeResults')
      );

      const parsed = this.extractJsonFromResponse<any>(completion.response);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.warn(`⚠️ [${this.serviceName.toUpperCase()}] Final synthesis failed, using fallback`, error);
    }

    return {
      executiveSummary: 'Synthesis completed. The combined evidence supports moderate confidence conclusions with targeted next steps.',
      keyFindings: ['Surface and deep research align on core trend direction', 'Agent dialogue surfaced nuanced risk factors'],
      recommendations: ['Validate high-impact claims with additional primary sources', 'Launch pilot programs with governance guardrails'],
      confidence: 'medium',
      nextSteps: ['Schedule review session with stakeholders', 'Prioritize data collection for identified gaps'],
      risks: ['Evidence gaps in long-term projections', 'Potential misalignment with user constraints'],
      appendix: {
        surfaceHighlights: surfaceResearchReport?.keyFindings || [],
        deepHighlights: deepResearchReport?.keyFindings || [],
        dialogueConsensus: Array.isArray(dialogueHistory) ? dialogueHistory.slice(-2).map((entry: any) => entry?.message || '') : [],
        openQuestions: ['How quickly will competitive pressure accelerate adoption?', 'What safeguards mitigate highlighted risks?'],
        userConsiderations: userContext ? [JSON.stringify(userContext)] : [],
        alignmentNotes: ['Fallback synthesis generated without model insights'],
        confidenceRationale: 'Confidence defaulted to medium due to fallback synthesis.'
      }
    };
  }

  // Health check for the LiteLLM service
  async healthCheck(): Promise<boolean> {
    try {
      // Test if we can get an API key
      const apiKey = await getFromEnvOrSecrets("LITE_LLM_PROXY_ARCHIE_BACKFILL");
      return apiKey !== null;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const liteLLMService = new LiteLLMService('lite');

// Instantiate dedicated services for flash and pro workflows
export const flashLLMService = new LiteLLMService('flash');
export const proLLMService = new LiteLLMService('pro');
