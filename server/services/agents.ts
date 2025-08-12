import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { configService } from "./config";

export interface AgentResponse {
  content: string;
  reasoning: string;
  confidence: number;
  sources: string[];
  metadata: any;
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

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
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
      return await this.mockGenerateResponse(researchData, config, previousDialogue, prompt);
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

Research Context: ${JSON.stringify(researchData)}
Previous Dialogue: ${JSON.stringify(previousDialogue)}

Respond with structured analysis including:
1. Your core position/answer
2. Key reasoning steps
3. Evidence evaluation
4. Confidence assessment
5. Areas of uncertainty

Be distinctive in your reasoning approach while maintaining intellectual rigor.`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 1500,
    });

    const content = response.choices[0].message.content || "";
    
    return {
      content,
      reasoning: "Inductive pattern analysis from empirical data",
      confidence: 0.78,
      sources: ["Research data synthesis", "Empirical pattern recognition"],
      metadata: {
        model: "gpt-4o",
        approach: config.approach,
        tokens: response.usage?.total_tokens
      }
    };
  }

  private async mockGenerateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    await this.delay(2000);
    
    const roundNumber = previousDialogue.length;
    const responses = [
      {
        content: "Based on the empirical data patterns, I see strong evidence for productivity complementarity rather than job substitution. The 15-30% productivity gains consistently appear across coding and writing tasks, suggesting LLMs excel at routine cognitive work while humans retain advantages in creative problem-solving and strategic thinking. However, I'm particularly concerned about the transition period - organizations that adapt quickly will gain competitive advantages, potentially forcing industry-wide adoption faster than workers can reskill.",
        reasoning: "Inductive analysis of productivity data patterns and organizational adaptation signals",
        confidence: 0.76
      },
      {
        content: "The productivity data is compelling, but I want to challenge the timeline assumptions. Early adopter bias might be skewing our optimism - these organizations likely have resources for proper implementation and training. What happens when LLM tools become commoditized and pressure mounts for faster, cheaper deployment? I'm seeing patterns suggesting the transition could be more abrupt than gradual, especially in cost-sensitive sectors.",
        reasoning: "Pattern recognition from historical technology adoption cycles",
        confidence: 0.71
      },
      {
        content: "I appreciate Gemini's structural concerns, but the data suggests something more nuanced. Yes, adoption pressure will increase, but the complementarity effects seem robust across different implementation styles. The key insight is that productivity gains come from human-AI collaboration, not replacement. Organizations trying to use LLMs as direct substitutes consistently underperform. This creates natural incentives for sustainable integration patterns.",
        reasoning: "Empirical evidence synthesis with focus on collaboration patterns",
        confidence: 0.79
      }
    ];

    const response = responses[Math.min(roundNumber, responses.length - 1)];
    
    return {
      content: response.content,
      reasoning: response.reasoning,
      confidence: response.confidence,
      sources: ["MIT productivity study", "Stanford workplace research", "McKinsey adoption analysis"],
      metadata: {
        model: "gpt-4o-mock",
        approach: config.approach,
        roundNumber
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

  async generateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    if (configService.isRealMode() && this.gemini) {
      return await this.realGenerateResponse(researchData, config, previousDialogue, prompt);
    } else {
      return await this.mockGenerateResponse(researchData, config, previousDialogue, prompt);
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

Research Context: ${JSON.stringify(researchData)}
Previous Dialogue: ${JSON.stringify(previousDialogue)}

Respond with structured analysis including:
1. Your core theoretical framework
2. Deductive reasoning from first principles
3. Systematic evaluation of assumptions
4. Long-term structural implications
5. Risk and uncertainty analysis

Challenge prevailing assumptions while maintaining analytical rigor.`;

    const response = await this.gemini.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `${systemPrompt}\n\nUser Query: ${prompt}`,
      config: {
        temperature: 0.4,
        maxOutputTokens: 1500,
      },
    });

    const content = response.text || "";
    
    return {
      content,
      reasoning: "Deductive framework analysis with structural risk assessment",
      confidence: 0.74,
      sources: ["Theoretical framework", "Historical precedent analysis"],
      metadata: {
        model: "gemini-2.5-pro",
        approach: config.approach,
        tokens: content.length
      }
    };
  }

  private async mockGenerateResponse(
    researchData: any,
    config: AgentConfig,
    previousDialogue: any[],
    prompt: string
  ): Promise<AgentResponse> {
    await this.delay(2200);
    
    const roundNumber = previousDialogue.length;
    const responses = [
      {
        content: "I approach this from a systems perspective and see concerning structural risks that the productivity data might obscure. While 15-30% gains are impressive, they reflect optimization within existing frameworks. The real question is systemic transformation: when LLMs become sufficiently capable, why maintain expensive human cognitive labor at all? Economic pressure suggests a potential phase transition rather than gradual adaptation. We need to examine the incentive structures more carefully.",
        reasoning: "Deductive analysis from economic first principles and systemic incentives",
        confidence: 0.72
      },
      {
        content: "ChatGPT raises valid points about current complementarity, but I'm concerned we're anchoring on today's capabilities. Consider the trajectory: current LLMs handle routine cognitive work, next-generation models will tackle creative and strategic tasks. The transition period might be shorter than expected. Historical precedent suggests that once a technology reaches cost-effectiveness thresholds, adoption accelerates exponentially. Are we prepared for that scenario?",
        reasoning: "Framework analysis of technology adoption curves and capability progression",
        confidence: 0.69
      },
      {
        content: "The collaboration model ChatGPT describes works well for high-skill, high-value work, but what about the broader knowledge economy? Service sectors, mid-level analysis, routine decision-making - these represent huge employment segments. Even if core creative roles remain human-dominated, the economic disruption from automating everything else could be substantial. We need policy frameworks that account for this asymmetric impact.",
        reasoning: "Structural analysis of labor market stratification and automation susceptibility",
        confidence: 0.76
      }
    ];

    const response = responses[Math.min(roundNumber, responses.length - 1)];
    
    return {
      content: response.content,
      reasoning: response.reasoning,
      confidence: response.confidence,
      sources: ["Economic theory", "Technology adoption models", "Labor market analysis"],
      metadata: {
        model: "gemini-2.5-pro-mock",
        approach: config.approach,
        roundNumber
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}