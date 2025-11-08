import { configService } from "./config";
import { truncateLog } from "./rate-limiter";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { searchDuckDuckGo as searchDuckDuckGoAPI } from 'ts-duckduckgo-search';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load reddit_config.env file if it exists
 * This file contains export statements like: export REDDIT_CLIENT_ID="value"
 */
function loadRedditConfig(): void {
  try {
    // Try multiple path resolutions to work in both dev and production
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'reddit_config.env'),        // From server/services/ (dev)
      path.join(process.cwd(), 'reddit_config.env'),                // From project root
      path.resolve(__dirname, '../../reddit_config.env'),           // Alternative resolution
      path.join(__dirname, '..', '..', '..', 'reddit_config.env'),  // From dist/ (production)
    ];
    
    let configPath: string | null = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        configPath = possiblePath;
        console.log(`✅ Found reddit_config.env at: ${configPath}`);
        break;
      }
    }
    
    if (!configPath) {
      console.warn(`⚠️  reddit_config.env not found. Tried: ${possiblePaths.join(', ')}`);
      return;
    }
    
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const lines = configContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Parse export KEY="value" format
      const exportMatch = trimmed.match(/^export\s+(\w+)="([^"]+)"/);
      if (exportMatch) {
        const [, key, value] = exportMatch;
        // Only set if not already in process.env (env vars take precedence)
        if (!process.env[key]) {
          process.env[key] = value;
          console.log(`✅ Loaded ${key} from reddit_config.env`);
        }
      }
    }
  } catch (error) {
    console.warn('Could not load reddit_config.env (this is optional):', error);
  }
}

// Load Reddit config file at module initialization
loadRedditConfig();

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  url?: string;
  source: string;
  relevanceScore: number;
  metadata: any;
}

/**
 * Retry utility with exponential backoff for search operations
 */
async function retrySearchOperation<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  operationName: string = "Search operation"
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`🔄 [${operationName}] Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMsg = lastError.message;
      
      // Don't retry on certain errors
      if (errorMsg.includes('404') || errorMsg.includes('401') || errorMsg.includes('403')) {
        console.warn(`⚠️  [${operationName}] Non-retryable error: ${errorMsg.substring(0, 100)}`);
        throw lastError;
      }
      
      if (attempt < maxRetries) {
        console.warn(`⚠️  [${operationName}] Attempt ${attempt + 1} failed: ${errorMsg.substring(0, 100)}`);
      } else {
        console.error(`❌ [${operationName}] All ${maxRetries + 1} attempts failed. Last error: ${errorMsg}`);
      }
    }
  }
  
  throw lastError || new Error(`${operationName} failed after ${maxRetries + 1} attempts`);
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
    if (!searchTerms || !Array.isArray(searchTerms) || searchTerms.length === 0) {
      console.warn("⚠️ Web search: No search terms provided, using fallback terms");
      searchTerms = ["technology", "research", "news"];
    }
    
    console.log(`🔍 Web search: Processing ${searchTerms.length} search terms with ${maxResultsPerTerm} results per term`);
    
    const allResults: SearchResult[] = [];
    
    for (let i = 0; i < searchTerms.length; i++) {
      const term = searchTerms[i];
      
      if (!term || typeof term !== 'string' || term.trim().length === 0) {
        console.warn(`⚠️ Skipping invalid search term at index ${i}`);
        continue;
      }
      
      if (progressCallback) {
        progressCallback(i, searchTerms.length, term);
      }
      
      try {
        console.log(`🔍 Web searching term ${i + 1}/${searchTerms.length}: "${truncateLog(term)}"`);
        
        // Always use real search - no mock data
        const termResults = await this.realSearch(term.trim(), maxResultsPerTerm);
        console.log(`✅ Found ${termResults.length} results for term "${truncateLog(term)}"`);
        allResults.push(...termResults);
        
        // Rate limiting between search terms
        if (i < searchTerms.length - 1) {
          await this.delay_ms(2000); // 2 second delay between terms
        }
      } catch (error) {
        console.error(`❌ Error searching term "${term}":`, error);
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
    
    // Use DuckDuckGo as the only search source
    try {
      console.log(`   Using DuckDuckGo...`);
      const results = await this.searchDuckDuckGo(query, count);
      if (results && results.size > 0) {
        console.log(`   ✅ DuckDuckGo returned ${results.size} results`);
        // Add results to our map
        for (const [url, content] of Array.from(results.entries())) {
          if (!searchResults.has(url)) {
            searchResults.set(url, content);
          }
        }
      } else {
        console.log(`   ⚠️  DuckDuckGo returned 0 results`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`   ⚠️  DuckDuckGo error: ${errorMsg.substring(0, 100)}`);
    }

    if (searchResults.size === 0) {
      console.warn(`⚠️  DuckDuckGo returned 0 results. This may indicate:`);
      console.warn(`   - Search engine is blocking automated requests (CAPTCHA)`);
      console.warn(`   - Network connectivity issues`);
      console.warn(`   - Query may be too specific or have no results`);
    }

    // Convert to SearchResult format with full content retrieval
    const validatedResults = await this.validateAndFormatResultsWithFullContent(searchResults, count);
    console.log(`Web scraper found ${validatedResults.length} valid results with content`);
    
    return validatedResults;
  }

  private async searchDuckDuckGoInstantAnswer(query: string): Promise<Map<string, string>> {
    try {
      // DuckDuckGo Instant Answer API - no CAPTCHA, but limited results
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        return new Map();
      }
      
      const data = await response.json();
      const results = new Map<string, string>();
      
      // Add abstract if available
      if (data.AbstractText && data.AbstractURL) {
        results.set(data.AbstractURL, data.AbstractText.substring(0, 500));
      }
      
      // Add related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.FirstURL && topic.Text) {
            results.set(topic.FirstURL, topic.Text.substring(0, 500));
          }
        }
      }
      
      // Add results
      if (data.Results && Array.isArray(data.Results)) {
        for (const result of data.Results.slice(0, 5)) {
          if (result.FirstURL && result.Text) {
            results.set(result.FirstURL, result.Text.substring(0, 500));
          }
        }
      }
      
      if (results.size > 0) {
        console.log(`✅ [DuckDuckGo API] Found ${results.size} results via Instant Answer API`);
      }
      
      return results;
    } catch (error) {
      console.warn(`⚠️  [DuckDuckGo API] Instant Answer API failed:`, error);
      return new Map();
    }
  }

  private async searchDuckDuckGo(query: string, count: number = 10): Promise<Map<string, string>> {
    return await retrySearchOperation(async () => {
      // Use ts-duckduckgo-search package (similar to Python duckduckgo-search)
      console.log(`🔍 [DuckDuckGo] Searching: ${truncateLog(query)}`);
      
      try {
        const results = await searchDuckDuckGoAPI(query, {
          maxResults: Math.min(count, 10), // Limit to 10 results per query
          userAgent: this.userAgent,
          safeSearch: 'moderate'
        });

        const resultMap = new Map<string, string>();
        
        for (const result of results) {
          // Filter out DuckDuckGo redirect URLs (ads/sponsored links)
          if (result.url && 
              result.url.startsWith('http') && 
              !result.url.includes('duckduckgo.com/y.js') &&
              !result.url.includes('duckduckgo.com/l/') &&
              result.title) {
            const content = `${result.title}\n\n${result.description || ''}`.trim();
            if (content.length > 30) {
              resultMap.set(result.url, content.substring(0, 500));
            }
          }
        }

        if (resultMap.size > 0) {
          console.log(`✅ [DuckDuckGo] Found ${resultMap.size} results for query: ${truncateLog(query)}`);
          return resultMap;
        } else {
          console.warn(`⚠️  [DuckDuckGo] No valid results found for query: ${truncateLog(query)} (received ${results.length} raw results)`);
          return new Map();
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️  [DuckDuckGo] Search error: ${errorMsg}`);
        
        // Check if it's a CAPTCHA/blocking error
        if (errorMsg.toLowerCase().includes('captcha') || 
            errorMsg.toLowerCase().includes('blocked') ||
            errorMsg.toLowerCase().includes('403') ||
            errorMsg.toLowerCase().includes('challenge')) {
          throw new Error(`DuckDuckGo search blocked: ${errorMsg}`);
        }
        
        throw error;
      }
    }, 3, 2000, `DuckDuckGo search: ${truncateLog(query)}`).catch(async (error) => {
      console.error(`❌ [DuckDuckGo] Search failed after retries for "${truncateLog(query)}":`, error);
      
      // Try Instant Answer API as fallback
      console.log(`🔄 [DuckDuckGo] Trying Instant Answer API as fallback...`);
      const instantResults = await this.searchDuckDuckGoInstantAnswer(query);
      if (instantResults.size > 0) {
        console.log(`✅ [DuckDuckGo] Fallback API returned ${instantResults.size} results`);
        return instantResults;
      }
      
      return new Map();
    });
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'identity', // Don't use gzip to avoid issues
          'Connection': 'close'
        },
        signal: controller.signal,
        redirect: 'follow'
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      
      // Check for error pages
      if (this.isErrorPage(html)) {
        return null;
      }
      
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script').remove();
      $('style').remove();
      $('nav').remove();
      $('header').remove();
      $('footer').remove();
      
      // Try to get main content from various selectors
      let content = '';
      const contentSelectors = [
        'main', 'article', '[role="main"]', '.content', '#content',
        '.post-content', '.entry-content', '.article-body', '.story-body',
        '.post', '.entry', '.article-content'
      ];
      
      for (const selector of contentSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          content = element.text();
          if (content.length > 200) break; // Found substantial content
        }
      }
      
      // Fallback to body if no specific content area found
      if (!content || content.length < 200) {
        // Remove common non-content elements from body
        $('body').find('nav, header, footer, aside, .sidebar, .menu').remove();
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
      // Silently fail - we'll use snippet instead
      return null;
    }
  }

  private isErrorPage(html: string): boolean {
    const lowerHtml = html.toLowerCase();
    const errorIndicators = [
      'access denied',
      '403 forbidden',
      '404 not found',
      '500 internal server error',
      'page not found',
      'error occurred',
      'captcha',
      'robot check',
      'blocked',
      'temporarily unavailable',
      'cloudflare',
      'checking your browser'
    ];
    
    return errorIndicators.some(indicator => lowerHtml.includes(indicator));
  }

  private async validateAndFormatResultsWithFullContent(results: Map<string, string>, maxCount: number): Promise<SearchResult[]> {
    const validatedResults: SearchResult[] = [];
    let index = 0;
    
    for (const [url, snippet] of Array.from(results.entries())) {
      if (validatedResults.length >= maxCount) break;
      
      try {
        // Validate URL first
        if (!this.isValidUrl(url)) continue;
        
        // Extract title from snippet (first line usually)
        const lines = snippet.split('\n').filter(line => line.trim());
        const title = lines[0] || 'Web Result';
        const contentPreview = snippet.substring(0, 1000); // Use snippet as content preview
        
        // Try to fetch full content, but don't fail if it doesn't work
        let fullContent = contentPreview;
        try {
          const fetchedContent = await this.fetchUrlContent(url);
          if (fetchedContent && fetchedContent.length > contentPreview.length) {
            fullContent = fetchedContent;
          }
        } catch (fetchError) {
          // Use snippet if fetch fails - this is acceptable
          console.log(`Using snippet for ${truncateLog(url)} - full content fetch failed`);
        }
        
        // Validate that we have meaningful content
        if (!this.hasMeaningfulContent(fullContent)) {
          console.log(`Skipping ${truncateLog(url)} - insufficient content`);
          continue;
        }
        
        validatedResults.push({
          id: `web-${Date.now()}-${index}`,
          title: title.substring(0, 200),
          content: fullContent.substring(0, 1000),
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
          await this.delay_ms(300); // Reduced delay
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
          content: content.substring(0, 1000), // Limit to first 1000 characters
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
  private accessToken: string | null = null;
  private tokenExpiry?: number;

  constructor() {
    // Load from environment variables (loaded from reddit_config.env or set directly)
    // reddit_config.env is loaded automatically at module initialization
    this.clientId = process.env.REDDIT_CLIENT_ID;
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
    // Use a proper User-Agent format that Reddit expects
    this.userAgent = process.env.REDDIT_USER_AGENT || "QuestSage/1.0 by /u/questsage";
    
    // Log credential status for debugging
    if (this.clientId && this.clientSecret) {
      console.log(`✅ [RedditSearchService] Credentials loaded: Client ID: ${this.clientId.substring(0, 10)}..., Secret: ${this.clientSecret ? 'SET' : 'NOT SET'}`);
    } else {
      console.warn(`⚠️  [RedditSearchService] No credentials found. Reddit search will fail.`);
      console.warn(`   Check that reddit_config.env exists and contains REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET`);
    }
  }

  private async getAccessToken(): Promise<string | null> {
    // If we have a valid token, return it
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // If no credentials, return null (will use unauthenticated requests)
    if (!this.clientId || !this.clientSecret) {
      console.log('ℹ️  [Reddit] No credentials configured - will attempt unauthenticated requests');
      return null;
    }

    try {
      // Get OAuth token using client credentials flow
      const authString = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const response = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent
        },
        body: 'grant_type=client_credentials'
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`⚠️  [Reddit] OAuth failed (${response.status}): ${errorText.substring(0, 200)}`);
        console.warn('   Will attempt unauthenticated requests (may fail due to Reddit blocking)');
        return null;
      }

      const data = await response.json();
      this.accessToken = (data.access_token as string) || null;
      
      if (this.accessToken) {
        // Set expiry to 45 minutes (tokens last 1 hour, refresh early)
        this.tokenExpiry = Date.now() + (45 * 60 * 1000);
        console.log(`✅ [Reddit] OAuth token acquired successfully (expires in 45 min)`);
        return this.accessToken;
      } else {
        console.warn(`⚠️  [Reddit] OAuth response missing access_token: ${JSON.stringify(data)}`);
        return null;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  [Reddit] OAuth error: ${errorMsg}`);
      console.warn('   Will attempt unauthenticated requests (may fail due to Reddit blocking)');
      return null;
    }
  }

  async search(query: string, count: number = 10): Promise<SearchResult[]> {
    // Always attempt real search - no mock data
    // Note: Reddit public API doesn't require credentials for search
    return await this.realSearch(query, count);
  }

  async searchMultipleSubreddits(subreddits: string[], maxPostsPerSubreddit: number = 50, maxCommentsPerPost: number = 100, progressCallback?: (progress: number, total: number, currentSubreddit: string) => void): Promise<SearchResult[]> {
    // Clean and validate subreddits - remove r/ prefix if present
    const cleanedSubreddits = (subreddits || [])
      .map(sub => typeof sub === 'string' ? sub.replace(/^r\//, '').trim() : '')
      .filter(sub => sub.length > 0);
    
    if (cleanedSubreddits.length === 0) {
      console.warn("⚠️ Reddit search: No valid subreddits provided, using fallback subreddits");
      cleanedSubreddits.push("MachineLearning", "technology", "programming");
    }
    
    console.log(`🔍 Reddit search: Processing ${cleanedSubreddits.length} subreddits with ${maxPostsPerSubreddit} posts (${maxCommentsPerPost} comments each)`);
    
    const allResults: SearchResult[] = [];
    const subredditStats: { subreddit: string; success: boolean; resultCount: number; error?: string }[] = [];
    
    for (let i = 0; i < cleanedSubreddits.length; i++) {
      const subreddit = cleanedSubreddits[i];
      
      if (progressCallback) {
        progressCallback(i, cleanedSubreddits.length, subreddit);
      }
      
      try {
        console.log(`🔍 Reddit searching subreddit ${i + 1}/${cleanedSubreddits.length}: r/${truncateLog(subreddit)}`);
        
        // Always use real search - no mock data
        const subredditResults = await this.realSearchSubreddit(subreddit, maxPostsPerSubreddit, maxCommentsPerPost);
        console.log(`✅ Found ${subredditResults.length} results from r/${subreddit}`);
        allResults.push(...subredditResults);
        subredditStats.push({ subreddit, success: true, resultCount: subredditResults.length });
        
        // Rate limiting between subreddits
        if (i < cleanedSubreddits.length - 1) {
          await this.delay(2000); // 2 second delay between subreddits
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error searching subreddit r/${subreddit}:`, errorMsg);
        subredditStats.push({ subreddit, success: false, resultCount: 0, error: errorMsg });
        // Continue with next subreddit
        continue;
      }
    }
    
    // Remove duplicates based on URL
    const uniqueResults = this.removeDuplicatesReddit(allResults);
    
    // Log summary statistics
    const successful = subredditStats.filter(s => s.success).length;
    const failed = subredditStats.filter(s => !s.success).length;
    const totalFromSuccessful = subredditStats.filter(s => s.success).reduce((sum, s) => sum + s.resultCount, 0);
    
    console.log(`🔍 Reddit search completed: ${uniqueResults.length} unique results from ${cleanedSubreddits.length} subreddits`);
    console.log(`   ✅ Successful: ${successful} subreddits (${totalFromSuccessful} results)`);
    if (failed > 0) {
      console.log(`   ❌ Failed: ${failed} subreddits`);
      const failedSubs = subredditStats.filter(s => !s.success).map(s => `r/${s.subreddit}`).join(', ');
      console.log(`   Failed subreddits: ${failedSubs}`);
    }
    
    if (progressCallback) {
      progressCallback(cleanedSubreddits.length, cleanedSubreddits.length, "Completed");
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

      // Get access token if available
      const token = await this.getAccessToken();
      const baseUrl = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';

      for (const subredditName of relevantSubreddits.slice(0, 4)) { // Increase to 4 subreddits for better coverage
        try {
          // First, get the most recent posts from the subreddit
          const recentPostsUrl = `${baseUrl}/r/${subredditName}/new.json?limit=20&t=day`;
          
          const headers: Record<string, string> = {
            'User-Agent': this.userAgent,
            'Accept': 'application/json'
          };
          
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          const recentResponse = await fetch(recentPostsUrl, { headers });

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
                const commentsUrl = token
                  ? `https://oauth.reddit.com/r/${subredditName}/comments/${post.id}.json?limit=10&sort=top`
                  : `https://www.reddit.com/r/${subredditName}/comments/${post.id}.json?limit=10&sort=top`;
                
                await this.delay(500); // Rate limiting between comment requests
                
                const commentHeaders: Record<string, string> = {
                  'User-Agent': this.userAgent,
                  'Accept': 'application/json'
                };
                
                if (token) {
                  commentHeaders['Authorization'] = `Bearer ${token}`;
                }
                
                const commentsResponse = await fetch(commentsUrl, { headers: commentHeaders });

                let topComments: string[] = [];
                if (commentsResponse.ok) {
                  const commentsData = await commentsResponse.json();
                  
                  // Extract top comments (limited to 10 per post)
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
                      .slice(0, 10) // Limit to 10 comments per post
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

    return await retrySearchOperation(async () => {
      // ALWAYS try to get access token first - Reddit blocks unauthenticated requests
      const token = await this.getAccessToken();
      
      // Use oauth.reddit.com when we have credentials (even if token acquisition failed, try authenticated endpoint)
      // Only use www.reddit.com if we have NO credentials at all
      const hasCredentials = this.clientId && this.clientSecret;
      const baseUrl = (hasCredentials && token) ? 'https://oauth.reddit.com' : 
                      hasCredentials ? 'https://oauth.reddit.com' : // Try authenticated even if token failed
                      'https://www.reddit.com';
      
      // Get recent posts from the subreddit
      const postsUrl = `${baseUrl}/r/${subreddit}/new.json?limit=${Math.min(maxPosts, 100)}&t=week`;
      
      const authStatus = token ? 'authenticated' : (hasCredentials ? 'credentials-available-but-no-token' : 'unauthenticated');
      console.log(`🔍 [Reddit] Fetching posts from r/${subreddit} (${authStatus})`);
      
      const headers: Record<string, string> = {
        'User-Agent': this.userAgent,
        'Accept': 'application/json'
      };
      
      // Always include Authorization header if we have a token
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const postsResponse = await fetch(postsUrl, { headers });

      if (!postsResponse.ok) {
        const errorText = await postsResponse.text().catch(() => '');
        const errorPreview = errorText.substring(0, 200);
        
        // Categorize the error
        if (postsResponse.status === 403) {
          // If we got 403 with credentials but no token, try to get token and retry
          if (hasCredentials && !token) {
            console.warn(`⚠️  [Reddit] r/${subreddit} returned 403 without token - attempting to acquire token...`);
            // Token acquisition should have been attempted, but retry once more
            const retryToken = await this.getAccessToken();
            if (retryToken) {
              console.log(`✅ [Reddit] Token acquired, retrying r/${subreddit}...`);
              headers['Authorization'] = `Bearer ${retryToken}`;
              const retryResponse = await fetch(postsUrl, { headers });
              if (retryResponse.ok) {
                const retryData = await retryResponse.json();
                return this.processRedditPosts(retryData, subreddit, maxPosts, maxCommentsPerPost, cutoffTime);
              }
            }
          }
          
          // Check if it's a private/restricted subreddit
          if (errorText.includes('private') || errorText.includes('restricted') || errorText.includes('banned')) {
            const errorMsg = `r/${subreddit} is private/restricted/banned`;
            console.warn(`⚠️  [Reddit] ${errorMsg}`);
            throw new Error(errorMsg);
          } else {
            // 403 without clear reason - likely Reddit blocking unauthenticated requests
            if (!hasCredentials) {
              const errorMsg = `r/${subreddit} returned 403 - Reddit requires authentication. Please configure REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET`;
              console.warn(`⚠️  [Reddit] ${errorMsg}`);
              throw new Error(errorMsg);
            } else if (!token) {
              const errorMsg = `r/${subreddit} returned 403 - OAuth token acquisition failed. Check Reddit API credentials.`;
              console.warn(`⚠️  [Reddit] ${errorMsg}`);
              throw new Error(errorMsg);
            } else {
              const errorMsg = `r/${subreddit} returned 403 even with authentication - may be private/restricted`;
              console.warn(`⚠️  [Reddit] ${errorMsg}`);
              throw new Error(errorMsg);
            }
          }
        } else if (postsResponse.status === 429) {
          const errorMsg = `r/${subreddit} rate limited (429)`;
          console.warn(`⚠️  [Reddit] ${errorMsg} - waiting before retry...`);
          await this.delay(5000); // Wait 5 seconds for rate limit
          throw new Error(errorMsg); // Will trigger retry
        } else {
          const errorMsg = `Reddit API error for r/${subreddit}: ${postsResponse.status} - ${errorPreview}`;
          console.warn(`⚠️  [Reddit] ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }

      const postsData = await postsResponse.json();
      console.log(`✅ [Reddit] Successfully fetched posts from r/${subreddit}`);
      return this.processRedditPosts(postsData, subreddit, maxPosts, maxCommentsPerPost, cutoffTime);
    }, 3, 2000, `Reddit search: r/${subreddit}`).catch((error) => {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ [Reddit] Search failed after retries for r/${subreddit}: ${errorMsg}`);
      return [];
    });
  }

  private async processRedditPosts(postsData: any, subreddit: string, maxPosts: number, maxCommentsPerPost: number, cutoffTime: number): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const token = await this.getAccessToken();
    
    if (postsData.data && postsData.data.children) {
      const posts = postsData.data.children
        .map((child: any) => child.data)
        .filter((post: any) => post.created_utc >= cutoffTime)
        .slice(0, maxPosts);

      console.log(`📊 [Reddit] Processing ${posts.length} posts from r/${subreddit}`);

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        try {
          // Fetch comments for each post with retry logic
          const commentsUrl = token 
            ? `https://oauth.reddit.com/r/${subreddit}/comments/${post.id}.json?limit=${Math.min(maxCommentsPerPost, 100)}&sort=top`
            : `https://www.reddit.com/r/${subreddit}/comments/${post.id}.json?limit=${Math.min(maxCommentsPerPost, 100)}&sort=top`;
          
          await this.delay(300); // Rate limiting between comment requests
          
          const headers: Record<string, string> = {
            'User-Agent': this.userAgent,
            'Accept': 'application/json'
          };
          
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          // Retry comment fetching with exponential backoff
          const commentsResponse = await retrySearchOperation(async () => {
            const response = await fetch(commentsUrl, { headers });
            if (!response.ok && response.status === 429) {
              await this.delay(5000); // Wait longer for rate limits
              throw new Error(`Rate limited: ${response.status}`);
            }
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            return response;
          }, 2, 1000, `Reddit comments: r/${subreddit}/${post.id}`).catch(() => null);

          let topComments: string[] = [];
          if (commentsResponse && commentsResponse.ok) {
            const commentsData = await commentsResponse.json();
            
            // Extract top comments (limited to maxCommentsPerPost, default 10)
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
                .slice(0, Math.min(maxCommentsPerPost, 10)) // Limit to maxCommentsPerPost (capped at 10)
                .map((comment: any) => {
                  const body = comment.data?.body || '';
                  const truncated = body.length > 200 ? body.substring(0, 200) + '...' : body;
                  return truncated;
                });
            }
          } else if (!commentsResponse) {
            console.warn(`⚠️  [Reddit] Failed to fetch comments for post ${post.id} after retries`);
          }

          // Combine post content with top comments
          let content = post.selftext || post.title;
          if (topComments.length > 0) {
            content += '\n\nTop comments:\n' + topComments.map(c => `• ${c}`).join('\n');
          }
          
          // Truncate to first 1000 characters
          if (content.length > 1000) {
            content = content.substring(0, 1000);
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
          const errorMsg = postError instanceof Error ? postError.message : String(postError);
          console.warn(`⚠️  [Reddit] Error processing post ${post.id}: ${errorMsg}`);
          // Still add the post without comments
          let content = post.selftext || post.title;
          if (content.length > 1000) {
            content = content.substring(0, 1000);
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
      
      console.log(`✅ [Reddit] Processed ${results.length} results from r/${subreddit}`);
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
  private llmService: any; // LiteLLMService instance

  constructor(llmService?: any) {
    // Use provided LiteLLM service or create a new one
    // Perplexity models are accessed through LiteLLM
    this.llmService = llmService;
  }

  async deepSearch(query: string): Promise<{
    answer: string;
    sources: SearchResult[];
    confidence: number;
  }> {
    if (!this.llmService) {
      console.warn('LiteLLM service not provided to PerplexityService - returning empty result');
      return {
        answer: 'LiteLLM service not configured for Perplexity',
        sources: [],
        confidence: 0
      };
    }
    
    return await this.realDeepSearch(query);
  }

  private async realDeepSearch(query: string): Promise<{
    answer: string;
    sources: SearchResult[];
    confidence: number;
  }> {
    try {
      console.log(`🔍 [Perplexity] Starting deep search with query: ${query.substring(0, 100)}...`);
      
      // Use LiteLLM to call Perplexity sonar-deep-research model
      const model = 'perplexity/sonar-deep-research';
      const systemPrompt = 'You are a research expert providing comprehensive, evidence-based analysis with source citations. Always include citations in your response.';
      
      const response = await this.llmService.generateCompletion(
        query,
        systemPrompt,
        model
      );

      const answer = response.response || '';
      
      // Extract citations from the response
      // Perplexity through LiteLLM returns citations in the response.citations field
      const citations: string[] = [];
      
      // First priority: citations from response.citations (direct from LiteLLM)
      if (response.citations && Array.isArray(response.citations) && response.citations.length > 0) {
        citations.push(...response.citations);
        console.log(`📚 [Perplexity] Found ${citations.length} citations from LiteLLM response`);
      }
      
      // Fallback: Try to extract citations from text patterns if not found in response
      if (citations.length === 0) {
        // Pattern 1: [1] https://url.com
        const citationPattern1 = /\[(\d+)\]\s*(https?:\/\/[^\s\)\]]+)/g;
        let match;
        while ((match = citationPattern1.exec(answer)) !== null) {
          citations.push(match[2]);
        }
        
        // Pattern 2: References section at the end with URLs
        const referencesMatch = answer.match(/References?:?\s*\n([\s\S]*)$/i);
        if (referencesMatch) {
          const referencesText = referencesMatch[1];
          const urlPattern = /https?:\/\/[^\s\n\)\]]+/g;
          const refUrls = referencesText.match(urlPattern) || [];
          citations.push(...refUrls);
        }
        
        // Pattern 3: Any URLs in the text (as last resort, but filter out common non-citation URLs)
        const allUrls = answer.match(/https?:\/\/[^\s\)\]]+/g) || [];
        const filteredUrls = allUrls.filter(url => {
          // Filter out common non-citation URLs
          const excludePatterns = [
            /perplexity\.ai/,
            /example\.com/,
            /localhost/,
            /127\.0\.0\.1/
          ];
          return !excludePatterns.some(pattern => pattern.test(url));
        });
        
        if (filteredUrls.length > 0) {
          citations.push(...filteredUrls.slice(0, 20)); // Limit to first 20 URLs
        }
      }

      // Remove duplicates
      const uniqueCitations = Array.from(new Set(citations));

      const sources: SearchResult[] = uniqueCitations.map((citation: string, index: number) => ({
        id: `perplexity-${Date.now()}-${index}`,
        title: `Source ${index + 1}`,
        content: "",
        url: citation,
        source: "perplexity",
        relevanceScore: 85,
        metadata: { citation, extractedFrom: 'perplexity-response' }
      }));

      console.log(`✅ [Perplexity] Deep search completed. Found ${sources.length} sources.`);

      return {
        answer,
        sources,
        confidence: sources.length > 0 ? 0.85 : 0.5
      };
    } catch (error: any) {
      console.error("❌ [Perplexity] Deep search error:", error);
      const errorMsg = error?.message || String(error);
      
      // Return error details for debugging
      return {
        answer: `Error occurred during Perplexity deep search: ${errorMsg}. Please check LiteLLM configuration and Perplexity API key setup.`,
        sources: [],
        confidence: 0
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
