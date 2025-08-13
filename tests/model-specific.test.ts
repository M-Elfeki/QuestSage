import { describe, test, expect, beforeEach, vi } from 'vitest';
import { FlashLLMService, ProLLMService } from '../server/services/llm';
import { ChatGPTAgent, GeminiAgent } from '../server/services/agents';
import { configService } from '../server/services/config';

// Mock external dependencies
vi.mock('@google/genai');
vi.mock('openai');
vi.mock('@anthropic-ai/sdk');

describe('Model-Specific Behavior Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  describe('Gemini Flash 2.5 Behavior', () => {
    test('should handle gemini-2.5-flash model parameters correctly', async () => {
      configService.setMode('dev');
      const flashLLM = new FlashLLMService();

      const mockResponse = {
        text: JSON.stringify({
          requirements: ['Test'],
          constraints: [],
          questions: [],
          answerFormat: { type: 'prediction', description: 'Test' },
          complexity: 'medium'
        })
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (flashLLM as any).gemini = {
        models: { generateContent: mockGenerateContent }
      };

      await flashLLM.clarifyIntent('test query');

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: expect.any(String)
      });

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-flash');
      expect(callArgs.contents).toContain('test query');
    });

    test('should handle gemini response parsing edge cases', async () => {
      configService.setMode('dev');
      const flashLLM = new FlashLLMService();

      // Test with JSON wrapped in markdown code blocks
      const mockResponse = {
        text: '```json\n{"requirements": ["Test requirement"]}\n```'
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (flashLLM as any).gemini = {
        models: { generateContent: mockGenerateContent }
      };

      const result = await flashLLM.clarifyIntent('test');
      expect(result.requirements).toEqual(['Test requirement']);
    });

    test('should handle gemini response with extra whitespace and formatting', async () => {
      configService.setMode('dev');
      const flashLLM = new FlashLLMService();

      const mockResponse = {
        text: '\n\n  {"requirements": ["Trimmed requirement"]}  \n\n'
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (flashLLM as any).gemini = {
        models: { generateContent: mockGenerateContent }
      };

      const result = await flashLLM.clarifyIntent('test');
      expect(result.requirements).toEqual(['Trimmed requirement']);
    });
  });

  describe('Gemini Pro 2.5 Behavior', () => {
    test('should use gemini-2.5-pro with correct configuration in production', async () => {
      configService.setMode('prod');
      const geminiAgent = new GeminiAgent();

      const mockResponse = {
        text: 'Gemini Pro response'
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (geminiAgent as any).gemini = {
        models: { generateContent: mockGenerateContent }
      };

      const config = {
        approach: 'deductive' as const,
        focus: 'framework',
        evidenceWeight: 'theoretical',
        temporal: 'long-term',
        risk: 'tail-risk'
      };

      await geminiAgent.generateResponse({}, config, [], 'test');

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
        contents: expect.stringContaining('deductive reasoning'),
        config: {
          temperature: 0.4,
          maxOutputTokens: 1500
        }
      });
    });

    test('should handle gemini-pro specific error responses', async () => {
      configService.setMode('prod');
      const geminiAgent = new GeminiAgent();

      const mockError = new Error('Gemini Pro API rate limit exceeded');
      const mockGenerateContent = vi.fn().mockRejectedValue(mockError);
      (geminiAgent as any).gemini = {
        models: { generateContent: mockGenerateContent }
      };

      const config = {
        approach: 'deductive' as const,
        focus: 'framework',
        evidenceWeight: 'theoretical',
        temporal: 'long-term',
        risk: 'tail-risk'
      };

      await expect(geminiAgent.generateResponse({}, config, [], 'test'))
        .rejects.toThrow('Gemini Pro API rate limit exceeded');
    });
  });

  describe('Claude Sonnet Behavior', () => {
    test('should use claude-3-5-sonnet correctly for Flash LLM in production', async () => {
      configService.setMode('prod');
      const flashLLM = new FlashLLMService();

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            requirements: ['Claude requirement'],
            constraints: [],
            questions: [],
            answerFormat: { type: 'analysis', description: 'Claude format' },
            complexity: 'high'
          })
        }]
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (flashLLM as any).anthropic = {
        messages: { create: mockCreate }
      };

      await flashLLM.clarifyIntent('claude test');

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: expect.stringContaining('claude test') }],
        max_tokens: 1500
      });
    });

    test('should handle claude content type validation', async () => {
      configService.setMode('prod');
      const flashLLM = new FlashLLMService();

      // Test unexpected content type
      const mockResponse = {
        content: [{
          type: 'image',
          text: 'should not be used'
        }]
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (flashLLM as any).anthropic = {
        messages: { create: mockCreate }
      };

      await expect(flashLLM.clarifyIntent('test'))
        .rejects.toThrow('Unexpected content type from Anthropic');
    });
  });

  describe('Claude Opus Behavior', () => {
    test('should use claude-3-opus for Pro LLM in production', async () => {
      configService.setMode('prod');
      const proLLM = new ProLLMService();

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            priorities: ['Opus priority'],
            expectedFindings: ['Opus finding'],
            evaluationCriteria: 'Opus criteria',
            orchestrationPlan: { phase: 'advanced' }
          })
        }]
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (proLLM as any).anthropic = {
        messages: { create: mockCreate }
      };

      await proLLM.orchestrateResearch({}, {});

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: expect.any(String) }],
        max_tokens: 1500
      });
    });

    test('should handle claude-opus thinking mode capabilities', async () => {
      configService.setMode('prod');
      const proLLM = new ProLLMService();

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            executiveSummary: 'Opus thinking mode summary',
            evidenceFoundation: [{ claim: 'Opus evidence', sources: ['test'], strength: 'high' }],
            reasoningChain: 'Advanced reasoning with thinking mode',
            dissentingViews: [],
            uncertaintyAnalysis: 'Opus uncertainty analysis',
            sourceAudit: [],
            confidenceInterval: [0.8, 0.95],
            synthesis: 'Advanced Opus synthesis'
          })
        }]
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (proLLM as any).anthropic = {
        messages: { create: mockCreate }
      };

      const result = await proLLM.synthesizeResults({}, {}, {}, {});

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: expect.any(String) }],
        max_tokens: 4000
      });
      expect(result.reasoningChain).toContain('thinking mode');
    });

    test('should handle opus token limits appropriately', async () => {
      configService.setMode('prod');
      const proLLM = new ProLLMService();

      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"test": "response"}' }]
      });
      (proLLM as any).anthropic = {
        messages: { create: mockCreate }
      };

      // Test different max_tokens for different operations
      await proLLM.orchestrateResearch({}, {});
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        max_tokens: 1500
      }));

      await proLLM.selectAgents({}, {});
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        max_tokens: 2000
      }));

      await proLLM.synthesizeResults({}, {}, {}, {});
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        max_tokens: 4000
      }));
    });
  });

  describe('OpenAI o3 Behavior', () => {
    test('should use o3-20241217 model for ChatGPT agent in production', async () => {
      configService.setMode('prod');
      const chatgptAgent = new ChatGPTAgent();

      const mockResponse = {
        choices: [{
          message: {
            content: 'OpenAI o3 response with advanced reasoning'
          }
        }],
        usage: { total_tokens: 200 }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (chatgptAgent as any).openai = {
        chat: {
          completions: { create: mockCreate }
        }
      };

      const config = {
        approach: 'inductive' as const,
        focus: 'empirical',
        evidenceWeight: 'data',
        temporal: 'short-term',
        risk: 'conservative'
      };

      await chatgptAgent.generateResponse({}, config, [], 'test prompt');

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'o3-20241217',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user', content: 'test prompt' })
        ]),
        temperature: 0.4,
        max_tokens: 1500
      });
    });

    test('should handle o3 system prompt configuration correctly', async () => {
      configService.setMode('prod');
      const chatgptAgent = new ChatGPTAgent();

      const mockResponse = {
        choices: [{ message: { content: 'test response' } }],
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
        focus: 'empirical-maximizer',
        evidenceWeight: 'data-driven',
        temporal: 'short-term-dynamics',
        risk: 'base-rate-anchored'
      };

      await chatgptAgent.generateResponse({}, config, [], 'test');

      const systemMessage = mockCreate.mock.calls[0][0].messages[0];
      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toContain('inductive reasoning');
      expect(systemMessage.content).toContain('empirical-maximizer');
      expect(systemMessage.content).toContain('short-term-dynamics');
      expect(systemMessage.content).toContain('base-rate-anchored');
    });

    test('should handle o3 usage tracking and metadata', async () => {
      configService.setMode('prod');
      const chatgptAgent = new ChatGPTAgent();

      const mockResponse = {
        choices: [{ message: { content: 'test response' } }],
        usage: { total_tokens: 175, prompt_tokens: 50, completion_tokens: 125 }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (chatgptAgent as any).openai = {
        chat: {
          completions: { create: mockCreate }
        }
      };

      const config = {
        approach: 'inductive' as const,
        focus: 'test',
        evidenceWeight: 'test',
        temporal: 'test',
        risk: 'test'
      };

      const result = await chatgptAgent.generateResponse({}, config, [], 'test');

      expect(result.metadata.model).toBe('o3-20241217');
      expect(result.metadata.tokens).toBe(175);
      expect(result.metadata.approach).toBe('inductive');
    });

    test('should handle o3 API errors gracefully', async () => {
      configService.setMode('prod');
      const chatgptAgent = new ChatGPTAgent();

      const mockError = new Error('OpenAI o3 API error');
      const mockCreate = vi.fn().mockRejectedValue(mockError);
      (chatgptAgent as any).openai = {
        chat: {
          completions: { create: mockCreate }
        }
      };

      const config = {
        approach: 'inductive' as const,
        focus: 'test',
        evidenceWeight: 'test',
        temporal: 'test',
        risk: 'test'
      };

      await expect(chatgptAgent.generateResponse({}, config, [], 'test'))
        .rejects.toThrow('OpenAI o3 API error');
    });
  });

  describe('Agent Differentiation in Development Mode', () => {
    test('should create distinct prompting strategies for both agents using Gemini Flash', async () => {
      configService.setMode('dev');
      
      const chatgptAgent = new ChatGPTAgent();
      const geminiAgent = new GeminiAgent();

      const mockResponse = { content: 'test response', raw_response: 'test response' };
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

      // Generate responses from both agents
      await chatgptAgent.generateResponse({}, config, [], 'test');
      await geminiAgent.generateResponse({}, config, [], 'test');

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);

      // Verify distinct prompting strategies
      const chatgptPrompt = mockGenerateContent.mock.calls[0][0].contents;
      const geminiPrompt = mockGenerateContent.mock.calls[1][0].contents;

      expect(chatgptPrompt).toContain('INDUCTIVE PATTERN ANALYSIS');
      expect(chatgptPrompt).toContain('EMPIRICAL DATA MAXIMIZER');
      expect(chatgptPrompt).toContain('SHORT-TERM DYNAMICS');

      expect(geminiPrompt).toContain('DEDUCTIVE FRAMEWORK ANALYSIS');
      expect(geminiPrompt).toContain('THEORETICAL CHALLENGER');
      expect(geminiPrompt).toContain('LONG-TERM STRUCTURAL');
    });

    test('should produce different metadata for each agent in dev mode', async () => {
      configService.setMode('dev');
      
      const chatgptAgent = new ChatGPTAgent();
      const geminiAgent = new GeminiAgent();

      const mockResponse = { content: 'test', raw_response: 'test' };
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

      const [chatgptResult, geminiResult] = await Promise.all([
        chatgptAgent.generateResponse({}, config, [], 'test'),
        geminiAgent.generateResponse({}, config, [], 'test')
      ]);

      // Verify different personalities and approaches
      expect(chatgptResult.metadata.agentPersonality).toBe('data-driven-conservative');
      expect(chatgptResult.metadata.approach).toBe('inductive-empirical-maximizer');
      expect(chatgptResult.reasoning).toContain('conservative extrapolation');

      expect(geminiResult.metadata.agentPersonality).toBe('framework-driven-contrarian');
      expect(geminiResult.metadata.approach).toBe('deductive-theoretical-challenger');
      expect(geminiResult.reasoning).toContain('assumption challenging');
    });
  });

  describe('Error Recovery and Fallbacks', () => {
    test('should handle model unavailability gracefully', async () => {
      configService.setMode('prod');
      
      // Test with missing Anthropic key
      delete process.env.ANTHROPIC_API_KEY;
      const flashLLM = new FlashLLMService();
      
      // Should not have anthropic client
      expect((flashLLM as any).anthropic).toBeUndefined();
    });

    test('should handle network timeouts consistently across models', async () => {
      const timeoutError = new Error('Network timeout');
      
      configService.setMode('prod');
      const proLLM = new ProLLMService();
      
      const mockCreate = vi.fn().mockRejectedValue(timeoutError);
      (proLLM as any).anthropic = {
        messages: { create: mockCreate }
      };

      await expect(proLLM.orchestrateResearch({}, {}))
        .rejects.toThrow('Network timeout');
    });

    test('should maintain consistent response structure on errors', async () => {
      configService.setMode('dev');
      const flashLLM = new FlashLLMService();

      // Mock malformed response
      const mockResponse = { text: 'not valid json' };
      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (flashLLM as any).gemini = {
        models: { generateContent: mockGenerateContent }
      };

      const result = await flashLLM.clarifyIntent('test');
      
      // Should still return an object, even if it contains an error
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('error');
    });
  });
});
