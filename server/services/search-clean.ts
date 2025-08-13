import { configService } from "./config";
import { truncateLog } from "./rate-limiter";

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
    // Always use real search - no mock data ever
    return await this.realSearch(query, count);
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
        console.log(`🔍 Web searching term ${i + 1}/${searchTerms.length}: "${truncateLog(term)}"`);
        
        // Always use real search - no mock data
        const termResults = await this.realSearch(term, maxResultsPerTerm);
        allResults.push(...termResults);
        
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
    console.log(`Web scraping search for: ${truncateLog(query)}`);

    const searchResults: Map<string, string> = new Map();
    
    // Try different search sources in sequence
    const sources = [
      () => this.searchGoogle(query),
      () => this.searchDuckDuckGo(query),
      () => this.searchBing(query)
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

    // Convert to SearchResult format with full content retrieval
    const validatedResults = await this.validateAndFormatResultsWithFullContent(searchResults, count);
    console.log(`Web scraper found ${validatedResults.length} valid results with content`);
    
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
        
        let href = $title.attr('href');
        const title = $title.text().trim();
        const snippet = $snippet.text().trim();
        
        // Extract actual URL from Bing redirect
        if (href && href.includes('/ck/a?')) {
          const urlMatch = href.match(/u=a1([^&]+)/);
          if (urlMatch) {
            try {
              href = Buffer.from(urlMatch[1], 'base64').toString('utf-8');
            } catch (e) {
              // Keep original if decoding fails
            }
          }
        }
        
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

  private async searchGoogle(query: string): Promise<Map<string, string>> {
    try {
      // Check if Google Search API is configured
      if (!process.env.GOOGLE_SEARCH_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
        return new Map();
      }
      
      const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
      const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(query)}&num=10`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Google Search API returned ${response.status}`);
      }

      const data = await response.json();
      const results = new Map<string, string>();
      
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const url = item.link;
          const title = item.title || '';
          const snippet = item.snippet || '';
          
          if (url && url.startsWith('http') && title) {
            const content = `${title}\n\n${snippet}`.trim();
            if (content.length > 30) {
              results.set(url, content.substring(0, 500));
            }
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error("Google search failed:", error);
      return new Map();
    }
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

  private async fetchUrlContent(url: string): Promise<string | null> {
    try {
      // Decode Bing redirect URLs if present
      if (url.includes('bing.com/ck/a')) {
        const urlMatch = url.match(/u=a1([^&]+)/);
        if (urlMatch) {
          try {
            // Decode the actual URL from Bing's redirect
            const encodedUrl = urlMatch[1];
            url = Buffer.from(encodedUrl, 'base64').toString('utf-8');
          } catch (e) {
            // If decoding fails, skip this URL
            return null;
          }
        }
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        signal: controller.signal,
        redirect: 'follow'
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script').remove();
      $('style').remove();
      
      // Try to get main content from various selectors
      let content = '';
      const contentSelectors = [
        'main', 'article', '[role="main"]', '.content', '#content',
        '.post-content', '.entry-content', '.article-body', '.story-body'
      ];
      
      for (const selector of contentSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          content = element.text();
          break;
        }
      }
      
      // Fallback to body if no specific content area found
      if (!content) {
        content = $('body').text();
      }
      
      // Clean up the content
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      // Return null if content is too short
      if (content.length < 100) {
        return null;
      }
      
      return content.substring(0, 5000); // Limit to 5000 chars
    } catch (error) {
      console.error(`Failed to fetch content from ${url}:`, error);
      return null;
    }
  }

  private async validateAndFormatResultsWithFullContent(results: Map<string, string>, maxCount: number): Promise<SearchResult[]> {
    const validatedResults: SearchResult[] = [];
    let index = 0;
    
    for (const [url, snippet] of Array.from(results.entries())) {
      if (validatedResults.length >= maxCount) break;
      
      try {
        // Validate URL first
        if (!this.isValidUrl(url)) continue;
        
        // Fetch full content from URL
        const fullContent = await this.fetchUrlContent(url);
        
        // Skip if no content could be retrieved
        if (!fullContent) {
          console.log(`Skipping ${truncateLog(url)} - no content retrieved`);
          continue;
        }
        
        // Extract title from snippet (first line usually)
        const lines = snippet.split('\n').filter(line => line.trim());
        const title = lines[0] || 'Web Result';
        
        validatedResults.push({
          id: `web-${Date.now()}-${index}`,
          title: title.substring(0, 200),
          content: fullContent,
          url: url,
          source: "web",
          relevanceScore: Math.max(95 - index * 5, 50),
          metadata: {
            domain: this.extractDomain(url),
            snippet: snippet,
            contentLength: fullContent.length,
            retrieved: new Date().toISOString()
          }
        });
        
        index++;
        
        // Small delay between fetches
        if (index < maxCount) {
          await this.delay_ms(500);
        }
      } catch (error) {
        console.error(`Error processing ${truncateLog(url)}:`, error);
        continue;
      }
    }
    
    return validatedResults;
  }

  private async delay_ms(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class ArxivSearchService {
  async search(query: string, count: number = 10): Promise<SearchResult[]> {
    // Always use real search - no mock data ever
    return await this.realSearch(query, count);
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
        console.log(`📚 arXiv searching term ${i + 1}/${searchTerms.length}: "${truncateLog(term)}"`);
        
        // Always use real search - no mock data
        const termResults = await this.realSearch(term, maxResultsPerTerm);
        allResults.push(...termResults);
        
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
        
        // Use abstract (summary) as content - this is the standard arXiv abstract
        // Only use full content if abstract is empty (which is very rare)
        let content = summary.trim();
        if (!content) {
          // Fallback to any other content if available
          content = entry.content || '';
        }
        
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
          content: content, // Full abstract, not truncated
          url: id,
          source: "arxiv",
          relevanceScore: Math.max(90 - index * 3, 60),
          metadata: {
            published: published,
            authors: authors.filter(author => author.length > 0),
            categories: categories.filter(cat => cat.length > 0),
            arxivId: id.split('/').pop() || id,
            abstract: summary.trim() // Store original abstract in metadata
          }
        });
      });

      return results;
    } catch (error) {
      console.error("ArXiv search error:", error);
      // Return empty array on error - no mock data
      return [];
    }
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
    // Always attempt real search - no mock data
    // Note: Reddit public API doesn't require credentials for search
    return await this.realSearch(query, count);
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
        console.log(`🔍 Reddit searching subreddit ${i + 1}/${subreddits.length}: r/${truncateLog(subreddit)}"`);
        
        // Always use real search - no mock data
        const subredditResults = await this.realSearchSubreddit(subreddit, maxPostsPerSubreddit, maxCommentsPerPost);
        allResults.push(...subredditResults);
        
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
                  
                  // Extract top 10 most relevant comments
                  if (Array.isArray(commentsData) && commentsData[1]?.data?.children) {
                    topComments = commentsData[1].data.children
                      .filter((comment: any) => {
                        const body = comment.data?.body;
                        return body && body !== '[deleted]' && body !== '[removed]' && body.length > 20;
                      })
                      .sort((a: any, b: any) => {
                        // Sort by score (upvotes - downvotes) to get most relevant
                        const scoreA = (a.data?.score || 0) + (a.data?.ups || 0);
                        const scoreB = (b.data?.score || 0) + (b.data?.ups || 0);
                        return scoreB - scoreA;
                      })
                      .slice(0, 10) // Keep exactly top 10 most relevant comments
                      .map((comment: any) => {
                        const body = comment.data?.body || '';
                        const truncated = body.length > 200 ? body.substring(0, 200) + '...' : body;
                        return truncated;
                      });
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
      // Return empty array on error - no mock data
      return [];
    }
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
              
              // Extract top 10 most relevant comments
              if (Array.isArray(commentsData) && commentsData[1]?.data?.children) {
                topComments = commentsData[1].data.children
                  .slice(0, Math.min(maxCommentsPerPost, 100))
                  .filter((comment: any) => {
                    const body = comment.data?.body;
                    return body && body !== '[deleted]' && body !== '[removed]' && body.length > 20;
                  })
                  .sort((a: any, b: any) => {
                    // Sort by score (upvotes - downvotes) to get most relevant
                    const scoreA = (a.data?.score || 0) + (a.data?.ups || 0);
                    const scoreB = (b.data?.score || 0) + (b.data?.ups || 0);
                    return scoreB - scoreA;
                  })
                  .slice(0, 10) // Keep exactly top 10 most relevant comments
                  .map((comment: any) => {
                    const body = comment.data?.body || '';
                    const truncated = body.length > 200 ? body.substring(0, 200) + '...' : body;
                    return truncated;
                  });
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
    if (this.apiKey) {
      return await this.realDeepSearch(query);
    } else {
      console.warn('Perplexity API key not configured - returning empty result');
      return {
        answer: 'Perplexity API key not configured',
        sources: [],
        confidence: 0
      };
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
      // Return empty result on error - no mock data
      return {
        answer: 'Error occurred during Perplexity search',
        sources: [],
        confidence: 0
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
