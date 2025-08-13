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
        console.log(`🔍 Web searching term ${i + 1}/${searchTerms.length}: "${truncateLog(term)}"`);
        
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
    console.log(`Web scraping search for: ${truncateLog(query)}`);

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

  private async fetchUrlContent(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        signal: controller.signal
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

  private async mockSearch(query: string, count: number): Promise<SearchResult[]> {
    await this.delay_ms(800);
    
    // Simulate full content retrieval with rich, long-form content
    const mockResults = [
      {
        id: "web-1",
        title: "AI in the Workplace: Latest Research Findings",
        content: `Recent studies conducted by leading research institutions have revealed transformative impacts of artificial intelligence on workplace productivity across multiple sectors. This comprehensive analysis examines data from over 500 organizations implementing AI solutions.

Key Findings:
- Productivity increases averaging 23% in knowledge work sectors
- 67% of employees report enhanced job satisfaction when AI handles routine tasks
- Implementation challenges include training requirements and cultural adaptation
- ROI typically achieved within 18-24 months of deployment

The research methodology involved longitudinal studies tracking organizations before and after AI implementation. Participants included technology companies, financial services, healthcare providers, and manufacturing firms. Data collection spanned 36 months, with quarterly assessments of productivity metrics, employee satisfaction, and business outcomes.

Significant variations were observed across industries, with technology and financial services showing the highest productivity gains. Healthcare organizations reported improved diagnostic accuracy and patient outcomes, while manufacturing saw reductions in defect rates and improved supply chain efficiency.

Employee perspectives revealed initial apprehension followed by growing acceptance as familiarity increased. Training programs proved crucial for successful adoption, with organizations investing in comprehensive upskilling initiatives showing better outcomes. The study also identified key success factors including executive sponsorship, clear communication strategies, and phased implementation approaches.

Future implications suggest continued evolution of human-AI collaboration models, with emphasis on augmentation rather than replacement. Organizations are advised to focus on change management, continuous learning, and ethical considerations in their AI adoption strategies.`.trim(),
        url: "https://example.com/ai-workplace-research",
        source: "web",
        relevanceScore: 95,
        metadata: { 
          domain: "example.com", 
          contentLength: 2145, 
          scrapedAt: new Date().toISOString(),
          snippet: "Recent studies show that artificial intelligence is transforming workplace productivity across multiple sectors."
        }
      },
      {
        id: "web-2", 
        title: "Machine Learning Applications in Knowledge Work",
        content: `Organizations worldwide are implementing machine learning tools to enhance knowledge worker productivity, with early adopters reporting significant gains in data analysis and decision-making processes. This detailed report examines real-world implementations and outcomes.

Executive Summary:
Machine learning (ML) technologies are revolutionizing how knowledge workers approach complex tasks. From automated data analysis to predictive modeling, ML tools are becoming integral to modern workplace operations. This report synthesizes findings from 200+ case studies across various industries.

Implementation Patterns:
1. Data Analysis and Insights
   - Automated pattern recognition in large datasets
   - Predictive analytics for business forecasting
   - Anomaly detection in financial transactions
   - Customer behavior analysis and segmentation

2. Decision Support Systems
   - Risk assessment and mitigation strategies
   - Resource allocation optimization
   - Strategic planning assistance
   - Real-time performance monitoring

3. Process Automation
   - Document processing and classification
   - Email categorization and response drafting
   - Report generation and summarization
   - Workflow optimization

Case Study Highlights:
- Financial Services Firm A: Reduced analysis time by 75% using ML-powered tools
- Healthcare Provider B: Improved diagnostic accuracy by 32% with ML assistance
- Retail Company C: Increased sales conversion by 45% through ML-driven recommendations
- Manufacturing Company D: Decreased production defects by 28% using predictive maintenance

Best Practices for Implementation:
1. Start with pilot projects to demonstrate value
2. Invest in data quality and governance
3. Provide comprehensive training programs
4. Establish clear metrics for success
5. Create feedback loops for continuous improvement

The report concludes that successful ML adoption requires a balanced approach combining technological capability with organizational readiness and cultural change management.`.trim(),
        url: "https://example.com/ml-knowledge-work",
        source: "web",
        relevanceScore: 88,
        metadata: { 
          domain: "example.com", 
          contentLength: 2389, 
          scrapedAt: new Date().toISOString(),
          snippet: "Organizations worldwide are implementing machine learning tools to enhance knowledge worker productivity."
        }
      },
      {
        id: "web-3",
        title: "Future of Work: Human-AI Collaboration",
        content: `Industry experts and researchers have convened to discuss the evolving landscape of human-AI collaboration, highlighting both opportunities and challenges for the modern workplace. This comprehensive analysis presents insights from leading thinkers in technology, business, and social sciences.

Introduction:
The integration of artificial intelligence into workplace environments represents one of the most significant shifts in human history. As AI capabilities expand, the nature of work itself is being redefined. This report examines current trends, future projections, and strategic recommendations for organizations navigating this transformation.

Current State of Human-AI Collaboration:
1. Augmentation vs. Automation
   - Most successful implementations focus on augmenting human capabilities
   - Complete automation remains limited to specific, well-defined tasks
   - Hybrid models show the greatest promise for productivity gains

2. Emerging Collaboration Patterns
   - AI as research assistant: gathering and synthesizing information
   - AI as creative partner: generating ideas and alternatives
   - AI as quality checker: identifying errors and inconsistencies
   - AI as personal coach: providing feedback and suggestions

Industry Perspectives:
"The future workplace will be characterized by seamless human-AI partnerships where each party contributes their unique strengths," notes Dr. Sarah Chen, Director of AI Research at TechCorp.

Key challenges identified include:
- Skill gap and need for continuous learning
- Ethical considerations in AI decision-making
- Privacy and security concerns
- Resistance to change and job displacement fears
- Technical infrastructure requirements

Recommendations for Organizations:
1. Develop clear AI adoption strategies aligned with business goals
2. Invest in employee training and reskilling programs
3. Establish ethical guidelines for AI use
4. Create transparent communication about AI's role
5. Foster a culture of experimentation and learning

The path forward requires thoughtful integration of AI technologies with human expertise, ensuring that technological advancement serves to enhance rather than diminish human potential in the workplace.`.trim(),
        url: "https://example.com/future-work-ai",
        source: "web",
        relevanceScore: 82,
        metadata: { 
          domain: "example.com", 
          contentLength: 2234, 
          scrapedAt: new Date().toISOString(),
          snippet: "Industry experts discuss the evolving landscape of human-AI collaboration."
        }
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
      
      // Generate full content (simulating webpage scraping)
      const fullContent = `${template.contentTemplate.replace(/\{term\}/g, termFormatted)}

This comprehensive analysis explores ${termFormatted} from multiple perspectives, drawing on extensive research and real-world case studies. The investigation encompasses theoretical frameworks, practical applications, and empirical evidence gathered from diverse sources.

Background and Context:
The emergence of ${termFormatted} represents a significant development in modern organizational practices. Historical analysis reveals a trajectory of innovation driven by technological advancement and changing workplace dynamics. Early adoption patterns suggest varying degrees of success dependent on organizational readiness and implementation strategies.

Research Methodology:
Our investigation employed mixed-methods approaches including:
- Quantitative analysis of performance metrics across 150+ organizations
- Qualitative interviews with industry leaders and practitioners  
- Longitudinal studies tracking implementation outcomes over 24 months
- Comparative analysis of different deployment models
- Meta-analysis of existing research literature

Key Findings:
1. Implementation Success Factors
   Organizations achieving positive outcomes with ${termFormatted} shared common characteristics including strong leadership support, clear communication strategies, and phased deployment approaches. Success rates varied significantly based on industry sector and organizational size.

2. Performance Metrics
   Measurable improvements included:
   - Productivity gains ranging from 15% to 45%
   - Cost reductions averaging 22% in operational expenses
   - Quality improvements reflected in reduced error rates
   - Enhanced employee satisfaction scores
   - Accelerated time-to-market for new initiatives

3. Challenges and Barriers
   Common obstacles encountered during ${termFormatted} implementation:
   - Technical infrastructure limitations
   - Skills gaps requiring extensive training
   - Cultural resistance to change
   - Integration complexity with existing systems
   - Regulatory compliance considerations

Industry-Specific Applications:
Different sectors have adapted ${termFormatted} to address unique challenges. Financial services leverage it for risk assessment and fraud detection. Healthcare applications focus on diagnostic support and treatment optimization. Manufacturing uses include predictive maintenance and quality control.

Future Outlook:
Projections indicate continued evolution of ${termFormatted} capabilities, with emerging trends pointing toward greater sophistication and broader applicability. Organizations are advised to maintain flexibility in their approach while building foundational capabilities that can adapt to future developments.

Recommendations:
Based on our analysis, we recommend organizations considering ${termFormatted} adoption to:
1. Conduct thorough readiness assessments
2. Develop comprehensive implementation roadmaps
3. Invest in change management and training
4. Establish clear success metrics
5. Create feedback mechanisms for continuous improvement

This research contributes to the growing body of knowledge surrounding ${termFormatted} and provides actionable insights for practitioners and researchers alike.`;

      mockResults.push({
        id,
        title: template.titleTemplate.replace(/\{term\}/g, termFormatted),
        content: fullContent.trim(),
        url: `https://${template.domain}/${termFormatted.replace(/\s+/g, '-')}-${i + 1}`,
        source: "web",
        relevanceScore: Math.max(95 - (i * 3) - Math.floor(Math.random() * 10), 70),
        metadata: { 
          domain: template.domain, 
          contentLength: fullContent.length, 
          scrapedAt: new Date().toISOString(),
          searchTerm: term,
          snippet: template.contentTemplate.replace(/\{term\}/g, termFormatted)
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
        console.log(`📚 arXiv searching term ${i + 1}/${searchTerms.length}: "${truncateLog(term)}"`);
        
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
      return await this.mockSearch(query, count);
    }
  }

  private async mockSearch(query: string, count: number): Promise<SearchResult[]> {
    await this.delay(1200);
    
    // Simulate arXiv papers with full abstracts
    const mockResults = [
      {
        id: "arxiv-1",
        title: "Large Language Models and Knowledge Work: A Quantitative Analysis",
        content: `We present a comprehensive quantitative analysis of Large Language Model (LLM) impact on productivity across diverse knowledge work domains. Our controlled study encompasses 500 professionals from technology, finance, healthcare, and education sectors, tracked over a 6-month period following LLM tool deployment.

The study employs a randomized controlled trial design with treatment and control groups, measuring productivity through multiple validated metrics including task completion rates, quality assessments, time-to-completion, and error rates. Participants were provided with standardized LLM tools and training, with usage patterns and outcomes systematically recorded.

Key findings indicate heterogeneous effects across domains and task types. Productivity gains averaged 34% for content creation tasks, 23% for data analysis, and 19% for code development. However, tasks requiring deep domain expertise showed minimal improvement (< 5%). Quality metrics revealed interesting patterns: while speed increased significantly, output quality showed mixed results depending on task complexity and user expertise level.

We identify several moderating factors influencing LLM effectiveness: (1) User technical proficiency positively correlates with productivity gains (r = 0.68, p < 0.001), (2) Task ambiguity negatively impacts LLM utility, (3) Organizational support and training significantly enhance outcomes, and (4) Ethical concerns and trust issues create adoption barriers in certain contexts.

The paper contributes to growing literature on AI-human collaboration by providing empirical evidence of LLM impact in real-world professional settings. Our results suggest that while LLMs offer substantial productivity benefits, their effectiveness is highly context-dependent and requires thoughtful implementation strategies. We discuss implications for workforce development, organizational design, and future research directions in human-AI collaboration.`,
        url: "https://arxiv.org/abs/2024.1234",
        source: "arxiv",
        relevanceScore: 90,
        metadata: {
          published: "2024-01-15",
          authors: ["Smith, J.", "Johnson, K.", "Williams, R.", "Brown, L."],
          categories: ["cs.HC", "cs.AI", "econ.GN"],
          arxivId: "2024.1234",
          abstract: "We present a comprehensive quantitative analysis of Large Language Model (LLM) impact on productivity across diverse knowledge work domains..."
        }
      },
      {
        id: "arxiv-2",
        title: "Employment Effects of Generative AI: Evidence from Early Adopters",
        content: `This paper examines employment patterns in organizations that adopted generative AI tools early, revealing complex substitution and complementarity effects across different job categories. Using a difference-in-differences approach, we analyze employment data from 127 early-adopter firms compared to matched control firms over 2021-2024.

Our dataset combines administrative employment records, firm-level AI adoption surveys, and detailed job task descriptions. We categorize workers into skill groups based on task content and track employment changes following AI implementation. The identification strategy exploits variation in AI adoption timing and intensity across firms.

Results show nuanced employment effects that challenge simple automation narratives. While routine content generation roles decreased by 18% (SE = 2.3%), we observe 23% growth in AI-complementary positions such as prompt engineers, AI trainers, and quality assurance specialists. High-skill analytical roles showed resilience, with employment levels remaining stable but job content evolving significantly.

Heterogeneous effects emerge across industries. Creative industries experienced job polarization, with mid-level positions declining while both entry-level and senior strategic roles expanded. Technology firms showed overall employment growth of 12%, driven by new AI-related positions. Traditional industries demonstrated slower adjustment patterns with temporary employment disruptions followed by gradual recovery.

We document important skill reallocation dynamics. Workers in displaced roles who received AI training showed 67% successful transition rates to complementary positions. Firms investing in reskilling programs experienced lower turnover and higher productivity gains. The paper identifies critical factors determining whether AI serves as substitute or complement to human labor.

Policy implications include the need for proactive workforce development, social safety nets during transition periods, and educational system reforms to prepare workers for AI-augmented roles. Our findings suggest that while generative AI creates significant labor market disruption, thoughtful implementation can lead to net positive employment effects with appropriate support structures.`,
        url: "https://arxiv.org/abs/2024.5678",
        source: "arxiv",
        relevanceScore: 85,
        metadata: {
          published: "2024-02-20",
          authors: ["Lee, A.", "Chen, M.", "Davis, R.", "Thompson, K.", "Garcia, S."],
          categories: ["econ.GN", "cs.CY", "stat.AP"],
          arxivId: "2024.5678",
          abstract: "This paper examines employment patterns in organizations that adopted generative AI tools early..."
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
      
      // Generate full abstract content
      const fullAbstract = `${template.contentTemplate.replace(/\{term\}/g, termFormatted)}

We present a comprehensive investigation into ${termFormatted} through rigorous empirical analysis and theoretical frameworks. This research addresses critical gaps in current understanding and provides novel insights with significant practical implications.

Background and Motivation:
The rapid evolution of ${termFormatted} has created both opportunities and challenges across multiple domains. Previous research has established foundational concepts but left important questions unanswered. Our work builds upon existing literature while introducing innovative methodologies to explore previously unexamined aspects.

Methodology:
Our approach combines multiple research methodologies:
- Large-scale data collection from diverse sources (N = ${Math.floor(Math.random() * 5000) + 1000})
- Advanced statistical modeling using state-of-the-art techniques
- Qualitative analysis through expert interviews and case studies
- Experimental validation in controlled environments
- Cross-sectional and longitudinal analysis spanning ${Math.floor(Math.random() * 3) + 2} years

Key Contributions:
1. Novel theoretical framework for understanding ${termFormatted} dynamics
2. Empirical evidence challenging conventional assumptions
3. Practical guidelines for implementation in real-world settings
4. Identification of critical success factors and failure modes
5. Quantitative metrics for evaluating ${termFormatted} effectiveness

Results and Findings:
Our analysis reveals surprising patterns in ${termFormatted} adoption and impact. Contrary to prevailing theories, we find non-linear relationships between implementation intensity and outcomes. The data shows significant heterogeneity across contexts, with effect sizes ranging from 0.2 to 0.8 depending on moderating variables.

Statistical significance was achieved for primary hypotheses (p < 0.001), with robust results across multiple model specifications. Sensitivity analyses confirm the stability of our findings under various assumptions.

Implications:
These findings have profound implications for both theory and practice. Theoretically, our results necessitate revision of existing models to account for observed complexity. Practically, organizations must adopt nuanced approaches to ${termFormatted} implementation, considering context-specific factors identified in our analysis.

Future Directions:
This research opens several avenues for future investigation, including exploration of boundary conditions, development of predictive models, and examination of long-term sustainability. We provide a research agenda to guide subsequent studies in this rapidly evolving field.`;

      mockResults.push({
        id,
        title: template.titleTemplate.replace(/\{term\}/g, termFormatted),
        content: fullAbstract.trim(),
        url: `https://arxiv.org/abs/${arxivId}`,
        source: "arxiv",
        relevanceScore: Math.max(90 - (i * 2) - Math.floor(Math.random() * 8), 75),
        metadata: {
          published: `2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
          authors: [`Author ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`, `Researcher ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`],
          categories: [template.category],
          arxivId,
          searchTerm: term,
          abstract: template.contentTemplate.replace(/\{term\}/g, termFormatted)
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
        console.log(`🔍 Reddit searching subreddit ${i + 1}/${subreddits.length}: r/${truncateLog(subreddit)}"`);
        
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