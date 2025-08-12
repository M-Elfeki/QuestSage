export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
  metadata?: any;
}

export interface SearchResponse {
  results: SearchResult[];
  count: number;
  processingTime: number;
}

export class SearchService {
  async searchGoogle(terms: string[]): Promise<SearchResponse> {
    await this.delay(1500);
    
    const mockResults: SearchResult[] = [
      {
        title: "AI Impact on Knowledge Work: 2024 Industry Analysis",
        url: "https://example.com/ai-knowledge-work-2024",
        snippet: "Comprehensive study shows 15-30% productivity improvements in coding, writing, and analytical tasks across 500+ organizations.",
        content: "Full article content would be here...",
        metadata: { domain: "example.com", publishDate: "2024-01-15", author: "Research Institute" }
      },
      {
        title: "Large Language Models Transform Financial Services Sector",
        url: "https://fintech.com/llm-finance-transformation", 
        snippet: "Early adoption in financial services shows mixed results, with compliance and risk management roles seeing automation pressure.",
        content: "Detailed analysis of LLM adoption...",
        metadata: { domain: "fintech.com", publishDate: "2024-02-08", author: "FinTech Today" }
      }
    ];

    // Only return results if they contain useful, non-empty articles
    const filteredResults = mockResults.filter(result => 
      result.content && result.content.length > 100
    );

    return {
      results: filteredResults,
      count: 47,
      processingTime: 1500
    };
  }

  async searchArxiv(terms: string[]): Promise<SearchResponse> {
    await this.delay(1200);
    
    return {
      results: [
        {
          title: "Large Language Models and Labor Market Dynamics: An Empirical Analysis",
          url: "https://arxiv.org/abs/2401.12345",
          snippet: "We analyze the impact of LLM deployment across 12 sectors using longitudinal employment data from 2022-2024.",
          content: "Abstract: This paper presents a comprehensive empirical analysis...",
          metadata: { authors: ["Smith, J.", "Doe, A."], publishDate: "2024-01-20", citations: 45 }
        }
      ],
      count: 23,
      processingTime: 1200
    };
  }

  async searchReddit(subreddits: string[], terms: string[]): Promise<SearchResponse> {
    await this.delay(1800);
    
    return {
      results: [
        {
          title: "My company just deployed ChatGPT for all developers - productivity results after 6 months",
          url: "https://reddit.com/r/MachineLearning/comments/abc123",
          snippet: "Detailed analysis of productivity metrics, code quality, and developer satisfaction after GPT-4 deployment.",
          content: "Long reddit post with detailed metrics and analysis...",
          metadata: { subreddit: "MachineLearning", score: 245, comments: 89, author: "dev_lead_2024" }
        }
      ],
      count: 156,
      processingTime: 1800
    };
  }

  async searchTwitter(accounts: string[], terms: string[]): Promise<SearchResponse> {
    await this.delay(1600);
    
    return {
      results: [
        {
          title: "Thread: Real-world LLM productivity data from 50+ engineering teams",
          url: "https://twitter.com/researcher123/status/1234567890",
          snippet: "Compiled data from Q4 2023 - Q1 2024 showing consistent 20-25% productivity gains in software engineering tasks.",
          content: "Twitter thread with detailed productivity statistics...",
          metadata: { author: "@researcher123", engagement: 89, retweets: 234, date: "2024-02-15" }
        }
      ],
      count: 89,
      processingTime: 1600
    };
  }

  async callDeepSonar(query: string): Promise<{
    findings: string;
    sources: SearchResult[];
    confidence: number;
    processingTime: number;
  }> {
    await this.delay(8000);
    
    return {
      findings: "Deep research reveals three key contradictory patterns: 1) Productivity studies show consistent gains but measure different metrics, 2) Job displacement fears are not reflected in current employment data, 3) Sector-specific adoption creates highly variable outcomes with legal and healthcare showing resistance while tech and finance show rapid integration.",
      sources: [
        {
          title: "Longitudinal Study of AI Tool Adoption in Knowledge Work",
          url: "https://research.institute/ai-adoption-longitudinal",
          snippet: "12-month study tracking 1,000+ knowledge workers across multiple sectors",
          content: "Comprehensive longitudinal analysis...",
          metadata: { credibility: "high", methodology: "peer-reviewed", sampleSize: 1000 }
        }
      ],
      confidence: 0.87,
      processingTime: 8000
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
