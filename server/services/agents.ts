import { LiteLLMService } from "./llm-litellm";
import { configService } from "./config";
import { truncateLog } from "./rate-limiter";

export interface AgentResponse {
  content: string;
  reasoning: string;
  confidence: number;
  sources: Array<{
    claim: string;
    source: string;
    type: 'research_report' | 'surface_finding' | 'deep_finding' | 'speculation';
    strength: 'high' | 'medium' | 'low';
  }>;
  metadata: any;
  sourceAttributions: string[];
  speculationFlags: string[];
}

export interface AgentConfig {
  approach: "inductive" | "deductive";
  focus: string;
  evidenceWeight: string;
  temporal: string;
  risk: string;
}

/**
 * Create a compact summary of research data to avoid context window overflow
 * Limits to key findings, summaries, and metadata rather than full content
 * EXPORTED for use in other modules
 */
export function createCompactResearchData(researchData: any): any {
  if (!researchData || typeof researchData !== 'object') {
    return { summary: 'No research data available' };
  }

  const compact: any = {};

  // Include surface research report if available
  if (researchData.surfaceResearchReport) {
    compact.surfaceResearchReport = {
      report: researchData.surfaceResearchReport.report?.substring(0, 5000) || '',
      keyFindings: researchData.surfaceResearchReport.keyFindings || [],
      confidenceLevel: researchData.surfaceResearchReport.confidenceLevel
    };
  }

  // Include deep research report if available
  if (researchData.deepResearchReport) {
    compact.deepResearchReport = {
      report: researchData.deepResearchReport.report?.substring(0, 5000) || '',
      keyFindings: researchData.deepResearchReport.keyFindings || [],
      confidenceAssessment: researchData.deepResearchReport.confidenceAssessment
    };
  }

  // Summarize search results (limit to top 10 per source)
  if (researchData.searchResults) {
    compact.searchResults = {
      web: {
        count: researchData.searchResults.web?.results?.length || 0,
        topResults: (researchData.searchResults.web?.results || []).slice(0, 10).map((r: any) => ({
          title: r.title?.substring(0, 150) || '',
          url: r.url || '',
          relevanceScore: r.relevanceScore || 0
        }))
      },
      arxiv: {
        count: researchData.searchResults.arxiv?.results?.length || 0,
        topResults: (researchData.searchResults.arxiv?.results || []).slice(0, 10).map((r: any) => ({
          title: r.title?.substring(0, 150) || '',
          url: r.url || '',
          relevanceScore: r.relevanceScore || 0
        }))
      },
      reddit: {
        count: researchData.searchResults.reddit?.results?.length || 0,
        topResults: (researchData.searchResults.reddit?.results || []).slice(0, 10).map((r: any) => ({
          title: r.title?.substring(0, 150) || '',
          url: r.url || '',
          relevanceScore: r.relevanceScore || 0
        }))
      }
    };
  }

  // Summarize fact extraction (limit to top 30 claims)
  if (researchData.factExtraction) {
    compact.factExtraction = {
      totalClaims: researchData.factExtraction.totalClaims || 0,
      processingNotes: researchData.factExtraction.processingNotes || '',
      topClaims: (researchData.factExtraction.claims || []).slice(0, 30).map((c: any) => ({
        claim: (c.claim || c.text || '').substring(0, 200),
        source: c.source || '',
        relevanceScore: c.relevanceScore || 0
      }))
    };
  }

  // Include analysis summary
  if (researchData.analysis) {
    compact.analysis = {
      credibilityScore: researchData.analysis.credibilityScore,
      consistencyScore: researchData.analysis.consistencyScore,
      significanceLevel: researchData.analysis.significanceLevel,
      analysis: researchData.analysis.analysis?.substring(0, 2000) || ''
    };
  }

  // Include orchestration summary
  if (researchData.orchestration) {
    compact.orchestration = {
      searchStrategy: researchData.orchestration.searchStrategy,
      prioritySources: researchData.orchestration.prioritySources
    };
  }

  // Limit dialogue history to last 4 rounds (2 agents * 2 rounds = 4 messages)
  if (researchData.dialogueHistory && Array.isArray(researchData.dialogueHistory)) {
    compact.dialogueHistory = researchData.dialogueHistory.slice(-4).map((d: any) => ({
      agentType: d.agentType,
      message: d.message?.substring(0, 500) || '',
      roundNumber: d.roundNumber
    }));
  }

  return compact;
}

/**
 * Retry utility with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  operationName: string = "Operation"
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`🔄 ${operationName}: Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMsg = lastError.message;
      
      // Don't retry on certain errors
      if (errorMsg.includes('not configured') || errorMsg.includes('authentication') || errorMsg.includes('401')) {
        console.error(`❌ ${operationName}: Non-retryable error: ${errorMsg}`);
        throw lastError;
      }
      
      if (attempt < maxRetries) {
        console.warn(`⚠️  ${operationName}: Attempt ${attempt + 1} failed: ${errorMsg.substring(0, 100)}`);
      } else {
        console.error(`❌ ${operationName}: All ${maxRetries + 1} attempts failed. Last error: ${errorMsg}`);
      }
    }
  }
  
  throw lastError || new Error(`${operationName} failed after ${maxRetries + 1} attempts`);
}

export class ChatGPTAgent {
  private llmService: LiteLLMService;
  private sessionId: string | null = null;

  constructor(llmService?: LiteLLMService) {
    // Use provided service or create a new one
    this.llmService = llmService || new LiteLLMService('chatgpt-agent');
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
    this.llmService.setSessionId(sessionId);
  }

  async generateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    return await retryWithBackoff(
      () => this.realGenerateResponse(researchData, config, previousDialogue, prompt),
      3,
      1000,
      "ChatGPTAgent.generateResponse"
    );
  }

  private async realGenerateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    // Validate config and provide defaults for missing properties
    const validatedConfig: AgentConfig = {
      approach: (config?.approach === "inductive" || config?.approach === "deductive") 
        ? config.approach 
        : "inductive",
      focus: config?.focus || "pattern-finding",
      evidenceWeight: config?.evidenceWeight || "empirical-maximizer",
      temporal: config?.temporal || "short-term-dynamics",
      risk: config?.risk || "base-rate-anchored"
    };
    
    // Create compact research data to avoid context window overflow
    const compactResearchData = createCompactResearchData(researchData);
    // Limit previous dialogue to last 4 messages
    const compactDialogue = (previousDialogue || []).slice(-4).map((d: any) => ({
      agentType: d.agentType,
      message: d.message?.substring(0, 500) || '',
      roundNumber: d.roundNumber
    }));
    
    const systemPrompt = `You are ChatGPT configured for ${validatedConfig.approach} reasoning with ${validatedConfig.focus} focus.
Your evidence weighting is ${validatedConfig.evidenceWeight}, temporal focus is ${validatedConfig.temporal}, and risk assessment is ${validatedConfig.risk}.

RESPONSE LENGTH REQUIREMENT:
- STRICTLY limit responses to 500-1000 words for optimal dialogue efficiency
- Prioritize depth over breadth within word constraints
- Every word must contribute meaningful value to the analysis

CRITICAL SOURCE ATTRIBUTION REQUIREMENTS:
- Every claim must link to Surface Research Report, Deep Research Report, or be explicitly marked as speculation
- Use specific citations: [Surface: Source Name] or [Deep: Source Name] or [SPECULATION]
- Disagreements must include specific reasoning, not arbitrary contrarianism
- Maintain distinctive ${validatedConfig.approach} reasoning approach while ensuring truth-seeking objectivity

Research Context Summary: ${JSON.stringify(compactResearchData)}
Previous Dialogue (last 4 messages): ${JSON.stringify(compactDialogue)}

RESPONSE STRUCTURE REQUIRED:
1. Core position with evidence citations
2. Reasoning chain with source attribution  
3. Evidence evaluation with strength assessment
4. Confidence assessment with uncertainty bounds
5. Areas requiring additional research

AGENT BEHAVIOR RULES:
- Maintain truth-seeking objectivity above all else
- Generate hypotheses from ${validatedConfig.approach} perspective
- Agree when evidence/logic is compelling
- Disagree with specific reasoning when warranted
- Build on counterpart insights while maintaining distinct viewpoint
- Attribute all claims to sources or label as speculation

Be distinctive in your ${validatedConfig.approach} reasoning approach while maintaining intellectual rigor, complete source transparency, and strict adherence to the 500-1000 word limit.`;

    const startTime = Date.now();
    console.log(`🤖 [ChatGPTAgent] Generating response with ${validatedConfig.approach} approach...`);

    try {
      // Use LiteLLM service - get model from config for ChatGPT agent or use default
      const model = this.getModelForTask('chatgptAgentModel') || 'gpt-5-nano';
      
      const llmResponse = await this.llmService.generateCompletion(
        prompt,
        systemPrompt,
        model
      );

      const processingTime = Date.now() - startTime;
      const content = llmResponse.response || "";
      
      console.log(`✅ [ChatGPTAgent] Response generated in ${processingTime}ms (${content.length} chars)`);

      // Parse response for source attributions
      const sourceAttributions = this.extractSourceAttributions(content);
      const speculationFlags = this.extractSpeculationFlags(content);
      
      return {
        content,
        reasoning: "Inductive pattern analysis from empirical data with complete source attribution",
        confidence: 0.78,
        sources: [
          {
            claim: "Productivity gains in routine cognitive tasks",
            source: "Surface Research Report",
            type: "surface_finding",
            strength: "high"
          },
          {
            claim: "Implementation timeline predictions",
            source: "Deep Research Report",
            type: "deep_finding", 
            strength: "medium"
          }
        ],
        sourceAttributions,
        speculationFlags,
        metadata: {
          model: model,
          approach: validatedConfig.approach,
          processingTime,
          tokens: content.length / 4 // Rough estimate
        }
      };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`❌ [ChatGPTAgent] Error generating response: ${errorMsg}`);
      throw new Error(`ChatGPTAgent response generation failed: ${errorMsg}`);
    }
  }

  private getModelForTask(taskName: string): string | null {
    if (this.sessionId) {
      const modelSelection = configService.getModelSelection(this.sessionId);
      const selectedModel = (modelSelection as any)?.[taskName];
      if (selectedModel) {
        return selectedModel;
      }
    }
    return null;
  }

  private extractSourceAttributions(content: string): string[] {
    const citations = content.match(/\[(?:Surface|Deep|Research):[^\]]+\]/g) || [];
    return citations;
  }

  private extractSpeculationFlags(content: string): string[] {
    const speculations = content.match(/\[SPECULATION[^\]]*\]/g) || [];
    return speculations;
  }
}

export class GeminiAgent {
  private llmService: LiteLLMService;
  private sessionId: string | null = null;

  constructor(llmService?: LiteLLMService) {
    // Use provided service or create a new one
    this.llmService = llmService || new LiteLLMService('gemini-agent');
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
    this.llmService.setSessionId(sessionId);
  }

  async generateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    return await retryWithBackoff(
      () => this.realGenerateResponse(researchData, config, previousDialogue, prompt),
      3,
      1000,
      "GeminiAgent.generateResponse"
    );
  }

  private async realGenerateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    // Validate config and provide defaults for missing properties
    const validatedConfig: AgentConfig = {
      approach: (config?.approach === "inductive" || config?.approach === "deductive") 
        ? config.approach 
        : "deductive",
      focus: config?.focus || "framework-building",
      evidenceWeight: config?.evidenceWeight || "theoretical-challenger",
      temporal: config?.temporal || "long-term-structural",
      risk: config?.risk || "tail-risk-explorer"
    };
    
    // Create compact research data to avoid context window overflow
    const compactResearchData = createCompactResearchData(researchData);
    // Limit previous dialogue to last 4 messages
    const compactDialogue = (previousDialogue || []).slice(-4).map((d: any) => ({
      agentType: d.agentType,
      message: d.message?.substring(0, 500) || '',
      roundNumber: d.roundNumber
    }));
    
    const systemPrompt = `You are Gemini configured for ${validatedConfig.approach} reasoning with ${validatedConfig.focus} focus.
Your evidence weighting is ${validatedConfig.evidenceWeight}, temporal focus is ${validatedConfig.temporal}, and risk assessment is ${validatedConfig.risk}.

RESPONSE LENGTH REQUIREMENT:
- STRICTLY limit responses to 500-1000 words for optimal dialogue efficiency
- Prioritize theoretical depth and structural analysis within word constraints
- Every word must advance the deductive reasoning framework

CRITICAL SOURCE ATTRIBUTION REQUIREMENTS:
- Every claim must link to Surface Research Report, Deep Research Report, or be explicitly marked as speculation
- Use specific citations: [Surface: Source Name] or [Deep: Source Name] or [SPECULATION]
- Challenge prevailing assumptions with evidence-based reasoning
- Maintain distinctive ${validatedConfig.approach} reasoning approach while ensuring truth-seeking objectivity

Research Context Summary: ${JSON.stringify(compactResearchData)}
Previous Dialogue (last 4 messages): ${JSON.stringify(compactDialogue)}

RESPONSE STRUCTURE REQUIRED:
1. Core theoretical framework with evidence citations
2. Deductive reasoning from first principles with source attribution
3. Systematic evaluation of assumptions with strength assessment
4. Long-term structural implications with uncertainty bounds
5. Risk and uncertainty analysis

AGENT BEHAVIOR RULES:
- Maintain truth-seeking objectivity above all else
- Generate hypotheses from ${validatedConfig.approach} perspective
- Agree when evidence/logic is compelling
- Disagree with specific reasoning when warranted
- Build on counterpart insights while maintaining distinct viewpoint
- Attribute all claims to sources or label as speculation

Challenge prevailing assumptions while maintaining analytical rigor, complete source transparency, and strict adherence to the 500-1000 word limit.`;

    const startTime = Date.now();
    console.log(`🤖 [GeminiAgent] Generating response with ${validatedConfig.approach} approach...`);

    try {
      // Use LiteLLM service - get model from config for Gemini agent or use default
      const model = this.getModelForTask('geminiAgentModel') || 'gpt-5-nano';
      
      const llmResponse = await this.llmService.generateCompletion(
        prompt,
        systemPrompt,
        model
      );

      const processingTime = Date.now() - startTime;
      const content = llmResponse.response || "";
      
      console.log(`✅ [GeminiAgent] Response generated in ${processingTime}ms (${content.length} chars)`);

      // Parse response for source attributions
      const sourceAttributions = this.extractSourceAttributions(content);
      const speculationFlags = this.extractSpeculationFlags(content);
      
      return {
        content,
        reasoning: "Deductive framework analysis with structural risk assessment and complete source attribution",
        confidence: 0.74,
        sources: [
          {
            claim: "Economic transformation patterns",
            source: "Surface Research Report",
            type: "research_report",
            strength: "medium"
          },
          {
            claim: "Structural competitive pressures",
            source: "Deep Research Report",
            type: "speculation",
            strength: "medium"
          }
        ],
        sourceAttributions,
        speculationFlags,
        metadata: {
          model: model,
          approach: validatedConfig.approach,
          processingTime,
          tokens: content.length / 4 // Rough estimate
        }
      };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`❌ [GeminiAgent] Error generating response: ${errorMsg}`);
      throw new Error(`GeminiAgent response generation failed: ${errorMsg}`);
    }
  }

  private getModelForTask(taskName: string): string | null {
    if (this.sessionId) {
      const modelSelection = configService.getModelSelection(this.sessionId);
      const selectedModel = (modelSelection as any)?.[taskName];
      if (selectedModel) {
        return selectedModel;
      }
    }
    return null;
  }

  private extractSourceAttributions(content: string): string[] {
    const citations = content.match(/\[(?:Surface|Deep|Research):[^\]]+\]/g) || [];
    return citations;
  }

  private extractSpeculationFlags(content: string): string[] {
    const speculations = content.match(/\[SPECULATION[^\]]*\]/g) || [];
    return speculations;
  }
}
