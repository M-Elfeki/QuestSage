import { describe, it, expect, beforeAll } from 'vitest';
import { WebScrapingService, ArxivSearchService, RedditSearchService } from '../server/services/search';

describe('Search Services Real Content Validation', () => {
  let webService: WebScrapingService;
  let arxivService: ArxivSearchService;
  let redditService: RedditSearchService;

  beforeAll(() => {
    // Set mode to prod to ensure real search
    process.env.MODE = 'prod';
    
    webService = new WebScrapingService();
    arxivService = new ArxivSearchService();
    redditService = new RedditSearchService();
  });

  describe('Web Search Validation', () => {
    it('should return valid URLs and full webpage content', async () => {
      const query = 'artificial intelligence 2024';
      const results = await webService.search(query, 5);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
      
      // Print first full webpage content
      const firstResult = results[0];
      console.log('\n=== First Web Result ===');
      console.log(`Title: ${firstResult.title}`);
      console.log(`URL: ${firstResult.url}`);
      console.log('Full Content:');
      console.log(firstResult.content);
      console.log('=== End Web Result ===\n');

      // Continue with validation
      for (const result of results) {
        // Validate URL
        expect(result.url).toBeDefined();
        expect(result.url).toMatch(/^https?:\/\/.+/);
        expect(result.url).not.toContain('example.com');
        
        // Validate title
        expect(result.title).toBeDefined();
        expect(result.title.length).toBeGreaterThan(0);
        expect(result.title.length).toBeLessThanOrEqual(200);
        
        // Validate full content
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(100); // Should be substantial content
        expect(result.content.length).toBeLessThanOrEqual(5000); // Max content limit
        
        // Content should not be just a snippet
        expect(result.content).not.toEqual(result.metadata?.snippet);
        
        // Validate metadata
        expect(result.metadata).toBeDefined();
        expect(result.metadata.domain).toBeDefined();
        expect(result.metadata.domain).not.toBe('unknown');
        expect(result.metadata.contentLength).toBe(result.content.length);
        expect(result.metadata.retrieved).toBeDefined();
        
        // Log for debugging
        console.log(`✅ Web result: ${result.title}`);
        console.log(`   URL: ${result.url}`);
        console.log(`   Content length: ${result.content.length} chars`);
        console.log(`   Domain: ${result.metadata.domain}`);
      }
    }, 30000);

    it('should fetch content from multiple search engines', async () => {
      const query = 'machine learning applications';
      const results = await webService.search(query, 10);
      
      expect(results.length).toBeGreaterThan(0);
      
      // Check for diversity in domains
      const domains = new Set(results.map(r => r.metadata.domain));
      expect(domains.size).toBeGreaterThan(1); // Should have results from multiple domains
      
      // Check that content is actually scraped
      const resultsWithContent = results.filter(r => r.content.length > 500);
      expect(resultsWithContent.length).toBeGreaterThan(0);
      
      console.log(`Found ${results.length} results from ${domains.size} different domains`);
    }, 30000);

    it('should handle special characters and complex queries', async () => {
      const query = 'AI & machine learning: impact on workplace productivity';
      const results = await webService.search(query, 3);
      
      expect(results.length).toBeGreaterThan(0);
      
      for (const result of results) {
        expect(result.url).toMatch(/^https?:\/\/.+/);
        expect(result.content.length).toBeGreaterThan(100);
      }
    }, 30000);
  });

  describe('ArXiv Search Validation', () => {
    it('should return valid arXiv papers with full abstracts', async () => {
      const query = 'large language models';
      const results = await arxivService.search(query, 5);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      // Print first full abstract
      const firstPaper = results[0];
      console.log('\n=== First arXiv Paper ===');
      console.log(`Title: ${firstPaper.title}`);
      console.log(`Authors: ${firstPaper.metadata.authors.join(', ')}`);
      console.log(`ID: ${firstPaper.metadata.arxivId}`);
      console.log('Abstract:');
      console.log(firstPaper.content);
      console.log('=== End arXiv Paper ===\n');
      
      for (const result of results) {
        // Validate arXiv URL
        expect(result.url).toBeDefined();
        expect(result.url).toMatch(/arxiv\.org/);
        
        // Validate title
        expect(result.title).toBeDefined();
        expect(result.title.length).toBeGreaterThan(0);
        
        // Validate abstract (full content)
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(100); // Abstracts are substantial
        expect(result.content).toBe(result.metadata.abstract); // Content should be the abstract
        
        // Validate metadata
        expect(result.metadata).toBeDefined();
        expect(result.metadata.arxivId).toMatch(/^\d{4}\.\d{4,6}(v\d+)?$/);
        expect(result.metadata.published).toBeDefined();
        expect(result.metadata.authors).toBeDefined();
        expect(Array.isArray(result.metadata.authors)).toBe(true);
        expect(result.metadata.authors.length).toBeGreaterThan(0);
        expect(result.metadata.categories).toBeDefined();
        expect(Array.isArray(result.metadata.categories)).toBe(true);
        
        // Log for debugging
        console.log(`✅ ArXiv paper: ${result.title}`);
        console.log(`   ID: ${result.metadata.arxivId}`);
        console.log(`   Authors: ${result.metadata.authors.join(', ')}`);
        console.log(`   Abstract length: ${result.content.length} chars`);
      }
    }, 30000);

    it('should return papers sorted by relevance', async () => {
      const query = 'neural networks optimization';
      const results = await arxivService.search(query, 10);
      
      expect(results.length).toBeGreaterThan(0);
      
      // Check relevance scores are descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i].relevanceScore).toBeLessThanOrEqual(results[i-1].relevanceScore);
      }
    }, 30000);
  });

  describe('Reddit Search Validation', () => {
    it('should return valid Reddit posts with top comments', async () => {
      const query = 'artificial intelligence';
      const results = await redditService.search(query, 5);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      // Print first post and comments
      const firstPost = results[0];
      console.log('\n=== First Reddit Post ===');
      console.log(`Title: ${firstPost.title}`);
      console.log(`Subreddit: ${firstPost.metadata.subreddit}`);
      console.log(`URL: ${firstPost.url}`);
      console.log('Content:');
      console.log(firstPost.content);
      console.log('=== End Reddit Post ===\n');
      
      for (const result of results) {
        // Validate Reddit URL
        expect(result.url).toBeDefined();
        expect(result.url).toMatch(/reddit\.com/);
        
        // Validate title
        expect(result.title).toBeDefined();
        expect(result.title.length).toBeGreaterThan(0);
        
        // Validate content includes comments
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(50);
        
        // Check if top comments are included
        if (result.content.includes('Top comments:')) {
          const commentSection = result.content.split('Top comments:')[1];
          const comments = commentSection.split('•').filter(c => c.trim());
          expect(comments.length).toBeGreaterThan(0);
          expect(comments.length).toBeLessThanOrEqual(10);
          
          // Each comment should be truncated to 200 chars max
          for (const comment of comments) {
            expect(comment.trim().length).toBeLessThanOrEqual(203); // 200 + "..."
          }
        }
        
        // Validate metadata
        expect(result.metadata).toBeDefined();
        expect(result.metadata.subreddit).toMatch(/^r\//);
        expect(result.metadata.upvotes).toBeGreaterThanOrEqual(0);
        expect(result.metadata.comments).toBeGreaterThanOrEqual(0);
        expect(result.metadata.topCommentsIncluded).toBeGreaterThanOrEqual(0);
        expect(result.metadata.topCommentsIncluded).toBeLessThanOrEqual(10);
        
        // Log for debugging
        console.log(`✅ Reddit post: ${result.title}`);
        console.log(`   Subreddit: ${result.metadata.subreddit}`);
        console.log(`   Upvotes: ${result.metadata.upvotes}`);
        console.log(`   Comments included: ${result.metadata.topCommentsIncluded}`);
      }
    }, 30000);

    it('should search specific subreddits', async () => {
      const subreddits = ['programming', 'artificial'];
      const results = await redditService.searchMultipleSubreddits(subreddits, 5, 10);
      
      expect(results.length).toBeGreaterThan(0);
      
      // Check that results come from specified subreddits
      const foundSubreddits = new Set(results.map(r => r.metadata.subreddit.replace('r/', '')));
      for (const subreddit of subreddits) {
        expect(foundSubreddits.has(subreddit)).toBe(true);
      }
    }, 30000);
  });

  describe('Content Quality Validation', () => {
    it('should not return empty or invalid content', async () => {
      const query = 'test query for content validation';
      
      // Test all search services
      const webResults = await webService.search(query, 3);
      const arxivResults = await arxivService.search(query, 3);
      const redditResults = await redditService.search(query, 3);
      
      const allResults = [...webResults, ...arxivResults, ...redditResults];
      
      for (const result of allResults) {
        // No empty URLs
        expect(result.url).toBeDefined();
        expect(result.url).not.toBe('');
        
        // No empty titles
        expect(result.title).toBeDefined();
        expect(result.title).not.toBe('');
        
        // No empty content
        expect(result.content).toBeDefined();
        expect(result.content).not.toBe('');
        expect(result.content.trim().length).toBeGreaterThan(20);
        
        // No placeholder content
        expect(result.content).not.toContain('Lorem ipsum');
        expect(result.content).not.toContain('loading');
        expect(result.content).not.toContain('Error');
        expect(result.content).not.toMatch(/^\s*404\s*$/);
        
        // Valid source
        expect(['web', 'arxiv', 'reddit']).toContain(result.source);
      }
    }, 30000);
  });

  describe('URL and Content Relationship', () => {
    it('should have content that relates to the URL domain', async () => {
      const query = 'machine learning research';
      const results = await webService.search(query, 5);
      
      expect(results.length).toBeGreaterThan(0);
      
      for (const result of results) {
        const domain = result.metadata.domain;
        
        // Content should be substantial
        expect(result.content.length).toBeGreaterThan(100);
        
        // URL and domain should match
        expect(result.url).toContain(domain);
        
        // Log content preview for manual verification
        console.log(`\n📄 Content from ${domain}:`);
        console.log(`Title: ${result.title}`);
        console.log(`First 200 chars: ${result.content.substring(0, 200)}...`);
        console.log(`Total length: ${result.content.length} chars`);
      }
    }, 30000);
  });
});
