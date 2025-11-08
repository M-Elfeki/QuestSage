#!/usr/bin/env ts-node

/**
 * LLM Service for QuestSage using LiteLLM
 * Based on the working Test/litellm_ts/litellm_test.ts implementation
 */

import * as AWS from 'aws-sdk';
import axios from 'axios';
import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load litellm_config.env file if it exists
 * This file contains export statements like: export LITELLM_API_KEY="value"
 */
function loadLiteLLMConfig(): void {
  try {
    const configPath = path.join(__dirname, '..', 'litellm_config.env');
    if (fs.existsSync(configPath)) {
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
    defaultModel: 'gpt-4o-mini',
    taskModels: {}
  }
};

try {
  const configPath = path.join(__dirname, '..', 'config.json');
  const configData = fs.readFileSync(configPath, 'utf-8');
  llmConfig = JSON.parse(configData);
} catch (error) {
  console.warn('Could not load config.json in llm_service, using defaults:', error);
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
 * This replicates the genai keystore functionality.
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
 * A simple wrapper class for the litellm package without genai dependencies.
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

  /**
   * Convert input to messages format.
   */
  private getMessages(inputData: string | Message[]): Message[] {
    if (typeof inputData === 'string') {
      return [{ role: "user", content: inputData }];
    } else if (Array.isArray(inputData)) {
      return inputData;
    } else {
      return inputData as Message[];
    }
  }

  /**
   * Generate a completion for the given input asynchronously.
   */
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
    
    // Use the exact same model format as the working Test version
    const requestData: any = {
      model: usingModel, // Use model name directly, not with litellm_proxy prefix
      messages: messages,
      ...(user && { user }),
      ...kwargs
    };
    
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
          }
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
      throw new Error(`LiteLLM API call failed: ${errorMsg}`);
    }
  }

  /**
   * Generate a completion for the given input synchronously.
   */
  completion(
    inputData: string | Message[],
    modelName: string | null = null,
    user: string | null = null,
    ...kwargs: any[]
  ): Promise<ModelResponse> {
    return this.acompletion(inputData, modelName, user, ...kwargs);
  }
}

async function main(
  prompt: string,
  llmModel: string = llmConfig?.llmModels?.defaultModel || "gpt-4o-mini",
  user: string = "internal_use",
  apiKeyName: string = "LITELLM_API_KEY",
  systemPrompt: string = "You are a helpful assistant."
): Promise<string> {
  // Get API key from environment or secrets - prioritize LITELLM_API_KEY
  const apiKey = await getFromEnvOrSecrets("LITELLM_API_KEY") || 
                 await getFromEnvOrSecrets("LITE_LLM_PROXY_ARCHIE_BACKFILL") ||
                 await getFromEnvOrSecrets(apiKeyName, null);

  if (!apiKey) {
    console.error(`\nAPI key not found for ${apiKeyName}`);
    console.error('Please set one of the following environment variables:');
    console.error(`- LITELLM_API_KEY (preferred)`);
    console.error(`- ${apiKeyName}`);
    console.error('- OPENAI_API_KEY');
    console.error('- ANTHROPIC_API_KEY');
    console.error('- CLAUDE_API_KEY'); 
    console.error('- GEMINI_API_KEY');
    console.error('- GOOGLE_API_KEY');
    console.error('- LLM_API_KEY');
    console.error('\nExample: export LITELLM_API_KEY="your-api-key-here"');
    throw new Error(`API key not found for ${apiKeyName}`);
  }

  // Use the LiteLLM wrapper with real API key
  const baseURL = getLiteLLMBaseURL();
  const llm = new LiteLLM(llmModel, apiKey, baseURL);

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: typeof prompt === 'string' ? prompt : JSON.stringify(prompt)
    }
  ];

  const result = await llm.acompletion(messages, undefined, user);

  return result.choices[0].message.content;
}

// Express app for HTTP interface
const app = express();
app.use(cors());
app.use(express.json());

// Global LLM service instance
let llmService: LiteLLM | null = null;

async function getLLMService(): Promise<LiteLLM> {
  if (llmService === null) {
    // Try LITELLM_API_KEY first (from config file), then fallback to LITE_LLM_PROXY_ARCHIE_BACKFILL
    const apiKey = await getFromEnvOrSecrets("LITELLM_API_KEY") || 
                   await getFromEnvOrSecrets("LITE_LLM_PROXY_ARCHIE_BACKFILL");
    if (!apiKey) {
      throw new Error("No API key available for LiteLLM service. Please set LITELLM_API_KEY or LITE_LLM_PROXY_ARCHIE_BACKFILL");
    }
    const baseURL = getLiteLLMBaseURL();
    console.log(`🔧 Initializing LiteLLM service with model: ${llmConfig?.llmModels?.defaultModel || "gpt-4o-mini"}, base URL: ${baseURL}`);
    llmService = new LiteLLM(llmConfig?.llmModels?.defaultModel || "gpt-4o-mini", apiKey, baseURL);
  }
  return llmService;
}

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'litellm' });
});

app.post('/completion', async (req, res) => {
  try {
    const { prompt, model = llmConfig?.llmModels?.defaultModel || 'gpt-4o-mini', system_prompt, user = 'questsage_user' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    // Use the main function directly (like the Test implementation)
    try {
      const result = await main(
        prompt,
        model,
        user,
        "LITELLM_API_KEY",
        system_prompt || "You are a helpful assistant."
      );

      res.json({
        result: result,
        model: model,
        cost: 0.0 // Cost tracking would need to be implemented separately
      });
    } catch (error: any) {
      if (error.message.includes('API key not found')) {
        return res.status(503).json({ 
          error: "LLM service unavailable: No API key configured",
          details: "Please set one of: LITE_LLM_PROXY_ARCHIE_BACKFILL, OPENAI_API_KEY, ANTHROPIC_API_KEY, CLAUDE_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, LITELLM_API_KEY, or LLM_API_KEY environment variable",
          service: "litellm",
          status: "no_api_key"
        });
      }
      throw error; // Re-throw other errors
    }

  } catch (error: any) {
    console.error('Completion error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/clarification', async (req, res) => {
  try {
    const { prompt, model = llmConfig?.llmModels?.defaultModel || 'gpt-4o-mini' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    // Use the main function directly
    try {
      const result = await main(
        prompt,
        model,
        "clarification_agent",
        "LITELLM_API_KEY",
        "You are a helpful assistant."
      );

      res.json({
        result: result,
        model: model,
        cost: 0.0
      });
    } catch (error: any) {
      if (error.message.includes('API key not found')) {
        return res.status(503).json({ 
          error: "LLM service unavailable: No API key configured",
          details: "Please set one of: LITE_LLM_PROXY_ARCHIE_BACKFILL, OPENAI_API_KEY, ANTHROPIC_API_KEY, CLAUDE_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, LITELLM_API_KEY, or LLM_API_KEY environment variable",
          service: "litellm",
          status: "no_api_key"
        });
      }
      throw error;
    }

  } catch (error: any) {
    console.error('Clarification error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/synthesis', async (req, res) => {
  try {
    const { prompt, model = llmConfig?.llmModels?.defaultModel || 'gpt-4o-mini' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    // Use the main function directly
    try {
      const result = await main(
        prompt,
        model,
        "synthesis_agent",
        "LITELLM_API_KEY",
        "You are a helpful assistant."
      );

      res.json({
        result: result,
        model: model,
        cost: 0.0
      });
    } catch (error: any) {
      if (error.message.includes('API key not found')) {
        return res.status(503).json({ 
          error: "LLM service unavailable: No API key configured",
          details: "Please set one of: LITE_LLM_PROXY_ARCHIE_BACKFILL, OPENAI_API_KEY, ANTHROPIC_API_KEY, CLAUDE_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, LITELLM_API_KEY, or LLM_API_KEY environment variable",
          service: "litellm",
          status: "no_api_key"
        });
      }
      throw error;
    }

  } catch (error: any) {
    console.error('Synthesis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.LLM_SERVICE_PORT || '5001');
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  app.listen(port, '0.0.0.0', () => {
    console.log(`Starting LLM Service on port ${port}`);
    console.log(`Environment: ${isDevelopment ? 'development' : 'production'}`);
    console.log(`Health check: http://localhost:${port}/health`);
  });
}

export { LiteLLM, main, getFromEnvOrSecrets, getLiteLLMBaseURL };
