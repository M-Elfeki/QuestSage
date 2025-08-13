import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { FlashLLMService, ProLLMService } from '../server/services/llm';
import { ChatGPTAgent, GeminiAgent } from '../server/services/agents';
import { configService } from '../server/services/config';

// Mock the external LLM APIs
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn()
    }
  }))
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  }))
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn()
    }
  }))
}));

describe('LLM Integration Tests', () => {
  let flashLLM: FlashLLMService;
  let proLLM: ProLLMService;
  let chatgptAgent: ChatGPTAgent;
  let geminiAgent: GeminiAgent;

  beforeAll(() => {
    // Set up environment variables for testing
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh instances
    flashLLM = new FlashLLMService();
    proLLM = new ProLLMService();
    chatgptAgent = new ChatGPTAgent();
    geminiAgent = new GeminiAgent();
  });

  afterEach(() => {
    // Reset config service state
    configService.setMode('dev');
  });

  describe('FlashLLMService', () => {
    describe('Development Mode', () => {
      beforeEach(() => {
        configService.setMode('dev');
      });

      test('should use Gemini Flash 2.5 for intent clarification in dev mode', async () => {
        const mockGeminiResponse = {
          text: JSON.stringify({
            requirements: ['Test requirement'],
            constraints: ['Test constraint'],
            questions: [],
            answerFormat: { type: 'prediction', description: 'Test format' },
            complexity: 'medium'
          })
        };

        // Mock Gemini Flash API call
        const mockGenerateContent = vi.fn().mockResolvedValue(mockGeminiResponse);
        (flashLLM as any).gemini = {
          models: { generateContent: mockGenerateContent }
        };

        const result = await flashLLM.clarifyIntent('test query');

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.5-flash',
          contents: expect.stringContaining('test query')
        });
        expect(result).toHaveProperty('requirements');
        expect(result.requirements).toContain('Test requirement');
      });

      test('should use Gemini Flash 2.5 for search terms generation in dev mode', async () => {
        const mockResponse = {
          text: JSON.stringify({
            surfaceTerms: ['term1', 'term2'],
            socialTerms: ['social1', 'social2'],
            domainSpecificSources: { relevantSubreddits: ['r/test'] },
            relevanceRubric: 'test rubric',
            sourceRankings: ['source1'],
            evidenceThresholds: { minimumRelevanceScore: 65 }
          })
        };

        const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
        (flashLLM as any).gemini = {
          models: { generateContent: mockGenerateContent }
        };

        const result = await flashLLM.generateSearchTerms({ test: 'intent' });

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.5-flash',
          contents: expect.any(String)
        });
        expect(result.surfaceTerms).toEqual(['term1', 'term2']);
      });

      test('should handle Gemini Flash API errors gracefully in dev mode', async () => {
        const mockGenerateContent = vi.fn().mockRejectedValue(new Error('API Error'));
        (flashLLM as any).gemini = {
          models: { generateContent: mockGenerateContent }
        };

        await expect(flashLLM.clarifyIntent('test query')).rejects.toThrow('API Error');
      });
    });

    describe('Production Mode', () => {
      beforeEach(() => {
        configService.setMode('prod');
      });

      test('should use Claude Sonnet for intent clarification in prod mode', async () => {
        const mockAnthropicResponse = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              requirements: ['Prod requirement'],
              constraints: ['Prod constraint'],
              questions: [],
              answerFormat: { type: 'prediction', description: 'Prod format' },
              complexity: 'high'
            })
          }]
        };

        const mockCreate = vi.fn().mockResolvedValue(mockAnthropicResponse);
        (flashLLM as any).anthropic = {
          messages: { create: mockCreate }
        };

        const result = await flashLLM.clarifyIntent('prod test query');

        expect(mockCreate).toHaveBeenCalledWith({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: expect.stringContaining('prod test query') }],
          max_tokens: 1500
        });
        expect(result.requirements).toContain('Prod requirement');
      });

      test('should handle Claude Sonnet API errors gracefully in prod mode', async () => {
        const mockCreate = vi.fn().mockRejectedValue(new Error('Claude API Error'));
        (flashLLM as any).anthropic = {
          messages: { create: mockCreate }
        };

        await expect(flashLLM.clarifyIntent('test query')).rejects.toThrow('Claude API Error');
      });
    });
  });

  describe('ProLLMService', () => {
    describe('Development Mode', () => {
      beforeEach(() => {
        configService.setMode('dev');
      });

      test('should use Gemini Flash 2.5 for research orchestration in dev mode', async () => {
        const mockResponse = {
          text: JSON.stringify({
            priorities: ['Priority 1'],
            expectedFindings: ['Finding 1'],
            evaluationCriteria: 'Test criteria',
            orchestrationPlan: { surfacePhase: '5 min' }
          })
        };

        const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
        (proLLM as any).gemini = {
          models: { generateContent: mockGenerateContent }
        };

        const result = await proLLM.orchestrateResearch({ test: 'intent' }, { test: 'terms' });

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.5-flash',
          contents: expect.any(String)
        });
        expect(result.priorities).toEqual(['Priority 1']);
      });

      test('should use Gemini Flash 2.5 for agent selection in dev mode', async () => {
        configService.setMode('dev');
        
        const result = await proLLM.selectAgents({ test: 'data' }, { test: 'context' });

        // In dev mode, this uses mock implementation with predefined logic
        expect(result).toHaveProperty('chatgptConfig');
        expect(result).toHaveProperty('geminiConfig');
        expect(result).toHaveProperty('successCriteria');
        expect(result).toHaveProperty('orchestratorRationale');
      });
    });

    describe('Production Mode', () => {
      beforeEach(() => {
        configService.setMode('prod');
      });

      test('should use Claude Opus for research orchestration in prod mode', async () => {
        const mockResponse = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              priorities: ['Prod Priority'],
              expectedFindings: ['Prod Finding'],
              evaluationCriteria: 'Prod criteria',
              orchestrationPlan: { surfacePhase: '10 min' }
            })
          }]
        };

        const mockCreate = vi.fn().mockResolvedValue(mockResponse);
        (proLLM as any).anthropic = {
          messages: { create: mockCreate }
        };

        const result = await proLLM.orchestrateResearch({ test: 'intent' }, { test: 'terms' });

        expect(mockCreate).toHaveBeenCalledWith({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: expect.any(String) }],
          max_tokens: 1500
        });
        expect(result.priorities).toEqual(['Prod Priority']);
      });

      test('should use Claude Opus for agent selection in prod mode', async () => {
        const mockResponse = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              chatgptConfig: { approach: 'inductive', focus: 'data' },
              geminiConfig: { approach: 'deductive', focus: 'theory' },
              successCriteria: ['Criterion 1'],
              orchestratorRationale: 'Test rationale',
              uncertaintyDimensions: ['Dimension 1']
            })
          }]
        };

        const mockCreate = vi.fn().mockResolvedValue(mockResponse);
        (proLLM as any).anthropic = {
          messages: { create: mockCreate }
        };

        const result = await proLLM.selectAgents({ test: 'data' }, { test: 'context' });

        expect(mockCreate).toHaveBeenCalledWith({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: expect.any(String) }],
          max_tokens: 2000
        });
        expect(result.successCriteria).toEqual(['Criterion 1']);
      });

      test('should use Claude Opus for final synthesis in prod mode', async () => {
        const mockResponse = {
          content: [{
            type: 'text',
            text: JSON.stringify({
              executiveSummary: 'Test summary',
              evidenceFoundation: [],
              reasoningChain: 'Test reasoning',
              dissentingViews: [],
              uncertaintyAnalysis: 'Test uncertainty',
              sourceAudit: [],
              confidenceInterval: [0.7, 0.9],
              synthesis: 'Test synthesis'
            })
          }]
        };

        const mockCreate = vi.fn().mockResolvedValue(mockResponse);
        (proLLM as any).anthropic = {
          messages: { create: mockCreate }
        };

        const result = await proLLM.synthesizeResults(
          { test: 'surface' },
          { test: 'deep' },
          { test: 'dialogue' },
          { test: 'context' }
        );

        expect(mockCreate).toHaveBeenCalledWith({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: expect.any(String) }],
          max_tokens: 4000
        });
        expect(result.executiveSummary).toBe('Test summary');
      });
    });
  });

  describe('ChatGPTAgent', () => {
    describe('Development Mode', () => {
      beforeEach(() => {
        configService.setMode('dev');
      });

      test('should use Gemini Flash 2.5 with inductive prompting in dev mode', async () => {
        const mockResponse = {
          text: 'Inductive analysis response based on empirical data patterns. This response demonstrates INDUCTIVE PATTERN ANALYSIS methodology with conservative extrapolation from empirical data sources.',
        };

        const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
        (chatgptAgent as any).gemini = {
          models: { generateContent: mockGenerateContent }
        };

        const config = {
          approach: 'inductive' as const,
          focus: 'empirical-data',
          evidenceWeight: 'empirical-maximizer',
          temporal: 'short-term',
          risk: 'base-rate-anchored'
        };

        const result = await chatgptAgent.generateResponse(
          { test: 'data' },
          config,
          [],
          'test prompt'
        );

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.5-flash',
          contents: expect.stringContaining('INDUCTIVE PATTERN ANALYSIS')
        });
        expect(result.content).toContain('Inductive analysis');
        expect(result.reasoning).toContain('conservative extrapolation');
        expect(result.metadata.agentPersonality).toBe('data-driven-conservative');
      });
    });

    describe('Production Mode', () => {
      beforeEach(() => {
        configService.setMode('prod');
      });

      test('should use OpenAI o3 in production mode', async () => {
        const mockResponse = {
          choices: [{
            message: {
              content: 'OpenAI o3 response with advanced reasoning capabilities...'
            }
          }],
          usage: { total_tokens: 150 }
        };

        const mockCreate = vi.fn().mockResolvedValue(mockResponse);
        (chatgptAgent as any).openai = {
          chat: {
            completions: { create: mockCreate }
          }
        };

        const config = {
          approach: 'inductive' as const,
          focus: 'empirical-data',
          evidenceWeight: 'empirical-maximizer',
          temporal: 'short-term',
          risk: 'base-rate-anchored'
        };

        const result = await chatgptAgent.generateResponse(
          { test: 'data' },
          config,
          [],
          'test prompt'
        );

        expect(mockCreate).toHaveBeenCalledWith({
          model: 'o3-20241217',
          messages: expect.arrayContaining([
            { role: 'system', content: expect.stringContaining('inductive reasoning') },
            { role: 'user', content: 'test prompt' }
          ]),
          temperature: 0.4,
          max_tokens: 1500
        });
        expect(result.content).toContain('OpenAI o3 response');
        expect(result.metadata.model).toBe('o3-20241217');
      });
    });
  });

  describe('GeminiAgent', () => {
    describe('Development Mode', () => {
      beforeEach(() => {
        configService.setMode('dev');
      });

      test('should use Gemini Flash 2.5 with deductive prompting in dev mode', async () => {
        const mockResponse = {
          text: 'Deductive framework analysis exploring structural implications. This demonstrates DEDUCTIVE FRAMEWORK ANALYSIS with systematic assumption challenging methodology.',
        };

        const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
        (geminiAgent as any).gemini = {
          models: { generateContent: mockGenerateContent }
        };

        const config = {
          approach: 'deductive' as const,
          focus: 'theoretical-framework',
          evidenceWeight: 'theoretical-challenger',
          temporal: 'long-term',
          risk: 'tail-risk-explorer'
        };

        const result = await geminiAgent.generateResponse(
          { test: 'data' },
          config,
          [],
          'test prompt'
        );

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.5-flash',
          contents: expect.stringContaining('DEDUCTIVE FRAMEWORK ANALYSIS')
        });
        expect(result.content).toContain('Deductive framework');
        expect(result.reasoning).toContain('assumption challenging');
        expect(result.metadata.agentPersonality).toBe('framework-driven-contrarian');
      });
    });

    describe('Production Mode', () => {
      beforeEach(() => {
        configService.setMode('prod');
      });

      test('should use Gemini Pro 2.5 in production mode', async () => {
        const mockResponse = {
          text: 'Gemini Pro 2.5 deductive analysis with theoretical frameworks...'
        };

        const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
        (geminiAgent as any).gemini = {
          models: { generateContent: mockGenerateContent }
        };

        const config = {
          approach: 'deductive' as const,
          focus: 'theoretical-framework',
          evidenceWeight: 'theoretical-challenger',
          temporal: 'long-term',
          risk: 'tail-risk-explorer'
        };

        const result = await geminiAgent.generateResponse(
          { test: 'data' },
          config,
          [],
          'test prompt'
        );

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.5-pro',
          contents: expect.stringContaining('deductive reasoning'),
          config: {
            temperature: 0.4,
            maxOutputTokens: 1500
          }
        });
        expect(result.content).toContain('Gemini Pro 2.5');
        expect(result.metadata.model).toBe('gemini-2.5-pro');
      });
    });
  });

  describe('Model Selection Logic', () => {
    test('should correctly switch models based on mode configuration', async () => {
      // Test dev mode
      configService.setMode('dev');
      expect(configService.isRealMode()).toBe(false);

      // Test prod mode
      configService.setMode('prod');
      expect(configService.isRealMode()).toBe(true);
    });

    test('should handle missing API keys gracefully', async () => {
      // Temporarily remove API keys
      const originalGemini = process.env.GEMINI_API_KEY;
      const originalOpenAI = process.env.OPENAI_API_KEY;
      const originalAnthropic = process.env.ANTHROPIC_API_KEY;

      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const testFlashLLM = new FlashLLMService();
      const testProLLM = new ProLLMService();
      const testChatGPT = new ChatGPTAgent();
      const testGemini = new GeminiAgent();

      // Services should initialize without throwing errors
      expect(testFlashLLM).toBeDefined();
      expect(testProLLM).toBeDefined();
      expect(testChatGPT).toBeDefined();
      expect(testGemini).toBeDefined();

      // Restore API keys
      if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
      if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
      if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
    });
  });

  describe('Response Format Validation', () => {
    test('should return consistent response format across all agents', async () => {
      configService.setMode('dev');

      // Mock responses for both agents
      const mockGeminiResponse = {
        content: 'Test response content',
        raw_response: 'Test response content'
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockGeminiResponse);
      (chatgptAgent as any).gemini = { models: { generateContent: mockGenerateContent } };
      (geminiAgent as any).gemini = { models: { generateContent: mockGenerateContent } };

      const config = {
        approach: 'inductive' as const,
        focus: 'test',
        evidenceWeight: 'test',
        temporal: 'test',
        risk: 'test'
      };

      const [chatgptResult, geminiResult] = await Promise.all([
        chatgptAgent.generateResponse({ test: 'data' }, config, [], 'test'),
        geminiAgent.generateResponse({ test: 'data' }, config, [], 'test')
      ]);

      // Both should have consistent response structure
      for (const result of [chatgptResult, geminiResult]) {
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('reasoning');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('sources');
        expect(result).toHaveProperty('sourceAttributions');
        expect(result).toHaveProperty('speculationFlags');
        expect(result).toHaveProperty('metadata');

        expect(typeof result.content).toBe('string');
        expect(typeof result.reasoning).toBe('string');
        expect(typeof result.confidence).toBe('number');
        expect(Array.isArray(result.sources)).toBe(true);
        expect(Array.isArray(result.sourceAttributions)).toBe(true);
        expect(Array.isArray(result.speculationFlags)).toBe(true);
        expect(typeof result.metadata).toBe('object');
      }
    });

    test('should properly extract source attributions and speculation flags', async () => {
      configService.setMode('dev');

      const mockResponse = {
        text: 'Test agent response with [Surface: MIT Study] and [SPECULATION] markers',
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (chatgptAgent as any).gemini = { models: { generateContent: mockGenerateContent } };

      const config = {
        approach: 'inductive' as const,
        focus: 'test',
        evidenceWeight: 'test',
        temporal: 'test',
        risk: 'test'
      };

      const result = await chatgptAgent.generateResponse({ test: 'data' }, config, [], 'test');

      expect(result.sourceAttributions).toContain('[Surface: MIT Study]');
      expect(result.speculationFlags).toContain('[SPECULATION]');
    });
  });

  describe('Error Handling', () => {
    test('should handle API timeouts gracefully', async () => {
      configService.setMode('prod');

      const mockCreate = vi.fn().mockRejectedValue(new Error('Request timeout'));
      (flashLLM as any).anthropic = {
        messages: { create: mockCreate }
      };

      await expect(flashLLM.clarifyIntent('test query')).rejects.toThrow('Request timeout');
    });

    test('should handle malformed JSON responses', async () => {
      configService.setMode('dev');

      const mockResponse = {
        text: 'Invalid JSON response that cannot be parsed',
        raw_response: 'Invalid JSON response that cannot be parsed'
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (flashLLM as any).gemini = { models: { generateContent: mockGenerateContent } };

      // Should not throw but handle gracefully
      const result = await flashLLM.clarifyIntent('test query');
      expect(result).toHaveProperty('error');
    });

    test('should handle rate limiting errors', async () => {
      configService.setMode('prod');

      const rateLimitError = new Error('Rate limit exceeded');
      const mockCreate = vi.fn().mockRejectedValue(rateLimitError);
      (proLLM as any).anthropic = {
        messages: { create: mockCreate }
      };

      await expect(proLLM.orchestrateResearch({}, {})).rejects.toThrow('Rate limit exceeded');
    });
  });
});
