import { describe, test, expect, beforeEach, vi } from 'vitest';
import { FlashLLMService, ProLLMService } from '../server/services/llm';
import { ChatGPTAgent, GeminiAgent } from '../server/services/agents';
import { configService } from '../server/services/config';

// Mock external dependencies
vi.mock('@google/genai');
vi.mock('openai');
vi.mock('@anthropic-ai/sdk');

describe('Workflow Integration Tests', () => {
  let flashLLM: FlashLLMService;
  let proLLM: ProLLMService;
  let chatgptAgent: ChatGPTAgent;
  let geminiAgent: GeminiAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    flashLLM = new FlashLLMService();
    proLLM = new ProLLMService();
    chatgptAgent = new ChatGPTAgent();
    geminiAgent = new GeminiAgent();
  });

  describe('Development Mode Workflow', () => {
    beforeEach(() => {
      configService.setMode('dev');
    });

    test('should execute complete dev workflow using Gemini Flash 2.5 throughout', async () => {
      // Mock Gemini Flash responses for all stages
      const intentResponse = {
        text: JSON.stringify({
          requirements: ['Test requirement'],
          constraints: ['Test constraint'],
          questions: [],
          answerFormat: { type: 'prediction', description: 'Test format' },
          complexity: 'medium'
        })
      };

      const searchTermsResponse = {
        text: JSON.stringify({
          surfaceTerms: ['AI impact', 'LLM adoption'],
          socialTerms: ['AI discussion', 'automation debate'],
          domainSpecificSources: { relevantSubreddits: ['r/MachineLearning'] },
          relevanceRubric: 'Test rubric',
          sourceRankings: ['academic', 'industry'],
          evidenceThresholds: { minimumRelevanceScore: 65 }
        })
      };

      const orchestrationResponse = {
        text: JSON.stringify({
          priorities: ['Evidence analysis'],
          expectedFindings: ['Productivity data'],
          evaluationCriteria: 'Quality assessment',
          orchestrationPlan: { surfacePhase: '5 min' }
        })
      };

      const agentResponse = {
        text: 'Test agent response with [Surface: Test Study] citation'
      };

      const mockGenerateContent = vi.fn()
        .mockResolvedValueOnce(intentResponse)      // Intent clarification
        .mockResolvedValueOnce(searchTermsResponse) // Search terms generation
        .mockResolvedValueOnce(orchestrationResponse) // Research orchestration
        .mockResolvedValueOnce(agentResponse)       // ChatGPT agent
        .mockResolvedValueOnce(agentResponse);      // Gemini agent

      // Set up mocks for all services
      (flashLLM as any).gemini = { models: { generateContent: mockGenerateContent } };
      (proLLM as any).gemini = { models: { generateContent: mockGenerateContent } };
      (chatgptAgent as any).gemini = { models: { generateContent: mockGenerateContent } };
      (geminiAgent as any).gemini = { models: { generateContent: mockGenerateContent } };

      // Execute workflow stages
      const clarification = await flashLLM.clarifyIntent('Test query for AI impact');
      const searchTerms = await flashLLM.generateSearchTerms(clarification);
      const orchestration = await proLLM.orchestrateResearch(clarification, searchTerms);
      
      const config = {
        approach: 'inductive' as const,
        focus: 'empirical',
        evidenceWeight: 'data',
        temporal: 'short-term',
        risk: 'conservative'
      };

      const chatgptResult = await chatgptAgent.generateResponse({}, config, [], 'Test prompt');
      const geminiResult = await geminiAgent.generateResponse({}, config, [], 'Test prompt');

      // Verify all stages completed successfully
      expect(clarification.requirements).toContain('Test requirement');
      expect(searchTerms.surfaceTerms).toContain('AI impact');
      expect(orchestration.priorities).toContain('Evidence analysis');
      expect(chatgptResult.content).toContain('Test agent response');
      expect(geminiResult.content).toContain('Test agent response');

      // Verify all calls used Gemini Flash 2.5
      expect(mockGenerateContent).toHaveBeenCalledTimes(5);
      mockGenerateContent.mock.calls.forEach(call => {
        expect(call[0].model).toBe('gemini-2.5-flash');
      });
    });

    test('should maintain agent differentiation throughout dev workflow', async () => {
      const mockResponse = {
        text: 'Differentiated agent response'
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (chatgptAgent as any).gemini = { models: { generateContent: mockGenerateContent } };
      (geminiAgent as any).gemini = { models: { generateContent: mockGenerateContent } };

      const config = {
        approach: 'inductive' as const,
        focus: 'test',
        evidenceWeight: 'test',
        temporal: 'test',
        risk: 'test'
      };

      // Simulate multiple dialogue rounds
      for (let round = 1; round <= 3; round++) {
        await chatgptAgent.generateResponse({}, config, [], `Round ${round} prompt`);
        await geminiAgent.generateResponse({}, config, [], `Round ${round} prompt`);
      }

      // Verify distinct prompting throughout
      expect(mockGenerateContent).toHaveBeenCalledTimes(6);
      
      const chatgptCalls = mockGenerateContent.mock.calls.filter((_, index) => index % 2 === 0);
      const geminiCalls = mockGenerateContent.mock.calls.filter((_, index) => index % 2 === 1);

      chatgptCalls.forEach(call => {
        expect(call[0].contents).toContain('INDUCTIVE PATTERN ANALYSIS');
      });

      geminiCalls.forEach(call => {
        expect(call[0].contents).toContain('DEDUCTIVE FRAMEWORK ANALYSIS');
      });
    });
  });

  describe('Production Mode Workflow', () => {
    beforeEach(() => {
      configService.setMode('prod');
    });

    test('should execute complete production workflow with correct model routing', async () => {
      // Mock responses for different models
      const claudeSonnetResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            requirements: ['Prod requirement'],
            constraints: [],
            questions: [],
            answerFormat: { type: 'analysis', description: 'Prod format' },
            complexity: 'high'
          })
        }]
      };

      const claudeOpusResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            priorities: ['Strategic analysis'],
            expectedFindings: ['Market data'],
            evaluationCriteria: 'Advanced criteria',
            orchestrationPlan: { phase: 'comprehensive' }
          })
        }]
      };

      const openaiO3Response = {
        choices: [{
          message: {
            content: 'OpenAI o3 advanced reasoning response with detailed analysis'
          }
        }],
        usage: { total_tokens: 250 }
      };

      const geminiProResponse = {
        text: 'Gemini Pro 2.5 deductive framework analysis with structural insights'
      };

      // Set up model-specific mocks
      (flashLLM as any).anthropic = {
        messages: { create: vi.fn().mockResolvedValue(claudeSonnetResponse) }
      };

      (proLLM as any).anthropic = {
        messages: { create: vi.fn().mockResolvedValue(claudeOpusResponse) }
      };

      (chatgptAgent as any).openai = {
        chat: { completions: { create: vi.fn().mockResolvedValue(openaiO3Response) } }
      };

      (geminiAgent as any).gemini = {
        models: { generateContent: vi.fn().mockResolvedValue(geminiProResponse) }
      };

      // Execute production workflow
      const clarification = await flashLLM.clarifyIntent('Production test query');
      const orchestration = await proLLM.orchestrateResearch(clarification, {});

      const config = {
        approach: 'inductive' as const,
        focus: 'empirical',
        evidenceWeight: 'data',
        temporal: 'short-term',
        risk: 'conservative'
      };

      const chatgptResult = await chatgptAgent.generateResponse({}, config, [], 'Production prompt');
      const geminiResult = await geminiAgent.generateResponse({}, config, [], 'Production prompt');

      // Verify correct model usage
      expect((flashLLM as any).anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-3-5-sonnet-20241022' })
      );

      expect((proLLM as any).anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-3-opus-20240229' })
      );

      expect((chatgptAgent as any).openai.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'o3-20241217' })
      );

      expect((geminiAgent as any).gemini.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-pro' })
      );

      // Verify workflow completion
      expect(clarification.requirements).toContain('Prod requirement');
      expect(orchestration.priorities).toContain('Strategic analysis');
      expect(chatgptResult.content).toContain('o3 advanced reasoning');
      expect(geminiResult.content).toContain('Pro 2.5 deductive framework');
    });

    test('should handle model-specific synthesis in production', async () => {
      const synthesisMock = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            executiveSummary: 'Claude Opus synthesis with thinking mode',
            evidenceFoundation: [{ claim: 'Test claim', sources: ['test'], strength: 'high' }],
            reasoningChain: 'Advanced reasoning chain',
            dissentingViews: [],
            uncertaintyAnalysis: 'Comprehensive uncertainty analysis',
            sourceAudit: [],
            confidenceInterval: [0.75, 0.92],
            synthesis: 'Final production synthesis'
          })
        }]
      };

      (proLLM as any).anthropic = {
        messages: { create: vi.fn().mockResolvedValue(synthesisMock) }
      };

      const result = await proLLM.synthesizeResults(
        { test: 'surface' },
        { test: 'deep' },
        { test: 'dialogue' },
        { test: 'context' }
      );

      expect((proLLM as any).anthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-opus-20240229',
          max_tokens: 4000
        })
      );

      expect(result.executiveSummary).toContain('thinking mode');
      expect(result.confidenceInterval).toEqual([0.75, 0.92]);
    });
  });

  describe('Cross-Model Integration', () => {
    test('should maintain data consistency across different models in production', async () => {
      configService.setMode('prod');

      // Mock a complete research session with data flow
      const initialIntent = {
        requirements: ['Cross-model requirement'],
        constraints: ['Cross-model constraint'],
        complexity: 'high'
      };

      const searchTerms = {
        surfaceTerms: ['cross-model term'],
        relevanceRubric: 'Cross-model rubric'
      };

      const orchestrationData = {
        priorities: ['Cross-model priority'],
        expectedFindings: ['Cross-model finding']
      };

      // Test data flow through Flash LLM → Pro LLM → Agents
      const claudeSonnetMock = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(searchTerms) }]
      });

      const claudeOpusMock = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(orchestrationData) }]
      });

      const openaiMock = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'O3 processed the cross-model data effectively' } }],
        usage: { total_tokens: 200 }
      });

      const searchTermsMock = vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(searchTerms) } }],
        usage: { total_tokens: 150 }
      });

      const geminiProMock = vi.fn().mockResolvedValue({
        text: 'Gemini Pro analyzed the cross-model orchestration data'
      });

      (flashLLM as any).anthropic = { messages: { create: claudeSonnetMock } };
      (flashLLM as any).openai = { chat: { completions: { create: searchTermsMock } } };
      (proLLM as any).anthropic = { messages: { create: claudeOpusMock } };
      (chatgptAgent as any).openai = { chat: { completions: { create: openaiMock } } };
      (geminiAgent as any).gemini = { models: { generateContent: geminiProMock } };

      // Execute cross-model workflow
      const terms = await flashLLM.generateSearchTerms(initialIntent);
      const orchestration = await proLLM.orchestrateResearch(initialIntent, terms);

      const config = { approach: 'inductive' as const, focus: 'test', evidenceWeight: 'test', temporal: 'test', risk: 'test' };
      
      const chatgptResult = await chatgptAgent.generateResponse(
        { orchestration, terms }, config, [], 'Cross-model prompt'
      );
      
      const geminiResult = await geminiAgent.generateResponse(
        { orchestration, terms }, config, [], 'Cross-model prompt'
      );

      // Verify data consistency
      expect(terms.surfaceTerms).toContain('cross-model term');
      expect(orchestration.priorities).toContain('Cross-model priority');
      expect(chatgptResult.content).toContain('cross-model data');
      expect(geminiResult.content).toContain('cross-model orchestration');
    });

    test('should handle mode switching mid-workflow gracefully', async () => {
      // Start in dev mode
      configService.setMode('dev');

      const devMock = vi.fn().mockResolvedValue({
        text: JSON.stringify({ requirements: ['Dev requirement'] })
      });

      (flashLLM as any).gemini = { models: { generateContent: devMock } };

      const devResult = await flashLLM.clarifyIntent('Test query');
      expect(devResult.requirements).toContain('Dev requirement');

      // Switch to production mode
      configService.setMode('prod');

      const prodMock = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ requirements: ['Prod requirement'] }) }]
      });

      (flashLLM as any).anthropic = { messages: { create: prodMock } };

      const prodResult = await flashLLM.clarifyIntent('Test query');
      expect(prodResult.requirements).toContain('Prod requirement');

      // Verify mode-appropriate models were used
      expect(devMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-flash' })
      );
      expect(prodMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-3-5-sonnet-20241022' })
      );
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle concurrent requests across different models', async () => {
      configService.setMode('prod');

      // Set up concurrent mocks
      const concurrentMocks = {
        flashLLM: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ test: 'flash' }) }]
        }),
        proLLM: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ test: 'pro' }) }]
        }),
        chatgpt: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'chatgpt concurrent' } }]
        }),
        gemini: vi.fn().mockResolvedValue({
          text: 'gemini concurrent'
        })
      };

      (flashLLM as any).anthropic = { messages: { create: concurrentMocks.flashLLM } };
      (proLLM as any).anthropic = { messages: { create: concurrentMocks.proLLM } };
      (chatgptAgent as any).openai = { chat: { completions: { create: concurrentMocks.chatgpt } } };
      (geminiAgent as any).gemini = { models: { generateContent: concurrentMocks.gemini } };

      const config = { approach: 'inductive' as const, focus: 'test', evidenceWeight: 'test', temporal: 'test', risk: 'test' };

      // Execute concurrent operations
      const promises = [
        flashLLM.clarifyIntent('Test 1'),
        proLLM.orchestrateResearch({}, {}),
        chatgptAgent.generateResponse({}, config, [], 'Test prompt'),
        geminiAgent.generateResponse({}, config, [], 'Test prompt')
      ];

      const results = await Promise.all(promises);

      // Verify all completed successfully
      expect(results).toHaveLength(4);
      expect(results[0]).toHaveProperty('test', 'flash');
      expect(results[1]).toHaveProperty('test', 'pro');
      expect(results[2].content).toContain('chatgpt concurrent');
      expect(results[3].content).toContain('gemini concurrent');
    });

    test('should maintain consistent error handling across models', async () => {
      configService.setMode('prod');

      const errors = [
        new Error('Claude Sonnet error'),
        new Error('Claude Opus error'),
        new Error('OpenAI o3 error'),
        new Error('Gemini Pro error')
      ];

      (flashLLM as any).anthropic = { messages: { create: vi.fn().mockRejectedValue(errors[0]) } };
      (proLLM as any).anthropic = { messages: { create: vi.fn().mockRejectedValue(errors[1]) } };
      (chatgptAgent as any).openai = { chat: { completions: { create: vi.fn().mockRejectedValue(errors[2]) } } };
      (geminiAgent as any).gemini = { models: { generateContent: vi.fn().mockRejectedValue(errors[3]) } };

      const config = { approach: 'inductive' as const, focus: 'test', evidenceWeight: 'test', temporal: 'test', risk: 'test' };

      // Test error handling for each model
      await expect(flashLLM.clarifyIntent('test')).rejects.toThrow('Claude Sonnet error');
      await expect(proLLM.orchestrateResearch({}, {})).rejects.toThrow('Claude Opus error');
      await expect(chatgptAgent.generateResponse({}, config, [], 'test')).rejects.toThrow('OpenAI o3 error');
      await expect(geminiAgent.generateResponse({}, config, [], 'test')).rejects.toThrow('Gemini Pro error');
    });
  });

  describe('Configuration Validation', () => {
    test('should validate correct model assignments per specification', () => {
      // Development mode validation
      configService.setMode('dev');
      expect(configService.isRealMode()).toBe(false);

      // Production mode validation
      configService.setMode('prod');
      expect(configService.isRealMode()).toBe(true);

      // Verify mode persistence
      expect(configService.getConfig().mode).toBe('prod');
      
      configService.setMode('dev');
      expect(configService.getConfig().mode).toBe('dev');
    });

    test('should maintain API key configuration requirements', () => {
      const originalKeys = {
        gemini: process.env.GEMINI_API_KEY,
        openai: process.env.OPENAI_API_KEY,
        anthropic: process.env.ANTHROPIC_API_KEY
      };

      // Test with all keys present
      const config = configService.getConfig();
      expect(config.enabledProviders.gemini).toBe(true);
      expect(config.enabledProviders.openai).toBe(true);
      expect(config.enabledProviders.anthropic).toBe(true);

      // Test key availability detection
      delete process.env.OPENAI_API_KEY;
      const newConfig = new (configService.constructor as any)();
      expect(newConfig.getConfig().enabledProviders.openai).toBe(false);

      // Restore keys
      Object.entries(originalKeys).forEach(([key, value]) => {
        if (value) process.env[`${key.toUpperCase()}_API_KEY`] = value;
      });
    });
  });
});
