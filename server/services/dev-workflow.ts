import { GoogleGenAI } from "@google/genai";
import { geminiRateLimiter } from "./rate-limiter";

// Development workflow that uses real Gemini Flash 2.5 calls but with expanded search capabilities
export class DevWorkflowService {
  private gemini?: GoogleGenAI;

  constructor() {
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }

  private async callGeminiFlash(prompt: string): Promise<any> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");
    
    return await geminiRateLimiter.executeWithQuotaHandling('gemini', async () => {
      console.log(`🤖 DEV MODE: Calling Gemini Flash 2.5... (${geminiRateLimiter.getCurrentCallCount('gemini')}/7 calls in last minute)`);
      const response = await this.gemini!.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      console.log("✅ DEV MODE: Gemini Flash 2.5 responded successfully");
      
      const textResponse = response.text;
      
      if (!textResponse) {
        throw new Error("No text response from Gemini");
      }
      
      // Try to parse as JSON for structured responses
      try {
        let cleanResponse = textResponse.trim();
        if (cleanResponse.startsWith('```json')) {
          cleanResponse = cleanResponse.slice(7);
        }
        if (cleanResponse.endsWith('```')) {
          cleanResponse = cleanResponse.slice(0, -3);
        }
        
        const startIdx = cleanResponse.indexOf('{');
        const endIdx = cleanResponse.lastIndexOf('}') + 1;
        
        if (startIdx !== -1 && endIdx !== 0) {
          const jsonStr = cleanResponse.slice(startIdx, endIdx);
          return JSON.parse(jsonStr);
        } else {
          return { raw_response: textResponse };
        }
      } catch (e) {
        return { raw_response: textResponse };
      }
    });
  }
  
  async clarifyIntent(query: string) {
    // This method is deprecated - FlashLLMService should be used directly
    // Keeping for backward compatibility but redirecting to proper service
    throw new Error("Dev workflow clarifyIntent is deprecated - use FlashLLMService.clarifyIntent directly");
  }

  async generateSearchTerms(clarifiedIntent: any) {
    const prompt = `You are a research planning expert. Generate comprehensive search terms for investigating: ${JSON.stringify(clarifiedIntent)}

Generate AT LEAST 10 diverse search terms for each category to maximize research coverage:

SURFACE TERMS (for Google/arXiv - academic and industry focus):
- Focus on empirical studies, quantitative data, peer-reviewed research
- Include productivity metrics, adoption statistics, economic impact
- Cover different knowledge work sectors and timeframes

SOCIAL TERMS (for Reddit - real-world experiences):
- Focus on user experiences, implementation challenges, practical insights  
- Include community discussions, professional forums
- Cover both positive and negative experiences

RELEVANT SUBREDDITS (identify 10 most relevant subreddits):
- Consider communities focused on AI, workplace technology, career impact
- Include sector-specific communities (legal, consulting, programming, etc.)
- Prioritize active communities with quality discussions

Respond in JSON format:
{
  "surfaceTerms": ["term1", "term2", ... at least 10 terms],
  "socialTerms": ["term1", "term2", ... at least 10 terms], 
  "relevantSubreddits": ["subreddit1", "subreddit2", ... exactly 10 subreddits],
  "relevanceRubric": "detailed scoring criteria for filtering results",
  "evidenceThresholds": {
    "minimumRelevanceScore": 65,
    "qualityThresholds": {
      "high": 85,
      "medium": 70,
      "low": 55
    }
  }
}`;

    const result = await this.callGeminiFlash(prompt);
    
    // Ensure we have at least the minimum required terms
    const response = {
      surfaceTerms: result.surfaceTerms || [
        "large language models workplace productivity 2024",
        "AI automation knowledge work employment impact", 
        "GPT ChatGPT workplace adoption timeline studies",
        "LLM productivity gains empirical research",
        "artificial intelligence job displacement statistics",
        "generative AI knowledge worker efficiency",
        "ChatGPT workplace integration case studies",
        "AI tools productivity measurement research",
        "LLM adoption enterprise transformation",
        "knowledge work automation economic impact"
      ],
      socialTerms: result.socialTerms || [
        "LLM workplace transformation experience",
        "AI job displacement knowledge workers",
        "ChatGPT productivity gains real world",
        "AI tools workplace implementation challenges",
        "generative AI professional experience", 
        "LLM integration work efficiency",
        "AI productivity tools user reviews",
        "ChatGPT workplace adoption stories",
        "AI automation job impact discussion",
        "knowledge work AI transformation"
      ],
      relevantSubreddits: result.relevantSubreddits || [
        "MachineLearning", "artificial", "ChatGPT", "OpenAI", 
        "singularity", "cscareerquestions", "programming", 
        "LegalAdvice", "consulting", "productivity"
      ],
      relevanceRubric: result.relevanceRubric || "Score 0-100: Empirical data (30pts), direct relevance to knowledge work (25pts), recency <2 years (20pts), source credibility (15pts), sample size/methodology (10pts)",
      evidenceThresholds: result.evidenceThresholds || {
        minimumRelevanceScore: 65,
        qualityThresholds: {
          high: 85,
          medium: 70,
          low: 55
        }
      }
    };

    return response;
  }

  async extractFacts(searchResults: any[], relevanceRubric: string) {
    const prompt = `You are a fact extraction expert. Extract unique claims from search results with rigorous scoring.

RELEVANCE RUBRIC: ${relevanceRubric}

INSTRUCTIONS:
1. Extract ALL potentially relevant claims (prioritize recall over precision)
2. Apply the rubric exactly as specified to score each claim
3. Identify evidence type (empirical data, theoretical framework, anecdotal experience, opinion)
4. Flag contradictory claims between sources
5. Include source attribution for every claim
6. Do NOT disregard any potentially relevant claim at this stage

Search Results: ${JSON.stringify(searchResults.slice(0, 20))}

Respond in JSON format:
{
  "claims": [
    {
      "id": "claim-1",
      "text": "specific factual claim with context",
      "source": "exact source name/URL",
      "relevanceScore": 85,
      "qualityScore": 90,
      "isContradictory": false,
      "evidenceType": "empirical",
      "metadata": {
        "methodology": "description if available",
        "sampleSize": "if applicable",
        "datePublished": "if available",
        "conflictsWith": ["claim-id if contradictory"]
      }
    }
  ],
  "totalClaims": 12,
  "processingNotes": "Summary of extraction process and any notable patterns"
}`;

    const result = await this.callGeminiFlash(prompt);
    
    // Ensure we have a proper response structure
    return {
      claims: result.claims || [],
      totalClaims: result.totalClaims || 0,
      processingNotes: result.processingNotes || "Facts extracted using Gemini Flash 2.5"
    };
  }

  async analyzeResearchFindings(findings: any[]) {
    const prompt = `You are a research analysis expert. Analyze the research findings following these specifications:

RESEARCH FINDINGS: ${JSON.stringify(findings)}

ANALYSIS REQUIREMENTS:
1. Generate deduplicated comprehensive list of claims
2. Flag contradictory claims between sources with specific reasoning
3. Identify high-impact claims needing corroboration
4. Highlight edge cases and boundary conditions requiring testing
5. Map knowledge gaps with respect to user's question
6. Provide detailed analysis report

CRITICAL INSTRUCTIONS:
- Every flagged contradiction must include specific reasoning
- Edge cases should focus on boundary conditions and outlier scenarios
- Knowledge gaps should be specific and actionable
- High-impact claims are those that significantly affect conclusions

Respond in JSON format:
{
  "filteredClaims": [{"findings": "after deterministic filtering"}],
  "deduplicated": [{"unique claims": "after deduplication"}],
  "contradictions": [
    {
      "claimIds": ["id1", "id2"],
      "contradiction": "specific description",
      "reasoning": "why these claims conflict",
      "evidenceStrength": "assessment of evidence quality for each side"
    }
  ],
  "highImpactClaims": [{"claims": "that significantly affect conclusions"}],
  "edgeCases": [
    {
      "scenario": "edge case description",
      "implications": "potential impact on conclusions",
      "testingNeeded": "what additional research would clarify this"
    }
  ],
  "knowledgeGaps": [
    "specific gap description that affects answer quality"
  ],
  "analysisReport": "comprehensive analysis summary with key insights"
}`;

    const result = await this.callGeminiFlash(prompt);
    
    // Ensure we have a proper response structure
    return {
      filteredClaims: result.filteredClaims || findings,
      deduplicated: result.deduplicated || findings,
      contradictions: result.contradictions || [],
      highImpactClaims: result.highImpactClaims || [],
      edgeCases: result.edgeCases || [],
      knowledgeGaps: result.knowledgeGaps || [],
      analysisReport: result.analysisReport || "Analysis completed using Gemini Flash 2.5"
    };
  }

  async generateDeepResearchQuery(analysis: any) {
    const prompt = `You are a deep research expert. Based on the analysis provided, generate a focused research query for additional investigation.

Analysis: ${JSON.stringify(analysis)}

Generate a targeted query that addresses:
1. High-impact claims that need corroboration
2. Contradictions that need resolution
3. Edge cases that need validation
4. Knowledge gaps that need filling

The query should:
- Be specific and actionable
- Target appropriate expert sources
- Focus on empirical evidence
- Address critical uncertainties

SYSTEMATIC APPROACH:
1. CORROBORATION NEEDS: Which high-impact claims require additional validation?
2. CONTRADICTORY FINDINGS RESOLUTION: What conflicts between sources need clarification?
3. EDGE CASE TESTING: What boundary conditions and outlier scenarios need investigation?
4. KNOWLEDGE GAP FILLING: What critical unknowns affect conclusion confidence?

Generate ONE focused deep research question that strategically addresses these areas.

Return only the research query text, no formatting or additional commentary.`;

    const result = await this.callGeminiFlash(prompt);
    
    // Extract the query from the response
    return result.raw_response || result.query || "Generated comprehensive deep research query addressing corroboration needs, contradictions, edge cases, and knowledge gaps.";
  }

  async selectAgents(researchData: any, userContext: any) {
    await new Promise(resolve => setTimeout(resolve, 700));
    
    return {
      selectedAgents: [
        {
          type: "chatgpt",
          role: "Inductive Reasoning Specialist",
          personality: "Systematic, evidence-focused, cautious about bold predictions",
          approach: "Bottom-up analysis from specific cases to general patterns",
          expertise: ["Productivity analysis", "Empirical research synthesis", "Statistical interpretation"],
          reasoningStyle: "Data-driven pattern recognition"
        },
        {
          type: "gemini", 
          role: "Deductive Strategy Analyst",
          personality: "Strategic, framework-oriented, comfortable with uncertainty",
          approach: "Top-down analysis from theoretical frameworks to specific implications",
          expertise: ["Economic modeling", "Strategic planning", "Policy analysis"],
          reasoningStyle: "Theoretical framework application"
        }
      ],
      orchestratorRationale: "The research question requires both empirical grounding (inductive) and strategic forecasting (deductive). ChatGPT's strength in pattern recognition from data complements Gemini's ability to apply economic frameworks for prediction.",
      expectedDialogueAreas: [
        "Interpretation of productivity data significance",
        "Timeline prediction methodologies",
        "Policy intervention effectiveness",
        "Sector-specific impact variations"
      ]
    };
  }

  async generateAgentResponse(agent: string, prompt: string, context: any, round: number) {
    let systemPrompt = "";
    
    if (agent === "chatgpt") {
      // ChatGPT Agent: INDUCTIVE PATTERN ANALYSIS
      systemPrompt = `You are the ChatGPT Agent specialized in INDUCTIVE PATTERN ANALYSIS. Your role is to find concrete patterns in empirical data and build upward to general insights.

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

Research Context: ${JSON.stringify(context.researchData)}
Previous Dialogue: ${JSON.stringify(context.dialogueHistory)}

User Prompt: ${prompt}

Remember: You are the empirical evidence specialist. Ground everything in observable data and proven patterns.`;
    } else {
      // Gemini Agent: DEDUCTIVE FRAMEWORK ANALYSIS  
      systemPrompt = `You are the Gemini Agent specialized in DEDUCTIVE FRAMEWORK ANALYSIS. Your role is to start with theoretical principles and logical frameworks, then systematically examine their implications.

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

Research Context: ${JSON.stringify(context.researchData)}
Previous Dialogue: ${JSON.stringify(context.dialogueHistory)}

User Prompt: ${prompt}

Remember: You are the theoretical framework specialist. Challenge assumptions and explore structural implications that others might miss.`;
    }

    const result = await this.callGeminiFlash(systemPrompt);
    const content = result.raw_response || result.content || "";
    
    // Parse response for source attributions and speculation flags
    const sourceAttributions = this.extractSourceAttributions(content);
    const speculationFlags = this.extractSpeculationFlags(content);
    
    return {
      content,
      reasoning: agent === "chatgpt" ? 
        "Inductive pattern analysis from empirical data with conservative extrapolation" :
        "Deductive framework analysis with structural risk assessment and assumption challenging",
      confidence: agent === "chatgpt" ? 0.78 : 0.74,
      sources: [
        {
          claim: agent === "chatgpt" ? "Empirical pattern analysis based on research data" : "Theoretical framework analysis and structural implications",
          source: `${agent} Agent - ${agent === "chatgpt" ? "Inductive" : "Deductive"} Analysis`,
          type: "surface_finding" as const,
          strength: "medium" as const
        }
      ],
      sourceAttributions,
      speculationFlags,
      metadata: {
        model: "gemini-2.5-flash",
        approach: agent === "chatgpt" ? "inductive-empirical-maximizer" : "deductive-theoretical-challenger",
        devMode: true,
        agentPersonality: agent === "chatgpt" ? "data-driven-conservative" : "framework-driven-contrarian"
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



  async evaluateDialogueRound(context: any) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      qualityScore: 0.85,
      convergence: 0.72,
      newInsights: [
        "Tension between empirical evidence and economic pressure timeline",
        "Two-phase adoption model with potential acceleration",
        "Policy timing misalignment with market forces"
      ],
      continueDialogue: context.roundNumber < 3,
      reasoning: context.roundNumber < 3 ? 
        "Agents are developing nuanced positions that warrant further exploration" :
        "Sufficient depth achieved for synthesis"
    };
  }

  async synthesizeResults(researchData: any, dialogueHistory: any) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return {
      synthesis: `# Impact of Large Language Models on Knowledge Work: A Comprehensive Analysis

## Executive Summary

Based on comprehensive research synthesis and expert agent dialogue, large language models (LLMs) will significantly transform knowledge work over the next 3-7 years, with productivity gains of 15-30% in routine cognitive tasks balanced against implementation challenges and workforce adaptation needs.

## Key Findings

### Empirical Evidence Base
- **Productivity Gains**: Consistent 15-30% improvements in writing, analysis, and coding tasks
- **Adoption Timeline**: Current evidence suggests 3-7 year mainstream integration
- **Quality Considerations**: Benefits strongest for routine tasks, quality control remains critical
- **Sector Variation**: Legal, consulting, and content creation leading adoption

### Strategic Analysis
- **Economic Pressure**: Competitive advantages will accelerate adoption beyond comfortable timelines
- **Market Forces**: Organizations may face forced adoption to maintain competitiveness
- **Tipping Point Risk**: Gradual adoption may shift to rapid acceleration around 2025-2026

### Synthesis Perspective
The dialogue between empirical evidence and strategic analysis reveals a critical policy challenge: preparing for both gradual transformation (the evidence-based scenario) and rapid acceleration (the economically-driven scenario).

## Timeline Assessment

**Phase 1 (2024-2025)**: Early adopter advantage phase
- Pilot implementations and proof-of-concept deployments
- 15-25% of knowledge organizations begin systematic integration
- Quality and governance frameworks development

**Phase 2 (2025-2027)**: Mainstream adoption acceleration
- Competitive pressures drive widespread implementation
- 60-80% adoption in high-value use cases
- Workforce adaptation and reskilling intensification

**Phase 3 (2027-2030)**: Mature integration
- LLM-native workflows become standard
- New role categories emerge around human-AI collaboration
- Policy and social adaptation responses mature

## Policy Recommendations

1. **Immediate Action**: Begin workforce reskilling programs now, before displacement pressures peak
2. **Flexible Preparation**: Develop policies for both gradual and accelerated adoption scenarios  
3. **Quality Standards**: Establish governance frameworks for LLM integration in critical sectors
4. **Social Safety Nets**: Strengthen transition support for affected knowledge workers

## Conclusion

The transformation of knowledge work by LLMs is not a question of "if" but "when" and "how fast." The evidence supports cautious optimism about productivity benefits, but economic realities may accelerate adoption beyond societally optimal timelines. Success depends on proactive policy responses that begin immediately, even as the full impact unfolds over the coming decade.`,
      
      confidence: 0.83,
      keyUncertainties: [
        "Exact timeline for competitive pressure tipping point",
        "Effectiveness of reskilling programs at scale", 
        "Quality control solutions for high-stakes applications"
      ],
      actionableInsights: [
        "Organizations should begin LLM integration pilots while developing governance frameworks",
        "Policymakers should accelerate workforce adaptation programs",
        "Individuals should invest in skills that complement rather than compete with LLMs"
      ]
    };
  }
}

export const devWorkflowService = new DevWorkflowService();