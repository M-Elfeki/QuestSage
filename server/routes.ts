import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertResearchSessionSchema, insertResearchFindingSchema, insertAgentDialogueSchema } from "@shared/schema";
import { FlashLLMService, ProLLMService } from "./services/llm";

import { ChatGPTAgent, GeminiAgent } from "./services/agents";
import { GoogleSearchService, ArxivSearchService, RedditSearchService, PerplexityService } from "./services/search";
import { configService } from "./services/config";

const flashLLM = new FlashLLMService();
const proLLM = new ProLLMService();
const googleSearch = new GoogleSearchService();
const arxivSearch = new ArxivSearchService();
const redditSearch = new RedditSearchService();
const perplexityService = new PerplexityService();
const chatgptAgent = new ChatGPTAgent();
const geminiAgent = new GeminiAgent();

export async function registerRoutes(app: Express): Promise<Server> {
  // Research Session routes
  app.post("/api/research-sessions", async (req, res) => {
    try {
      const sessionData = insertResearchSessionSchema.parse(req.body);
      const session = await storage.createResearchSession(sessionData);
      res.json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/research-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getResearchSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Research session not found" });
      }
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/research-sessions/:id", async (req, res) => {
    try {
      const session = await storage.updateResearchSession(req.params.id, req.body);
      res.json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // System configuration
  app.get("/api/config", async (req, res) => {
    try {
      const config = configService.getConfig();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/config", async (req, res) => {
    try {
      configService.updateConfig(req.body);
      const config = configService.getConfig();
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Intent clarification
  app.post("/api/clarify-intent", async (req, res) => {
    try {
      const { query } = req.body;
      const clarification = await flashLLM.clarifyIntent(query);
      res.json(clarification);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Research pipeline
  app.post("/api/start-research", async (req, res) => {
    try {
      const { sessionId, clarifiedIntent } = req.body;
      
      // Generate search terms
      const searchPlan = await flashLLM.generateSearchTerms(clarifiedIntent);
      
      // Execute parallel searches
      const [googleResults, arxivResults, redditResults] = await Promise.all([
        googleSearch.search(searchPlan.surfaceTerms?.[0] || "LLM knowledge work impact", 5),
        arxivSearch.search(searchPlan.surfaceTerms?.[0] || "large language models employment", 3),
        redditSearch.search(searchPlan.socialTerms?.[0] || "AI job impact discussion", 3)
      ]);

      // Store research findings
      const allResults = [
        ...googleResults.map((r: any) => ({ ...r, sourceType: "surface" })),
        ...arxivResults.map((r: any) => ({ ...r, sourceType: "surface" })),
        ...redditResults.map((r: any) => ({ ...r, sourceType: "social" }))
      ];

      const findings = [];
      for (const result of allResults) {
        const finding = await storage.createResearchFinding({
          sessionId,
          source: result.source,
          sourceType: result.sourceType,
          title: result.title,
          url: result.url,
          content: result.content,
          snippet: result.snippet,
          relevanceScore: Math.floor(Math.random() * 40) + 60, // Mock scoring
          qualityScore: Math.floor(Math.random() * 30) + 70,
          isContradictory: Math.random() < 0.1,
          metadata: result.metadata
        });
        findings.push(finding);
      }

      // Extract facts
      const factExtraction = await flashLLM.extractFacts(allResults);
      
      // Analyze findings
      const analysis = await proLLM.analyzeResearchFindings(findings);
      
      res.json({
        searchResults: {
          google: { results: googleResults },
          arxiv: { results: arxivResults },
          reddit: { results: redditResults }
        },
        factExtraction,
        analysis,
        findings
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Deep research
  app.post("/api/deep-research", async (req, res) => {
    try {
      const { sessionId, analysis } = req.body;
      
      const deepQuery = await flashLLM.generateDeepResearchQuery(analysis);
      const deepResults = await perplexityService.deepSearch(deepQuery);
      
      // Store deep research findings
      for (const source of deepResults.sources) {
        await storage.createResearchFinding({
          sessionId,
          source: "deepSonar",
          sourceType: "deep",
          title: source.title,
          url: source.url,
          content: source.content,
          snippet: source.content.substring(0, 200),
          relevanceScore: 95,
          qualityScore: 90,
          isContradictory: false,
          metadata: source.metadata
        });
      }
      
      res.json({ query: deepQuery, results: deepResults });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Agent selection
  app.post("/api/select-agents", async (req, res) => {
    try {
      const { researchData, userContext } = req.body;
      const agentConfig = await proLLM.selectAgents(researchData, userContext);
      res.json(agentConfig);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Agent dialogue
  app.post("/api/agent-dialogue", async (req, res) => {
    try {
      const { sessionId, roundNumber, agentConfigs, context } = req.body;
      
      const [chatgptResponse, geminiResponse] = await Promise.all([
        chatgptAgent.generateResponse(context.researchData, agentConfigs.chatgpt, context.previousDialogue || [], "Analyze the research data and provide your perspective"),
        geminiAgent.generateResponse(context.researchData, agentConfigs.gemini, context.previousDialogue || [], "Analyze the research data and provide your perspective")
      ]);

      // Store dialogue responses
      const chatgptDialogue = await storage.createAgentDialogue({
        sessionId,
        roundNumber,
        agentType: "chatgpt",
        agentConfig: agentConfigs.chatgpt,
        message: chatgptResponse.content,
        reasoning: chatgptResponse.reasoning,
        confidenceScore: chatgptResponse.confidence,
        sources: chatgptResponse.sources
      });

      const geminiDialogue = await storage.createAgentDialogue({
        sessionId,
        roundNumber,
        agentType: "gemini", 
        agentConfig: agentConfigs.gemini,
        message: geminiResponse.content,
        reasoning: geminiResponse.reasoning,
        confidenceScore: geminiResponse.confidence,
        sources: geminiResponse.sources
      });

      res.json({
        chatgpt: chatgptDialogue,
        gemini: geminiDialogue
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dialogue evaluation
  app.post("/api/evaluate-dialogue", async (req, res) => {
    try {
      const { context } = req.body;
      const evaluation = await proLLM.evaluateDialogueRound(context);
      res.json(evaluation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Final synthesis
  app.post("/api/synthesize", async (req, res) => {
    try {
      const { researchData, dialogueHistory } = req.body;
      const synthesis = await proLLM.synthesizeResults(researchData, dialogueHistory);
      res.json(synthesis);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get research findings
  app.get("/api/research-sessions/:id/findings", async (req, res) => {
    try {
      const findings = await storage.getResearchFindings(req.params.id);
      res.json(findings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get agent dialogues
  app.get("/api/research-sessions/:id/dialogues", async (req, res) => {
    try {
      const dialogues = await storage.getAgentDialogues(req.params.id);
      res.json(dialogues);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Essay generation for follow-up questions
  app.post("/api/generate-essay", async (req, res) => {
    try {
      const { sessionId, question, researchData } = req.body;
      
      // Use Pro LLM for essay generation
      const essayPrompt = `Based on the comprehensive research data provided, write a detailed essay answering this follow-up question: "${question}"

Research Context: ${JSON.stringify(researchData)}

Please provide:
1. A clear thesis statement
2. Structured arguments with evidence
3. Consideration of counterarguments
4. Well-supported conclusions
5. Proper attribution to sources

Write in an engaging, informative style suitable for an educated audience.`;

      let essayContent;
      if (configService.isRealMode() && (proLLM as any).anthropic) {
        const response = await (proLLM as any).anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          messages: [{ role: "user", content: essayPrompt }],
          max_tokens: 3000,
        });
        essayContent = response.content[0].text;
      } else {
        // Mock essay response
        essayContent = `# Understanding the Timeline of LLM Impact on Knowledge Work

## Introduction

The question of when and how large language models will transform knowledge work sectors represents one of the most significant economic and social challenges of our time. Based on comprehensive research across academic studies, industry reports, and real-world implementation experiences, several key patterns emerge that help us understand both the opportunities and risks ahead.

## The Evidence for Gradual Transformation

Current empirical data strongly supports a model of gradual transformation rather than sudden displacement. Studies from MIT and Stanford consistently show 15-30% productivity gains in routine cognitive tasks like coding, writing, and data analysis. However, these gains appear most pronounced in tasks that complement rather than replace human judgment.

The evidence suggests that organizations implementing LLM tools strategically - with proper training and integration - see sustainable productivity improvements without significant job losses. Early adopter companies report workforce augmentation patterns, where AI tools enhance human capabilities rather than substitute for them.

## Structural Risks and Timeline Acceleration

However, we must also consider the structural economic pressures that could accelerate adoption beyond comfortable adaptation timelines. As LLM capabilities improve and costs decrease, competitive pressures may force rapid implementation even in organizations unprepared for thoughtful integration.

The concern isn't whether LLMs will transform knowledge work - the evidence clearly indicates they will. The question is whether the transformation will occur gradually enough to allow for reskilling, social adaptation, and policy responses.

## Sector-Specific Variations

Different knowledge work sectors face varying levels of transformation risk and timeline pressure. Legal research, content creation, and basic analysis may see faster adoption, while strategic decision-making, creative problem-solving, and interpersonal roles may maintain stronger human advantages.

## Conclusion

The research suggests we're in a critical transition period where proactive planning and policy development can significantly influence whether LLM integration becomes a positive economic transformation or a source of widespread disruption. The key is maintaining focus on human-AI collaboration models while preparing for potential acceleration in adoption timelines.`;
      }

      res.json({ essay: essayContent });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
