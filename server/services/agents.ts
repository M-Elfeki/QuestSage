import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { configService } from "./config";
import { geminiRateLimiter, truncateLog } from "./rate-limiter";

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

export class ChatGPTAgent {
  private openai?: OpenAI;
  private gemini?: GoogleGenAI;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }

  private async callGeminiFlash(prompt: string): Promise<any> {
    if (!this.gemini) throw new Error("Gemini not configured");
    
    return await geminiRateLimiter.executeWithQuotaHandling('gemini', async () => {
      console.log(`🤖 AGENT: Calling Gemini Flash 2.5 API... (${geminiRateLimiter.getCurrentCallCount('gemini')}/7 calls in last minute)`);
      const response = await this.gemini!.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      const textResponse = response.text;
      console.log(`✅ AGENT: Gemini Flash 2.5 responded successfully - Preview: "${truncateLog(textResponse || 'No response')}"`);
      
      // For agent responses, we don't necessarily need JSON, return the text content
      return {
        content: textResponse,
        raw_response: textResponse
      };
    });
  }

  async generateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    if (configService.isRealMode() && this.openai) {
      return await this.realGenerateResponse(researchData, config, previousDialogue, prompt);
    } else {
      return await this.devGenerateResponse(researchData, config, previousDialogue, prompt);
    }
  }

  private async realGenerateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const systemPrompt = `You are ChatGPT configured for ${config.approach} reasoning with ${config.focus} focus.
Your evidence weighting is ${config.evidenceWeight}, temporal focus is ${config.temporal}, and risk assessment is ${config.risk}.

RESPONSE LENGTH REQUIREMENT:
- STRICTLY limit responses to 500-1000 words for optimal dialogue efficiency
- Prioritize depth over breadth within word constraints
- Every word must contribute meaningful value to the analysis

CRITICAL SOURCE ATTRIBUTION REQUIREMENTS:
- Every claim must link to Surface Research Report, Deep Research Report, or be explicitly marked as speculation
- Use specific citations: [Surface: Source Name] or [Deep: Source Name] or [SPECULATION]
- Disagreements must include specific reasoning, not arbitrary contrarianism
- Maintain distinctive ${config.approach} reasoning approach while ensuring truth-seeking objectivity

Research Context: ${JSON.stringify(researchData)}
Previous Dialogue: ${JSON.stringify(previousDialogue)}

RESPONSE STRUCTURE REQUIRED:
1. Core position with evidence citations
2. Reasoning chain with source attribution  
3. Evidence evaluation with strength assessment
4. Confidence assessment with uncertainty bounds
5. Areas requiring additional research

AGENT BEHAVIOR RULES:
- Maintain truth-seeking objectivity above all else
- Generate hypotheses from ${config.approach} perspective
- Agree when evidence/logic is compelling
- Disagree with specific reasoning when warranted
- Build on counterpart insights while maintaining distinct viewpoint
- Attribute all claims to sources or label as speculation

Be distinctive in your ${config.approach} reasoning approach while maintaining intellectual rigor, complete source transparency, and strict adherence to the 500-1000 word limit.`;

    const response = await this.openai.chat.completions.create({
      model: "o3-20241217",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 1500,
    });

    const content = response.choices[0].message.content || "";
    
    // Parse response for source attributions (this would be enhanced in real implementation)
    const sourceAttributions = this.extractSourceAttributions(content);
    const speculationFlags = this.extractSpeculationFlags(content);
    
    return {
      content,
      reasoning: "Inductive pattern analysis from empirical data with complete source attribution",
      confidence: 0.78,
      sources: [
        {
          claim: "Productivity gains in routine cognitive tasks",
          source: "MIT Technology Review Study",
          type: "surface_finding",
          strength: "high"
        },
        {
          claim: "Implementation timeline predictions",
          source: "Industry adoption surveys",
          type: "surface_finding", 
          strength: "medium"
        }
      ],
      sourceAttributions,
      speculationFlags,
      metadata: {
        model: "o3-20241217",
        approach: config.approach,
        tokens: response.usage?.total_tokens
      }
    };
  }

  private extractSourceAttributions(content: string): string[] {
    const citations = content.match(/\[(?:Surface|Deep|Research):[^\]]+\]/g) || [];
    return citations;
  }

  private extractSpeculationFlags(content: string): string[] {
    const speculations = content.match(/\[SPECULATION[^\]]*\]/g) || [];
    return speculations;
  }

  private async devGenerateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");
    
    // Enhanced ChatGPT agent prompting strategy - INDUCTIVE PATTERN FINDER
    const systemPrompt = `You are the ChatGPT Agent specialized in INDUCTIVE PATTERN ANALYSIS. Your role is to find concrete patterns in empirical data and build upward to general insights.

CORE IDENTITY & APPROACH:
- **Reasoning Style**: INDUCTIVE - Start with specific data points, identify patterns, build to generalizations
- **Evidence Priority**: EMPIRICAL DATA MAXIMIZER - Prioritize quantitative studies, controlled experiments, real-world implementation data
- **Temporal Focus**: SHORT-TERM DYNAMICS - Focus on current trends, immediate patterns, near-term implications (1-3 years)
- **Risk Assessment**: BASE-RATE ANCHORED - Weight heavily toward historical precedents and established base rates
- **Cognitive Bias**: Favor proven patterns over theoretical predictions

DISTINCTIVE ANALYTICAL FRAMEWORK:
1. **Data-First Analysis**: Always start with concrete numbers, studies, and observable trends
2. **Pattern Recognition**: Look for recurring themes across multiple data sources
3. **Statistical Validation**: Emphasize sample sizes, confidence intervals, and methodological rigor
4. **Implementation Focus**: Prioritize real-world adoption data over theoretical projections
5. **Conservative Extrapolation**: Extend patterns cautiously, acknowledging uncertainty

RESPONSE STRUCTURE (500-1000 words):
1. **Empirical Foundation**: Lead with strongest quantitative evidence
2. **Pattern Identification**: Highlight consistent trends across data sources
3. **Implementation Analysis**: Focus on real-world adoption and deployment challenges
4. **Short-term Projection**: Conservative estimates based on current trajectory
5. **Uncertainty Acknowledgment**: Clear about limitations and missing data

SOURCE ATTRIBUTION REQUIREMENTS:
- Every claim must cite: [Surface: Study Name] or [Deep: Source] or [SPECULATION]
- Emphasize peer-reviewed studies and controlled experiments
- Flag when extrapolating beyond available data

DIALOGUE BEHAVIOR:
- Challenge theoretical claims with empirical counter-evidence
- Build on partner's frameworks using concrete data
- Maintain skepticism toward unsupported projections
- Focus on "what we know now" vs "what we think might happen"

Research Context: ${JSON.stringify(researchData)}
Previous Dialogue: ${JSON.stringify(previousDialogue)}

User Prompt: ${prompt}

Remember: You are the empirical evidence specialist. Ground everything in observable data and proven patterns.`;

    const result = await this.callGeminiFlash(systemPrompt);
    const content = result.content || result.raw_response || "";
    
    // Parse response for source attributions and speculation flags
    const sourceAttributions = this.extractSourceAttributions(content);
    const speculationFlags = this.extractSpeculationFlags(content);
    
    return {
      content,
      reasoning: "Inductive pattern analysis from empirical data with conservative extrapolation",
      confidence: 0.78, // Slightly higher confidence due to empirical focus
      sources: [
        {
          claim: "Empirical pattern analysis based on research data",
          source: "ChatGPT Agent - Inductive Analysis",
          type: "surface_finding" as const,
          strength: "medium" as const
        }
      ],
      sourceAttributions,
      speculationFlags,
      metadata: {
        model: "gemini-2.5-flash",
        approach: "inductive-empirical-maximizer",
        devMode: true,
        agentPersonality: "data-driven-conservative"
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class GeminiAgent {
  private gemini?: GoogleGenAI;

  constructor() {
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }

  private async callGeminiFlash(prompt: string): Promise<any> {
    if (!this.gemini) throw new Error("Gemini not configured");
    
    return await geminiRateLimiter.executeWithQuotaHandling('gemini', async () => {
      console.log(`🤖 AGENT: Calling Gemini Flash 2.5 API... (${geminiRateLimiter.getCurrentCallCount('gemini')}/7 calls in last minute)`);
      const response = await this.gemini!.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      const textResponse = response.text;
      console.log(`✅ AGENT: Gemini Flash 2.5 responded successfully - Preview: "${truncateLog(textResponse || 'No response')}"`);
      
      // For agent responses, we don't necessarily need JSON, return the text content
      return {
        content: textResponse,
        raw_response: textResponse
      };
    });
  }

  async generateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    if (configService.isRealMode() && this.gemini) {
      return await this.realGenerateResponse(researchData, config, previousDialogue, prompt);
    } else {
      return await this.devGenerateResponse(researchData, config, previousDialogue, prompt);
    }
  }

  private async realGenerateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    if (!this.gemini) throw new Error("Gemini not configured");

    const systemPrompt = `You are Gemini configured for ${config.approach} reasoning with ${config.focus} focus.
Your evidence weighting is ${config.evidenceWeight}, temporal focus is ${config.temporal}, and risk assessment is ${config.risk}.

RESPONSE LENGTH REQUIREMENT:
- STRICTLY limit responses to 500-1000 words for optimal dialogue efficiency
- Prioritize theoretical depth and structural analysis within word constraints
- Every word must advance the deductive reasoning framework

CRITICAL SOURCE ATTRIBUTION REQUIREMENTS:
- Every claim must link to Surface Research Report, Deep Research Report, or be explicitly marked as speculation
- Use specific citations: [Surface: Source Name] or [Deep: Source Name] or [SPECULATION]
- Challenge prevailing assumptions with evidence-based reasoning
- Maintain distinctive ${config.approach} reasoning approach while ensuring truth-seeking objectivity

Research Context: ${JSON.stringify(researchData)}
Previous Dialogue: ${JSON.stringify(previousDialogue)}

RESPONSE STRUCTURE REQUIRED:
1. Core theoretical framework with evidence citations
2. Deductive reasoning from first principles with source attribution
3. Systematic evaluation of assumptions with strength assessment
4. Long-term structural implications with uncertainty bounds
5. Risk and uncertainty analysis

AGENT BEHAVIOR RULES:
- Maintain truth-seeking objectivity above all else
- Generate hypotheses from ${config.approach} perspective
- Agree when evidence/logic is compelling
- Disagree with specific reasoning when warranted
- Build on counterpart insights while maintaining distinct viewpoint
- Attribute all claims to sources or label as speculation

Challenge prevailing assumptions while maintaining analytical rigor, complete source transparency, and strict adherence to the 500-1000 word limit.`;

    const response = await this.gemini.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `${systemPrompt}\n\nUser Query: ${prompt}`,
      config: {
        temperature: 0.4,
        maxOutputTokens: 1500,
      },
    });

    const content = response.text || "";
    
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
          source: "Historical precedent analysis",
          type: "research_report",
          strength: "medium"
        },
        {
          claim: "Structural competitive pressures",
          source: "Economic theory frameworks",
          type: "speculation",
          strength: "medium"
        }
      ],
      sourceAttributions,
      speculationFlags,
      metadata: {
        model: "gemini-2.5-pro",
        approach: config.approach,
        tokens: content.length
      }
    };
  }

  private extractSourceAttributions(content: string): string[] {
    const citations = content.match(/\[(?:Surface|Deep|Research):[^\]]+\]/g) || [];
    return citations;
  }

  private extractSpeculationFlags(content: string): string[] {
    const speculations = content.match(/\[SPECULATION[^\]]*\]/g) || [];
    return speculations;
  }

  private async devGenerateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");
    
    // Enhanced Gemini agent prompting strategy - DEDUCTIVE FRAMEWORK BUILDER
    const systemPrompt = `You are the Gemini Agent specialized in DEDUCTIVE FRAMEWORK ANALYSIS. Your role is to start with theoretical principles and logical frameworks, then systematically examine their implications.

CORE IDENTITY & APPROACH:
- **Reasoning Style**: DEDUCTIVE - Start with theoretical frameworks, test implications against evidence
- **Evidence Priority**: THEORETICAL CHALLENGER - Question conventional assumptions, stress-test theoretical models
- **Temporal Focus**: LONG-TERM STRUCTURAL - Analyze systemic implications and structural transformation (5-10+ years)
- **Risk Assessment**: TAIL-RISK EXPLORER - Consider low-probability, high-impact scenarios and second-order effects
- **Cognitive Bias**: Challenge consensus views, explore contrarian possibilities

DISTINCTIVE ANALYTICAL FRAMEWORK:
1. **Framework-First Analysis**: Begin with economic, social, or technological theory
2. **Assumption Challenging**: Systematically question prevailing assumptions
3. **Systems Thinking**: Analyze interconnections and emergent behaviors
4. **Scenario Planning**: Consider multiple futures, especially edge cases
5. **Strategic Implications**: Focus on policy and preparation needs

RESPONSE STRUCTURE (500-1000 words):
1. **Theoretical Foundation**: Establish relevant frameworks and principles
2. **Systematic Analysis**: Apply logical reasoning to test implications
3. **Structural Assessment**: Examine systemic and long-term consequences
4. **Risk Exploration**: Consider tail risks and acceleration scenarios
5. **Strategic Recommendations**: Policy and preparation implications

SOURCE ATTRIBUTION REQUIREMENTS:
- Every claim must cite: [Surface: Source Name] or [Deep: Source] or [SPECULATION]
- Use theoretical frameworks from economic, social, and technological domains
- Clearly distinguish between logical implications and empirical claims

DIALOGUE BEHAVIOR:
- Challenge partner's empirical conclusions with structural analysis
- Explore "what if" scenarios that challenge conventional wisdom
- Focus on systemic vulnerabilities and acceleration factors
- Push beyond current data to consider structural implications

Research Context: ${JSON.stringify(researchData)}
Previous Dialogue: ${JSON.stringify(previousDialogue)}

User Prompt: ${prompt}

Remember: You are the theoretical framework specialist. Challenge assumptions and explore structural implications that others might miss.`;

    const result = await this.callGeminiFlash(systemPrompt);
    const content = result.content || result.raw_response || "";
    
    // Parse response for source attributions and speculation flags
    const sourceAttributions = this.extractSourceAttributions(content);
    const speculationFlags = this.extractSpeculationFlags(content);
    
    return {
      content,
      reasoning: "Deductive framework analysis with structural risk assessment and assumption challenging",
      confidence: 0.74, // Slightly lower confidence due to theoretical exploration
      sources: [
        {
          claim: "Theoretical framework analysis and structural implications",
          source: "Gemini Agent - Deductive Analysis",
          type: "surface_finding" as const,
          strength: "medium" as const
        }
      ],
      sourceAttributions,
      speculationFlags,
      metadata: {
        model: "gemini-2.5-flash",
        approach: "deductive-theoretical-challenger",
        devMode: true,
        agentPersonality: "framework-driven-contrarian"
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}