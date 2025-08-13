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

export class WebScrapingService {
  private maxResults: number;
  private delay: number;
  private userAgent: string;

  constructor() {
    this.maxResults = 15;
    this.delay = 1000; // 1 second delay between requests
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  async search(query: string, count: number = 10): Promise<SearchResult[]> {
    if (configService.isRealMode()) {
      return await this.realSearch(query, count);
    } else {
      return await this.mockSearch(query, count);
    }
  }

  async searchMultipleTerms(searchTerms: string[], maxResultsPerTerm: number = 10, progressCallback?: (progress: number, total: number, currentTerm: string) => void): Promise<SearchResult[]> {
    console.log(`🔍 Web search: Processing ${searchTerms.length} search terms with ${maxResultsPerTerm} results per term`);
    
    const allResults: SearchResult[] = [];
    
    for (let i = 0; i < searchTerms.length; i++) {
      const term = searchTerms[i];
      
      if (progressCallback) {
        progressCallback(i, searchTerms.length, term);
      }
      
      try {
        console.log(`🔍 Web searching term ${i + 1}/${searchTerms.length}: "${term}"`);
        
        if (configService.isRealMode()) {
          const termResults = await this.realSearch(term, maxResultsPerTerm);
          allResults.push(...termResults);
        } else {
          // In dev mode, generate diverse mock results for each term
          const mockResults = await this.mockSearchSingleTerm(term, maxResultsPerTerm);
          allResults.push(...mockResults);
        }
        
        // Rate limiting between search terms
        if (i < searchTerms.length - 1) {
          await this.delay_ms(2000); // 2 second delay between terms
        }
      } catch (error) {
        console.error(`Error searching term "${term}":`, error);
        // Continue with next term
        continue;
      }
    }
    
    // Remove duplicates based on URL
    const uniqueResults = this.removeDuplicates(allResults);
    
    console.log(`🔍 Web search completed: ${uniqueResults.length} unique results from ${searchTerms.length} terms`);
    
    if (progressCallback) {
      progressCallback(searchTerms.length, searchTerms.length, "Completed");
    }
    
    return uniqueResults;
  }

  private removeDuplicates(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      if (result.url && seen.has(result.url)) {
        return false;
      }
      if (result.url) {
        seen.add(result.url);
      }
      return true;
    });
  }

  private async realSearch(query: string, count: number): Promise<SearchResult[]> {
    if (!query || !query.trim()) {
      console.warn("Empty query provided to web scraper");
      return [];
    }

    query = query.trim();
    console.log(`Web scraping search for: ${query}`);

    const searchResults: Map<string, string> = new Map();
    
    // Try different search sources in sequence
    const sources = [
      () => this.searchDuckDuckGo(query),
      () => this.searchBing(query),
      () => this.searchRedditSearch(query)
    ];

    for (const sourceFunc of sources) {
      try {
        const results = await sourceFunc();
        if (results && results.size > 0) {
          // Add results to our map
          for (const [url, content] of Array.from(results.entries())) {
            if (!searchResults.has(url)) {
              searchResults.set(url, content);
            }
          }
          
          // Stop if we have enough results
          if (searchResults.size >= Math.min(count, this.maxResults)) {
            break;
          }
        }
        
        // Rate limiting delay
        await this.delay_ms(this.delay);
      } catch (error) {
        console.error(`Error with search source:`, error);
        continue;
      }
    }

    // Convert to SearchResult format
    const validatedResults = this.validateAndFormatResults(searchResults, count);
    console.log(`Web scraper found ${validatedResults.length} valid results`);
    
    return validatedResults;
  }

  private async searchDuckDuckGo(query: string): Promise<Map<string, string>> {
    try {
      const url = 'https://duckduckgo.com/html/';
      const params = new URLSearchParams({ q: query });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${url}?${params}`, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`DuckDuckGo returned ${response.status}`);
      }

      const html = await response.text();
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      
      const results = new Map<string, string>();
      
      // Find result links
      $('.result__a').each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        
        if (href && href.startsWith('http')) {
          const title = $link.text().trim();
          const $snippet = $link.closest('.result').find('.result__snippet');
          const snippet = $snippet.text().trim();
          
          const content = `${title}\n\n${snippet}`.trim();
          
          if (content && content.length > 30) {
            results.set(href, content.substring(0, 500));
          }
        }
      });

      return results;
    } catch (error) {
      console.error("DuckDuckGo search failed:", error);
      return new Map();
    }
  }

  private async searchBing(query: string): Promise<Map<string, string>> {
    try {
      const url = 'https://www.bing.com/search';
      const params = new URLSearchParams({ q: query, count: '10' });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${url}?${params}`, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Bing returned ${response.status}`);
      }

      const html = await response.text();
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      
      const results = new Map<string, string>();
      
      // Find Bing result links
      $('.b_algo').each((_, element) => {
        const $result = $(element);
        const $title = $result.find('h2 a');
        const $snippet = $result.find('.b_caption p, .b_snippet');
        
        const href = $title.attr('href');
        const title = $title.text().trim();
        const snippet = $snippet.text().trim();
        
        if (href && href.startsWith('http') && title && snippet) {
          const content = `${title}\n\n${snippet}`.trim();
          if (content.length > 30) {
            results.set(href, content.substring(0, 500));
          }
        }
      });

      return results;
    } catch (error) {
      console.error("Bing search failed:", error);
      return new Map();
    }
  }

  private async searchRedditSearch(query: string): Promise<Map<string, string>> {
    try {
      const url = 'https://www.reddit.com/search.json';
      const params = new URLSearchParams({ 
        q: query, 
        limit: '10', 
        sort: 'relevance',
        t: 'week'
      });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${url}?${params}`, {
        headers: {
          'User-Agent': this.userAgent
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Reddit search returned ${response.status}`);
      }

      const data = await response.json();
      const results = new Map<string, string>();
      
      if (data.data && data.data.children) {
        for (const post of data.data.children) {
          const postData = post.data;
          const url = postData.url;
          const title = postData.title || '';
          const selftext = postData.selftext || '';
          
          if (url && url.startsWith('http') && title) {
            const content = `${title}\n\n${selftext}`.trim();
            if (content.length > 20) {
              results.set(url, content.substring(0, 500));
            }
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error("Reddit search failed:", error);
      return new Map();
    }
  }

  private validateAndFormatResults(results: Map<string, string>, count: number): SearchResult[] {
    const validatedResults: SearchResult[] = [];
    let index = 0;
    
    for (const [url, content] of Array.from(results.entries())) {
      if (validatedResults.length >= count) break;
      
      // Validate URL
      if (!this.isValidUrl(url)) continue;
      
      // Validate content
      if (!this.hasMeaningfulContent(content)) continue;
      
      // Extract title from content (first line typically)
      const lines = content.split('\n').filter((line: string) => line.trim().length > 0);
      const title = lines[0] || 'Web Result';
      const bodyContent = lines.slice(1).join('\n').trim() || content;
      
      validatedResults.push({
        id: `web-${Date.now()}-${index++}`,
        title: title.substring(0, 200),
        content: bodyContent.substring(0, 500),
        url: url,
        source: "web",
        relevanceScore: Math.max(90 - validatedResults.length * 5, 60),
        metadata: {
          domain: this.extractDomain(url),
          contentLength: content.length,
          scrapedAt: new Date().toISOString()
        }
      });
    }
    
    return validatedResults;
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  private hasMeaningfulContent(text: string): boolean {
    if (!text) return false;
    
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (cleanText.length < 20) return false;
    
    // Check for meaningless patterns
    const meaninglessPatterns = [
      /^\s*$/,
      /^\s*[^\w\s]*\s*$/,
      /^\s*loading\s*$/i,
      /^\s*error\s*$/i,
      /^\s*404\s*$/i,
      /^\s*not found\s*$/i
    ];
    
    return !meaninglessPatterns.some(pattern => pattern.test(cleanText));
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  private async delay_ms(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async mockSearch(query: string, count: number): Promise<SearchResult[]> {
    await this.delay_ms(800);
    
    const mockResults = [
      {
        id: "web-1",
        title: "AI in the Workplace: Latest Research Findings",
        content: "Recent studies show that artificial intelligence is transforming workplace productivity across multiple sectors. Employees report increased efficiency while learning to work alongside AI systems.",
        url: "https://example.com/ai-workplace-research",
        source: "web",
        relevanceScore: 95,
        metadata: { domain: "example.com", contentLength: 150, scrapedAt: new Date().toISOString() }
      },
      {
        id: "web-2", 
        title: "Machine Learning Applications in Knowledge Work",
        content: "Organizations worldwide are implementing machine learning tools to enhance knowledge worker productivity. Early adopters report significant gains in data analysis and decision-making processes.",
        url: "https://example.com/ml-knowledge-work",
        source: "web",
        relevanceScore: 88,
        metadata: { domain: "example.com", contentLength: 180, scrapedAt: new Date().toISOString() }
      },
      {
        id: "web-3",
        title: "Future of Work: Human-AI Collaboration",
        content: "Industry experts discuss the evolving landscape of human-AI collaboration, highlighting both opportunities and challenges for the modern workplace.",
        url: "https://example.com/future-work-ai",
        source: "web",
        relevanceScore: 82,
        metadata: { domain: "example.com", contentLength: 140, scrapedAt: new Date().toISOString() }
      }
    ];

    return mockResults.slice(0, count);
  }

  private async mockSearchSingleTerm(term: string, count: number): Promise<SearchResult[]> {
    await this.delay_ms(400 + Math.random() * 600); // Variable delay for realism
    
    // Generate diverse mock results based on the search term
    const baseResults = [
      {
        titleTemplate: "Research Study: {term} Impact Analysis",
        contentTemplate: "Comprehensive analysis of {term} reveals significant insights into workplace transformation and productivity implications.",
        domain: "research-institute.org"
      },
      {
        titleTemplate: "{term} Implementation Guide for Enterprises", 
        contentTemplate: "Best practices for implementing {term} in enterprise environments, including case studies and lessons learned.",
        domain: "enterprise-tech.com"
      },
      {
        titleTemplate: "Economic Effects of {term} on Labor Markets",
        contentTemplate: "Economic research examining the broader implications of {term} adoption across different industry sectors.",
        domain: "economic-journal.org"
      },
      {
        titleTemplate: "Industry Survey: {term} Adoption Trends",
        contentTemplate: "Latest industry survey data on {term} adoption rates, challenges, and success factors across organizations.",
        domain: "industry-insights.com"
      },
      {
        titleTemplate: "{term} Case Study: Real-World Results",
        contentTemplate: "Detailed case study examining the practical implementation and outcomes of {term} in a large organization.",
        domain: "business-cases.net"
      }
    ];

    const mockResults: SearchResult[] = [];
    const termFormatted = term.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    for (let i = 0; i < Math.min(count, baseResults.length); i++) {
      const template = baseResults[i];
      const id = `web-${term.slice(0, 10).replace(/\s+/g, '-')}-${i + 1}`;
      
      mockResults.push({
        id,
        title: template.titleTemplate.replace(/\{term\}/g, termFormatted),
        content: template.contentTemplate.replace(/\{term\}/g, termFormatted),
        url: `https://${template.domain}/${termFormatted.replace(/\s+/g, '-')}-${i + 1}`,
        source: "web",
        relevanceScore: Math.max(95 - (i * 3) - Math.floor(Math.random() * 10), 70),
        metadata: { 
          domain: template.domain, 
          contentLength: 150 + Math.floor(Math.random() * 200), 
          scrapedAt: new Date().toISOString(),
          searchTerm: term
        }
      });
    }
    
    return mockResults;
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

  async searchMultipleTerms(searchTerms: string[], maxResultsPerTerm: number = 10, progressCallback?: (progress: number, total: number, currentTerm: string) => void): Promise<SearchResult[]> {
    console.log(`📚 arXiv search: Processing ${searchTerms.length} search terms with ${maxResultsPerTerm} results per term`);
    
    const allResults: SearchResult[] = [];
    
    for (let i = 0; i < searchTerms.length; i++) {
      const term = searchTerms[i];
      
      if (progressCallback) {
        progressCallback(i, searchTerms.length, term);
      }
      
      try {
        console.log(`📚 arXiv searching term ${i + 1}/${searchTerms.length}: "${term}"`);
        
        if (configService.isRealMode()) {
          const termResults = await this.realSearch(term, maxResultsPerTerm);
          allResults.push(...termResults);
        } else {
          // In dev mode, generate diverse mock results for each term
          const mockResults = await this.mockSearchSingleTerm(term, maxResultsPerTerm);
          allResults.push(...mockResults);
        }
        
        // Rate limiting between search terms
        if (i < searchTerms.length - 1) {
          await this.delay(1500); // 1.5 second delay between terms
        }
      } catch (error) {
        console.error(`Error searching arXiv term "${term}":`, error);
        // Continue with next term
        continue;
      }
    }
    
    // Remove duplicates based on URL
    const uniqueResults = this.removeDuplicates(allResults);
    
    console.log(`📚 arXiv search completed: ${uniqueResults.length} unique results from ${searchTerms.length} terms`);
    
    if (progressCallback) {
      progressCallback(searchTerms.length, searchTerms.length, "Completed");
    }
    
    return uniqueResults;
  }

  private removeDuplicates(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      if (result.url && seen.has(result.url)) {
        return false;
      }
      if (result.url) {
        seen.add(result.url);
      }
      return true;
    });
  }

  private async realSearch(query: string, count: number): Promise<SearchResult[]> {
    try {
      const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${count}&sortBy=submittedDate&sortOrder=descending`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`ArXiv API error: ${response.status} ${response.statusText}`);
      }
      
      const text = await response.text();
      
      // Use XML parser compatible with Node.js
      const { XMLParser } = await import('fast-xml-parser');
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        parseTagValue: false,
        parseAttributeValue: false,
        trimValues: true
      });
      
      const xmlDoc = parser.parse(text);
      const feed = xmlDoc.feed;
      
      if (!feed || !feed.entry) {
        return [];
      }
      
      // Handle single entry or array of entries
      const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
      
      const results: SearchResult[] = [];
      entries.forEach((entry: any, index: number) => {
        const title = entry.title || '';
        const summary = entry.summary || '';
        const id = entry.id || '';
        const published = entry.published || '';
        
        // Handle authors (can be single author or array)
        let authors: string[] = [];
        if (entry.author) {
          if (Array.isArray(entry.author)) {
            authors = entry.author.map((author: any) => author.name || '');
          } else {
            authors = [entry.author.name || ''];
          }
        }
        
        // Handle categories
        let categories: string[] = [];
        if (entry.category) {
          if (Array.isArray(entry.category)) {
            categories = entry.category.map((cat: any) => cat["@_term"] || '');
          } else {
            categories = [entry.category["@_term"] || ''];
          }
        }
        
        results.push({
          id: `arxiv-${Date.now()}-${index}`,
          title: title.trim(),
          content: summary.trim().substring(0, 500) + (summary.length > 500 ? '...' : ''),
          url: id,
          source: "arxiv",
          relevanceScore: Math.max(90 - index * 3, 60),
          metadata: {
            published: published,
            authors: authors.filter(author => author.length > 0),
            categories: categories.filter(cat => cat.length > 0),
            arxivId: id.split('/').pop() || id
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

  private async mockSearchSingleTerm(term: string, count: number): Promise<SearchResult[]> {
    await this.delay(800 + Math.random() * 800); // Variable delay for realism
    
    // Generate diverse mock arXiv results based on the search term
    const baseResults = [
      {
        titleTemplate: "{term}: A Comprehensive Survey and Analysis",
        contentTemplate: "This paper provides a comprehensive survey of {term} research, analyzing current approaches and identifying future research directions.",
        category: "cs.AI"
      },
      {
        titleTemplate: "Economic Impact Assessment of {term} on Labor Markets", 
        contentTemplate: "We present an empirical analysis of {term} adoption effects on employment patterns across different industry sectors.",
        category: "econ.GN"
      },
      {
        titleTemplate: "Quantitative Analysis of {term} Performance in Enterprise Settings",
        contentTemplate: "Large-scale controlled study examining {term} implementation outcomes across 100+ organizations.",
        category: "cs.CY"
      },
      {
        titleTemplate: "{term} and Human-Computer Interaction: User Experience Studies",
        contentTemplate: "Investigation of human factors and usability considerations in {term} deployment for knowledge work.",
        category: "cs.HC"
      },
      {
        titleTemplate: "Statistical Methods for Evaluating {term} Effectiveness",
        contentTemplate: "Novel statistical approaches for measuring and analyzing the effectiveness of {term} in workplace environments.",
        category: "stat.AP"
      }
    ];

    const mockResults: SearchResult[] = [];
    const termFormatted = term.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    
    for (let i = 0; i < Math.min(count, baseResults.length); i++) {
      const template = baseResults[i];
      const id = `arxiv-${term.slice(0, 8).replace(/\s+/g, '-')}-${i + 1}`;
      const arxivId = `2024.${String(Math.floor(Math.random() * 9000) + 1000)}`;
      
      mockResults.push({
        id,
        title: template.titleTemplate.replace(/\{term\}/g, termFormatted),
        content: template.contentTemplate.replace(/\{term\}/g, termFormatted),
        url: `https://arxiv.org/abs/${arxivId}`,
        source: "arxiv",
        relevanceScore: Math.max(90 - (i * 2) - Math.floor(Math.random() * 8), 75),
        metadata: {
          published: `2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
          authors: [`Author ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`, `Researcher ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`],
          category: template.category,
          arxivId,
          searchTerm: term
        }
      });
    }
    
    return mockResults;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class RedditSearchService {
  private clientId?: string;
  private clientSecret?: string;
  private userAgent: string;

  constructor() {
    this.clientId = process.env.REDDIT_CLIENT_ID;
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
    this.userAgent = process.env.REDDIT_USER_AGENT || "QuestSage/1.0";
  }

  async search(query: string, count: number = 10): Promise<SearchResult[]> {
    if (configService.isRealMode() && this.clientId && this.clientSecret) {
      return await this.realSearch(query, count);
    } else {
      return await this.mockSearch(query, count);
    }
  }

  async searchMultipleSubreddits(subreddits: string[], maxPostsPerSubreddit: number = 50, maxCommentsPerPost: number = 100, progressCallback?: (progress: number, total: number, currentSubreddit: string) => void): Promise<SearchResult[]> {
    console.log(`🔍 Reddit search: Processing ${subreddits.length} subreddits with ${maxPostsPerSubreddit} posts (${maxCommentsPerPost} comments each)`);
    
    const allResults: SearchResult[] = [];
    
    for (let i = 0; i < subreddits.length; i++) {
      const subreddit = subreddits[i];
      
      if (progressCallback) {
        progressCallback(i, subreddits.length, subreddit);
      }
      
      try {
        console.log(`🔍 Reddit searching subreddit ${i + 1}/${subreddits.length}: r/${subreddit}`);
        
        if (configService.isRealMode() && this.clientId && this.clientSecret) {
          const subredditResults = await this.realSearchSubreddit(subreddit, maxPostsPerSubreddit, maxCommentsPerPost);
          allResults.push(...subredditResults);
        } else {
          // In dev mode, generate diverse mock results for each subreddit
          const mockResults = await this.mockSearchSingleSubreddit(subreddit, maxPostsPerSubreddit, maxCommentsPerPost);
          allResults.push(...mockResults);
        }
        
        // Rate limiting between subreddits
        if (i < subreddits.length - 1) {
          await this.delay(2000); // 2 second delay between subreddits
        }
      } catch (error) {
        console.error(`Error searching subreddit r/${subreddit}:`, error);
        // Continue with next subreddit
        continue;
      }
    }
    
    // Remove duplicates based on URL
    const uniqueResults = this.removeDuplicatesReddit(allResults);
    
    console.log(`🔍 Reddit search completed: ${uniqueResults.length} unique results from ${subreddits.length} subreddits`);
    
    if (progressCallback) {
      progressCallback(subreddits.length, subreddits.length, "Completed");
    }
    
    return uniqueResults;
  }

  private removeDuplicatesReddit(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      if (result.url && seen.has(result.url)) {
        return false;
      }
      if (result.url) {
        seen.add(result.url);
      }
      return true;
    });
  }

  private async realSearch(query: string, count: number): Promise<SearchResult[]> {
    try {
      // Use Reddit's JSON API directly instead of snoowrap for better compatibility
      const results: SearchResult[] = [];
      const relevantSubreddits = [
        'MachineLearning', 'artificial', 'singularity', 'OpenAI', 
        'ChatGPT', 'programming', 'cscareerquestions', 'technology'
      ];

      const cutoffTime = Date.now() / 1000 - (72 * 60 * 60); // 72 hours ago in Unix timestamp

      for (const subredditName of relevantSubreddits.slice(0, 4)) { // Increase to 4 subreddits for better coverage
        try {
          // First, get the most recent posts from the subreddit
          const recentPostsUrl = `https://www.reddit.com/r/${subredditName}/new.json?limit=20&t=day`;
          
          const recentResponse = await fetch(recentPostsUrl, {
            headers: {
              'User-Agent': this.userAgent
            }
          });

          if (!recentResponse.ok) {
            console.warn(`Reddit API error for r/${subredditName} recent posts: ${recentResponse.status}`);
            continue;
          }

          const recentData = await recentResponse.json();
          
          if (recentData.data && recentData.data.children) {
            // Filter posts by query relevance and recency
            const relevantPosts = recentData.data.children
              .map((child: any) => child.data)
              .filter((post: any) => {
                if (post.created_utc < cutoffTime) return false;
                
                // Check if post title or content contains query terms
                const postText = `${post.title} ${post.selftext || ''}`.toLowerCase();
                const queryTerms = query.toLowerCase().split(' ');
                return queryTerms.some(term => postText.includes(term));
              })
              .slice(0, Math.ceil(count / 4)); // Distribute across subreddits

            for (const post of relevantPosts) {
              if (results.length >= count) break;

              try {
                // Fetch comments for each relevant post
                const commentsUrl = `https://www.reddit.com/r/${subredditName}/comments/${post.id}.json?limit=10&sort=top`;
                
                await this.delay(500); // Rate limiting between comment requests
                
                const commentsResponse = await fetch(commentsUrl, {
                  headers: {
                    'User-Agent': this.userAgent
                  }
                });

                let topComments: string[] = [];
                if (commentsResponse.ok) {
                  const commentsData = await commentsResponse.json();
                  
                  // Extract top relevant comments
                  if (Array.isArray(commentsData) && commentsData[1]?.data?.children) {
                    topComments = commentsData[1].data.children
                      .slice(0, 5) // Top 5 comments
                      .map((comment: any) => comment.data?.body)
                      .filter((body: string) => body && body !== '[deleted]' && body !== '[removed]')
                      .filter((body: string) => {
                        // Filter comments that are relevant to the query
                        const commentText = body.toLowerCase();
                        const queryTerms = query.toLowerCase().split(' ');
                        return queryTerms.some(term => commentText.includes(term)) || body.length > 50;
                      })
                      .slice(0, 3) // Keep top 3 relevant comments
                      .map((body: string) => body.substring(0, 200)); // Truncate long comments
                  }
                }

                // Combine post content with top comments
                let content = post.selftext || post.title;
                if (topComments.length > 0) {
                  content += '\n\nTop comments:\n' + topComments.map(c => `• ${c}`).join('\n');
                }
                
                // Truncate if too long
                if (content.length > 800) {
                  content = content.substring(0, 800) + '...';
                }

                results.push({
                  id: `reddit-${post.id}`,
                  title: post.title,
                  content: content,
                  url: `https://reddit.com${post.permalink}`,
                  source: "reddit",
                  relevanceScore: Math.max(85 - results.length * 2, 65), // Higher base score
                  metadata: {
                    subreddit: `r/${subredditName}`,
                    upvotes: post.ups || 0,
                    comments: post.num_comments || 0,
                    created_utc: post.created_utc,
                    author: post.author || '[deleted]',
                    topCommentsIncluded: topComments.length,
                    postScore: post.score || 0
                  }
                });

              } catch (postError) {
                console.warn(`Error fetching comments for post ${post.id}:`, postError);
                // Still add the post without comments
                let content = post.selftext || post.title;
                if (content.length > 400) {
                  content = content.substring(0, 400) + '...';
                }

                results.push({
                  id: `reddit-${post.id}`,
                  title: post.title,
                  content: content,
                  url: `https://reddit.com${post.permalink}`,
                  source: "reddit",
                  relevanceScore: Math.max(80 - results.length * 2, 60),
                  metadata: {
                    subreddit: `r/${subredditName}`,
                    upvotes: post.ups || 0,
                    comments: post.num_comments || 0,
                    created_utc: post.created_utc,
                    author: post.author || '[deleted]',
                    topCommentsIncluded: 0,
                    postScore: post.score || 0
                  }
                });
              }
            }
          }
          
          // Add delay between subreddits to respect rate limits
          await this.delay(1000);
        } catch (subredditError) {
          console.warn(`Error searching subreddit ${subredditName}:`, subredditError);
          continue;
        }
      }

      // Sort results by relevance score and recency
      results.sort((a, b) => {
        const scoreA = a.relevanceScore + (a.metadata.upvotes / 10) + (a.metadata.topCommentsIncluded * 5);
        const scoreB = b.relevanceScore + (b.metadata.upvotes / 10) + (b.metadata.topCommentsIncluded * 5);
        return scoreB - scoreA;
      });

      return results.slice(0, count);
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
        content: "I've been using ChatGPT for code reviews and documentation for 6 months. Productivity is up ~25% but I worry about losing problem-solving skills.\n\nTop comments:\n• Same here, I use it mainly for boilerplate code and it's incredible how much time it saves\n• The key is to use it as a tool, not a replacement for thinking. I still review everything it generates\n• Be careful about over-reliance. I've noticed junior devs struggle more with debugging when they use AI too much",
        url: "https://reddit.com/r/programming/comments/example1",
        source: "reddit",
        relevanceScore: 85,
        metadata: {
          subreddit: "r/programming",
          upvotes: 2847,
          comments: 156,
          created_utc: Date.now() / 1000 - (24 * 60 * 60), // 24 hours ago
          author: "dev_user_2024",
          topCommentsIncluded: 3,
          postScore: 2847
        }
      },
      {
        id: "reddit-2",
        title: "LLMs replacing junior developers discussion",
        content: "Mixed views on whether AI tools will eliminate entry-level positions. Most agree it's changing skill requirements rather than eliminating jobs entirely.\n\nTop comments:\n• I think it will raise the bar for entry-level positions, but not eliminate them entirely\n• Companies still need humans to understand business requirements and context\n• The future is probably AI-assisted development rather than AI replacement",
        url: "https://reddit.com/r/cscareerquestions/comments/example2",
        source: "reddit",
        relevanceScore: 82,
        metadata: {
          subreddit: "r/cscareerquestions",
          upvotes: 1523,
          comments: 284,
          created_utc: Date.now() / 1000 - (48 * 60 * 60), // 48 hours ago
          author: "career_questioner",
          topCommentsIncluded: 3,
          postScore: 1523
        }
      },
      {
        id: "reddit-3",
        title: "AI productivity tools - what's actually worth it?",
        content: "After trying various AI tools for work, here's my breakdown of what actually improves productivity vs marketing hype.\n\nTop comments:\n• GitHub Copilot has been a game changer for me, especially for repetitive coding tasks\n• Cursor IDE is amazing if you're doing any kind of coding work\n• For writing, Claude and ChatGPT are both solid, depends on your use case",
        url: "https://reddit.com/r/artificial/comments/example3",
        source: "reddit",
        relevanceScore: 78,
        metadata: {
          subreddit: "r/artificial",
          upvotes: 892,
          comments: 127,
          created_utc: Date.now() / 1000 - (12 * 60 * 60), // 12 hours ago
          author: "productivity_guru",
          topCommentsIncluded: 3,
          postScore: 892
        }
      }
    ];

    return mockResults.slice(0, count);
  }

  private async realSearchSubreddit(subreddit: string, maxPosts: number, maxCommentsPerPost: number): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const cutoffTime = Date.now() / 1000 - (72 * 60 * 60); // 72 hours ago

    try {
      // Get recent posts from the subreddit
      const postsUrl = `https://www.reddit.com/r/${subreddit}/new.json?limit=${maxPosts}&t=week`;
      
      const postsResponse = await fetch(postsUrl, {
        headers: {
          'User-Agent': this.userAgent
        }
      });

      if (!postsResponse.ok) {
        console.warn(`Reddit API error for r/${subreddit}: ${postsResponse.status}`);
        return [];
      }

      const postsData = await postsResponse.json();
      
      if (postsData.data && postsData.data.children) {
        const posts = postsData.data.children
          .map((child: any) => child.data)
          .filter((post: any) => post.created_utc >= cutoffTime)
          .slice(0, maxPosts);

        for (const post of posts) {
          try {
            // Fetch comments for each post
            const commentsUrl = `https://www.reddit.com/r/${subreddit}/comments/${post.id}.json?limit=${Math.min(maxCommentsPerPost, 100)}&sort=top`;
            
            await this.delay(300); // Rate limiting between comment requests
            
            const commentsResponse = await fetch(commentsUrl, {
              headers: {
                'User-Agent': this.userAgent
              }
            });

            let topComments: string[] = [];
            if (commentsResponse.ok) {
              const commentsData = await commentsResponse.json();
              
              // Extract top relevant comments
              if (Array.isArray(commentsData) && commentsData[1]?.data?.children) {
                topComments = commentsData[1].data.children
                  .slice(0, Math.min(maxCommentsPerPost, 100))
                  .map((comment: any) => comment.data?.body)
                  .filter((body: string) => body && body !== '[deleted]' && body !== '[removed]')
                  .filter((body: string) => body.length > 20)
                  .slice(0, 20) // Keep top 20 relevant comments
                  .map((body: string) => body.substring(0, 150)); // Truncate long comments
              }
            }

            // Combine post content with top comments
            let content = post.selftext || post.title;
            if (topComments.length > 0) {
              content += '\n\nTop comments:\n' + topComments.map(c => `• ${c}`).join('\n');
            }
            
            // Truncate if too long
            if (content.length > 1500) {
              content = content.substring(0, 1500) + '...';
            }

            results.push({
              id: `reddit-${subreddit}-${post.id}`,
              title: post.title,
              content: content,
              url: `https://reddit.com${post.permalink}`,
              source: "reddit",
              relevanceScore: Math.max(85 - results.length * 1, 70),
              metadata: {
                subreddit: `r/${subreddit}`,
                upvotes: post.ups || 0,
                comments: post.num_comments || 0,
                created_utc: post.created_utc,
                author: post.author || '[deleted]',
                topCommentsIncluded: topComments.length,
                postScore: post.score || 0
              }
            });

          } catch (postError) {
            console.warn(`Error fetching comments for post ${post.id}:`, postError);
            // Still add the post without comments
            let content = post.selftext || post.title;
            if (content.length > 400) {
              content = content.substring(0, 400) + '...';
            }

            results.push({
              id: `reddit-${subreddit}-${post.id}`,
              title: post.title,
              content: content,
              url: `https://reddit.com${post.permalink}`,
              source: "reddit",
              relevanceScore: Math.max(80 - results.length * 1, 65),
              metadata: {
                subreddit: `r/${subreddit}`,
                upvotes: post.ups || 0,
                comments: post.num_comments || 0,
                created_utc: post.created_utc,
                author: post.author || '[deleted]',
                topCommentsIncluded: 0,
                postScore: post.score || 0
              }
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error searching subreddit r/${subreddit}:`, error);
    }

    return results;
  }

  private async mockSearchSingleSubreddit(subreddit: string, maxPosts: number, maxCommentsPerPost: number): Promise<SearchResult[]> {
    await this.delay(500 + Math.random() * 1000); // Variable delay for realism
    
    const mockResults: SearchResult[] = [];
    const postsToGenerate = Math.min(maxPosts, 10); // Generate up to 10 mock posts per subreddit

    for (let i = 0; i < postsToGenerate; i++) {
      const postTypes = [
        {
          titleTemplate: "My experience with AI tools in {field} - honest review",
          contentTemplate: "I've been using various AI tools for {field} work over the past few months. Here's what I've learned about productivity, challenges, and best practices."
        },
        {
          titleTemplate: "Question: How is AI changing {field} workflows?",
          contentTemplate: "Looking for insights from professionals in {field} about how AI tools are changing day-to-day work and what skills are becoming more important."
        },
        {
          titleTemplate: "Study: AI adoption trends in {field} sector",
          contentTemplate: "New research shows interesting patterns in how {field} professionals are adopting and using AI tools, with some surprising findings about productivity and job satisfaction."
        },
        {
          titleTemplate: "Discussion: Long-term impact of AI on {field} careers",
          contentTemplate: "What do people think about the future of {field} careers as AI becomes more capable? Share your thoughts on skills, opportunities, and challenges ahead."
        }
      ];

      const postType = postTypes[i % postTypes.length];
      const field = this.getFieldFromSubreddit(subreddit);
      
      // Generate mock comments
      const commentCount = Math.min(Math.floor(Math.random() * maxCommentsPerPost), 15);
      const comments = this.generateMockComments(commentCount, field);
      
      let content = postType.contentTemplate.replace(/\{field\}/g, field);
      if (comments.length > 0) {
        content += '\n\nTop comments:\n' + comments.map(c => `• ${c}`).join('\n');
      }

      mockResults.push({
        id: `reddit-${subreddit}-mock-${i + 1}`,
        title: postType.titleTemplate.replace(/\{field\}/g, field),
        content: content,
        url: `https://reddit.com/r/${subreddit}/comments/mock${i + 1}`,
        source: "reddit",
        relevanceScore: Math.max(90 - (i * 2) - Math.floor(Math.random() * 10), 70),
        metadata: {
          subreddit: `r/${subreddit}`,
          upvotes: Math.floor(Math.random() * 1000) + 50,
          comments: commentCount,
          created_utc: Date.now() / 1000 - (Math.floor(Math.random() * 72) * 60 * 60), // Random within 72 hours
          author: `user_${Math.floor(Math.random() * 9999)}`,
          topCommentsIncluded: comments.length,
          postScore: Math.floor(Math.random() * 800) + 100
        }
      });
    }

    return mockResults;
  }

  private getFieldFromSubreddit(subreddit: string): string {
    const fieldMap: { [key: string]: string } = {
      'MachineLearning': 'machine learning',
      'artificial': 'AI development',
      'ChatGPT': 'ChatGPT usage',
      'OpenAI': 'AI research',
      'singularity': 'AI advancement',
      'cscareerquestions': 'software development',
      'programming': 'programming',
      'LegalAdvice': 'legal practice',
      'consulting': 'business consulting',
      'productivity': 'productivity optimization'
    };
    return fieldMap[subreddit] || 'professional work';
  }

  private generateMockComments(count: number, field: string): string[] {
    const commentTemplates = [
      `I've had similar experiences with AI in ${field} - the key is finding the right balance`,
      `This matches what I'm seeing in my ${field} work. Productivity is definitely up but there are challenges`,
      `Great insights! I think ${field} professionals need to adapt but not panic about job security`,
      `The learning curve for AI tools in ${field} is steep but worth it once you get the hang of it`,
      `I'm curious about the long-term implications for ${field} education and training programs`,
      `Thanks for sharing! This helps me think about my own approach to AI in ${field}`,
      `Different perspective here - I've found AI tools more helpful for certain ${field} tasks than others`,
      `This is exactly what we've been discussing at work. ${field} is changing fast`
    ];

    const comments: string[] = [];
    for (let i = 0; i < count; i++) {
      const template = commentTemplates[i % commentTemplates.length];
      comments.push(template);
    }
    return comments;
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