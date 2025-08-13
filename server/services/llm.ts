import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import Anthropic from '@anthropic-ai/sdk';
import { configService } from "./config";
import { geminiRateLimiter, truncateLog } from "./rate-limiter";

export interface LLMResponse {
  response: string;
  processingTime: number;
  confidence?: number;
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

export class FlashLLMService {
  private openai?: OpenAI;
  private gemini?: GoogleGenAI;
  private anthropic?: Anthropic;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  private async callGeminiFlash(prompt: string): Promise<any> {
    if (!this.gemini) throw new Error("Gemini not configured");
    
    return await geminiRateLimiter.executeWithQuotaHandling('gemini', async () => {
      console.log(`🤖 Calling Gemini Flash 2.5 API... (${geminiRateLimiter.getCurrentCallCount('gemini')}/7 calls in last minute)`);
      const response = await this.gemini!.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      console.log("✅ Gemini Flash 2.5 responded successfully");
      
      const textResponse = response.text;
      
      if (!textResponse) {
        throw new Error("No text response from Gemini");
      }
      
      // Try to parse as JSON
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
          console.warn("Could not find JSON content in Gemini response");
          return { error: "No JSON found", raw_response: textResponse };
        }
      } catch (e) {
        console.warn("Could not parse Gemini response as JSON:", e);
        return { error: "JSON parse error", raw_response: textResponse };
      }
    });
  }

  async clarifyIntent(query: string): Promise<ClarificationResponse> {
    const startTime = Date.now();

    // Use real mode if we have any LLM configured
    if (configService.isRealMode() && (this.anthropic || this.gemini || this.openai)) {
      return await this.realClarifyIntent(query);
    } else {
      return await this.devClarifyIntent(query);
    }
  }

  private async realClarifyIntent(query: string): Promise<ClarificationResponse> {
    // Try to use available LLM providers in order of preference
    if (this.anthropic) {
      return await this.realClarifyIntentWithAnthropic(query);
    } else if (this.gemini) {
      return await this.realClarifyIntentWithGemini(query);
    } else if (this.openai) {
      return await this.realClarifyIntentWithOpenAI(query);
    } else {
      throw new Error("No LLM provider configured");
    }
  }
  
  private async realClarifyIntentWithGemini(query: string): Promise<ClarificationResponse> {
    const prompt = `You are an expert research analyst specializing in generating precise clarifying questions. Your primary goal is to identify ambiguities in user queries and generate high-quality clarifying questions.

Raw User Question: "${query}"

PROCESS:
1. Extract explicit requirements and constraints from the query
2. Identify answer format needed (affects subsequent research resource allocation)  
3. **FOCUS: Generate clarifying questions for ambiguities** - This is the most critical part
4. Assess problem complexity level

CLARIFYING QUESTIONS GENERATION (PRIMARY FOCUS):
- Identify each ambiguous aspect in the user's query
- Generate specific, actionable clarifying questions
- For each question, provide:
  * Multiple choice options when appropriate (3-5 well-thought options)
  * Allow open text when the question requires nuanced input
- Focus on ambiguities that would significantly impact research direction
- Prioritize questions that clarify scope, timeframe, methodology preferences, and success criteria

IMPORTANT FORMATTING RULES:
- Each clarifying question MUST have either "options" (array) or "open_text": true
- DO NOT use both in the same question - choose the most appropriate format
- For options, provide exactly 3-5 clear, distinct choices

Respond with a JSON object with this exact structure:
{
  "query": "original query",
  "clarifiedIntent": "refined research question",
  "answerFormat": "one of: comprehensive_report, comparison_analysis, fact_check, recommendation_list, trend_analysis, specific_answer",
  "clarifyingQuestions": [
    {
      "question": "specific question text",
      "context": "why this matters for research",
      "options": ["option1", "option2", "option3"] OR "open_text": true
    }
  ],
  "complexityLevel": "one of: simple, moderate, complex"
}`;

    const response = await this.callGeminiFlash(prompt);
    
    // Gemini returns parsed JSON already from callGeminiFlash
    return response;
  }
  
  private async realClarifyIntentWithOpenAI(query: string): Promise<ClarificationResponse> {
    if (!this.openai) throw new Error("OpenAI not configured");
    
    const prompt = `You are an expert research analyst specializing in generating precise clarifying questions. Your primary goal is to identify ambiguities in user queries and generate high-quality clarifying questions.

Raw User Question: "${query}"

PROCESS:
1. Extract explicit requirements and constraints from the query
2. Identify answer format needed (affects subsequent research resource allocation)  
3. **FOCUS: Generate clarifying questions for ambiguities** - This is the most critical part
4. Assess problem complexity level

CLARIFYING QUESTIONS GENERATION (PRIMARY FOCUS):
- Identify each ambiguous aspect in the user's query
- Generate specific, actionable clarifying questions
- For each question, provide:
  * Multiple choice options when appropriate (3-5 well-thought options)
  * Allow open text when the question requires nuanced input
- Focus on ambiguities that would significantly impact research direction
- Prioritize questions that clarify scope, timeframe, methodology preferences, and success criteria

IMPORTANT FORMATTING RULES:
- Each clarifying question MUST have either "options" (array) or "open_text": true
- DO NOT use both in the same question - choose the most appropriate format
- For options, provide exactly 3-5 clear, distinct choices

Respond with a JSON object with this exact structure:
{
  "query": "original query",
  "clarifiedIntent": "refined research question",
  "answerFormat": "one of: comprehensive_report, comparison_analysis, fact_check, recommendation_list, trend_analysis, specific_answer",
  "clarifyingQuestions": [
    {
      "question": "specific question text",
      "context": "why this matters for research",
      "options": ["option1", "option2", "option3"] OR "open_text": true
    }
  ],
  "complexityLevel": "one of: simple, moderate, complex"
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    if (!content) throw new Error("No response from OpenAI");
    
    return JSON.parse(content);
  }

  private async realClarifyIntentWithAnthropic(query: string): Promise<ClarificationResponse> {
    if (!this.anthropic) throw new Error("Anthropic not configured");

    const prompt = `You are an expert research analyst specializing in generating precise clarifying questions. Your primary goal is to identify ambiguities in user queries and generate high-quality clarifying questions.

Raw User Question: "${query}"

PROCESS:
1. Extract explicit requirements and constraints from the query
2. Identify answer format needed (affects subsequent research resource allocation)  
3. **FOCUS: Generate clarifying questions for ambiguities** - This is the most critical part
4. Assess problem complexity level

CLARIFYING QUESTIONS GENERATION (PRIMARY FOCUS):
- Identify each ambiguous aspect in the user's query
- Generate specific, actionable clarifying questions
- For each question, provide:
  * Multiple choice options when appropriate (3-5 well-thought options)
  * Allow open text when the question requires nuanced input
- Focus on ambiguities that would significantly impact research direction
- Prioritize questions that clarify scope, timeframe, methodology preferences, and success criteria

ANSWER FORMAT TYPES (select the most appropriate):
- **Prediction with confidence intervals**: Forecasting future outcomes with uncertainty bounds
- **Ranked options**: Evaluating and ordering alternative choices or scenarios  
- **Decision framework**: Providing structured approach for strategic decisions
- **Causal analysis**: Understanding cause-and-effect relationships and mechanisms

COMPLEXITY ASSESSMENT:
- **Low**: Well-defined problems with clear parameters
- **Medium**: Multi-faceted issues requiring moderate research depth
- **High**: Complex, ambiguous problems with high uncertainty (market predictions, unsolved scientific questions, strategic decisions)

Respond in JSON format with emphasis on generating meaningful clarifying questions:
{
  "requirements": ["explicit requirement from query", "another requirement", ...],
  "constraints": ["stated constraint", "implied constraint", ...],
  "questions": [
    {
      "id": "timeframe_scope",
      "text": "What timeframe should this analysis focus on?",
      "options": ["Short-term (1-2 years)", "Medium-term (3-5 years)", "Long-term (5+ years)", "All timeframes with comparison"],
      "allowOpenText": true
    },
    {
      "id": "methodology_preference", 
      "text": "What type of evidence should be prioritized?",
      "options": ["Quantitative data and studies", "Qualitative analysis and case studies", "Mixed methods approach", "Theoretical frameworks"],
      "allowOpenText": true
    }
  ],
  "answerFormat": {
    "type": "prediction|ranked_options|decision_framework|causal_analysis",
    "description": "specific format requirements for the final answer",
    "confidenceRequired": true/false,
    "uncertaintyBounds": true/false
  },
  "complexity": "low|medium|high",
  "resourceAllocation": "estimated research intensity and agent configuration needed"
}`;

    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const result = JSON.parse(content.text);
      return result;
    } else {
      throw new Error("Unexpected content type from Anthropic");
    }
  }

  private async devClarifyIntent(query: string): Promise<ClarificationResponse> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");

    console.log("🔍 DEV MODE: Using Gemini Flash 2.5 for intent clarification");

    const prompt = `You are an expert research analyst specializing in generating precise clarifying questions. Your primary goal is to identify ambiguities in user queries and generate high-quality clarifying questions.

Raw User Question: "${query}"

PROCESS:
1. Extract explicit requirements and constraints from the query
2. Identify answer format needed (affects subsequent research resource allocation)  
3. **FOCUS: Generate clarifying questions for ambiguities** - This is the most critical part
4. Assess problem complexity level

CLARIFYING QUESTIONS GENERATION (PRIMARY FOCUS):
- Identify each ambiguous aspect in the user's query
- Generate specific, actionable clarifying questions
- For each question, provide:
  * Multiple choice options when appropriate (3-5 well-thought options)
  * Allow open text when the question requires nuanced input
- Focus on ambiguities that would significantly impact research direction
- Prioritize questions that clarify scope, timeframe, methodology preferences, and success criteria

ANSWER FORMAT TYPES (select the most appropriate):
- **Prediction with confidence intervals**: Forecasting future outcomes with uncertainty bounds
- **Ranked options**: Evaluating and ordering alternative choices or scenarios  
- **Decision framework**: Providing structured approach for strategic decisions
- **Causal analysis**: Understanding cause-and-effect relationships and mechanisms

COMPLEXITY ASSESSMENT:
- **Low**: Well-defined problems with clear parameters
- **Medium**: Multi-faceted issues requiring moderate research depth
- **High**: Complex, ambiguous problems with high uncertainty (market predictions, unsolved scientific questions, strategic decisions)

Respond in JSON format with emphasis on generating meaningful clarifying questions:
{
  "requirements": ["explicit requirement from query", "another requirement", ...],
  "constraints": ["stated constraint", "implied constraint", ...],
  "questions": [
    {
      "id": "timeframe_scope",
      "text": "What timeframe should this analysis focus on?",
      "options": ["Short-term (1-2 years)", "Medium-term (3-5 years)", "Long-term (5+ years)", "All timeframes with comparison"],
      "allowOpenText": true
    },
    {
      "id": "methodology_preference", 
      "text": "What type of evidence should be prioritized?",
      "options": ["Quantitative data and studies", "Qualitative analysis and case studies", "Mixed methods approach", "Theoretical frameworks"],
      "allowOpenText": true
    }
  ],
  "answerFormat": {
    "type": "prediction|ranked_options|decision_framework|causal_analysis",
    "description": "specific format requirements for the final answer",
    "confidenceRequired": true/false,
    "uncertaintyBounds": true/false
  },
  "complexity": "low|medium|high",
  "resourceAllocation": "estimated research intensity and agent configuration needed"
}`;

    return await this.callGeminiFlash(prompt);
  }

  async generateSearchTerms(clarifiedIntent: any): Promise<{
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
    sourceRankings: string[];
    evidenceThresholds: {
      minimumRelevanceScore: number;
      qualityThresholds: {
        high: number;
        medium: number;
        low: number;
      };
    };
  }> {
    if (configService.isRealMode() && this.openai) {
      return await this.realGenerateSearchTerms(clarifiedIntent);
    } else {
      return await this.devGenerateSearchTerms(clarifiedIntent);
    }
  }

  private async realGenerateSearchTerms(clarifiedIntent: any): Promise<{
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
    sourceRankings: string[];
    evidenceThresholds: {
      minimumRelevanceScore: number;
      qualityThresholds: {
        high: number;
        medium: number;
        low: number;
      };
    };
  }> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const prompt = `
You are a research planning expert following Multi-Agent Research System specifications. Based on the clarified research intent, generate a comprehensive search strategy:

Intent: ${JSON.stringify(clarifiedIntent)}

Generate:
1. Surface-level search terms (for Google, arXiv) - focus on empirical studies, quantitative data
2. Social media search terms (for Reddit, Twitter/X) - capture real-world experiences and expert discussions
3. Domain-specific sources identification (relevant subreddits, expert Twitter accounts, specialized databases)
4. Detailed relevance scoring rubric (specific to this question type and answer format)
5. Source priority rankings (peer-reviewed > primary sources > expert analysis > aggregated content)
6. Evidence quality thresholds for filtering

DOMAIN-SPECIFIC SOURCE IDENTIFICATION:
- Relevant subreddits for the research domain
- Expert Twitter/X accounts in the field
- Specialized academic databases
- Industry-specific forums and communities
- Professional association resources

Requirements:
- Search terms should maximize recall over precision at this stage
- Domain sources must be specific to the research question context
- Relevance rubric must align with problem complexity and answer format needed
- Thresholds should ensure high-quality evidence while maintaining comprehensive coverage

Respond in JSON format:
{
  "surfaceTerms": ["term1", "term2", ...],
  "socialTerms": ["term1", "term2", ...],
  "domainSpecificSources": {
    "relevantSubreddits": ["r/subreddit1", "r/subreddit2", ...],
    "expertTwitterAccounts": ["@expert1", "@expert2", ...],
    "specializedDatabases": ["database1", "database2", ...],
    "professionalForums": ["forum1", "forum2", ...],
    "industryResources": ["resource1", "resource2", ...]
  },
  "relevanceRubric": "detailed scoring criteria (0-100) specific to question type with examples",
  "sourceRankings": ["source1", "source2", ...],
  "evidenceThresholds": {
    "minimumRelevanceScore": 65,
    "qualityThresholds": {
      "high": 85,
      "medium": 70,
      "low": 55
    }
  }
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  }

  private async devGenerateSearchTerms(clarifiedIntent: any): Promise<{
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
    sourceRankings: string[];
    evidenceThresholds: {
      minimumRelevanceScore: number;
      qualityThresholds: {
        high: number;
        medium: number;
        low: number;
      };
    };
  }> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");

    const prompt = `
You are a research planning expert following Multi-Agent Research System specifications. Based on the clarified research intent, generate a comprehensive search strategy:

Intent: ${JSON.stringify(clarifiedIntent)}

Generate:
1. Surface-level search terms (for Google, arXiv) - focus on empirical studies, quantitative data
2. Social media search terms (for Reddit, Twitter/X) - capture real-world experiences and expert discussions
3. Domain-specific sources identification (relevant subreddits, expert Twitter accounts, specialized databases)
4. Detailed relevance scoring rubric (specific to this question type and answer format)
5. Source priority rankings (peer-reviewed > primary sources > expert analysis > aggregated content)
6. Evidence quality thresholds for filtering

DOMAIN-SPECIFIC SOURCE IDENTIFICATION:
- Relevant subreddits for the research domain
- Expert Twitter/X accounts in the field
- Specialized academic databases
- Industry-specific forums and communities
- Professional association resources

Requirements:
- Search terms should maximize recall over precision at this stage
- Domain sources must be specific to the research question context
- Relevance rubric must align with answer format requirements
- Evidence thresholds should filter low-quality content while preserving valuable insights

Respond in JSON format:
{
  "surfaceTerms": ["term1", "term2", ...],
  "socialTerms": ["social_term1", "social_term2", ...],
  "domainSpecificSources": {
    "relevantSubreddits": ["r/subreddit1", "r/subreddit2", ...],
    "expertTwitterAccounts": ["@expert1", "@expert2", ...],
    "specializedDatabases": ["database1", "database2", ...],
    "professionalForums": ["forum1", "forum2", ...],
    "industryResources": ["resource1", "resource2", ...]
  },
  "relevanceRubric": "detailed scoring rubric with specific criteria and point values",
  "sourceRankings": ["highest priority source type", "medium priority", "lowest priority"],
  "evidenceThresholds": {
    "minimumRelevanceScore": 65,
    "qualityThresholds": {
      "high": 85,
      "medium": 70,
      "low": 55
    }
  }
}`;

    return await this.callGeminiFlash(prompt);
  }

  async extractFacts(searchResults: any[], relevanceRubric: string): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      qualityScore: number;
      isContradictory: boolean;
      evidenceType: 'empirical' | 'theoretical' | 'anecdotal' | 'opinion';
      metadata: any;
    }>;
    totalClaims: number;
    processingNotes: string;
  }> {
    if (configService.isRealMode() && this.openai) {
      return await this.realExtractFacts(searchResults, relevanceRubric);
    } else {
      return await this.devExtractFacts(searchResults, relevanceRubric);
    }
  }

  async extractFactsFromWebResults(webResults: any[], relevanceRubric: string): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      qualityScore: number;
      isContradictory: boolean;
      evidenceType: 'empirical' | 'theoretical' | 'anecdotal' | 'opinion';
      metadata: any;
    }>;
    totalClaims: number;
    processingNotes: string;
  }> {
    console.log("🔍 Extracting facts from web search results using separate Gemini call...");
    return await this.devExtractFactsFromSpecificSource(webResults, relevanceRubric, "web");
  }

  async extractFactsFromRedditResults(redditResults: any[], relevanceRubric: string): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      qualityScore: number;
      isContradictory: boolean;
      evidenceType: 'empirical' | 'theoretical' | 'anecdotal' | 'opinion';
      metadata: any;
    }>;
    totalClaims: number;
    processingNotes: string;
  }> {
    console.log("🔍 Extracting facts from Reddit results using separate Gemini call...");
    return await this.devExtractFactsFromSpecificSource(redditResults, relevanceRubric, "reddit");
  }

  async extractFactsFromArxivResults(arxivResults: any[], relevanceRubric: string): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      qualityScore: number;
      isContradictory: boolean;
      evidenceType: 'empirical' | 'theoretical' | 'anecdotal' | 'opinion';
      metadata: any;
    }>;
    totalClaims: number;
    processingNotes: string;
  }> {
    console.log("🔍 Extracting facts from arXiv results using separate Gemini call...");
    return await this.devExtractFactsFromSpecificSource(arxivResults, relevanceRubric, "arxiv");
  }

  private async realExtractFacts(searchResults: any[], relevanceRubric: string): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      qualityScore: number;
      isContradictory: boolean;
      evidenceType: 'empirical' | 'theoretical' | 'anecdotal' | 'opinion';
      metadata: any;
    }>;
    totalClaims: number;
    processingNotes: string;
  }> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const prompt = `
You are a fact extraction expert. Extract unique claims from search results with rigorous scoring.

RELEVANCE RUBRIC: ${relevanceRubric}

INSTRUCTIONS:
1. Extract ALL potentially relevant claims (prioritize recall over precision)
2. Apply the rubric exactly as specified to score each claim
3. Identify evidence type (empirical data, theoretical framework, anecdotal experience, opinion)
4. Flag contradictory claims between sources
5. Include source attribution for every claim
6. Do NOT disregard any potentially relevant claim at this stage

Search Results: ${JSON.stringify(searchResults.slice(0, 10))}

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

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2000,
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  }

  private async devExtractFacts(searchResults: any[], relevanceRubric: string): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      qualityScore: number;
      isContradictory: boolean;
      evidenceType: 'empirical' | 'theoretical' | 'anecdotal' | 'opinion';
      metadata: any;
    }>;
    totalClaims: number;
    processingNotes: string;
  }> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");

    const prompt = `
You are a fact extraction expert. Extract unique claims from search results with rigorous scoring.

RELEVANCE RUBRIC: ${relevanceRubric}

INSTRUCTIONS:
1. Extract ALL potentially relevant claims (prioritize recall over precision)
2. Apply the rubric exactly as specified to score each claim
3. Identify evidence type (empirical data, theoretical framework, anecdotal experience, opinion)
4. Flag contradictory claims between sources
5. Include source attribution for every claim
6. Do NOT disregard any potentially relevant claim at this stage

Search Results: ${JSON.stringify(searchResults.slice(0, 10))}

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

    return await this.callGeminiFlash(prompt);
  }

  private async devExtractFactsFromSpecificSource(searchResults: any[], relevanceRubric: string, sourceType: string): Promise<{
    claims: Array<{
      id: string;
      text: string;
      source: string;
      relevanceScore: number;
      qualityScore: number;
      isContradictory: boolean;
      evidenceType: 'empirical' | 'theoretical' | 'anecdotal' | 'opinion';
      metadata: any;
    }>;
    totalClaims: number;
    processingNotes: string;
  }> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");

    const prompt = `
You are a fact extraction expert specializing in ${sourceType.toUpperCase()} sources. Extract unique claims with rigorous scoring.

RELEVANCE RUBRIC: ${relevanceRubric}

SOURCE TYPE: ${sourceType.toUpperCase()}
${sourceType === 'web' ? 'Focus on: Published articles, news reports, official statements, research summaries' : ''}
${sourceType === 'reddit' ? 'Focus on: User experiences, community insights, practical applications, real-world examples' : ''}
${sourceType === 'arxiv' ? 'Focus on: Academic findings, research methodologies, theoretical frameworks, empirical data' : ''}

INSTRUCTIONS:
1. Extract ALL potentially relevant claims from ${sourceType} sources (prioritize recall over precision)
2. Apply the rubric exactly as specified to score each claim
3. Identify evidence type appropriate for ${sourceType} sources
4. Flag contradictory claims between ${sourceType} sources
5. Include source attribution for every claim
6. Consider ${sourceType}-specific credibility factors

${sourceType.charAt(0).toUpperCase() + sourceType.slice(1)} Search Results: ${JSON.stringify(searchResults.slice(0, 15))}

Respond in JSON format:
{
  "claims": [
    {
      "id": "claim-${sourceType}-1",
      "text": "specific factual claim with context",
      "source": "exact source name/URL",
      "relevanceScore": 85,
      "qualityScore": 90,
      "isContradictory": false,
      "evidenceType": "${sourceType === 'arxiv' ? 'empirical' : sourceType === 'reddit' ? 'anecdotal' : 'theoretical'}",
      "metadata": {
        "sourceType": "${sourceType}",
        "methodology": "description if available",
        "sampleSize": "if applicable", 
        "datePublished": "if available",
        "conflictsWith": ["claim-id if contradictory"]
      }
    }
  ],
  "totalClaims": 0,
  "processingNotes": "Summary of ${sourceType} extraction process and patterns"
}`;

    return await this.callGeminiFlash(prompt);
  }

  async generateSurfaceResearchReport(
    factExtraction: any, 
    searchResults: any, 
    userContext: any
  ): Promise<{
    report: string;
    keyFindings: string[];
    sourceAttribution: any[];
    confidenceAssessment: string;
    recommendationsForDeepResearch: string[];
  }> {
    if (configService.isRealMode() && this.openai) {
      return await this.realGenerateSurfaceReport(factExtraction, searchResults, userContext);
    } else {
      return await this.devGenerateSurfaceReport(factExtraction, searchResults, userContext);
    }
  }

  private async realGenerateSurfaceReport(
    factExtraction: any, 
    searchResults: any, 
    userContext: any
  ): Promise<{
    report: string;
    keyFindings: string[];
    sourceAttribution: any[];
    confidenceAssessment: string;
    recommendationsForDeepResearch: string[];
  }> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const prompt = `
You are generating a formal Surface Research Report following the Multi-Agent Research System specifications.

INPUTS:
- Fact Extraction: ${JSON.stringify(factExtraction)}
- Search Results: ${JSON.stringify(searchResults)}
- User Context: ${JSON.stringify(userContext)}

GENERATE A COMPREHENSIVE SURFACE RESEARCH REPORT with:

1. EXECUTIVE SUMMARY: Overview of surface-level and social research findings
2. KEY FINDINGS: Numbered list of most important discoveries
3. SOURCE BREAKDOWN: Analysis by source type (Google, arXiv, Reddit)
4. EVIDENCE QUALITY: Assessment of data strength and reliability
5. CONTRADICTIONS IDENTIFIED: Specific conflicts between sources
6. CONFIDENCE ASSESSMENT: Overall reliability of surface research
7. RECOMMENDATIONS FOR DEEP RESEARCH: Specific areas needing investigation

REQUIREMENTS:
- Every claim must have source attribution
- Highlight contradictions with specific evidence
- Assess confidence levels for each major finding
- Identify gaps that need deep research investigation
- Maintain academic rigor while being accessible

Respond in JSON format:
{
  "report": "comprehensive markdown-formatted report",
  "keyFindings": ["finding 1", "finding 2", ...],
  "sourceAttribution": [
    {
      "claim": "specific claim",
      "sources": ["source1", "source2"],
      "strength": "high|medium|low"
    }
  ],
  "confidenceAssessment": "overall assessment of research reliability",
  "recommendationsForDeepResearch": ["specific area 1", "specific area 2", ...]
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2500,
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  }

  private async mockGenerateSurfaceReport(
    factExtraction: any, 
    searchResults: any, 
    userContext: any
  ): Promise<{
    report: string;
    keyFindings: string[];
    sourceAttribution: any[];
    confidenceAssessment: string;
    recommendationsForDeepResearch: string[];
  }> {
    await this.delay(1500);
    
    return {
      report: `# Surface Research Report: LLM Impact on Knowledge Work

## Executive Summary

Surface-level research across Google, arXiv, and Reddit sources reveals consistent patterns of productivity improvement in routine cognitive tasks, with significant variation in predictions about timeline and employment impact. 

## Key Findings

### Productivity Evidence
- **MIT Study Results**: 14% productivity increase demonstrated across 2,000 knowledge workers
- **Microsoft Data**: 70% of Copilot users report productivity improvements
- **Task Specificity**: Gains concentrated in writing, coding, and analysis tasks

### Adoption Patterns  
- **Legal Sector**: 40% early adoption rate with focus on augmentation
- **Timeline Variation**: Industry surveys suggest 3-7 year mainstream adoption
- **Quality Concerns**: Implementation challenges around accuracy and oversight

### Economic Predictions
- **Goldman Sachs Model**: Estimates 300M jobs globally affected by automation
- **Contradictory Evidence**: Industry adoption patterns suggest augmentation over replacement
- **Sector Variation**: Different impacts across knowledge work domains

## Source Quality Assessment

### Academic Sources (arXiv)
- **Strength**: Peer-reviewed methodology, controlled studies
- **Limitation**: Limited long-term data, small sample sizes
- **Confidence**: High for productivity claims, medium for timeline predictions

### Industry Reports (Google)
- **Strength**: Large-scale implementation data, real-world results
- **Limitation**: Potential early adopter bias, commercial interests
- **Confidence**: Medium to high for current trends, lower for predictions

### Social Evidence (Reddit)
- **Strength**: Unfiltered user experiences, implementation challenges
- **Limitation**: Anecdotal evidence, selection bias
- **Confidence**: Low for quantitative claims, medium for qualitative insights

## Critical Contradictions

1. **Displacement vs Augmentation**: Economic models predict job displacement while empirical adoption shows augmentation focus
2. **Timeline Predictions**: Academic studies suggest gradual adoption while competitive pressures may accelerate implementation
3. **Quality vs Productivity**: Productivity gains reported alongside concerns about output quality and over-reliance

## Knowledge Gaps Identified

- Limited longitudinal studies on skill development impacts
- Insufficient sector-specific timeline analysis
- Missing policy intervention effectiveness research
- Lack of quality control framework evaluation`,

      keyFindings: [
        "14% productivity increase in knowledge work tasks (MIT study)",
        "70% of Microsoft Copilot users report productivity improvements", 
        "Legal sector shows 40% adoption rate with augmentation focus",
        "Contradiction between displacement predictions and augmentation adoption",
        "Quality control challenges in implementation"
      ],
      
      sourceAttribution: [
        {
          claim: "14% productivity increase in knowledge work tasks",
          sources: ["MIT Technology Review", "Randomized controlled trial"],
          strength: "high"
        },
        {
          claim: "300 million jobs globally could be automated",
          sources: ["Goldman Sachs Research", "Economic modeling"],
          strength: "medium"
        },
        {
          claim: "Legal sector 40% adoption rate",
          sources: ["American Bar Association Survey", "Industry survey"],
          strength: "medium"
        }
      ],
      
      confidenceAssessment: "High confidence in productivity improvement claims supported by controlled studies. Medium confidence in adoption timeline predictions due to conflicting evidence. Low confidence in long-term displacement predictions due to limited empirical validation.",
      
      recommendationsForDeepResearch: [
        "Investigate contradictory claims about job displacement vs augmentation patterns",
        "Analyze policy frameworks for managing LLM adoption in knowledge sectors", 
        "Examine quality control solutions for high-stakes knowledge work applications",
        "Research skill complementarity patterns in early adopter organizations"
      ]
    };
  }

  private async devGenerateSurfaceReport(
    factExtraction: any, 
    searchResults: any, 
    userContext: any
  ): Promise<{
    report: string;
    keyFindings: string[];
    sourceAttribution: any[];
    confidenceAssessment: string;
    recommendationsForDeepResearch: string[];
  }> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");

    const prompt = `
You are a research analyst creating a comprehensive surface research report.

Fact Extraction: ${JSON.stringify(factExtraction)}
Search Results: ${JSON.stringify(searchResults)}
User Context: ${JSON.stringify(userContext)}

Generate a comprehensive surface research report in JSON format:
{
  "report": "comprehensive analysis of surface findings",
  "keyFindings": ["finding1", "finding2", ...],
  "sourceAttribution": [
    {
      "finding": "specific finding",
      "sources": ["source1", "source2"],
      "strength": "high|medium|low"
    }
  ],
  "confidenceAssessment": "assessment of confidence levels",
  "recommendationsForDeepResearch": ["recommendation1", "recommendation2", ...]
}`;

    return await this.callGeminiFlash(prompt);
  }

  async generateDeepResearchQuery(analysis: any): Promise<string> {
    if (configService.isRealMode() && this.openai) {
      return await this.realGenerateDeepQuery(analysis);
    } else {
      return await this.devGenerateDeepQuery(analysis);
    }
  }

  async generateDeepResearchReport(deepResult: any): Promise<{
    report: string;
    keyFindings: string[];
    sourceAttribution: any[];
    confidenceAssessment: string;
  }> {
    if (configService.isRealMode() && this.openai) {
      if (!this.openai) throw new Error("OpenAI not configured");
      const prompt = `You are generating a Deep Research Report from Perplexity Sonar results following the system specification.\n\nINPUT: ${JSON.stringify(deepResult)}\n\nProduce JSON with: report (markdown), keyFindings (array), sourceAttribution (array of {claim, sources, strength}), confidenceAssessment (string).`;
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
      return JSON.parse(response.choices[0].message.content || "{}");
    }
    // mock
    return {
      report: "# Deep Research Report\n\nConsolidated insights from Perplexity Sonar focusing on contradictions, edge cases, and knowledge gaps.",
      keyFindings: [
        "Contradictions around displacement vs augmentation refined with additional sources",
        "Edge cases identified for rapid adoption under competitive pressure",
      ],
      sourceAttribution: [
        { claim: "Adoption acceleration risk", sources: ["Deep: Technology adoption curve analysis"], strength: "medium" },
      ],
      confidenceAssessment: "Medium-high confidence in corroborated areas; remaining uncertainty on long-term wage effects"
    };
  }
  private async realGenerateDeepQuery(analysis: any): Promise<string> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const prompt = `
You are generating a targeted Deep Research Query for Perplexity Sonar following Multi-Agent Research System specifications.

SURFACE RESEARCH ANALYSIS: ${JSON.stringify(analysis)}

CRAFT A TARGETED QUESTION THAT SYSTEMATICALLY ADDRESSES ALL FOUR REQUIRED AREAS:

1. **CORROBORATION NEEDS**: Which high-impact claims require additional validation?
   - Identify claims with significant implications but limited source diversity
   - Focus on productivity metrics, timeline predictions, economic impacts

2. **CONTRADICTORY FINDINGS RESOLUTION**: What conflicts between sources need clarification?
   - Address disagreements between academic studies vs industry reports
   - Resolve conflicts between displacement vs augmentation predictions
   - Clarify methodology differences causing contradictory results

3. **EDGE CASE TESTING**: What boundary conditions and outlier scenarios need investigation?
   - Rapid adoption acceleration scenarios
   - Quality control failure modes in critical applications
   - Sector-specific vulnerability variations
   - Policy intervention effectiveness edge cases

4. **KNOWLEDGE GAP FILLING**: What critical unknowns affect conclusion confidence?
   - Long-term longitudinal data gaps
   - Cross-sector comparative studies missing
   - Policy framework effectiveness research gaps
   - Skills complementarity vs substitution patterns

QUERY CONSTRUCTION REQUIREMENTS:
- Single, coherent question that enables comprehensive investigation
- Specific enough for targeted research but broad enough to address multiple areas
- Actionable for Perplexity Sonar's research capabilities
- Designed to fill the most critical gaps affecting answer quality

Generate ONE focused deep research question that strategically addresses these areas:`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    return response.choices[0].message.content || "";
  }

  private async devGenerateDeepQuery(analysis: any): Promise<string> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");

    const prompt = `
You are a deep research expert. Based on the analysis provided, generate a focused research query for additional investigation.

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

Return only the research query text, no formatting or additional commentary.`;

    const result = await this.callGeminiFlash(prompt);
    return result?.query || result?.raw_response || "Generated deep research query based on analysis findings";
  }

  async checkAlignment(
    conversationHistory: any[], 
    userIntent: any, 
    currentRound: number
  ): Promise<{
    isAligned: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    driftAreas: string[];
    checkpointQuestion?: string;
    recommendAction: 'proceed' | 'clarify' | 'realign';
  }> {
    if (configService.isRealMode() && this.openai) {
      return await this.realCheckAlignment(conversationHistory, userIntent, currentRound);
    } else {
      return await this.mockCheckAlignment(conversationHistory, userIntent, currentRound);
    }
  }

  private async realCheckAlignment(
    conversationHistory: any[], 
    userIntent: any, 
    currentRound: number
  ): Promise<{
    isAligned: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    driftAreas: string[];
    checkpointQuestion?: string;
    recommendAction: 'proceed' | 'clarify' | 'realign';
  }> {
    if (!this.openai) throw new Error("OpenAI not configured");

    const prompt = `
You are an alignment checker for a multi-agent research system. Assess whether the conversation is staying aligned with user intent.

USER INTENT: ${JSON.stringify(userIntent)}
CONVERSATION HISTORY: ${JSON.stringify(conversationHistory)}
CURRENT ROUND: ${currentRound}

ASSESSMENT CRITERIA:
1. Are agents addressing the original research question?
2. Is the conversation maintaining focus on the specified scope?
3. Are agents exploring relevant uncertainty dimensions?
4. Is the discussion generating insights useful for the user's needs?
5. Are agents staying within evidence bounds or making unsubstantiated leaps?

DRIFT RISK FACTORS:
- Conversation wandering into tangential topics
- Agents arguing about methodology rather than addressing the question
- Discussion becoming too abstract without practical relevance
- Focus shifting away from user's specified requirements

WHEN CREATING A CHECKPOINT QUESTION:
- Include the FULL original research question for context
- Summarize the key findings/insights discovered so far
- Clearly explain what aspects are being debated or explored
- List specific topics that have emerged from the discussion
- Make the question completely self-sufficient - the user should understand everything from the question alone
- Provide concrete options or directions the user can choose from
- Explain the impact of their choice on the remaining dialogue rounds

Respond in JSON format:
{
  "isAligned": true/false,
  "riskLevel": "low|medium|high",
  "driftAreas": ["specific area of concern 1", "area 2"],
  "checkpointQuestion": "optional question to ask user if realignment needed",
  "recommendAction": "proceed|clarify|realign"
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  }

  private async mockCheckAlignment(
    conversationHistory: any[], 
    userIntent: any, 
    currentRound: number
  ): Promise<{
    isAligned: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    driftAreas: string[];
    checkpointQuestion?: string;
    recommendAction: 'proceed' | 'clarify' | 'realign';
  }> {
    await this.delay(300);
    
    // Simple heuristic-based alignment check for dev mode
    const recentMessages = conversationHistory.slice(-4); // Last 2 rounds
    
    // Check for potential drift indicators
    const driftIndicators = {
      tangentialTopics: 0,
      methodologyFocus: 0,
      abstractionLevel: 0,
      offTopicDiscussion: 0
    };
    
    // Analyze recent messages for drift patterns
    recentMessages.forEach(msg => {
      const content = msg.message?.toLowerCase() || '';
      
      // Check for excessive methodology discussion
      if (content.includes('methodology') || content.includes('approach') || content.includes('framework')) {
        driftIndicators.methodologyFocus++;
      }
      
      // Check for overly abstract discussion
      if (content.includes('theoretical') || content.includes('philosophical') || content.includes('conceptual')) {
        driftIndicators.abstractionLevel++;
      }
      
      // Simple keyword check for original intent alignment
      const intentKeywords = userIntent?.query?.toLowerCase().split(' ') || [];
      const matchCount = intentKeywords.filter((keyword: string) => 
        keyword.length > 3 && content.includes(keyword)
      ).length;
      
      if (matchCount < 2) {
        driftIndicators.offTopicDiscussion++;
      }
    });
    
    // Determine risk level and action
    const totalDriftScore = Object.values(driftIndicators).reduce((a, b) => a + b, 0);
    
    if (totalDriftScore >= 6 && currentRound >= 3) {
      const originalQuery = userIntent?.query || 'your research question';
      const clarifiedIntent = userIntent?.clarifiedIntent || userIntent?.query || originalQuery;
      
      // Extract key insights from conversation so far
      const keyInsights = this.extractKeyInsights(conversationHistory);
      const emergentTopics = this.extractRecentTopics(conversationHistory.slice(-4));
      const debatedAspects = this.extractDebatedAspects(conversationHistory);
      
      return {
        isAligned: false,
        riskLevel: 'high',
        driftAreas: [
          "Discussion becoming too abstract without practical relevance",
          "Agents focusing on methodology rather than addressing the core question"
        ],
        checkpointQuestion: `
🔄 **Research Alignment Check Required**

**Your Original Research Question:**
"${originalQuery}"

**Research Context & Progress:**
You initiated this research to explore: ${clarifiedIntent}

**Key Insights Discovered So Far (${currentRound} of 7 rounds completed):**
${keyInsights.length > 0 ? keyInsights.map((insight, i) => `${i + 1}. ${insight}`).join('\n') : '• The agents have been exploring various perspectives but haven\'t yet converged on concrete insights.'}

**Current Debate Focus:**
The agents are currently debating:
${debatedAspects.map(aspect => `• ${aspect}`).join('\n')}

**Emerging Topics:**
${emergentTopics.map(topic => `• ${topic}`).join('\n')}

**⚠️ Observation:** The discussion has shifted toward abstract theoretical frameworks and methodological debates rather than directly addressing your research question about practical applications and real-world implications.

**Your Decision Needed:**
With ${7 - currentRound} rounds remaining, how would you like to redirect the agents' focus?

**Specific Options:**
1. **Return to Core Question**: Have agents provide concrete examples and evidence directly related to "${truncateLog(originalQuery, 100)}"

2. **Deep Dive on Insights**: Choose one of the discovered insights above to explore in depth with supporting evidence

3. **Focus on Practical Applications**: Request real-world case studies, implementation examples, and actionable recommendations

4. **Explore Emerging Theme**: Pick one of the emerging topics to investigate thoroughly

5. **Custom Direction**: Provide your own specific guidance for what aspects matter most to you

**Please provide your direction:** Be as specific as possible about what you want the agents to focus on. Your response will directly shape the remaining dialogue.`.trim(),
        recommendAction: 'clarify'
      };
    }
    
    if (totalDriftScore >= 4 && currentRound >= 2) {
      const originalQuery = userIntent?.query || 'your research question';
      const recentTopics = this.extractRecentTopics(conversationHistory.slice(-4));
      
      // Get comprehensive context
      const keyInsights = this.extractKeyInsights(conversationHistory);
      const initialFindings = this.extractInitialFindings(conversationHistory);
      const debatePositions = this.extractAgentPositions(conversationHistory);
      
      return {
        isAligned: false,
        riskLevel: 'medium',
        driftAreas: ["Some tangential exploration detected"],
        checkpointQuestion: `
🎯 **Research Direction Check**

**Your Original Research Question:**
"${originalQuery}"

**Why You Started This Research:**
${userIntent?.clarifiedIntent || userIntent?.query || 'To gain comprehensive insights on this topic'}

**Progress Update (Round ${currentRound} of 7):**

**Initial Findings:**
${initialFindings.map((finding, i) => `${i + 1}. ${finding}`).join('\n')}

**Current Agent Perspectives:**
${debatePositions.map(pos => `• ${pos}`).join('\n')}

**Emerging Themes Being Explored:**
${recentTopics.map(t => `• ${t}`).join('\n')}

**📊 Assessment:** The agents have started exploring some tangential but potentially valuable topics that weren't part of your original question. These explorations might yield unexpected insights, but they're also using up dialogue rounds.

**Your Strategic Choice:**

**Option 1 - Stay the Course:** Continue with current exploration
- Pros: May discover unexpected connections and insights
- Cons: Less time for your core question
- Best if: You're interested in these emerging themes

**Option 2 - Refocus on Original:** Return to "${truncateLog(originalQuery, 80)}"
- Pros: Ensures your main question gets fully addressed
- Cons: May miss interesting tangential insights
- Best if: You need specific answers to your original question

**Option 3 - Hybrid Approach:** Quickly wrap current themes, then return to core
- Pros: Balance of exploration and focus
- Cons: May feel rushed
- Best if: Both aspects seem valuable

**Option 4 - Narrow Focus:** Pick ONE specific aspect to dive deep
- Pros: Thorough exploration of most important element
- Cons: Other aspects won't be covered
- Best if: One topic stands out as most critical

**Your Direction:** Please describe specifically what you'd like the agents to prioritize. Examples:
- "Focus on [specific aspect] with real-world examples"
- "Compare perspectives on [specific theme]"
- "Provide evidence for [specific claim]"

Your guidance will immediately redirect the conversation.`.trim(),
        recommendAction: 'clarify'
      };
    }
    
    // Default: proceed
    return {
      isAligned: true,
      riskLevel: 'low',
      driftAreas: [],
      recommendAction: 'proceed'
    };
  }

  private extractRecentTopics(recentMessages: any[]): string[] {
    const topics: string[] = [];
    
    recentMessages.forEach(msg => {
      const content = msg.message || '';
      
      // Extract key topics using simple pattern matching
      const topicPatterns = [
        /discussing\s+([^.]+)/i,
        /exploring\s+([^.]+)/i,
        /focused on\s+([^.]+)/i,
        /analysis of\s+([^.]+)/i,
        /implications for\s+([^.]+)/i
      ];
      
      topicPatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match && match[1]) {
          const topic = match[1].trim();
          if (topic.length > 10 && topic.length < 100 && !topics.includes(topic)) {
            topics.push(topic);
          }
        }
      });
    });
    
    // If no topics found through patterns, extract from content
    if (topics.length === 0) {
      recentMessages.slice(-2).forEach(msg => {
        const content = msg.message || '';
        const sentences = content.split('.').filter((s: string) => s.trim().length > 20);
        if (sentences.length > 0) {
          topics.push(sentences[0].trim().substring(0, 80) + '...');
        }
      });
    }
    
    return topics.slice(0, 3); // Return top 3 topics
  }

  private extractKeyInsights(conversationHistory: any[]): string[] {
    const insights: string[] = [];
    
    conversationHistory.forEach(msg => {
      const content = msg.message || '';
      
      // Look for insight patterns
      const insightPatterns = [
        /studies show that\s+([^.]+)/i,
        /research indicates\s+([^.]+)/i,
        /evidence suggests\s+([^.]+)/i,
        /we can conclude that\s+([^.]+)/i,
        /the data reveals\s+([^.]+)/i,
        /key finding[s]?:\s*([^.]+)/i,
        /importantly,\s+([^.]+)/i,
        /significantly,\s+([^.]+)/i
      ];
      
      insightPatterns.forEach(pattern => {
        const matches = content.matchAll(new RegExp(pattern, 'gi'));
        for (const match of matches) {
          if (match[1]) {
            const insight = match[1].trim().replace(/\s+/g, ' ');
            if (insight.length > 20 && insight.length < 200 && !insights.some(i => i.includes(insight))) {
              insights.push(insight);
            }
          }
        }
      });
    });
    
    return insights.slice(0, 5); // Return top 5 insights
  }

  private extractInitialFindings(conversationHistory: any[]): string[] {
    const findings: string[] = [];
    
    // Focus on first few rounds for initial findings
    const earlyMessages = conversationHistory.slice(0, Math.min(6, conversationHistory.length));
    
    earlyMessages.forEach(msg => {
      const content = msg.message || '';
      
      // Look for finding patterns
      const findingPatterns = [
        /initial (?:findings?|observations?|analysis) (?:show|indicate|suggest)\s+([^.]+)/i,
        /first,?\s+([^.]+\.)/i,
        /to begin with,?\s+([^.]+)/i,
        /preliminary (?:data|evidence|research)\s+([^.]+)/i,
        /starting point[s]?:\s*([^.]+)/i
      ];
      
      findingPatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match && match[1]) {
          const finding = match[1].trim();
          if (finding.length > 20 && finding.length < 150 && !findings.includes(finding)) {
            findings.push(finding);
          }
        }
      });
    });
    
    // If no specific findings, extract key statements from early rounds
    if (findings.length === 0 && earlyMessages.length > 0) {
      earlyMessages.slice(0, 3).forEach(msg => {
        const content = msg.message || '';
        const sentences = content.split(/[.!?]/).filter((s: string) => s.trim().length > 30);
        if (sentences.length > 0) {
          findings.push(sentences[0].trim());
        }
      });
    }
    
    return findings.slice(0, 3);
  }

  private extractDebatedAspects(conversationHistory: any[]): string[] {
    const debates: string[] = [];
    
    conversationHistory.forEach(msg => {
      const content = msg.message || '';
      
      // Look for debate patterns
      const debatePatterns = [
        /however,?\s+([^.]+)/i,
        /on the other hand,?\s+([^.]+)/i,
        /alternatively,?\s+([^.]+)/i,
        /counter[- ]?argument[s]?:\s*([^.]+)/i,
        /disagree[s]? (?:with|that)\s+([^.]+)/i,
        /the debate centers on\s+([^.]+)/i,
        /contentious (?:issue|point|aspect)[s]?:\s*([^.]+)/i,
        /different perspectives on\s+([^.]+)/i
      ];
      
      debatePatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match && match[1]) {
          const debate = match[1].trim();
          if (debate.length > 15 && debate.length < 100 && !debates.includes(debate)) {
            debates.push(debate);
          }
        }
      });
    });
    
    return debates.slice(0, 3);
  }

  private extractAgentPositions(conversationHistory: any[]): string[] {
    const positions: string[] = [];
    const agentMap = new Map<string, string>();
    
    // Get the most recent position from each agent
    conversationHistory.slice(-6).forEach(msg => {
      const agent = msg.agent || 'Unknown Agent';
      const content = msg.message || '';
      
      // Look for position statements
      const positionPatterns = [
        /I (?:believe|think|argue|maintain) that\s+([^.]+)/i,
        /my (?:position|view|perspective) is that\s+([^.]+)/i,
        /from my analysis,?\s+([^.]+)/i,
        /the evidence (?:points to|suggests|indicates)\s+([^.]+)/i
      ];
      
      positionPatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match && match[1]) {
          const position = match[1].trim();
          if (position.length > 20 && position.length < 150) {
            agentMap.set(agent, `${agent}: ${position}`);
          }
        }
      });
    });
    
    // Convert map to array
    agentMap.forEach(position => positions.push(position));
    
    return positions.slice(0, 4);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class ProLLMService {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private gemini?: GoogleGenAI;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }

  private async callGeminiFlash(prompt: string): Promise<any> {
    if (!this.gemini) throw new Error("Gemini not configured");
    
    return await geminiRateLimiter.executeWithQuotaHandling('gemini', async () => {
      console.log(`🤖 PRO: Calling Gemini Flash 2.5 API... (${geminiRateLimiter.getCurrentCallCount('gemini')}/7 calls in last minute)`);
      const response = await this.gemini!.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      console.log("✅ PRO: Gemini Flash 2.5 responded successfully");
      
      const textResponse = response.text;
      
      if (!textResponse) {
        throw new Error("No text response from Gemini");
      }
      
      // Try to parse as JSON
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
          console.warn("Could not find JSON content in Gemini response");
          return { error: "No JSON found", raw_response: textResponse };
        }
      } catch (e) {
        console.warn("Could not parse Gemini response as JSON:", e);
        return { error: "JSON parse error", raw_response: textResponse };
      }
    });
  }

  async orchestrateResearch(clarifiedIntent: any, searchTerms: any): Promise<{
    priorities: string[];
    expectedFindings: string[];
    evaluationCriteria: string;
    orchestrationPlan: any;
  }> {
    if (configService.isRealMode() && (this.anthropic || this.gemini || this.openai)) {
      return await this.realOrchestrateResearch(clarifiedIntent, searchTerms);
    } else {
      return await this.devOrchestrateResearch(clarifiedIntent, searchTerms);
    }
  }

  private async realOrchestrateResearch(clarifiedIntent: any, searchTerms: any): Promise<{
    priorities: string[];
    expectedFindings: string[];
    evaluationCriteria: string;
    orchestrationPlan: any;
  }> {
    // Try to use available LLM providers in order of preference
    if (this.anthropic) {
      return await this.realOrchestrateResearchWithAnthropic(clarifiedIntent, searchTerms);
    } else if (this.gemini) {
      return await this.realOrchestrateResearchWithGemini(clarifiedIntent, searchTerms);
    } else if (this.openai) {
      return await this.realOrchestrateResearchWithOpenAI(clarifiedIntent, searchTerms);
    } else {
      throw new Error("No LLM provider configured");
    }
  }
  
  private async realOrchestrateResearchWithGemini(clarifiedIntent: any, searchTerms: any): Promise<{
    priorities: string[];
    expectedFindings: string[];
    evaluationCriteria: string;
    orchestrationPlan: any;
  }> {
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

    const response = await this.callGeminiFlash(prompt);
    // Gemini returns parsed JSON already from callGeminiFlash
    return response;
  }
  
  private async realOrchestrateResearchWithOpenAI(clarifiedIntent: any, searchTerms: any): Promise<{
    priorities: string[];
    expectedFindings: string[];
    evaluationCriteria: string;
    orchestrationPlan: any;
  }> {
    if (!this.openai) throw new Error("OpenAI not configured");
    
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

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    if (!content) throw new Error("No response from OpenAI");
    
    return JSON.parse(content);
  }

  private async realOrchestrateResearchWithAnthropic(clarifiedIntent: any, searchTerms: any): Promise<{
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
      model: "claude-3-opus-20240229",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return JSON.parse(content.text);
    } else {
      throw new Error("Unexpected content type from Anthropic");
    }
  }

  private async devOrchestrateResearch(clarifiedIntent: any, searchTerms: any): Promise<{
    priorities: string[];
    expectedFindings: string[];
    evaluationCriteria: string;
    orchestrationPlan: any;
  }> {
    if (!this.gemini) throw new Error("Gemini not configured for dev mode");

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

    return await this.callGeminiFlash(prompt);
  }

  async analyzeResearchFindings(findings: any[], evidenceThresholds: any): Promise<{
    filteredClaims: any[];
    deduplicated: any[];
    contradictions: any[];
    highImpactClaims: any[];
    edgeCases: any[];
    knowledgeGaps: string[];
    analysisReport: string;
  }> {
    // Step 1: Deterministic filtering based on thresholds
    const filteredClaims = this.applyDeterministicFilter(findings, evidenceThresholds);
    
    // Step 2: Pro LLM analysis of filtered claims
    if (configService.isRealMode() && (this.anthropic || this.gemini || this.openai)) {
      return await this.realAnalyzeResearchFindings(filteredClaims, evidenceThresholds);
    } else {
      // For now, use the mock version until full implementation is complete
      return await this.mockAnalyzeResearchFindings(filteredClaims, evidenceThresholds);
    }
  }

  private applyDeterministicFilter(findings: any[], thresholds: any): any[] {
    // DISABLED FOR NOW - return all findings without filtering
    // const minimumScore = thresholds.minimumRelevanceScore || 65;
    
    // return findings.filter(finding => {
    //   // Apply relevance threshold
    //   if (finding.relevanceScore < minimumScore) {
    //     return false;
    //   }
    //   
    //   // Keep claims that meet quality thresholds OR are contradictory (for analysis)
    //   return finding.qualityScore >= thresholds.qualityThresholds.low || finding.isContradictory;
    // });
    
    return findings; // Return all findings without any filtering
  }

  private async realAnalyzeResearchFindings(filteredClaims: any[], evidenceThresholds: any): Promise<{
    filteredClaims: any[];
    deduplicated: any[];
    contradictions: any[];
    highImpactClaims: any[];
    edgeCases: any[];
    knowledgeGaps: string[];
    analysisReport: string;
  }> {
    if (!this.anthropic) throw new Error("Anthropic not configured");

    const prompt = `You are a research analysis expert. Analyze the filtered research findings following these specifications:

FILTERED CLAIMS: ${JSON.stringify(filteredClaims)}
EVIDENCE THRESHOLDS: ${JSON.stringify(evidenceThresholds)}

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
  "filteredClaims": [original filtered claims],
  "deduplicated": [unique claims after deduplication],
  "contradictions": [
    {
      "claimIds": ["id1", "id2"],
      "contradiction": "specific description",
      "reasoning": "why these claims conflict",
      "evidenceStrength": "assessment of evidence quality for each side"
    }
  ],
  "highImpactClaims": [claims that significantly affect conclusions],
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

    const response = await this.anthropic.messages.create({
      model: "claude-3-opus-20240229",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2500,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const result = JSON.parse(content.text);
      result.filteredClaims = filteredClaims;
      return result;
    } else {
      throw new Error("Unexpected content type from Anthropic");
    }
  }

  private async mockAnalyzeResearchFindings(filteredClaims: any[], evidenceThresholds: any): Promise<{
    filteredClaims: any[];
    deduplicated: any[];
    contradictions: any[];
    highImpactClaims: any[];
    edgeCases: any[];
    knowledgeGaps: string[];
    analysisReport: string;
  }> {
    await this.delay(2000);
    
    const contradictions = filteredClaims.filter(f => f.isContradictory);
    const highImpact = filteredClaims.filter(f => f.relevanceScore > evidenceThresholds.qualityThresholds.high);
    
    return {
      filteredClaims,
      deduplicated: filteredClaims.slice(0, Math.floor(filteredClaims.length * 0.9)),
      contradictions: [
        {
          claimIds: ["claim-2", "claim-3"],
          contradiction: "Displacement vs augmentation predictions",
          reasoning: "Goldman Sachs predicts mass automation while industry surveys show augmentation focus",
          evidenceStrength: "Theoretical modeling vs empirical early adoption data"
        }
      ],
      highImpactClaims: highImpact,
      edgeCases: [
        {
          scenario: "Rapid adoption acceleration due to competitive pressure",
          implications: "May invalidate gradual transition assumptions",
          testingNeeded: "Analysis of historical technology adoption curves in competitive markets"
        },
        {
          scenario: "Quality control failures in mission-critical applications",
          implications: "Could slow adoption in high-stakes sectors",
          testingNeeded: "Investigation of failure modes and mitigation strategies"
        }
      ],
      knowledgeGaps: [
        "Limited longitudinal data on productivity quality vs quantity",
        "Insufficient analysis of skill complementarity patterns",
        "Lack of sector-specific adoption timeline studies",
        "Missing policy intervention effectiveness research"
      ],
      analysisReport: "Analysis reveals tension between theoretical displacement predictions and empirical augmentation patterns. High-impact claims cluster around productivity gains and adoption timelines. Key edge cases involve acceleration scenarios and quality control challenges. Knowledge gaps primarily concern long-term effects and policy responses."
    };
  }

  async selectAgents(researchData: any, userContext: any): Promise<{
    chatgptConfig: any;
    geminiConfig: any;
    successCriteria: string[];
    orchestratorRationale: string;
    uncertaintyDimensions: string[];
  }> {
    if (configService.isRealMode() && (this.anthropic || this.gemini || this.openai)) {
      return await this.realSelectAgents(researchData, userContext);
    } else {
      return await this.devSelectAgents(researchData, userContext);
    }
  }

  private async realSelectAgents(researchData: any, userContext: any): Promise<{
    chatgptConfig: any;
    geminiConfig: any;
    successCriteria: string[];
    orchestratorRationale: string;
    uncertaintyDimensions: string[];
  }> {
    if (!this.anthropic) throw new Error("Anthropic not configured");

    const prompt = `You are the Pro Orchestrator conducting strategic agent selection following the Multi-Agent Research System specifications.

INPUTS:
- Research Data: ${JSON.stringify(researchData)}
- User Context: ${JSON.stringify(userContext)}

ANALYSIS REQUIREMENTS:
1. Analyze problem structure to identify key uncertainty dimensions
2. Select agent configurations that create natural methodological tension
3. Maximize orthogonal search space exploration
4. Assign one configuration to ChatGPT, one to Gemini
5. Generate specialized prompts that emphasize each agent's cognitive approach
6. Define success criteria for exploration completeness

AGENT PAIRING STRATEGIES (choose the most relevant):
- **Cognitive Approach**: Inductive pattern-finder vs. Deductive framework-builder
- **Temporal Focus**: Short-term dynamics vs. Long-term structural analysis  
- **Evidence Weighting**: Empirical data maximizer vs. Theoretical model challenger
- **Risk Orientation**: Base-rate anchored vs. Tail-risk explorer

SELECTION CRITERIA:
- Choose configurations that maximize orthogonal search space exploration
- Create natural methodological tension for comprehensive coverage
- Ensure both agents can contribute meaningfully to the specific problem
- Focus on truth-seeking over consensus-building

Respond in JSON format:
{
  "chatgptConfig": {
    "approach": "inductive|deductive",
    "focus": "specific focus area",
    "evidenceWeight": "empirical-maximizer|theoretical-challenger",
    "temporal": "short-term|long-term",
    "risk": "base-rate-anchored|tail-risk-explorer"
  },
  "geminiConfig": {
    "approach": "inductive|deductive",
    "focus": "specific focus area",
    "evidenceWeight": "empirical-maximizer|theoretical-challenger",
    "temporal": "short-term|long-term", 
    "risk": "base-rate-anchored|tail-risk-explorer"
  },
  "successCriteria": [
    "specific criterion 1",
    "specific criterion 2",
    "specific criterion 3"
  ],
  "orchestratorRationale": "detailed explanation of configuration choices",
  "uncertaintyDimensions": ["dimension 1", "dimension 2", ...]
}`;

    const response = await this.anthropic.messages.create({
      model: "claude-3-opus-20240229",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return JSON.parse(content.text);
    } else {
      throw new Error("Unexpected content type from Anthropic");
    }
  }

  private async devSelectAgents(researchData: any, userContext: any): Promise<{
    chatgptConfig: any;
    geminiConfig: any;
    successCriteria: string[];
    orchestratorRationale: string;
    uncertaintyDimensions: string[];
  }> {
    await this.delay(1500);
    
    // Analyze problem structure to identify key uncertainty dimensions
    const problemStructure = this.analyzeProblemStructure(researchData, userContext);
    
    // Select agent pairing strategy based on problem characteristics
    const pairingStrategy = this.selectPairingStrategy(problemStructure);
    
    // Generate specialized agent configurations
    const agentConfigs = this.generateAgentConfigurations(pairingStrategy, problemStructure);
    
    return {
      chatgptConfig: agentConfigs.chatgpt,
      geminiConfig: agentConfigs.gemini,
      successCriteria: this.defineSuccessCriteria(problemStructure),
      orchestratorRationale: this.generateOrchestrationRationale(pairingStrategy, problemStructure),
      uncertaintyDimensions: problemStructure.uncertaintyDimensions
    };
  }
  
  private analyzeProblemStructure(researchData: any, userContext: any): any {
    // Analyze the research data to identify problem characteristics
    const hasContradictions = researchData?.analysis?.contradictions?.length > 0;
    const hasHighImpactClaims = researchData?.analysis?.highImpactClaims?.length > 0;
    const hasTemporalUncertainty = researchData?.analysis?.knowledgeGaps?.some((gap: string) => 
      gap.toLowerCase().includes('timeline') || gap.toLowerCase().includes('temporal')
    );
    const hasEconomicFactors = researchData?.analysis?.knowledgeGaps?.some((gap: string) => 
      gap.toLowerCase().includes('economic') || gap.toLowerCase().includes('market')
    );
    
    return {
      problemType: hasContradictions ? 'contradiction-heavy' : hasHighImpactClaims ? 'evidence-rich' : 'exploratory',
      temporalComplexity: hasTemporalUncertainty ? 'high' : 'medium',
      economicFactors: hasEconomicFactors ? 'significant' : 'moderate',
      uncertaintyDimensions: [
        "Timeline prediction methodology",
        "Evidence quality vs quantity trade-offs", 
        "Competitive pressure dynamics",
        "Policy intervention timing and effectiveness",
        "Sector-specific transformation patterns"
      ],
      cognitiveApproachNeeded: hasContradictions ? 'tension-creation' : 'complementary-exploration'
    };
  }
  
  private selectPairingStrategy(problemStructure: any): string {
    // Select strategy based on problem characteristics
    if (problemStructure.temporalComplexity === 'high' && problemStructure.economicFactors === 'significant') {
      return 'temporal-economic-tension';
    } else if (problemStructure.problemType === 'contradiction-heavy') {
      return 'evidence-theory-challenger';
    } else {
      return 'empirical-structural-complementary';
    }
  }
  
  private generateAgentConfigurations(strategy: string, problemStructure: any): any {
    const strategies = {
      'temporal-economic-tension': {
        chatgpt: {
          approach: "inductive",
          focus: "short-term-empirical-patterns",
          evidenceWeight: "empirical-maximizer", 
          temporal: "short-term-dynamics",
          risk: "base-rate-anchored"
        },
        gemini: {
          approach: "deductive",
          focus: "long-term-economic-structural-analysis", 
          evidenceWeight: "theoretical-challenger",
          temporal: "long-term-structural",
          risk: "tail-risk-explorer"
        }
      },
      'evidence-theory-challenger': {
        chatgpt: {
          approach: "inductive",
          focus: "evidence-synthesis-and-validation",
          evidenceWeight: "empirical-maximizer", 
          temporal: "current-data-focused",
          risk: "conservative-evidence-based"
        },
        gemini: {
          approach: "deductive",
          focus: "theoretical-framework-stress-testing", 
          evidenceWeight: "theoretical-challenger",
          temporal: "structural-implications",
          risk: "assumption-challenger"
        }
      },
      'empirical-structural-complementary': {
        chatgpt: {
          approach: "inductive",
          focus: "empirical-pattern-analysis",
          evidenceWeight: "empirical-maximizer", 
          temporal: "short-term-dynamics",
          risk: "base-rate-anchored"
        },
        gemini: {
          approach: "deductive",
          focus: "structural-framework-analysis", 
          evidenceWeight: "theoretical-challenger",
          temporal: "long-term-structural",
          risk: "tail-risk-explorer"
        }
      }
    };
    
    return strategies[strategy as keyof typeof strategies] || strategies['empirical-structural-complementary'];
  }
  
  private defineSuccessCriteria(problemStructure: any): string[] {
    const baseCriteria = [
      "Complete exploration of identified uncertainty dimensions",
      "Meaningful disagreements with evidence-based reasoning",
      "Novel insights that weren't obvious from individual research sources"
    ];
    
    if (problemStructure.temporalComplexity === 'high') {
      baseCriteria.push("Thorough analysis of timeline uncertainty factors");
    }
    
    if (problemStructure.economicFactors === 'significant') {
      baseCriteria.push("Integration of economic pressures with empirical evidence");
    }
    
    if (problemStructure.problemType === 'contradiction-heavy') {
      baseCriteria.push("Resolution or clarification of major contradictory findings");
    }
    
    return baseCriteria;
  }
  
  private generateOrchestrationRationale(strategy: string, problemStructure: any): string {
    const rationales = {
      'temporal-economic-tension': "The research reveals significant temporal complexity combined with economic factors. ChatGPT's inductive approach will ground analysis in current empirical patterns and short-term data, while Gemini's deductive framework will explore long-term economic structural implications. This creates productive tension between evidence-based near-term projections and theory-driven long-term structural analysis.",
      'evidence-theory-challenger': "Multiple contradictory findings require systematic evidence validation and theoretical stress-testing. ChatGPT will focus on synthesizing and validating empirical evidence, while Gemini will challenge theoretical assumptions and frameworks. This approach maximizes the chances of resolving contradictions through complementary analytical perspectives.",
      'empirical-structural-complementary': "The research question involves both empirical evidence and structural implications requiring complementary exploration. ChatGPT's inductive approach will identify patterns in current data, while Gemini's deductive framework will explore structural implications and theoretical considerations."
    };
    
    return rationales[strategy as keyof typeof rationales] || rationales['empirical-structural-complementary'];
  }

  async evaluateDialogueRound(context: any): Promise<{
    decision: "continue" | "conclude";
    feedback: string[];
    questions: string[];
    reason: string;
    successCriteriaStatus: any;
    insightStagnationDetected: boolean;
    successCriteriaCompletionPercentage?: number;
  }> {
    if (configService.isRealMode() && (this.anthropic || this.gemini || this.openai)) {
      return await this.realEvaluateDialogueRound(context);
    } else {
      return await this.mockEvaluateDialogueRound(context);
    }
  }
  
  private async realEvaluateDialogueRound(context: any): Promise<{
    decision: "continue" | "conclude";
    feedback: string[];
    questions: string[];
    reason: string;
    successCriteriaStatus: any;
    insightStagnationDetected: boolean;
    successCriteriaCompletionPercentage?: number;
  }> {
    if (!this.anthropic) throw new Error("Anthropic not configured");
    
    const prompt = `You are the Pro Judge evaluating whether to continue or conclude agent dialogue following the Multi-Agent Research System specifications.

CONTEXT:
- Research Data: ${JSON.stringify(context.researchData || {})}
- Dialogue History: ${JSON.stringify(context.dialogueHistory || [])}
- Success Criteria: ${JSON.stringify(context.successCriteria || [])}
- Current Round: ${context.roundNumber || 0}
- Max Rounds: 7

CRITICAL INSTRUCTION: **YOU MUST EXPLICITLY CHECK EACH SUCCESS CRITERION** before making your decision.

EVALUATION DECISION TREE:

**CONCLUDE** if ANY of these conditions are met:
1. ALL success criteria are satisfied (status: "completed") - this is the PRIMARY condition
2. 80% or more of success criteria are completed AND remaining ones show no progress potential
3. High-confidence answer emerged with strong evidence addressing all key dimensions
4. Maximum rounds reached (7) - automatic conclusion
5. No new insights emerging for 2+ rounds (insight stagnation detected)

**CONTINUE** only if ALL of these conditions are true:
1. At least one success criterion remains incomplete or partially addressed
2. Agents are still discovering new important dimensions
3. Recent rounds show meaningful progress on success criteria
4. Under maximum round limit with active insight generation
5. Evidence conflicts or knowledge gaps can be addressed with more dialogue

SUCCESS CRITERIA EVALUATION REQUIREMENTS:
- For EACH criterion provided, assess its current status based on dialogue content
- Status definitions:
  * "completed": Criterion fully addressed with sufficient evidence/exploration
  * "partial": Some progress made but more exploration needed
  * "not_started": No meaningful exploration of this criterion yet
- Provide specific evidence from dialogue supporting each status assessment
- If a criterion seems vague, interpret it in context of the research question

RESPONSE REQUIREMENTS:
1. Start by evaluating EACH success criterion individually
2. Base your decision PRIMARILY on success criteria completion
3. Detect insight stagnation by comparing recent rounds
4. Provide specific feedback targeting incomplete criteria if continuing
5. Questions should directly address gaps in success criteria

Respond in JSON format:
{
  "decision": "continue|conclude",
  "feedback": ["specific feedback for agents focusing on incomplete success criteria"],
  "questions": ["targeted questions to address specific gaps in success criteria"],
  "reason": "detailed explanation emphasizing success criteria status in decision",
  "successCriteriaStatus": {
    "criterion1_key": {"status": "completed|partial|not_started", "evidence": "specific evidence from dialogue"},
    "criterion2_key": {"status": "completed|partial|not_started", "evidence": "specific evidence from dialogue"}
  },
  "insightStagnationDetected": true/false,
  "successCriteriaCompletionPercentage": 0-100
}`;

    const response = await this.anthropic.messages.create({
      model: "claude-3-opus-20240229",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return JSON.parse(content.text);
    } else {
      throw new Error("Unexpected content type from Anthropic");
    }
  }
  
  private async mockEvaluateDialogueRound(context: any): Promise<{
    decision: "continue" | "conclude";
    feedback: string[];
    questions: string[];
    reason: string;
    successCriteriaStatus: any;
    insightStagnationDetected: boolean;
    successCriteriaCompletionPercentage?: number;
  }> {
    await this.delay(1000);
    
    const roundsCompleted = context.roundNumber || 0;
    const maxRounds = 7;
    const dialogueHistory = context.dialogueHistory || [];
    
    // Evaluate success criteria
    const successCriteriaStatus = this.evaluateSuccessCriteria(context);
    
    // Detect insight stagnation
    const insightStagnationDetected = this.detectInsightStagnation(dialogueHistory, roundsCompleted);
    
    // Calculate success criteria completion percentage
    const completedCriteria = Object.values(successCriteriaStatus).filter(
      (criterion: any) => criterion.status === 'completed'
    ).length;
    const totalCriteria = Object.keys(successCriteriaStatus).length;
    const completionPercentage = totalCriteria > 0 ? Math.round((completedCriteria / totalCriteria) * 100) : 0;
    
    // Decision logic following specification with emphasis on success criteria
    
    // Check PRIMARY condition first - ALL success criteria completed
    if (completionPercentage === 100) {
      return {
        decision: "conclude",
        feedback: [],
        questions: [],
        reason: "All success criteria have been satisfied - comprehensive exploration achieved",
        successCriteriaStatus,
        insightStagnationDetected,
        successCriteriaCompletionPercentage: completionPercentage
      };
    }
    
    // Check maximum rounds
    if (roundsCompleted >= maxRounds) {
      return {
        decision: "conclude",
        feedback: [],
        questions: [],
        reason: `Maximum rounds reached (7) with ${completionPercentage}% of success criteria completed`,
        successCriteriaStatus,
        insightStagnationDetected,
        successCriteriaCompletionPercentage: completionPercentage
      };
    }
    
    // Check 80% completion threshold
    if (completionPercentage >= 80) {
      const partialCriteria = Object.values(successCriteriaStatus).filter(
        (criterion: any) => criterion.status === 'partial'
      ).length;
      
      if (partialCriteria === 0) { // No more progress possible
        return {
          decision: "conclude",
          feedback: [],
          questions: [],
          reason: `${completionPercentage}% of success criteria completed with no further progress potential`,
          successCriteriaStatus,
          insightStagnationDetected,
          successCriteriaCompletionPercentage: completionPercentage
        };
      }
    }
    
    // Check insight stagnation
    if (insightStagnationDetected && roundsCompleted >= 3) {
      return {
        decision: "conclude",
        feedback: [],
        questions: [],
        reason: `No new insights emerging for 2+ rounds. ${completionPercentage}% of success criteria completed`,
        successCriteriaStatus,
        insightStagnationDetected,
        successCriteriaCompletionPercentage: completionPercentage
      };
    }
    
    return {
      decision: "continue",
      feedback: this.generateContinueFeedback(successCriteriaStatus, roundsCompleted),
      questions: this.generateTargetedQuestions(successCriteriaStatus, context),
      reason: `Continuing dialogue to complete remaining success criteria. Currently ${completionPercentage}% completed with active progress on incomplete criteria`,
      successCriteriaStatus,
      insightStagnationDetected,
      successCriteriaCompletionPercentage: completionPercentage
    };
  }
  
  private evaluateSuccessCriteria(context: any): any {
    // Mock evaluation of success criteria
    return {
      "uncertainty_exploration": {
        status: context.roundNumber >= 2 ? "partial" : "not_started",
        evidence: "Agents have begun exploring timeline and adoption uncertainties"
      },
      "meaningful_disagreements": {
        status: context.roundNumber >= 1 ? "completed" : "not_started", 
        evidence: "Clear disagreements emerging on acceleration vs gradual adoption"
      },
      "novel_insights": {
        status: context.roundNumber >= 3 ? "partial" : "not_started",
        evidence: "Some novel perspectives on policy timing, need deeper exploration"
      },
      "evidence_integration": {
        status: context.roundNumber >= 2 ? "partial" : "not_started",
        evidence: "Good integration of empirical data, theoretical frameworks need work"
      }
    };
  }
  
  private detectInsightStagnation(dialogueHistory: any[], currentRound: number): boolean {
    if (currentRound < 3) return false;
    
    // Simple heuristic: if last 2 rounds are very similar, stagnation detected
    const recentRounds = dialogueHistory.slice(-4); // Last 2 rounds (2 agents each)
    if (recentRounds.length < 4) return false;
    
    // In a real implementation, this would use semantic similarity
    // For now, use simple keyword overlap heuristic
    const keywords1 = this.extractKeywords(recentRounds[0]?.message || '');
    const keywords2 = this.extractKeywords(recentRounds[2]?.message || '');
    
    const overlap = keywords1.filter(k => keywords2.includes(k)).length;
    const similarity = overlap / Math.max(keywords1.length, keywords2.length);
    
    return similarity > 0.7; // High similarity suggests stagnation
  }
  
  private extractKeywords(text: string): string[] {
    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 4)
      .slice(0, 10);
  }
  
  private generateContinueFeedback(successCriteriaStatus: any, roundNumber: number): string[] {
    const feedback = [];
    
    for (const [key, criterion] of Object.entries(successCriteriaStatus)) {
      const crit = criterion as any;
      if (crit.status === 'not_started') {
        feedback.push(`Begin exploring ${key.replace('_', ' ')} dimensions`);
      } else if (crit.status === 'partial') {
        feedback.push(`Deepen analysis of ${key.replace('_', ' ')}`);
      }
    }
    
    if (roundNumber >= 3) {
      feedback.push("Focus on areas where you genuinely disagree rather than finding artificial consensus");
    }
    
    return feedback.slice(0, 3); // Limit to most important feedback
  }
  
  private generateTargetedQuestions(successCriteriaStatus: any, context: any): string[] {
    const questions = [];
    
    const partialCriteria = Object.entries(successCriteriaStatus)
      .filter(([_, criterion]) => (criterion as any).status === 'partial')
      .map(([key, _]) => key);
    
    if (partialCriteria.includes('uncertainty_exploration')) {
      questions.push("What are the most critical uncertainties that could invalidate your current analysis?");
    }
    
    if (partialCriteria.includes('evidence_integration')) {
      questions.push("How do you reconcile conflicting evidence sources in your reasoning?");
    }
    
    if (partialCriteria.includes('novel_insights')) {
      questions.push("What non-obvious implications emerge from combining your different analytical approaches?");
    }
    
    // Add context-specific questions
    if (context.researchData?.analysis?.knowledgeGaps?.length > 0) {
      questions.push("How do the identified knowledge gaps affect your confidence in key conclusions?");
    }
    
    return questions.slice(0, 2); // Limit to most targeted questions
  }

  async synthesizeResults(
    surfaceResearchReport: any,
    deepResearchReport: any, 
    dialogueHistory: any,
    userContext: any
  ): Promise<{
    executiveSummary: string;
    evidenceFoundation: any[];
    reasoningChain: string;
    dissentingViews: any[];
    uncertaintyAnalysis: string;
    sourceAudit: any[];
    confidenceInterval: [number, number];
    synthesis: string;
  }> {
    if (configService.isRealMode() && (this.anthropic || this.gemini || this.openai)) {
      return await this.realSynthesizeResults(surfaceResearchReport, deepResearchReport, dialogueHistory, userContext);
    } else {
      return await this.devSynthesizeResults(surfaceResearchReport, deepResearchReport, dialogueHistory, userContext);
    }
  }

  private async realSynthesizeResults(
    surfaceResearchReport: any,
    deepResearchReport: any, 
    dialogueHistory: any,
    userContext: any
  ): Promise<{
    executiveSummary: string;
    evidenceFoundation: any[];
    reasoningChain: string;
    dissentingViews: any[];
    uncertaintyAnalysis: string;
    sourceAudit: any[];
    confidenceInterval: [number, number];
    synthesis: string;
  }> {
    if (!this.anthropic) throw new Error("Anthropic not configured");

    const prompt = `You are generating the Final Synthesis following the Multi-Agent Research System specifications.

INPUTS:
- Surface Research Report: ${JSON.stringify(surfaceResearchReport)}
- Deep Research Report: ${JSON.stringify(deepResearchReport)}
- Agent Dialogue History: ${JSON.stringify(dialogueHistory)}
- User Context: ${JSON.stringify(userContext)}

GENERATE COMPREHENSIVE SYNTHESIS with these REQUIRED SECTIONS:

1. **EXECUTIVE SUMMARY**: Direct answer to user question with confidence assessment
2. **EVIDENCE FOUNDATION**: Key facts with source attribution supporting conclusions
3. **REASONING CHAIN**: How research and agent dialogue led to final synthesis
4. **DISSENTING VIEWS**: Where agents disagreed and why, with supporting evidence
5. **UNCERTAINTY ANALYSIS**: What remains unknown and how it affects confidence
6. **SOURCE AUDIT**: Complete citation trail for all major claims

SYNTHESIS REQUIREMENTS:
- Generate opinionated answer with clear reasoning chain
- Include confidence intervals or uncertainty bounds
- Preserve meaningful disagreements with supporting evidence
- Provide decision-relevant insights, not just information summary
- All major claims must trace to sources in Surface/Deep Research Reports
- Confidence levels must reflect actual evidence strength

VERIFICATION CHECKLIST:
✓ All major claims trace to sources in reports
✓ Disagreements are substantive, not artificial
✓ Answer directly addresses user's clarified intent
✓ Source attributions are accurate and accessible

Respond in JSON format:
{
  "executiveSummary": "direct answer with confidence assessment",
  "evidenceFoundation": [
    {
      "claim": "key fact supporting conclusion",
      "sources": ["source1", "source2"],
      "strength": "high|medium|low",
      "evidenceType": "empirical|theoretical|anecdotal"
    }
  ],
  "reasoningChain": "detailed explanation of how research and dialogue led to conclusions",
  "dissentingViews": [
    {
      "view": "agent disagreement description",
      "evidence": "supporting evidence for dissenting view",
      "confidence": 0.75,
      "agent": "chatgpt|gemini"
    }
  ],
  "uncertaintyAnalysis": "specific unknowns and their impact on confidence",
  "sourceAudit": [
    {
      "type": "peer-reviewed",
      "count": 12,
      "percentage": 60,
      "examples": ["MIT Study 2024", "Stanford Research"]
    }
  ],
  "confidenceInterval": [0.72, 0.88],
  "synthesis": "comprehensive final synthesis report in MARKDOWN format with proper headers, lists, emphasis"
}

SYNTHESIS FORMATTING REQUIREMENTS:
- The "synthesis" field MUST be in full Markdown format
- Use proper headers (# ## ###) for sections
- Use bullet points and numbered lists where appropriate
- Use **bold** for emphasis and *italics* for secondary emphasis
- Include clear section breaks and logical organization
- Make it visually scannable and professionally formatted`;

    const response = await this.anthropic.messages.create({
      model: "claude-3-opus-20240229",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4000,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return JSON.parse(content.text);
    } else {
      throw new Error("Unexpected content type from Anthropic");
    }
  }

  private async devSynthesizeResults(
    surfaceResearchReport: any,
    deepResearchReport: any, 
    dialogueHistory: any,
    userContext: any
  ): Promise<{
    executiveSummary: string;
    evidenceFoundation: any[];
    reasoningChain: string;
    dissentingViews: any[];
    uncertaintyAnalysis: string;
    sourceAudit: any[];
    confidenceInterval: [number, number];
    synthesis: string;
  }> {
    await this.delay(3000);
    
    return {
      executiveSummary: "Large language models will transform knowledge work through augmentation rather than wholesale replacement over the next 3-7 years, with 15-30% productivity gains in routine cognitive tasks but requiring careful implementation and workforce adaptation policies. Confidence: Medium-High (72-85%).",
      
      evidenceFoundation: [
        {
          claim: "14% productivity increase in knowledge work tasks",
          sources: ["MIT Technology Review", "Randomized controlled trial with 2000 participants"],
          strength: "high",
          evidenceType: "empirical"
        },
        {
          claim: "Legal sector shows 40% adoption rate with augmentation focus",
          sources: ["American Bar Association Survey", "3500 legal professionals"],
          strength: "medium",
          evidenceType: "empirical"
        },
        {
          claim: "Economic models predict 300M jobs affected globally",
          sources: ["Goldman Sachs Research", "Economic modeling"],
          strength: "medium",
          evidenceType: "theoretical"
        },
        {
          claim: "Implementation challenges around quality control persist",
          sources: ["Reddit community discussions", "User experience reports"],
          strength: "low",
          evidenceType: "anecdotal"
        }
      ],
      
      reasoningChain: "Surface research established consistent productivity improvements (14-30% gains) across multiple empirical studies, with sector-specific adoption patterns favoring augmentation over replacement. Deep research investigation confirmed policy gaps around transition management. Agent dialogue revealed critical tension between empirical evidence suggesting gradual adoption and economic theory predicting acceleration due to competitive pressures. ChatGPT's inductive analysis of implementation data supported gradual 3-7 year timeline, while Gemini's deductive framework suggested potential acceleration around 2025-2026. Synthesis resolves this by acknowledging both scenarios while emphasizing need for proactive policy preparation.",
      
      dissentingViews: [
        {
          view: "Gemini emphasized rapid acceleration scenario due to competitive pressure",
          evidence: "Economic transformation theory and historical technology adoption curves",
          confidence: 0.74,
          agent: "gemini"
        },
        {
          view: "ChatGPT focused on implementation constraints limiting adoption speed",
          evidence: "Empirical data on organizational adoption patterns and quality control challenges",
          confidence: 0.78,
          agent: "chatgpt"
        }
      ],
      
      uncertaintyAnalysis: "Key uncertainties include: (1) Timeline acceleration due to competitive pressures - economic incentives may force adoption faster than optimal implementation allows; (2) Quality control solution development - mission-critical applications require reliability improvements; (3) Workforce adaptation capacity - effectiveness of reskilling programs at scale remains unproven; (4) Policy intervention timing - regulatory responses may lag behind market developments. These factors create 13-point confidence interval reflecting substantial but manageable uncertainty.",
      
      sourceAudit: [
        {
          type: "peer-reviewed",
          count: 8,
          percentage: 40,
          examples: ["MIT Technology Review Study", "Stanford Workplace Research"]
        },
        {
          type: "primary-industry-data",
          count: 6,
          percentage: 30,
          examples: ["American Bar Association Survey", "Microsoft Copilot Usage Data"]
        },
        {
          type: "economic-analysis",
          count: 4,
          percentage: 20,
          examples: ["Goldman Sachs Research", "McKinsey Industry Reports"]
        },
        {
          type: "social-evidence",
          count: 2,
          percentage: 10,
          examples: ["Reddit Community Discussions", "User Experience Reports"]
        }
      ],
      
      confidenceInterval: [0.72, 0.85],
      
      synthesis: `# Final Synthesis: LLM Impact on Knowledge Work

## Executive Summary

Large language models will fundamentally transform knowledge work over the next 3-7 years through augmentation rather than wholesale replacement, delivering measurable productivity gains while requiring proactive workforce adaptation strategies. The evidence supports cautious optimism about net positive employment effects, with critical dependencies on implementation quality and policy responses.

## Evidence Foundation

### Empirical Productivity Evidence
- **MIT Study Findings**: 14% productivity increase across 2,000 knowledge workers in controlled trials
- **Microsoft Copilot Data**: 70% of users report sustained productivity improvements
- **Task Specificity**: Gains concentrated in routine cognitive work (writing, analysis, coding)

### Adoption Pattern Analysis  
- **Legal Sector Leadership**: 40% early adoption rate with explicit augmentation focus
- **Implementation Challenges**: Quality control and governance framework development remain critical
- **Timeline Indicators**: Industry surveys consistently suggest 3-7 year mainstream integration

### Economic Model Predictions
- **Displacement Estimates**: Goldman Sachs models predict 300M jobs globally affected
- **Contradiction with Reality**: Empirical adoption patterns show augmentation preference
- **Competitive Pressure Factors**: Economic incentives may accelerate adoption beyond comfort zones

## Reasoning Chain

The synthesis emerges from reconciling three information streams:

1. **Surface Research Convergence**: Multiple independent studies demonstrate consistent 15-30% productivity gains in routine cognitive tasks, establishing empirical foundation for transformation claims.

2. **Deep Research Insights**: Policy analysis reveals gap between technological capability and institutional readiness, highlighting critical role of governance frameworks in managing transition.

3. **Agent Dialogue Resolution**: Productive tension between ChatGPT's empirical caution and Gemini's structural urgency illuminates key decision points around timeline assumptions and policy preparation needs.

The evidence supports gradual transformation as the base case, with acceleration scenarios requiring proactive preparation rather than reactive responses.

## Dissenting Views and Synthesis

### ChatGPT Position: Implementation-Constrained Gradual Adoption
- **Core Argument**: Organizational learning curves and quality control requirements will moderate adoption speed
- **Evidence Base**: Real-world implementation challenges and pilot program outcomes
- **Timeline Prediction**: 3-7 years for mainstream integration with sustainable quality

### Gemini Position: Economic-Driven Acceleration
- **Core Argument**: Competitive pressures will force adoption faster than optimal implementation timelines
- **Evidence Base**: Historical technology adoption curves and economic transformation theory  
- **Timeline Prediction**: Potential acceleration around 2025-2026 driven by market forces

### Synthesis Resolution
Both perspectives capture essential dynamics. The gradual adoption scenario assumes rational, coordinated implementation - the economically optimal path. The acceleration scenario reflects competitive market realities that may override individual organizational preferences. **Policy preparation must account for both scenarios**, with immediate workforce adaptation investments regardless of timeline uncertainty.

## Uncertainty Analysis

### Critical Unknowns
1. **Competitive Pressure Tipping Point**: When do market advantages become so compelling that rapid adoption becomes unavoidable?
2. **Quality Control Solutions**: How quickly will reliability improvements enable high-stakes applications?
3. **Workforce Adaptation Effectiveness**: Can reskilling programs operate at sufficient scale and speed?
4. **Policy Response Timing**: Will regulatory frameworks emerge proactively or reactively?

### Impact on Confidence
These uncertainties create meaningful but manageable confidence bounds (72-85%). The lower bound reflects acceleration scenarios and policy failure risks; the upper bound assumes coordinated adaptation and effective governance responses.

## Strategic Implications

### For Organizations
- Begin pilot implementations while developing governance frameworks
- Invest in human-AI collaboration models rather than replacement strategies  
- Prepare for both gradual integration and potential acceleration scenarios

### For Policymakers
- Accelerate workforce transition program development immediately
- Create regulatory frameworks before rather than after mass adoption
- Focus on adaptation support rather than adoption prevention

### For Individuals
- Develop skills that complement rather than compete with LLM capabilities
- Engage with AI tools to understand collaboration patterns
- Prepare for evolving rather than disappearing role definitions

## Source Verification

All major conclusions trace to verified sources: 40% peer-reviewed research, 30% primary industry data, 20% economic analysis, 10% social evidence. Source quality assessments and contradiction analysis support confidence interval bounds.

## Conclusion

The transformation of knowledge work by LLMs represents a manageable but significant transition requiring proactive preparation. Success depends on treating this as a coordination challenge rather than a technological inevitability, with policy responses beginning immediately regardless of timeline uncertainty.`
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
