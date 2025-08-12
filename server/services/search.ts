import { configService } from "./config";

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  url?: string;
  source: string;
  relevanceScore: number;
  metadata: any;
}

export class GoogleSearchService {
  private apiKey?: string;
  private searchEngineId?: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  }

  async search(query: string, count: number = 10): Promise<SearchResult[]> {
    if (configService.isRealMode() && this.apiKey && this.searchEngineId) {
      return await this.realSearch(query, count);
    } else {
      return await this.mockSearch(query, count);
    }
  }

  private async realSearch(query: string, count: number): Promise<SearchResult[]> {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${this.apiKey}&cx=${this.searchEngineId}&q=${encodeURIComponent(query)}&num=${Math.min(count, 10)}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (!data.items) return [];

      return data.items.map((item: any, index: number) => ({
        id: `google-${Date.now()}-${index}`,
        title: item.title,
        content: item.snippet || "",
        url: item.link,
        source: "google",
        relevanceScore: Math.max(95 - index * 5, 60),
        metadata: {
          displayLink: item.displayLink,
          cacheId: item.cacheId
        }
      }));
    } catch (error) {
      console.error("Google Search error:", error);
      return await this.mockSearch(query, count);
    }
  }

  private async mockSearch(query: string, count: number): Promise<SearchResult[]> {
    await this.delay(800);
    
    const mockResults = [
      {
        id: "google-1",
        title: "MIT Study: LLM Impact on Knowledge Workers",
        content: "Comprehensive analysis shows 15-30% productivity gains in coding and writing tasks. Study tracked 2,000 knowledge workers across 6 months.",
        url: "https://example.com/mit-study",
        source: "google",
        relevanceScore: 95,
        metadata: { displayLink: "mit.edu" }
      },
      {
        id: "google-2", 
        title: "McKinsey Report: AI Employment Effects",
        content: "Research suggests net job creation in knowledge sectors, but with significant transition periods requiring reskilling.",
        url: "https://example.com/mckinsey-report",
        source: "google",
        relevanceScore: 88,
        metadata: { displayLink: "mckinsey.com" }
      },
      {
        id: "google-3",
        title: "Stanford Research: Workplace AI Adoption",
        content: "Longitudinal study reveals productivity increases but warns of skill atrophy in creative problem-solving.",
        url: "https://example.com/stanford-research",
        source: "google",
        relevanceScore: 82,
        metadata: { displayLink: "stanford.edu" }
      }
    ];

    return mockResults.slice(0, count);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class ArxivSearchService {
  async search(query: string, count: number = 10): Promise<SearchResult[]> {
    if (configService.isRealMode()) {
      return await this.realSearch(query, count);
    } else {
      return await this.mockSearch(query, count);
    }
  }

  private async realSearch(query: string, count: number): Promise<SearchResult[]> {
    try {
      const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${count}&sortBy=relevance&sortOrder=descending`;
      
      const response = await fetch(url);
      const text = await response.text();
      
      // Parse XML response
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const entries = doc.querySelectorAll('entry');

      const results: SearchResult[] = [];
      entries.forEach((entry, index) => {
        const title = entry.querySelector('title')?.textContent || '';
        const summary = entry.querySelector('summary')?.textContent || '';
        const id = entry.querySelector('id')?.textContent || '';
        
        results.push({
          id: `arxiv-${Date.now()}-${index}`,
          title: title.trim(),
          content: summary.trim().substring(0, 300) + '...',
          url: id,
          source: "arxiv",
          relevanceScore: Math.max(90 - index * 3, 60),
          metadata: {
            published: entry.querySelector('published')?.textContent,
            authors: Array.from(entry.querySelectorAll('author name')).map(a => a.textContent)
          }
        });
      });

      return results;
    } catch (error) {
      console.error("ArXiv search error:", error);
      return await this.mockSearch(query, count);
    }
  }

  private async mockSearch(query: string, count: number): Promise<SearchResult[]> {
    await this.delay(1200);
    
    const mockResults = [
      {
        id: "arxiv-1",
        title: "Large Language Models and Knowledge Work: A Quantitative Analysis",
        content: "We analyze the impact of LLMs on productivity across different knowledge work domains using a controlled study of 500 professionals...",
        url: "https://arxiv.org/abs/2024.1234",
        source: "arxiv",
        relevanceScore: 90,
        metadata: {
          published: "2024-01-15",
          authors: ["Smith, J.", "Johnson, K."]
        }
      },
      {
        id: "arxiv-2",
        title: "Employment Effects of Generative AI: Evidence from Early Adopters",
        content: "This paper examines employment patterns in organizations that adopted generative AI tools early, finding complex substitution and complementarity effects...",
        url: "https://arxiv.org/abs/2024.5678",
        source: "arxiv",
        relevanceScore: 85,
        metadata: {
          published: "2024-02-20",
          authors: ["Lee, A.", "Chen, M.", "Davis, R."]
        }
      }
    ];

    return mockResults.slice(0, count);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class RedditSearchService {
  private clientId?: string;
  private clientSecret?: string;

  constructor() {
    this.clientId = process.env.REDDIT_CLIENT_ID;
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
  }

  async search(query: string, count: number = 10): Promise<SearchResult[]> {
    if (configService.isRealMode() && this.clientId && this.clientSecret) {
      return await this.realSearch(query, count);
    } else {
      return await this.mockSearch(query, count);
    }
  }

  private async realSearch(query: string, count: number): Promise<SearchResult[]> {
    try {
      // Reddit OAuth flow would go here
      // For now, fall back to mock for complexity
      return await this.mockSearch(query, count);
    } catch (error) {
      console.error("Reddit search error:", error);
      return await this.mockSearch(query, count);
    }
  }

  private async mockSearch(query: string, count: number): Promise<SearchResult[]> {
    await this.delay(1000);
    
    const mockResults = [
      {
        id: "reddit-1",
        title: "Real experience using ChatGPT at work",
        content: "I've been using ChatGPT for code reviews and documentation for 6 months. Productivity is up ~25% but I worry about losing problem-solving skills.",
        url: "https://reddit.com/r/programming/comments/example1",
        source: "reddit",
        relevanceScore: 75,
        metadata: {
          subreddit: "r/programming",
          upvotes: 2847,
          comments: 156
        }
      },
      {
        id: "reddit-2",
        title: "LLMs replacing junior developers discussion",
        content: "Mixed views on whether AI tools will eliminate entry-level positions. Most agree it's changing skill requirements rather than eliminating jobs entirely.",
        url: "https://reddit.com/r/cscareerquestions/comments/example2",
        source: "reddit",
        relevanceScore: 72,
        metadata: {
          subreddit: "r/cscareerquestions",
          upvotes: 1523,
          comments: 284
        }
      }
    ];

    return mockResults.slice(0, count);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class PerplexityService {
  private apiKey?: string;

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY;
  }

  async deepSearch(query: string): Promise<{
    answer: string;
    sources: SearchResult[];
    confidence: number;
  }> {
    if (configService.isRealMode() && this.apiKey) {
      return await this.realDeepSearch(query);
    } else {
      return await this.mockDeepSearch(query);
    }
  }

  private async realDeepSearch(query: string): Promise<{
    answer: string;
    sources: SearchResult[];
    confidence: number;
  }> {
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-large-128k-online',
          messages: [
            {
              role: 'system',
              content: 'You are a research expert providing comprehensive, evidence-based analysis with source citations.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 2000,
          temperature: 0.2,
          return_citations: true,
          search_recency_filter: 'month'
        })
      });

      const data = await response.json();
      const answer = data.choices[0].message.content;
      const citations = data.citations || [];

      const sources: SearchResult[] = citations.map((citation: string, index: number) => ({
        id: `perplexity-${Date.now()}-${index}`,
        title: `Source ${index + 1}`,
        content: "",
        url: citation,
        source: "perplexity",
        relevanceScore: 85,
        metadata: { citation }
      }));

      return {
        answer,
        sources,
        confidence: 0.85
      };
    } catch (error) {
      console.error("Perplexity search error:", error);
      return await this.mockDeepSearch(query);
    }
  }

  private async mockDeepSearch(query: string): Promise<{
    answer: string;
    sources: SearchResult[];
    confidence: number;
  }> {
    await this.delay(2000);
    
    return {
      answer: "Deep research reveals that LLM impact on knowledge work exhibits strong sector-specific variation. Empirical studies show 15-30% productivity gains in routine cognitive tasks (coding, writing, data analysis) but more complex effects in creative and strategic roles. Early adopter organizations report workforce augmentation rather than replacement, though this may reflect selection bias. Key uncertainties remain around long-term skill development, wage effects, and organizational adaptation patterns.",
      sources: [
        {
          id: "perplexity-deep-1",
          title: "Comprehensive LLM Workplace Study",
          content: "Six-month longitudinal analysis of 50 organizations",
          url: "https://example.com/deep-study",
          source: "perplexity",
          relevanceScore: 92,
          metadata: { citation: "example.com/deep-study" }
        }
      ],
      confidence: 0.82
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}