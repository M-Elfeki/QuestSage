import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import Anthropic from '@anthropic-ai/sdk';
import { configService } from "./config";

export interface LLMResponse {
  response: string;
  processingTime: number;
  confidence?: number;
  metadata?: any;
}

export interface ClarificationResponse {
  requirements: string[];
  questions: Array<{
    id: string;
    text: string;
    options: string[];
    allowOpenText?: boolean;
  }>;
  answerFormat: string;
  complexity: 'low' | 'medium' | 'high';
}

export class FlashLLMService {
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

  async clarifyIntent(query: string): Promise<ClarificationResponse> {
    const startTime = Date.now();

    if (configService.isRealMode() && this.openai) {
      return await this.realClarifyIntent(query);
    } else {
      return await this.mockClarifyIntent(query);
    }
  }

  private async realClarifyIntent(query: string): Promise<ClarificationResponse> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const prompt = `
You are an expert research analyst. Analyze this query and extract:
1. Explicit requirements and constraints
2. Clarifying questions with multiple choice options AND open-ended text capability
3. Answer format needed
4. Problem complexity level

Query: "${query}"

Respond in JSON format:
{
  "requirements": ["requirement1", "requirement2", ...],
  "questions": [
    {
      "id": "unique_id",
      "text": "Question text?",
      "options": ["option1", "option2", "option3"],
      "allowOpenText": true
    }
  ],
  "answerFormat": "description of needed format",
  "complexity": "low|medium|high"
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
  }

  private async mockClarifyIntent(query: string): Promise<ClarificationResponse> {
    await this.delay(800);
    
    return {
      requirements: [
        "Analysis of LLM impact on knowledge work sectors",
        "Focus on job market implications", 
        "Timeline consideration for widespread adoption",
        "Sector-specific differentiation required"
      ],
      questions: [
        {
          id: "timeframe",
          text: "What timeframe should we focus on?",
          options: ["2-5 years", "5-10 years", "Long term (10+ years)"],
          allowOpenText: true
        },
        {
          id: "sectors",
          text: "Which knowledge work sectors are most important to analyze?",
          options: ["Legal", "Finance", "Healthcare", "Education", "Content Creation"],
          allowOpenText: true
        },
        {
          id: "methodology",
          text: "What research methodology should we prioritize?",
          options: ["Quantitative analysis", "Qualitative studies", "Mixed methods"],
          allowOpenText: true
        }
      ],
      answerFormat: "comprehensive analysis with confidence intervals",
      complexity: "high"
    };
  }

  async generateSearchTerms(clarifiedIntent: any): Promise<{
    surfaceTerms: string[];
    socialTerms: string[];
    relevanceRubric: string;
    sourceRankings: string[];
  }> {
    if (configService.isRealMode() && this.openai) {
      return await this.realGenerateSearchTerms(clarifiedIntent);
    } else {
      return await this.mockGenerateSearchTerms(clarifiedIntent);
    }
  }

  private async realGenerateSearchTerms(clarifiedIntent: any): Promise<{
    surfaceTerms: string[];
    socialTerms: string[];
    relevanceRubric: string;
    sourceRankings: string[];
  }> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const prompt = `
Based on this clarified research intent, generate comprehensive search terms for different research tiers:

Intent: ${JSON.stringify(clarifiedIntent)}

Generate:
1. Surface-level search terms (for Google, arXiv)
2. Social media search terms (for Reddit discussions)
3. Relevance scoring rubric
4. Source priority rankings

Respond in JSON format:
{
  "surfaceTerms": ["term1", "term2", ...],
  "socialTerms": ["term1", "term2", ...],
  "relevanceRubric": "description of scoring criteria",
  "sourceRankings": ["source1", "source2", ...]
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  }

  private async mockGenerateSearchTerms(clarifiedIntent: any): Promise<{
    surfaceTerms: string[];
    socialTerms: string[];
    relevanceRubric: string;
    sourceRankings: string[];
  }> {
    await this.delay(600);
    
    return {
      surfaceTerms: [
        "large language models job market impact",
        "LLM productivity knowledge work",
        "AI automation employment effects",
        "GPT workplace transformation"
      ],
      socialTerms: [
        "AI job displacement discussion",
        "ChatGPT workplace experience", 
        "LLM productivity gains real world"
      ],
      relevanceRubric: "Score based on empirical data, recency, and sector relevance",
      sourceRankings: ["peer-reviewed papers", "industry reports", "expert analysis", "case studies"]
    };
  }

  async extractFacts(searchResults: any[]): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      isContradictory: boolean;
    }>;
    totalClaims: number;
  }> {
    if (configService.isRealMode() && this.openai) {
      return await this.realExtractFacts(searchResults);
    } else {
      return await this.mockExtractFacts(searchResults);
    }
  }

  private async realExtractFacts(searchResults: any[]): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      isContradictory: boolean;
    }>;
    totalClaims: number;
  }> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const prompt = `
Extract unique claims from these search results. For each claim:
1. Extract the core factual statement
2. Identify the source
3. Score relevance (1-100)
4. Mark if contradictory to other claims

Search Results: ${JSON.stringify(searchResults.slice(0, 10))} // Limit for token efficiency

Respond in JSON format:
{
  "claims": [
    {
      "id": "claim-1",
      "text": "factual claim text",
      "source": "source name",
      "relevanceScore": 85,
      "isContradictory": false
    }
  ],
  "totalClaims": 5
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  }

  private async mockExtractFacts(searchResults: any[]): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      isContradictory: boolean;
    }>;
    totalClaims: number;
  }> {
    await this.delay(1200);
    
    const mockClaims = [
      {
        id: "claim-1",
        text: "Studies show 15-30% productivity gains in coding and writing tasks",
        source: "MIT Technology Review",
        relevanceScore: 95,
        isContradictory: false
      },
      {
        id: "claim-2", 
        text: "Contradictory predictions on net job creation vs displacement",
        source: "Multiple Sources",
        relevanceScore: 88,
        isContradictory: true
      }
    ];

    return {
      claims: mockClaims,
      totalClaims: mockClaims.length
    };
  }

  async generateDeepResearchQuery(analysis: any): Promise<string> {
    if (configService.isRealMode() && this.openai) {
      return await this.realGenerateDeepQuery(analysis);
    } else {
      return await this.mockGenerateDeepQuery(analysis);
    }
  }

  private async realGenerateDeepQuery(analysis: any): Promise<string> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const prompt = `
Based on this analysis of surface research findings, craft a targeted deep research query for Perplexity Sonar:

Analysis: ${JSON.stringify(analysis)}

Generate a focused question that addresses:
- Knowledge gaps identified
- Contradictory findings that need resolution
- High-impact claims requiring corroboration
- Edge cases needing investigation

The query should be specific, actionable, and designed to fill critical gaps in our understanding.`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    return response.choices[0].message.content || "";
  }

  private async mockGenerateDeepQuery(analysis: any): Promise<string> {
    await this.delay(400);
    
    return "Investigate contradictory claims about LLM impact on creative and analytical roles. Focus on empirical studies of productivity changes, wage effects, and skill complementarity vs substitution patterns in early adopter organizations.";
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class ProLLMService {
  private openai?: OpenAI;
  private anthropic?: Anthropic;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  async orchestrateResearch(clarifiedIntent: any, searchTerms: any): Promise<{
    priorities: string[];
    expectedFindings: string[];
    evaluationCriteria: string;
    orchestrationPlan: any;
  }> {
    if (configService.isRealMode() && this.anthropic) {
      return await this.realOrchestrateResearch(clarifiedIntent, searchTerms);
    } else {
      return await this.mockOrchestrateResearch(clarifiedIntent, searchTerms);
    }
  }

  private async realOrchestrateResearch(clarifiedIntent: any, searchTerms: any): Promise<{
    priorities: string[];
    expectedFindings: string[];
    evaluationCriteria: string;
    orchestrationPlan: any;
  }> {
    if (!this.anthropic) throw new Error("Anthropic not configured");

    const prompt = `You are a research orchestration expert. Plan a comprehensive research strategy.

Intent: ${JSON.stringify(clarifiedIntent)}
Search Terms: ${JSON.stringify(searchTerms)}

Create a detailed research plan that includes:
1. Research priorities (ordered by importance)
2. Expected findings categories
3. Quality evaluation criteria
4. Time allocation plan for each research phase

Respond in JSON format:
{
  "priorities": ["priority1", "priority2", ...],
  "expectedFindings": ["finding1", "finding2", ...],
  "evaluationCriteria": "detailed criteria description",
  "orchestrationPlan": {
    "surfacePhase": "time estimate",
    "socialPhase": "time estimate",
    "deepPhase": "time estimate"
  }
}`;

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    });

    return JSON.parse(response.content[0].text);
  }

  private async mockOrchestrateResearch(clarifiedIntent: any, searchTerms: any): Promise<{
    priorities: string[];
    expectedFindings: string[];
    evaluationCriteria: string;
    orchestrationPlan: any;
  }> {
    await this.delay(1000);
    
    return {
      priorities: [
        "Empirical productivity studies",
        "Sector-specific case studies",
        "Contradictory findings analysis"
      ],
      expectedFindings: [
        "Quantitative productivity metrics",
        "Qualitative workflow changes",
        "Employment trend indicators"
      ],
      evaluationCriteria: "Data quality, source reliability, recency, sample size",
      orchestrationPlan: {
        surfacePhase: "15 minutes",
        socialPhase: "10 minutes", 
        deepPhase: "20 minutes"
      }
    };
  }

  async analyzeResearchFindings(findings: any[]): Promise<{
    deduplicated: any[];
    contradictions: any[];
    highImpactClaims: any[];
    knowledgeGaps: string[];
  }> {
    await this.delay(2000);
    
    return {
      deduplicated: findings.slice(0, Math.floor(findings.length * 0.8)),
      contradictions: findings.filter(f => f.isContradictory),
      highImpactClaims: findings.filter(f => f.relevanceScore > 90),
      knowledgeGaps: [
        "Limited long-term data on wage effects",
        "Insufficient sector-specific analysis",
        "Lack of control group studies"
      ]
    };
  }

  async selectAgents(researchData: any, userContext: any): Promise<{
    chatgptConfig: any;
    geminiConfig: any;
    successCriteria: string[];
  }> {
    await this.delay(1500);
    
    return {
      chatgptConfig: {
        approach: "inductive",
        focus: "pattern-finding",
        evidenceWeight: "empirical-maximizer", 
        temporal: "short-term",
        risk: "base-rate-anchored"
      },
      geminiConfig: {
        approach: "deductive",
        focus: "framework-building", 
        evidenceWeight: "theoretical-challenger",
        temporal: "long-term",
        risk: "tail-risk-explorer"
      },
      successCriteria: [
        "Comprehensive exploration of uncertainty dimensions",
        "Meaningful disagreements with evidence",
        "Novel perspectives discovered"
      ]
    };
  }

  async evaluateDialogueRound(context: any): Promise<{
    decision: "continue" | "conclude";
    feedback: string[];
    questions: string[];
    reason: string;
  }> {
    await this.delay(1000);
    
    // Mock evaluation logic
    const roundsCompleted = context.roundNumber || 0;
    const maxRounds = 7;
    
    if (roundsCompleted >= maxRounds) {
      return {
        decision: "conclude",
        feedback: [],
        questions: [],
        reason: "Maximum rounds reached"
      };
    }
    
    return {
      decision: "continue",
      feedback: [
        "Explore the temporal aspects more deeply",
        "Challenge the productivity metrics assumptions"
      ],
      questions: [
        "How do we account for adaptation periods?",
        "What are the second-order effects on skill development?"
      ],
      reason: "Significant knowledge gaps remain unexplored"
    };
  }

  async synthesizeResults(researchData: any, dialogueHistory: any): Promise<{
    executiveSummary: string;
    evidenceFoundation: any[];
    reasoningChain: string;
    dissentingViews: any[];
    uncertaintyAnalysis: string;
    sourceAudit: any[];
    confidenceInterval: [number, number];
  }> {
    await this.delay(3000);
    
    return {
      executiveSummary: "Large language models will likely create net positive employment effects in knowledge work sectors over the next 5-10 years, but with significant sector-specific variation and short-term displacement risks.",
      evidenceFoundation: [
        {
          claim: "15-30% productivity gains in coding and writing",
          sources: ["MIT Tech Review", "Stanford Study 2024"],
          strength: "high"
        }
      ],
      reasoningChain: "Research indicates complementarity effects outweigh substitution effects in creative and analytical roles, but implementation timing and organizational adaptation capabilities create significant variation.",
      dissentingViews: [
        {
          view: "Gemini agent emphasized long-term structural risks",
          evidence: "Historical technology adoption patterns",
          confidence: 0.72
        }
      ],
      uncertaintyAnalysis: "Key uncertainties remain around adoption speed, regulatory responses, and worker reskilling capabilities.",
      sourceAudit: [
        { type: "peer-reviewed", count: 67, percentage: 67 },
        { type: "primary-sources", count: 23, percentage: 23 },
        { type: "recent", count: 78, percentage: 78 }
      ],
      confidenceInterval: [0.68, 0.84]
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
